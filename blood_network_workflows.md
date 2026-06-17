# Blood Network — Architecture Workflows & Scenario Coverage

> **Purpose**: A companion to the architecture doc — walks every significant path through the system end-to-end, identifies where gaps exist, and validates that the architecture handles each case correctly.
> **Format**: Each workflow traces the exact sequence of service calls, state transitions, events, and UI responses.

---

## Table of Contents

1. [Core Request Lifecycle Workflow](#1-core-request-lifecycle-workflow)
2. [Contact Reveal Workflow (OTP-Gated)](#2-contact-reveal-workflow-otp-gated)
3. [Donor Eligibility & Availability Toggle Workflow](#3-donor-eligibility--availability-toggle-workflow)
4. [Notification Delivery Workflow](#4-notification-delivery-workflow)
5. [Outcome Reporting & Reputation Update Workflow](#5-outcome-reporting--reputation-update-workflow)
6. [Org Onboarding & Verification Workflow](#6-org-onboarding--verification-workflow)
7. [WhatsApp Share → New Donor Registration Workflow](#7-whatsapp-share--new-donor-registration-workflow)
8. [Abuse Detection & Moderation Workflow](#8-abuse-detection--moderation-workflow)
9. [Mass Casualty Mode Workflow](#9-mass-casualty-mode-workflow)
10. [Admin Daily Operations Workflow](#10-admin-daily-operations-workflow)
11. [Identified Gaps & Practical Issues — Consolidated Table](#11-identified-gaps--practical-issues)

---

## 1. Core Request Lifecycle Workflow

### Happy path: Emergency request created → fulfilled

```
[Patient/Requester]          [Request Service]         [Matching Engine]       [Notification Service]
      │                             │                          │                         │
      ├─ POST /requests ──────────►│                          │                         │
      │  { blood_group: "O+",      │                          │                         │
      │    urgency: EMERGENCY,     │                          │                         │
      │    hospital_name: "...",   │                          │                         │
      │    required_by: "+2h" }    │                          │                         │
      │                            ├─ Validate Zod schema     │                         │
      │                            ├─ Check rate limits       │                         │
      │                            │  (2 active / 1 EMERGENCY/24h)                      │
      │                            ├─ Verify hospital in DB   │                         │
      │                            ├─ Create blood_requests   │                         │
      │                            │  record (status=ACTIVE)  │                         │
      │                            ├─ Generate share_token    │                         │
      │                            ├─ Publish request.created ─────────────────────────►│
      │◄─ 201 { id, share_token, ──│                          │                         │
      │        matching_count: 8 } │                          │                         │
      │                            │                          │◄─ request.created event  │
      │                            │                          ├─ Geospatial query        │
      │                            │                          │  (PostGIS or city match) │
      │                            │                          ├─ Blood compat expand     │
      │                            │                          ├─ Apply fatigue guard     │
      │                            │                          ├─ AI score ranking        │
      │                            │                          ├─ Publish matching.       │
      │                            │                          │  donor_batch_selected ──►│
      │                            │                          │                         ├─ Check donor prefs
      │                            │                          │                         ├─ Check daily cap
      │                            │                          │                         ├─ Check quiet hours
      │                            │                          │                         ├─ Send FCM push
      │                            │                          │                         ├─ Send SMS (EMERGENCY: simultaneous)
      │                            │                          │                         ├─ Write notification_log
```

### State transitions during lifecycle

```
blood_requests.status:
  ACTIVE ──────────────────────────────────────────► FULFILLED (requester marks fulfilled)
         ─────────────────────────────────────────── PARTIALLY_FULFILLED (units_confirmed < units_needed)
         ─────────────────────────────────────────── EXPIRED (expires_at reached, requester didn't extend)
         ─────────────────────────────────────────── CANCELLED (requester explicitly cancels)

donor_interests.status (per donor slot):
  INTERESTED → REVEAL_PENDING → CONTACT_REVEALED → CONFIRMED → DONATED
                                                              → TURNED_AWAY
                                                              → NO_SHOW
             → WITHDRAWN (before OTP — donor backs out, no penalty)
                                                 → DECLINED_AFTER_REVEAL (after OTP — soft flag)
```

### Gap: Auto-expiry must NOT delete records

> ⚠️ **G11 (Critical)**: MongoDB TTL index deletes the document. This loses all `donor_interests`, `contact_reveals`, and `outcome_reports` linked to the request. The correct approach:
> - Remove TTL index from `bloodrequests` collection
> - Filter out expired requests in GET /requests query: `{ expiresAt: { $gt: new Date() } }`
> - Use a scheduled job (cron every 15 min) to set `status = EXPIRED` on overdue documents
> - Never delete blood request documents — they are permanent audit records

---

## 2. Contact Reveal Workflow (OTP-Gated)

### Who does what, in which app session

```
[Requester App]              [Request Service]         [Auth Service]          [Donor App]
      │                             │                        │                        │
      ├─ Taps "Reveal Contact"      │                        │                        │
      │  on donor slot              │                        │                        │
      ├─ ContactRevealModal opens   │                        │                        │
      │  (shows donor preview,      │                        │                        │
      │   consent warning)          │                        │                        │
      │                             │                        │                        │
      ├─ POST /requests/:id/         │                        │                        │
      │    interest/:iid/reveal ───►│                        │                        │
      │                             ├─ Check rate limit      │                        │
      │                             │  (3 reveals/request/hour, Redis)               │
      │                             ├─ Check interest status │                        │
      │                             │  (must be INTERESTED)  │                        │
      │                             ├─ Set status=REVEAL_PENDING                     │
      │                             ├─ Create contact_reveals record                  │
      │                             ├─ POST /auth/otp/contact-reveal/send ──────────►│
      │                             │                        ├─ Generate 6-digit OTP  │
      │                             │                        ├─ Store with key        │
      │                             │                        │  CONTACT_REVEAL:{phone}│
      │                             │                        ├─ TTL: 15 minutes ◄──── FIXED (was 5min)
      │                             │                        ├─ Send SMS to donor ───►│ [SMS arrives]
      │◄─ 200 { otp_sent: true,     │                        │                        │
      │         reveal_id: "uuid" } │                        │                        │
      │  [Shows "Waiting for        │                        │                        │
      │   donor to confirm OTP..."] │                        │                        │
      │                             │                        │                        ├─ Donor taps
      │                             │                        │                        │  deep link in SMS
      │                             │                        │                        ├─ Opens /reveals/:revealId/confirm
      │                             │                        │                        ├─ OTPConfirmScreen
      │                             │                        │                        │  (in DONOR's session)
      │                             │                        │                        ├─ POST /reveals/:revealId/confirm
      │                             │                        │                        │  { otp: "483920" }
      │                             │                        │◄────────────────────────┤
      │                             │◄────────────────────────┤                        │
      │                             ├─ Validate OTP           │                        │
      │                             ├─ Set contact_reveals.revealed=true              │
      │                             ├─ Set interest.status=CONTACT_REVEALED           │
      │                             ├─ Publish contact.revealed event                 │
      │◄─ WebSocket event ──────────│                        │                        │
      │   { donor_phone, eta }      │                        │                        │◄─ 200 {
      │  [Modal updates: contact    │                        │                        │    patient_phone,
      │   revealed, ETA shown]      │                        │                        │    hospital_address,
      │                             │                        │                        │    ward_number,
      │                             │                        │                        │    guardian_name }
```

### Key invariants

1. The OTP entry screen renders in the **donor's** app session — not the requester's
2. The requester sees a "waiting" state; the donor is the one who enters the OTP
3. Both phones are revealed **simultaneously** in the same API response
4. Ward/room number is in the donor's response payload — **not** in the public request card
5. The reveal is permanent — the app cannot un-share it. The log is the accountability mechanism
6. OTP TTL is 15 minutes (not 5 — fixed to account for poor connectivity in India)

### Gap: Donor may not be active in the app

> ⚠️ **G10**: If the donor's last app session was 2 days ago, they may not see the SMS immediately. Before initiating contact reveal, the requester should be warned if the donor's `last_seen` timestamp is older than 24 hours: "This donor hasn't opened the app recently — they may not respond to OTP quickly."

---

## 3. Donor Eligibility & Availability Toggle Workflow

### Toggle ON attempt (server-side validation)

```
[Donor App]                  [User Service]
      │                             │
      ├─ Taps availability toggle   │
      ├─ PUT /donors/availability   │
      │  { available: true,         │
      │    component: "WHOLE_BLOOD" } ──────────────────────►│
      │                             ├─ Load DonorProfile
      │                             ├─ computeEligibility(profile, component)
      │                             │
      │                             │  Check order:
      │                             │  1. bloodGroupVerified? → if false: UNVERIFIED_BLOOD_GROUP
      │                             │  2. weightKg != null AND < 45? → WEIGHT_BELOW_MIN
      │                             │  3. tempDeferralUntil > now? → TEMP_DEFERRAL
      │                             │  4. component==PLATELETS AND !plateletEligible? → NOT_OPT_IN
      │                             │  5. lastDonation + restPeriod > now? → REST_PERIOD
      │                             │  6. All pass → eligible: true
      │                             │
      │  If ineligible:             │
      │◄─ 403 { eligible: false,    │
      │   reason: "REST_PERIOD",    │
      │   unblockDate: "...",       │
      │   daysRemaining: 27 }       │
      │  [UI: toggle stays OFF,     │
      │   shows reason message]     │
      │                             │
      │  If eligible:               │
      │◄─ 200 { available: true }   │
      │  [UI: toggle ON, green dot] │
      │                             ├─ Publish user.donor.availability_changed
```

### Weight gate nuance

> ⚠️ **FIX**: `weightKg` can be null (not entered). The eligibility function must check `weightKg !== null` before comparing `< 45`. If weight is not entered, the weight gate is skipped — the donor is prompted to enter their weight but not blocked from toggling on.

### UI enforcement vs server enforcement

- **UI**: Disables the toggle button and shows reason when `eligibility.eligible === false`
- **Server**: Re-validates on EVERY `POST /interest` and `PUT /donors/availability` call
- A motivated bad actor who crafts a direct API request is still blocked server-side

---

## 4. Notification Delivery Workflow

### Channel selection and delivery confirmation

```
[Matching Engine]     [Notification Service]        [FCM]         [SMS Gateway]    [Donor Device]
      │                        │                       │                │                  │
      ├─ Publish matching.     │                       │                │                  │
      │  donor_batch_selected  │                       │                │                  │
      │  { donors: [...],      │                       │                │                  │
      │    request: {...} }    │                       │                │                  │
      │                        │◄──────────────────────│                │                  │
      │                        ├─ For each donor:       │                │                  │
      │                        ├─ Check donor prefs     │                │                  │
      │                        ├─ Check daily cap       │                │                  │
      │                        │  (Redis: notif:daily:{donorId}:{date}) │                  │
      │                        ├─ Check quiet hours     │                │                  │
      │                        ├─ Check fatigue guard   │                │                  │
      │                        │  (3+ unresponded today → deprioritise) │                  │
      │                        │                        │                │                  │
      │                        │  If EMERGENCY:         │                │                  │
      │                        ├─────────────────────── FCM push ──────►│                  │
      │                        ├──────────────────────────────────────── SMS ──────────────►│
      │                        │  (simultaneous — dual channel)         │                  │
      │                        │                        │                │                  │
      │                        │  If HIGH / NORMAL:     │                │                  │
      │                        ├─────────────────────── FCM push ──────►│                  │
      │                        ├─ Set 5-min timer       │                │                  │
      │                        │  (if no delivery receipt → send SMS)   │                  │
      │                        │                        │                │                  │
      │                        ├─ Write notification_log                 │                  │
      │                        │  (sent_at, channel, donor_id)          │                  │
      │                        │                        │                │                  │
      │                        │◄─ FCM delivery receipt ┤                │                  │
      │                        │  { delivered: true }   │                │                  │
      │                        ├─ Update notification_log.delivered_at  │                  │
      │                        ├─ Publish notification.delivered        │                  │
      │◄─ Matching Engine      │                        │                │                  │
      │   marks donor notified │                        │                │                  │
      │   30-min response      │                        │                │                  │
      │   window starts        │                        │                │                  │
```

### Non-response scoring uses delivery confirmation

```
Non-response = notification.delivered_at IS NOT NULL
               AND responded = false
               AND (now - delivered_at) > 30 minutes

If non-response count >= 3 today:
  → Donor deprioritised in ranking for next 24h
  → Reset when: donor responds OR midnight
```

> ⚠️ **Do NOT use sent_at for non-response scoring** — in India's 2G connectivity, a notification may arrive 40+ minutes after `sent_at`. Using `delivered_at` prevents penalising donors who genuinely didn't receive the notification in time.

---

## 5. Outcome Reporting & Reputation Update Workflow

### Both sides submit — discrepancies are flagged

```
[2h after donor's ETA — timer fires]
      │
      ├─ Both donor and requester receive outcome prompt (push + in-app)
      │
[Donor submits]                          [Requester submits]
      │                                         │
      ├─ POST /interests/:iid/outcome            ├─ POST /interests/:iid/outcome
      │  { outcome: "DONATED" }                 │  { outcome: "DONATED" }
      │                                         │
      [Request Service ingests both]
      │
      ├─ Match outcomes?
      │   Both say DONATED → update: donor.totalDonations++, donor.lastDonation = now
      │                              request.unitsConfirmed++
      │                              interest.status = DONATED
      │
      │   Donor says DONATED, requester says NO_SHOW → flag for admin review
      │   Donor says TURNED_AWAY + reason → check reason
      │     HEMOGLOBIN_LOW / OTHER_MEDICAL / NO_BED → no reputation penalty
      │                                              → set tempDeferralUntil if medical
      │     BLOOD_GROUP_MISMATCH → flag donor profile for blood group review
      │   Donor says NO_SHOW (self-report) → noShowCount++, inform requester
      │   Requester says NO_SHOW, donor silent → noShowCount++ after 48h grace period
      │   Requester says PAYMENT_DEMANDED → immediate soft suspension of donor
      │
      ├─ Publish donation.outcome_reported
      │
      [Scoring Service ingests]
      ├─ Update response_rate_30d feature
      ├─ Update fulfillment_rate feature
      ├─ Re-score donor (XGBoost inference)
      ├─ Write new score to ai_scores + Redis (invalidate cache)
```

### Outcome timer is based on donor ETA, not request required_by

> The outcome timer fires **2 hours after the donor's set ETA** — not 2 hours after `required_by`. If the donor set ETA as 3:45 PM, the prompt fires at 5:45 PM. If no ETA was set (donor was interested but not contact-revealed), no outcome prompt is sent for that slot.

---

## 6. Org Onboarding & Verification Workflow

```
[Org Registers]              [Request Service]         [Admin Service]         [Admin UI]
      │                             │                        │                        │
      ├─ POST /auth/register        │                        │                        │
      │  { role: "ORG",             │                        │                        │
      │    orgName, regNo, ... }    │                        │                        │
      │◄─ 201 { user, token }       │                        │                        │
      │   verificationStatus=PENDING│                        │                        │
      │                             │                        │                        │
      │  [Org dashboard shows:      │                        │                        │
      │   "Verification pending"]   │                        │                        │
      │  [All data endpoints        │                        │                        │
      │   return 403 until verified]│                        │                        │
      │                             │                        │                        │
      │                             │                        │◄─ Admin sees badge:     │
      │                             │                        │   "1 pending org"      │
      │                             │                        │                        │
      │                             │                        │  GET /admin/orgs/pending
      │                             │                        │  [Admin reviews]       │
      │                             │                        │  - Org name + type     │
      │                             │                        │  - Registration number │
      │                             │                        │  - Uploaded license    │
      │                             │                        │  - NBTC registry check │
      │                             │                        │                        │
      │                             │                        │  PUT /admin/orgs/:id/verify
      │                             │◄─ verificationStatus   │                        │
      │                             │   = VERIFIED           │                        │
      │◄─ Org notified (in-app +    │                        │                        │
      │   email): "Verified!"       │                        │                        │
      │                             │                        │                        │
      │  [Org dashboard unlocks:    │                        │                        │
      │   stats, inventory,         │                        │                        │
      │   post requests]            │                        │                        │
```

### What an unverified org can and cannot do

| Action | PENDING | VERIFIED |
|---|---|---|
| Login | ✅ | ✅ |
| View own org profile | ✅ | ✅ |
| Post requests | ❌ | ✅ |
| View dashboard stats | ❌ | ✅ |
| Update inventory | ❌ | ✅ |
| See donor data | ❌ | ✅ (only responders to their requests) |
| Initiate contact reveal | ❌ | ✅ (via standard OTP flow) |

---

## 7. WhatsApp Share → New Donor Registration Workflow

```
[Requester]              [Public /r/:token page]       [New User]          [Request Service]
      │                          │                          │                      │
      ├─ POST /requests/:id/share│                          │                      │
      │◄─ { share_url:          │                          │                      │
      │     "/r/abc123token" }   │                          │                      │
      │                          │                          │                      │
      ├─ Copies link to WhatsApp │                          │                      │
      │  "My mother needs B+ blood — Apollo Hospital..."    │                      │
      │                          │                          │                      │
      │                          │◄─ Mohan taps the link    │                      │
      │                          │  (GET /r/abc123token)    │                      │
      │                          ├─ Looks up share_token    │                      │
      │                          │  → finds blood_request   │                      │
      │                          ├─ Renders public request  │                      │
      │                          │  card (SSR for WhatsApp  │                      │
      │                          │  preview metadata)       │                      │
      │                          │  [Blood group, urgency,  │                      │
      │                          │   hospital, units needed] │                      │
      │                          │  [NO ward, NO patient    │                      │
      │                          │   name, NO phone]        │                      │
      │                          │                          │                      │
      │                          │  CTA: "I want to donate" │                      │
      │                          │◄── Mohan taps CTA ───────┤                      │
      │                          │                          │                      │
      │                          │  Quick registration form │                      │
      │                          │  { name, phone, blood_group, city }             │
      │                          │  (2 minutes, minimal fields)                    │
      │                          │  Phone OTP verified      │                      │
      │                          │                          │                      │
      │                          │                          ├─ POST /requests/:id/interest
      │                          │                          │  (interest expressed, blood group unverified)
      │                          │                          │◄─ 201 { interest_id, trust_badge: "UNVERIFIED" }
      │                          │                          │                      │
      │                          │   [Mohan shown in        │                      │
      │                          │    requester's tracker   │                      │
      │                          │    with "Unverified"     │                      │
      │                          │    badge]                │                      │
```

### Gap: New donor lands on already-fulfilled request

> ⚠️ **G8**: If Mohan registers from a share link and the request is already FULFILLED, the app should:
> 1. Show: "This request has been fulfilled — thank you for wanting to help!"
> 2. Query for other open requests in Mohan's city + blood group
> 3. Show: "We found [N] other active requests near you matching your blood group" + link to feed
> 4. Prompt him to complete his profile (blood group verification, weight) to appear in future matching

---

## 8. Abuse Detection & Moderation Workflow

### Auto-flag sequence for phone harvesting

```
[Bad actor makes reveals]     [Request Service]          [Admin Service]
      │                              │                          │
      ├─ POST reveals × 3 (1h limit)│                          │
      │◄─ 429 after 3rd reveal      │                          │
      │                              │                          │
      │  [Bad actor waits 1h]        │                          │
      │                              │                          │
      [After 2h of request life]     │                          │
      │                              ├─ Cron check: requests where
      │                              │  reveals > (unitsNeeded × 2)
      │                              │  AND unitsConfirmed == 0
      │                              │  AND createdAt < 2h ago
      │                              ├─ Set is_flagged=true     │
      │                              ├─ Publish request.flagged ─────────────────────►│
      │                              │                          ├─ Add to admin flags queue
      │                              │                          ├─ Admin badge: "+1 flagged request"
      │                              │                          │
      │                              │                          [Admin reviews]
      │                              │                          ├─ If confirmed abuse:
      │                              │                          │  PUT /admin/flags/:id/cancel
      │                              │                          │  → request CANCELLED
      │                              │                          │  → all interested donors notified
      │                              │                          │  → requester account suspended
```

### Payment demand — immediate response

```
[Patient reports "Donor asked for payment"]
      │
      ├─ POST /requests/:id/interest/:iid/outcome
      │  { outcome: "DONOR_DECLINED", outcome_reason: "PAYMENT_DEMANDED" }
      │
      [Request Service]
      ├─ Create outcome_report
      ├─ Publish request.payment_demand_reported
      │
      [Admin Service]
      ├─ Soft-suspend donor account: suspended=true, suspendedReason="Payment demand report — pending review"
      ├─ Notify donor: "Your account has been temporarily suspended pending review of a report."
      ├─ Add to admin reports queue: PAYMENT_DEMANDED (P1 — review within 2h)
      ├─ Admin reviews both outcome reports
      │  → If upheld: permanent suspension + (optionally) report to authorities
      │  → If overturned: unsuspend + notify donor
```

---

## 9. Mass Casualty Mode Workflow

```
[Multiple hospitals posting emergencies]
      │
      [Request Service — running Cron every 5 min]
      ├─ Count: EMERGENCY requests in same city in last 30 min
      ├─ If count > 10:
      │   ├─ Publish system.mass_casualty.detected { city, count }
      │
      [Notification Service]
      ├─ Receives mass_casualty event
      ├─ Switch to consolidated mode for this city:
      │   For each donor in this city:
      │   ├─ Collapse all matching requests → 1 SMS:
      │   │  "MASS EMERGENCY in [city] — [N] blood requests active. Open app."
      │   ├─ Per-donor rate: max 1 alert per 15 min (not per request)
      │
      [All donor clients in city]
      ├─ WebSocket push: system.mass_casualty.active
      ├─ Home page shows MassCasualtyBanner (sticky, red)
      ├─ Request feed pre-filtered by donor's blood group + city
      │   (no information overload — only what the donor can help with)
      │
      [Admin Dashboard]
      ├─ Real-time alert: "Mass Casualty Active — [city] — [N] emergency requests"
      ├─ Admin can manually escalate or de-escalate
      │
      [De-escalation — Cron check]
      ├─ active_emergency_count < 5
      │  AND no new emergencies in last 30 min
      ├─ Publish system.mass_casualty.resolved
      ├─ Notification Service returns to normal mode
      ├─ Home page banner dismissed
```

### Gap: Sustained multi-hour crises

> ⚠️ **G7**: If a city has 8 ongoing emergencies for 6 hours (sustained disaster), the de-escalation threshold (count < 5) may never be met. The de-escalation condition must also check: no *new* emergencies in the last 30 minutes — even if there are still active ones. Admin can also manually de-escalate.

---

## 10. Admin Daily Operations Workflow

### Morning routine checklist

```
1. Login → /admin → Overview tab
   GET /admin/stats
   → Review: activeRequests, fulfilledToday, newUsers, openReports, pendingOrgs

2. Org verification queue (SLA: 24h)
   GET /admin/orgs/pending
   For each:
     → View uploaded license (signed URL, 15-min expiry)
     → Cross-check NBTC registry (manual step)
     → PUT /admin/orgs/:id/verify OR /admin/orgs/:id/reject { reason }

3. Blood group proof queue (SLA: 48h)
   GET /admin/proofs/pending
   For each:
     → GET /admin/proofs/:userId/file (signed URL to view document)
     → Review: photo quality, blood group visible, matches claimed group
     → PUT /admin/proofs/:userId/approve OR /admin/proofs/:userId/reject { reason }
     → Approve: donor.bloodGroupVerified=true → donor immediately activated

4. Reports inbox (SLA: P1=2h, P2=24h)
   GET /admin/reports?status=OPEN
   Priority: PAYMENT_DEMANDED first, then SUSPICIOUS_REQUEST, then HARASSMENT
   For each:
     → View both outcome reports, request timeline
     → Take action: [Suspend user] [Force-cancel request] [Dismiss] [Resolve]

5. Flagged requests
   GET /admin/flags
   For auto-flagged requests (high reveals, low fulfillment):
     → Review request legitimacy
     → PUT /admin/flags/:id/clear (legitimate) OR /admin/flags/:id/cancel (fraudulent)

6. No-show disputes
   GET /admin/disputes
   For each:
     → Review donor claim + patient report + timeline
     → PUT /admin/disputes/:id/uphold (flag stays) OR /admin/disputes/:id/overturn (flag removed)
```

### Gap: No batch actions in admin panel

> ⚠️ **G14**: When 30+ blood group proofs come in during a blood drive, admin must review each one individually. Add a batch review mode with keyboard shortcuts (A=approve, R=reject, reason modal on reject).

---

## 11. Identified Gaps & Practical Issues

Consolidated table of all gaps identified across workflows and scenarios:

| # | Gap Description | Severity | Affected Flow | Recommended Fix |
|---|---|---|---|---|
| **G1** | No apheresis-capable hospital data — platelet donors may travel to wrong hospitals | Medium | S3 | Add `has_apheresis` flag to `verified_hospitals`; filter platelet requests to apheresis-capable hospitals |
| **G2** | Requester may mark FULFILLED before confirming donation happened, closing no-show window | High | S5 | Confirmation dialog: "Has the donor actually donated? Closing will end outcome reporting." Requires checkbox |
| **G3** | Donors can self-report wrong turn-away reason to avoid deferral | Medium | S6 | Blood group mismatch outcome → auto-flag donor profile. Cross-check with patient's outcome report |
| **G4** | New donor registering via share link after request expiry is not automatically matched to extended request | High | S8 | On `user.blood_group.verified`, trigger matching engine to check all ACTIVE requests in donor's city |
| **G5** | Donor with confirmed ETA for one request receives another matching alert on the same day — double-booking risk | Medium | S11 | Before sending notification: check if donor has CONFIRMED interest for another request today. Append warning to notification |
| **G6** | Admin may approve blood group proof documents too quickly — fake proofs getting verified | High | S13 | Require two verification factors: government photo ID + blood group card. Add confidence score field to proof review UI |
| **G7** | Mass casualty de-escalation is count-based only — doesn't handle sustained multi-hour crises | Medium | S17 | De-escalation: count < 5 AND no new emergencies in last 30 min. Admin manual override available |
| **G8** | New donor who registers from fulfilled share link has no path to find other open requests | Medium | S21 | Post-registration redirect: "Request fulfilled — but we found [N] other open requests near you matching your blood group" |
| **G9** | Contact reveal OTP has 5-min TTL — may expire before donor with poor connectivity receives SMS | High | S9 | Extend contact reveal OTP TTL to 15 minutes. Add "Resend OTP" option on OTP entry screen |
| **G10** | Donor who hasn't opened app in 24h+ won't see OTP SMS promptly — reveal will timeout | High | W4 | Before initiating reveal: check donor's last_seen. Show warning if > 24h: "This donor may not be active — consider alerting next donor" |
| **G11** | MongoDB TTL index deletes blood request documents — loses all interest/reveal/outcome history | **Critical** | All | Remove TTL index. Use query filter `{ expiresAt: { $gt: now } }` + cron job to set status=EXPIRED. Never delete request documents |
| **G12** | Org dashboard "DonorContactQueue" implied direct contact access without OTP reveal | **Critical** | S2, S22 | Orgs use same OTP-gated reveal flow. Contact queue shows interest slots only — not phone numbers. Remove any UI implying direct access |
| **G13** | No workflow for cancellation after donor is confirmed — donation may no longer be needed | Medium | All | On request CANCEL: notify all CONFIRMED donors immediately. Set their slots to WITHDRAWN. Do NOT update their donation date |
| **G14** | Admin panel has no batch actions — reviewing 30+ proofs individually is unusable at scale | Medium | W5 | Add batch review mode with keyboard shortcuts (A=approve, R=reject) and bulk action on proofs queue |

---

## Architecture Flaws Corrected (Cross-Reference with architecture doc Section 17)

| Flaw # | Summary | Impact |
|---|---|---|
| F1 | Donor/Patient as fixed roles — same user can be both | Role model, every page, access control |
| F2 | Separate `(donor)/` and `(patient)/` route groups | Page routing, navigation, profile |
| F3 | UUID in share links (`/request/[id]`) — enumerable | Privacy, security |
| F4 | 4-tile role selector included Donor+Patient as separate account types | Registration UX, user model |
| F5 | Filter bar had no default city — donors saw all-city requests | Donor home UX |
| F6 | AI score chip visible to donors ("not labeled as AI" = deceptive UX) | Donor UX, trust |
| F7 | Patient home was a browsable donor directory with no request requirement | Privacy, abuse surface |
| F8 | Request creation restricted to "Patient" role | Access control |
| F9 | No validation on `required_by` upper bound (could be 30 days in future) | Data quality |
| F10 | "Reveal contact" triggered OTP immediately without preview modal | UX, trust, consent |
| F11 | OTP entry screen location was ambiguous — rendered in requester's session | Critical UX/security flaw |
| F12 | 2h outcome timer was after `required_by`, not donor's ETA | Data accuracy, no-show scoring |
| F13 | Org DonorContactQueue implied direct contact access without OTP | Privacy, trust model |
| F14 | `donor.weight < 45` failed silently when weight is null | Eligibility logic bug |
| F15 | Auto-flag rule "≥5 reveals" was too aggressive for multi-unit requests | False positive moderation |
| F16 | No city-based fallback when hospital_location is null | Matching failure for unverified hospitals |
| F17 | Radius expansion had no cap — could notify donors 75km+ away | Notification fatigue |
| F18 | `REVEAL_PENDING` and `WITHDRAWN` states missing from donor_interests schema | State machine inconsistency |
| F19 | `share_token` missing from production schema | Feature gap |
| F20 | Compound index on nullable `hospital_location` | DB index inefficiency |
| F21 | `reveal_count_this_hour` denorm column was inconsistency-prone | Data consistency |
| F22 | `patient_id` FK name wrong in contact_reveals — can be org | Naming, correctness |
| F23 | Reporter role enum used old `DONOR`/`PATIENT` (not unified model) | Schema mismatch |
| F24 | Reveal endpoint URL exposed donor UUIDs | Privacy |
| F25 | Auto-pause at 2 reports was too aggressive | Moderation policy |
| F26 | New donors need >3 interactions to leave cold start | AI scoring cold start |
| F27 | Axios used throughout client code | Unnecessary dependency, bundle size |
| F28 | `patient_profiles` table existed only because of the flawed role model | Schema redundancy |
| F29 | Separate `(donor)/home` and `(patient)/home` couldn't serve dual-role users | Routing ambiguity |
| F30 | FilterBar `sortBy: 'urgency'` sorted by enum string value, not numeric priority | Sort correctness |

---

*Version 1.0 — companion to `blood_network_architecture.md` v2.0*
