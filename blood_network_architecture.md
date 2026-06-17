# Blood Network — Complete System Design & Architecture

> **Document type**: Senior SWE Architecture Specification
> **Scope**: Full-stack production system — every component chosen, structured, and responsibility-assigned
> **Context**: India-focused blood donation coordination platform supporting donors, patients, hospitals/orgs, and a platform admin
> **Last revised**: 2026-06-16 — flaws identified and corrected throughout; see `⚠️ FIX` annotations

---

## Table of Contents

1. [System Overview & Core Principles](#1-system-overview--core-principles)
2. [High-Level Architecture Diagram](#2-high-level-architecture-diagram)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Backend Service Decomposition](#4-backend-service-decomposition)
5. [Data Models & Schema](#5-data-models--schema)
6. [API Contract Design](#6-api-contract-design)
7. [Request Lifecycle State Machine](#7-request-lifecycle-state-machine)
8. [Matching Engine & Blood Compatibility](#8-matching-engine--blood-compatibility)
9. [Notification Architecture](#9-notification-architecture)
10. [AI Scoring Pipeline](#10-ai-scoring-pipeline)
11. [Trust, Safety & Abuse Prevention](#11-trust-safety--abuse-prevention)
12. [Authentication & Authorization](#12-authentication--authorization)
13. [Infrastructure & Deployment](#13-infrastructure--deployment)
14. [Storage Architecture](#14-storage-architecture)
15. [Observability & Operations](#15-observability--operations)
16. [Component Responsibility Map](#16-component-responsibility-map)
17. [Identified Flaws & Corrections](#17-identified-flaws--corrections)

---

## 1. System Overview & Core Principles

### What This System Does

The Blood Network is a real-time coordination platform that connects blood donors with patients who need blood. It is not a blood bank management system — it is a **request-routing and trust-mediation layer** that sits between the person who needs blood and the person willing to give it.

Every design decision flows from the following:

| Principle | Implication |
|---|---|
| **Seconds matter in emergency** | Login must be OTP-only. Notification delivery must be multi-channel and confirmed. |
| **Trust is the product** | Phone numbers are never exposed without mutual consent. Donor identity is verified before they appear in results. |
| **Donor fatigue kills the network** | Notifications have hard system-level caps. Inactive donors are deprioritised, not spammed. |
| **Hospitals crossmatch anyway** | The app is not a medical safety net. Its job is to get a *willing, likely-eligible* donor to the hospital fast. |
| **India connectivity is real** | SMS must be a first-class delivery channel, not a fallback. Offline state must be graceful. |
| **Abuse is expected** | Every flow that reveals data has a rate limit, a log, and a flag path. |

### User Roles

> ⚠️ **FIX — Role model was inconsistent**: The original used `DONOR`/`PATIENT` as fixed roles but the same person can be both in real life. The corrected model uses `INDIVIDUAL` for all regular users, with capabilities unlocked by profile state. `DONOR` and `PATIENT` are **capability modes**, not account types.

| Role | Description | Primary Action |
|---|---|---|
| **Individual (donor-capable)** | Any registered user who has verified blood group + eligibility | Browse requests, respond, complete donation |
| **Individual (patient/requester)** | Any registered user — all individuals can post requests from day one | Create request, manage donor contacts, close loop |
| **Org / Hospital** | Verified hospital or blood bank | Post on behalf of patients, manage inventory |
| **Platform Admin** | Internal team | Verify orgs, review flagged accounts, handle disputes |

---

## 2. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│   ┌──────────────────┐    ┌─────────────────┐   ┌────────────────┐  │
│   │  Next.js Web App  │    │  React Native    │   │  SMS Deep Link │  │
│   │  (PWA-capable)    │    │  Mobile App      │   │  Landing Page  │  │
│   └────────┬─────────┘    └────────┬────────┘   └───────┬────────┘  │
└────────────┼──────────────────────┼────────────────────┼────────────┘
             │         HTTPS / WSS  │                     │
┌────────────▼──────────────────────▼─────────────────────▼────────────┐
│                          API GATEWAY                                   │
│   Kong / AWS API Gateway — rate limiting, JWT validation, routing     │
└───────┬──────────┬────────┬────────┬────────┬──────────┬────────────┘
        │          │        │        │        │          │
┌───────▼──┐ ┌─────▼──┐ ┌──▼────┐ ┌─▼─────┐ ┌▼──────┐ ┌▼──────────┐
│  Auth    │ │  User  │ │Request│ │Matchng│ │Notif. │ │  Scoring  │
│ Service  │ │Service │ │Service│ │Engine │ │Service│ │  Service  │
│ (Node.js)│ │(Node.js│ │(Node) │ │(Python│ │(Node) │ │ (Python)  │
└───┬──────┘ └───┬────┘ └──┬────┘ └──┬────┘ └───┬───┘ └───┬───────┘
    │            │          │          │           │         │
┌───▼────────────▼──────────▼──────────▼───────────▼─────────▼────────┐
│                       MESSAGE BUS (Redis Streams / Kafka)             │
│   Events: request.created · donor.responded · donation.outcome · ... │
└──────────┬──────────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────────────┐
│                       DATA LAYER                                      │
│  ┌─────────────┐  ┌────────────────┐  ┌─────────────┐  ┌──────────┐│
│  │  PostgreSQL  │  │  Redis (cache) │  │  S3 / R2    │  │ Pinpoint ││
│  │  (Primary DB)│  │  session/queue │  │  (file stor)│  │ (SMS/FCM)││
│  └─────────────┘  └────────────────┘  └─────────────┘  └──────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Frontend Architecture

### Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | SSR for public request pages (WhatsApp share links must render on social preview), RSC for performance |
| Language | **TypeScript** | Type safety across all data models |
| Styling | **Tailwind CSS + shadcn/ui** | Rapid UI with consistent design tokens |
| State | **Zustand** (local) + **React Query / TanStack Query** (server) | Server state separated from UI state; cache invalidation built-in |
| Maps | **Leaflet.js** | India-optimised maps, offline tile support |
| Real-time | **WebSocket** via socket.io-client | Live request updates, donor interest feed |
| Notifications | **Firebase Cloud Messaging (FCM)** via service worker | Push in PWA |
| Forms | **React Hook Form + Zod** | Schema-driven validation matching backend Zod schemas |
| HTTP Client | **Native `fetch` wrapped in `lib/api.ts`** | ⚠️ **FIX** — Axios removed; no heavy dependency needed when fetch covers all requirements with a thin token-refresh wrapper |
| Mobile | **React Native (Expo)** — separate app sharing backend | Same API layer, native push handling |

### Page & Component Structure

> ⚠️ **FIX — Page routing was wrong**: The original used separate `(donor)/` and `(patient)/` route groups with different homes. This is impractical — the same user can be both. The corrected structure uses a single `(app)/` group with a shared home and role-specific tabs. Separate `donor/` and `patient/` sub-routes still exist for dedicated views.

```
app/
├── (public)/
│   ├── page.tsx                  # Landing page — unauthenticated
│   ├── r/[token]/page.tsx        # Public request page (WhatsApp share target)
│   │                             # ⚠️ FIX: was /request/[id] — UUIDs in share links
│   │                             # are scrape-able; opaque share tokens are safer
│   └── register/page.tsx
│
├── (auth)/
│   ├── login/page.tsx
│   └── onboarding/page.tsx       # Post-registration profile completion
│
├── (app)/                        # ⚠️ FIX: was split into (donor)/ and (patient)/
│   │                             # — a single user can do both; one protected shell
│   ├── home/page.tsx             # Unified home — shows request feed + "Post request" CTA
│   ├── profile/page.tsx          # Single profile page with donor + patient sections
│   ├── my-requests/page.tsx      # All requests this user has posted
│   ├── my-donations/page.tsx     # All donation activity (interests, outcomes)
│   ├── request/new/page.tsx      # Multi-step request creation
│   ├── request/[id]/page.tsx     # Request tracker (owned) or request detail (donor view)
│   └── respond/[requestId]/page.tsx  # Donor respond flow
│
├── (org)/
│   ├── dashboard/page.tsx        # Org command centre
│   ├── requests/page.tsx         # Org request management
│   ├── inventory/page.tsx        # Blood unit inventory
│   └── requests/new/page.tsx     # Post on behalf of patient
│
└── (admin)/
    ├── dashboard/page.tsx
    ├── orgs/page.tsx             # Org verification queue
    ├── flags/page.tsx            # Flagged accounts / requests
    ├── proofs/page.tsx           # Blood group proof review queue
    └── users/[id]/page.tsx       # User detail / dispute review
```

### Global Components

#### `<Navbar />`

> ⚠️ **FIX**: Original had three separate Navbar variants hardcoded per role. Because one user can now be donor AND patient, the navbar uses a single shell with conditional elements:

- **Public**: Logo, "Find donors", "Active requests", Register CTA, Login CTA, blood group quick-search pill
- **Authenticated (Individual)**: Avatar, links (Home / My Requests / My Donations / Profile), notification bell with unread count badge, availability toggle (if donor-capable), logout
- **Org**: Org name + verified badge, links (Dashboard / Requests / Inventory), pending verification warning banner
- **Admin**: Admin label, links (Overview / Reports / Orgs / Users / Disputes)

#### `<EmergencyBanner />`
- Sticky top strip, overlays every page
- Renders only when: `user.donorCapable && user.available && hasMatchingEmergencyRequest`
- Data: blood group + distance + hospital name, deep link to request
- Dismiss is session-scoped (sessionStorage), not permanent
- Driven by WebSocket event `emergency.request.nearby`

#### `<NotificationDrawer />`
- Slide-in panel from bell icon
- Notifications grouped: Emergency | Request Updates | System
- Per-notification-type toggles for push / SMS / email
- Each notification has a deep link to source request
- State managed by `useNotifications()` hook backed by React Query + WebSocket subscription

#### `<LocationPrompt />`
- Browser `navigator.geolocation` with permission grant flow
- Manual fallback: city/pincode text entry
- Radius selector: 5 / 10 / 25 / 50 km
- Coordinates stored in user profile, cached in localStorage for repeat sessions

---

### Page 1: Registration & Login

**Component tree:**
```
<RegistrationPage>
  <RoleSelector />          # Step 0: 3 tiles — Individual, Hospital/Org, (Admin = no self-reg)
                            # ⚠️ FIX: was 4 tiles (Donor, Patient, Hospital, Org)
                            # Donor and Patient are not account types — they're capabilities
  <BasicDetailsForm />      # Step 1: name, phone, DOB, email
  <OrgDetailsForm />        # Step 1b (org only): name, reg no., type, license upload
  <PhoneOTPVerify />        # Step 2: 6-digit OTP, 60s resend timer
  <EmailVerify />           # Step 3 (optional skip): magic link
</RegistrationPage>
```

**Design decisions:**
- Phone OTP is **mandatory** and blocks all further action until complete.
- Password is **not required** for individuals — phone OTP is the primary credential. Password is optional hardening.
- Org accounts: after form submit, state = `PENDING_VERIFICATION`. Org dashboard is locked until admin approves.
- Quick registration path (from WhatsApp share link): minimal fields (name, phone, blood group), OTP verify, blood group proof deferred but flagged as unverified.

> ⚠️ **FIX**: Original registration forced role selection first and routed Donor vs Patient to different flows. In practice a user might not know which "role" they are. The new flow: everyone registers as an Individual. They optionally fill in blood group (to activate donor capabilities) and can post requests immediately without any extra step.

---

### Page 2: Profile

**Component tree (Individual):**
```
<ProfilePage>
  <ProfileHeader />           # Avatar, name, phone/email verified chips
  <BloodGroupPanel />         # Group display, change request triggers proof upload
                              # ⚠️ FIX: "verified donor" badge only shows here, not in navbar
  <DonorCapabilitySection />  # Collapsed if blood group not verified
    <EligibilityPanel />      # Last donation date, next eligible date, rest period status
      <DonationTypeToggles /> # Whole blood / Platelets / Plasma — separate eligibility per type
      <TemporaryDeferral />   # Illness/medication deferral with auto-return date
    <AvailabilityToggle />    # ON/OFF — disabled when ineligible, snooze options
  <LocationPanel />           # City, state, pin, radius preference
  <ReputationPanel />         # Donations count, response rate, no-show count, flagged items
  <ActivityHistory />         # Donation history + request history in tabs
                              # ⚠️ FIX: original had separate donor/patient activity; unified here
  <NotificationPrefs />       # Per-type channel toggles, quiet hours, max daily alerts
  <VerificationStatus />      # Phone/email/blood group verification chips
</ProfilePage>
```

**Donor eligibility rules enforced in UI and backend:**

| Component | Rest Period | Enforced by |
|---|---|---|
| Whole Blood | 56 days (8 weeks) | Toggle disabled |
| Platelets | 7 days (max 24/year) | Toggle disabled per component |
| Plasma | 28 days | Toggle disabled per component |
| Weight < 45 kg | Indefinite | Toggle disabled |
| Temporary deferral | Admin/self-set date | Toggle disabled until date passes |

> ⚠️ **FIX**: The original `computeEligibility` function checked `!donor.blood_group_verified` as an eligibility gate for *toggling availability*. This is fine. But the original architecture also described a "Patient profile" with no eligibility — that only makes sense if Donor and Patient are different account types. Since they're unified now, the eligibility section is simply hidden/collapsed when no blood group is set.

---

### Page 3: Home (Unified — Individual View)

> ⚠️ **FIX**: The original had two separate home pages — `DonorHomePage` (request feed) and `PatientHomePage` (donor cards). This is a practical problem: which page does the app show when the same person is both? The corrected design uses a single home with tabs/sections.

**Component tree:**
```
<HomePage>
  <MassCasualtyBanner />     # Shown only in mass casualty mode
  <HomeTabs>
    <Tab label="Find Donors">           # Active if: user has an active blood request
      <FilterBar />                     # Blood group, distance, component
      <DonorFeed>
        <DonorCard />                   # Avatar initials, blood group badge, availability dot,
                                        # distance, last donated, trust badge, "Request contact" CTA
      </DonorFeed>
    </Tab>
    <Tab label="Donate Blood">          # Active if: user is donor-capable
      <FilterBar />                     # Blood group chips, urgency, distance slider, component type
      <MapListToggle />                 # Toggle between map and card list
      <LiveDashboardStrip />            # Auto-refreshes every 30s, new request toasts
      <RequestFeed>
        <RequestCard />                 # Per request — blood group, urgency, hospital, distance,
                                        # "I can donate" CTA
      </RequestFeed>
    </Tab>
  </HomeTabs>
  <FAB label="Post Blood Request" />    # Floating action button — always visible for any user
</HomePage>
```

> ⚠️ **FIX — Filter logic was missing city as a default context**: The FilterBar must default to the user's saved city/radius. Without this, a donor in Chennai sees requests in Mumbai. The city/radius should pre-fill from `user.donorProfile.city` and `notificationRadiusKm`.

**RequestCard** shows:
- Blood group badge (colour-coded: O− = universal red, O+ = red, A/B = blue/green, AB = purple)
- Urgency chip: Emergency (red) / High (amber) / Normal (grey)
- Hospital name + distance in km
- Units needed + component (whole blood / platelets / plasma)
- Time posted + "expires in Xh Xm"
- "I can donate" button → `<InterestModal />`

> ⚠️ **FIX**: The original showed an "AI response likelihood chip" (High/Medium/Low) in the `RequestCard` and noted it's "not directly labeled as AI to the donor." This is deceptive UX — the chip is visible to the donor but its meaning is hidden. Removed from donor-facing card. The AI score remains internal to the matching engine only.

**Blood compatibility filter default:** Shows all compatible requests for the donor's blood group; incompatible requests are hidden by default (donor can toggle "Show all" to see greyed-out incompatible cards with a label).

> ⚠️ **FIX**: Original showed ALL blood groups including incompatible ones by default (greyed). For a busy donor, seeing 12 greyed requests and 2 relevant ones is poor UX. Default to compatible-only; show-all is opt-in.

**DonorCard** shows (in Find Donors tab):
- Initials avatar (no photo — privacy)
- Blood group badge
- Availability status dot (green = available, grey = unavailable)
- Distance ("3.2 km away")
- Last donated ("18 days ago" — freshness signal without revealing date)
- Donation count (anonymised: "5 donations")
- Trust indicator chip: "Verified donor" / "Unverified" / "New"
- "Request contact" button → triggers OTP contact reveal flow

> ⚠️ **FIX — Patient home page "Find Donors" was a browsable donor directory**: Any patient could see all available donors nearby. This is a privacy risk — it lets anyone enumerate donors' rough locations and blood groups without any linked request. The corrected model requires an **active blood request** before the "Find Donors" tab is shown. If the user has no active request, the tab shows an empty state: "Post a request first to find matching donors."

---

### Page 4: Request Creation (Any Individual or Org)

> ⚠️ **FIX**: Original restricted request creation to "Patient" role. Since all individuals can post requests, this is now available to any authenticated user.

**Component tree:**
```
<RequestCreationPage>
  <StepIndicator step={currentStep} />   # 3-step progress bar

  {step === 1 && <BloodDetailsStep />}
    # Blood group grid (8 types), component picker, units stepper,
    # urgency picker (Emergency/High/Normal), required-by date+time

  {step === 2 && <HospitalStep />}
    # Hospital name search (against verified DB) + manual entry fallback
    # Ward/room number (shown only to contact-revealed donors — not in card)
    # Location autofill from profile or map pick
    # Attending doctor (optional)
    # Guardian contact override (if different from profile)
    # Document upload: prescription/lab report (optional but prompted)

  {step === 3 && <ReviewAndSubmit />}
    # Full summary card with edit links per section
    # Estimated matching donors count (live query)
    # Consent toggle for push notifications
    # Submit → request goes live, system begins matching immediately

  {submitted && <RequestTracker requestId={id} />}
</RequestCreationPage>
```

> ⚠️ **FIX**: The 3-step form had no validation that `requiredBy` is actually in the future and not more than 72 hours away (requests expiring in 30 days are useless as emergencies). Added: `requiredBy` must be between 30 minutes and 72 hours from now for EMERGENCY/HIGH. NORMAL requests can go up to 7 days.

---

### Request Tracker (Post-Submit)

```
<RequestTracker>
  <StatusTimeline />         # Posted → Notified → Interest received → Confirmed → Fulfilled
  <DonorSlotList>
    <DonorSlot />            # Per donor: Interested → Contact revealed → Confirmed → Donated/No-show
                             # Shows: blood group, trust badge, "Reveal contact" button, ETA
  </DonorSlotList>
  <UnitsCounter />           # "2 of 3 units confirmed"
  <ActionBar />              # Re-activate search, Extend expiry, Share to WhatsApp, Mark fulfilled, Cancel
</RequestTracker>
```

**Key invariant**: Request status is **never automatically closed** when a donor confirms. Only the patient or org explicitly marks it fulfilled, or the platform closes it after expiry + 24h grace.

> ⚠️ **FIX**: Original had "Reveal contact" as a button directly on `<DonorSlot />`. The contact reveal flow requires the patient to first see the donor's profile preview (trust badge, blood group, donation count). The "Reveal contact" button must open `<ContactRevealModal />` first, not trigger OTP immediately.

---

### Donor Response Flow (Full modal chain)

```
"I can donate" tap →
<InterestModal>
  Full request summary
  Eligibility check result (green/red per component)
  ETA picker (time I can arrive)
  Warning: "Contact will be revealed only after patient initiates OTP"
  [Submit interest]
</InterestModal>

Patient taps "Reveal contact" →
<ContactRevealModal>
  Donor profile preview (blood group, donations count, trust badge)
  Warning: "Phone numbers will be shared bilaterally and permanently"
  Warning: "Donation must be voluntary. Report if donor asks for money."
  [Send OTP to donor's phone]   ← ⚠️ FIX: was "Send OTP to donor" ambiguously
                                   — OTP goes to DONOR'S phone, not the patient's
</ContactRevealModal>

OTP fires to donor's phone →
<OTPConfirmScreen>  ← ⚠️ FIX: this screen renders in the DONOR's app/session, not the patient's
  6-digit OTP entry
  "By entering this OTP, you confirm you intend to donate"
  [Confirm] → both phones revealed simultaneously
</OTPConfirmScreen>

After OTP confirmed →
Donor sees: full hospital address + ward + nurse contact
Patient sees: "Donor confirmed — arriving by [ETA]"
```

> ⚠️ **FIX — Critical UX gap**: The original flow said "OTP fires to donor's phone → `<OTPConfirmScreen>`" but didn't specify *where* that screen appears. The donor must be in the app (or open the app from the SMS link) to enter the OTP. The flow requires: (1) SMS to donor with OTP + deep link, (2) donor opens the deep link → lands on OTP entry screen in-app. The patient sees "Waiting for donor to confirm OTP" until this completes.

---

### Outcome Reporting (2h after ETA)

Both donor and patient receive a push notification:

**Donor outcome prompt:**
- Donated successfully ✓
- Turned away — reason: [Hemoglobin too low / Blood group mismatch / Other medical / No bed available]
- No-show (if they missed their own ETA — rare for self-report but possible)

**Patient outcome prompt:**
- Donor came and donated ✓
- Donor came but was rejected at hospital
- Donor didn't come (no-show)
- Donor asked for payment (report)

Outcome reasons are differentiated in the scoring system — medical deferrals do NOT penalise the donor's reliability score.

> ⚠️ **FIX**: The 2-hour timer after ETA is based on the **donor's set ETA**, not the request's `required_by` time. If a donor sets ETA as 3:45 PM, the outcome prompt fires at 5:45 PM. If no ETA is set (donor showed interest but was not contact-revealed), no outcome prompt is sent for that slot.

---

### Org Dashboard

```
<OrgDashboardPage>
  <StatsBar />               # Active requests / Fulfilled today / Pending contacts
  <InventoryPanel>
    <InventoryRow />         # Per blood group: current units on hand
  </InventoryPanel>
  <ActiveRequestsTable />    # All org-posted requests with status, donor counts, ETA
  <DonorContactQueue />      # Donors who responded to org requests — reveal contact handles
  <QuickActions />           # "Post new request" / "Post on behalf of patient" shortcuts
</OrgDashboardPage>
```

**Org-specific invariants:**
- Orgs in `PENDING_VERIFICATION` state see zero donor data
- Orgs can only see donors who responded to *their* requests — no browsable donor directory
- "Post on behalf of patient" creates a request with `patient_type: ANONYMOUS` — family can be linked later

> ⚠️ **FIX**: The `DonorContactQueue` on the org dashboard showed "Donors who responded to org requests — reveal contact handles." This implies the org can directly see donor contacts from the dashboard without going through the OTP flow. That breaks the trust model. The correct flow: org sees interested donors per request in the `ActiveRequestsTable` row expansion; contact reveal still goes through the OTP-gated flow per the standard path.

---

## 4. Backend Service Decomposition

Each service is independently deployable, owns its own DB tables, and communicates via events on the message bus (except for synchronous user-facing flows which use direct HTTP).

### 4.1 Auth Service

**Tech**: Node.js + Express + Passport.js
**Owns**: Session tokens, OTP lifecycle, device trust
**DB Tables**: `auth_sessions`, `otp_attempts`, `trusted_devices`

**Responsibilities:**
- Phone OTP generation, delivery (via SMS Service), and validation
- JWT issuance (access token: 15m, refresh token: 30d stored in httpOnly cookie)
- Password (optional) hash/verify using bcrypt
- Device trust: after OTP, device is optionally marked trusted for 30 days
- Contact-reveal OTP: separate OTP purpose code (`purpose: CONTACT_REVEAL`) — not reusable for login
- OTP rate limits: max 5 attempts per phone per 10 minutes, max 3 sends per phone per hour
- Session revocation (for account suspension, impersonation disputes)
- Publishes: `auth.otp.sent`, `auth.session.created`, `auth.contact_reveal.completed`

**Endpoints:**
```
POST /auth/otp/send           # Send OTP to phone number
POST /auth/otp/verify         # Verify OTP, returns tokens
POST /auth/refresh            # Refresh access token
POST /auth/logout
POST /auth/otp/contact-reveal/send    # Purpose-specific OTP for contact reveal
POST /auth/otp/contact-reveal/verify  # Marks reveal complete, unlocks both phones
```

---

### 4.2 User Service

**Tech**: Node.js + Express
**Owns**: User profiles, donor eligibility state, org verification state
**DB Tables**: `users`, `donor_profiles`, `org_profiles`, `blood_group_verifications`, `reputation_records`

> ⚠️ **FIX**: The original had separate `patient_profiles` table. In the unified model, all individuals share one `donor_profiles` table (which holds optional donor fields). There is no separate `patient_profiles` — the `users` table holds `guardian_name`, `guardian_phone`, `primary_hospital`, `preferred_contact` for anyone who needs them.

**Responsibilities:**
- User CRUD, profile management
- Donor eligibility computation (56/7/28-day rules, weight, deferral)
- Availability toggle enforcement (rejects toggle-on if ineligible, computes ineligibility reason)
- Blood group change requests: stores proof document reference, sets status to `UNDER_REVIEW`
- Blood group verification workflow (admin approval endpoint)
- Org verification workflow: receives org registration, sends to admin queue, updates status
- Reputation management: tracks donation count, response rate, no-show count, declined-after-reveal flag
- Geo coordinates update from profile (stored as PostGIS `POINT`)
- Publishes: `user.donor.availability_changed`, `user.blood_group.verified`, `user.org.verified`

**Eligibility computation (pure function, called on every availability toggle attempt):**
```typescript
function computeEligibility(donor: DonorProfile, component: BloodComponent): EligibilityResult {
  const daysSinceLast = daysSince(donor.last_donation_date[component]);
  const restPeriod = REST_PERIODS[component]; // {WHOLE_BLOOD: 56, PLATELETS: 7, PLASMA: 28}

  if (!donor.blood_group_verified) return { eligible: false, reason: 'UNVERIFIED_BLOOD_GROUP' };
  if (donor.weight_kg !== null && donor.weight_kg < 45) return { eligible: false, reason: 'WEIGHT_BELOW_MIN', unblockDate: null };
  if (donor.temporary_deferral_until && donor.temporary_deferral_until > now()) return { eligible: false, reason: 'TEMP_DEFERRAL', unblockDate: donor.temporary_deferral_until };
  if (daysSinceLast !== null && daysSinceLast < restPeriod) return { eligible: false, reason: 'REST_PERIOD', unblockDate: addDays(donor.last_donation_date[component], restPeriod) };

  return { eligible: true };
}
```

> ⚠️ **FIX**: Original checked `donor.weight < 45` but `weight_kg` can be null for donors who haven't entered it. The corrected function checks `!== null` before the comparison. Weight is only a hard gate if it has been entered and is below 45 — not if it's missing (user is prompted to enter weight, but it doesn't block immediately on first registration).

---

### 4.3 Request Service

**Tech**: Node.js + Express
**Owns**: Blood requests, donor interest records, contact reveal logs, outcome reports
**DB Tables**: `blood_requests`, `donor_interests`, `contact_reveals`, `outcome_reports`, `request_flags`

**Responsibilities:**
- Blood request CRUD (any individual or org actor)
- Urgency validation: `EMERGENCY` requires hospital in verified DB, else capped to `HIGH`
- Rate limit enforcement: max 2 active requests per user, 1 EMERGENCY per 24h
- Hospital lookup against verified hospital database (provided by Org Service)
- Request status machine transitions (see Section 7)
- Donor interest recording, ETA management
- Contact reveal orchestration: checks rate limit (3 reveals/request/hour), triggers Auth Service OTP, logs reveal with timestamp and both user IDs
- Outcome report ingestion: classifies outcome, delegates reputation update to User Service
- Mass casualty detection: if >10 EMERGENCY requests in same city within 30 min, publishes `system.mass_casualty.detected`
- Request flag ingestion from donors (suspicious request reports)
- Auto-flagging rules: requests with ≥5 reveals and no close/fulfil after 2h

> ⚠️ **FIX**: The original auto-flagging rule was "≥5 reveals and no close." But a 4-unit request could legitimately have 5+ reveals (family reveals contact with 5 different donors to get 4 confirmed). The corrected rule: flag if `reveal_count > (units_needed * 2)` AND `units_confirmed == 0` AND request is older than 2h.

- New donor registration trigger: on `user.blood_group.verified` event, queries for open requests matching blood group + city, fires `request.new_eligible_donor_for_open_request` event
- Publishes: `request.created`, `request.donor.interested`, `request.contact_revealed`, `request.fulfilled`, `request.expired`, `request.flagged`

**Request state transitions (abbreviated — see Section 7 for full FSM):**
```
DRAFT → ACTIVE → PARTIALLY_FULFILLED → FULFILLED
                → EXPIRED
                → CANCELLED
```

---

### 4.4 Matching Engine

**Tech**: Python + FastAPI
**Owns**: Donor-to-request matching computation
**DB Read**: users, donor_profiles (PostGIS), blood_requests
**No writes** — read-only service, delegates actions back via events

**Responsibilities:**
- Blood compatibility matrix lookup (see Section 8)
- Geospatial query: PostGIS ST_DWithin for donors within radius
- Radius expansion for rare blood groups: AB−, B−, A−, O− blood requests expand from 10km → 25km → 50km in steps
- Mass casualty mode: deduplicates donor notification queue, caps at 1 alert per 15 min per donor
- Donor scoring-weighted ranking: reads AI scores, ranks notification order
- Fatigue guard check: reads donor's notification history for last 24h — if 3+ unresponded alerts, donor is deprioritised
- Delivery confirmation tracking: marks notifications as delivered, not just sent (used for non-response scoring)
- Platelet pool separation: platelet requests only match donors with `donor_profile.platelet_eligible = true`
- Publishes: `matching.donor_batch_selected` (list of donor IDs to notify, in priority order)

> ⚠️ **FIX**: The matching engine performed a geospatial query against the hospital's location (`request.hospital_location`). But in the MVP/early phase, many requests won't have a verified hospital with a known lat/lon. The fallback must be: if `hospital_location` is null, match against `hospital_city` text field using city-level donor index. Geospatial matching is best-effort, city matching is the baseline.

---

### 4.5 Notification Service

**Tech**: Node.js + Bull (Redis-backed queue)
**Owns**: Notification delivery, channel selection, delivery tracking
**DB Tables**: `notification_log`, `delivery_confirmations`, `donor_notification_daily_counts`

**Responsibilities:**
- Consumes `matching.donor_batch_selected` → fires push + SMS per donor
- Channel selection logic (per donor preference + connectivity signal):
  - Default: Push (FCM) + SMS simultaneously for EMERGENCY
  - High/Normal: Push first, SMS if push not delivered within 5 min
  - Donor preference override: "always SMS for Emergency"
- SMS delivery via AWS SNS (primary) + Twilio (fallback) — India A2P SMS
- FCM push via Firebase Admin SDK
- Rate limiting: per-request (1 blast / 30 min), per-donor (max N per day, configurable)
- Mass casualty deduplication: collapses N matching requests into 1 consolidated alert
- Delivery confirmation webhook ingestion (FCM delivery receipt, SMS delivery report)
- `delivery_confirmed` event published back to Matching Engine for non-response scoring
- In-app notifications written to Redis Pub/Sub → WebSocket broadcast to connected clients
- Email notifications for non-time-critical events (account updates, weekly donation stats)
- Publishes: `notification.delivered`, `notification.failed`

---

### 4.6 AI Scoring Service

**Tech**: Python + FastAPI + scikit-learn (initial) → PyTorch (v2)
**Owns**: Donor response likelihood scores
**DB Tables**: `ai_scores`, `scoring_features`, `outcome_training_data`

**Responsibilities:**
- Score computation: P(donor responds and donates | request features, donor features)
- Feature inputs:
  - Donor: response rate (30-day), fulfillment rate, average response time, active hours (time-of-day histogram), distance distribution of past donations, platelet eligibility, days since last donation, no-show count
  - Request: urgency, blood group rarity, component type, time of day, day of week, competing requests in same city
- Score output: float 0–1, mapped to High/Medium/Low for internal notification priority
- Score refresh: on `donation.outcome_reported` event — incremental update, full retrain nightly
- Score stored in Redis (TTL 6h) with fallback to last DB-stored score
- Offline scoring: pre-computes scores for all active donors nightly, caches results
- Cold start: new donors get a neutral score (0.5) until they have 3+ interactions
- **Score is never shown to the donor** — it is a notification priority signal only
- Publishes: `scoring.donor_scores_updated`

---

### 4.7 Admin Service

**Tech**: Node.js + Express
**Owns**: Org verification workflow, account suspension, flag review
**DB Tables**: `admin_actions`, `org_verification_queue`, `flagged_accounts`, `dispute_records`

**Responsibilities:**
- Org verification queue: admin checklist against NBTC / state blood bank registry
- Org approval/rejection with audit log
- Account suspension (payment report → immediate soft suspension pending review)
- Flag review: suspicious request, fake hospital, no-show dispute
- No-show dispute resolution: donor can appeal, admin reviews, removes flag if valid
- Donor blood group proof review (approve/reject proof documents)
- Mass casualty alert dashboard: admin sees spike in real-time
- All admin actions are immutable audit log entries (append-only table)

---

## 5. Data Models & Schema

### users
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         VARCHAR(15) UNIQUE NOT NULL,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  email         VARCHAR(255) UNIQUE,
  email_verified BOOLEAN DEFAULT false,
  full_name     VARCHAR(255) NOT NULL,
  role          VARCHAR(10) NOT NULL CHECK (role IN ('INDIVIDUAL', 'ORG', 'ADMIN')),
  -- ⚠️ FIX: removed DONOR/PATIENT enum values — role is now INDIVIDUAL/ORG/ADMIN only
  password_hash VARCHAR(255),           -- nullable; optional for individual users
  -- Patient-convenience fields (applicable to any individual posting a request)
  guardian_name  VARCHAR(255),
  guardian_phone VARCHAR(15),
  preferred_contact VARCHAR(20) DEFAULT 'PHONE' CHECK (preferred_contact IN ('PHONE','WHATSAPP','APP')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  suspended     BOOLEAN DEFAULT false,
  suspension_reason TEXT
);
```

### donor_profiles
```sql
CREATE TABLE donor_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id),
  -- Blood group is optional until the user wants to activate donor capabilities
  blood_group       VARCHAR(3) CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  blood_group_verified BOOLEAN DEFAULT false,
  blood_group_proof_key VARCHAR(500),     -- S3/R2 object key
  donor_activated   BOOLEAN GENERATED ALWAYS AS (blood_group_verified) STORED,
  -- ⚠️ FIX: donor_activated is now a computed column — a donor is activated iff blood group is verified

  -- Per-component last donation dates
  last_whole_blood_donation   DATE,
  last_platelet_donation      DATE,
  last_plasma_donation        DATE,

  -- Eligibility flags
  weight_kg         DECIMAL(5,2),           -- nullable; gate only applies if entered
  platelet_eligible BOOLEAN DEFAULT false,   -- opt-in for apheresis donations

  -- Deferral
  temp_deferral_until       DATE,
  temp_deferral_reason      VARCHAR(255),

  -- Availability
  available                 BOOLEAN DEFAULT false,
  availability_snooze_until DATE,

  -- Location (PostGIS)
  location                  GEOGRAPHY(POINT, 4326),
  city                      VARCHAR(100),
  state                     VARCHAR(100),
  pincode                   VARCHAR(10),
  notification_radius_km    INT DEFAULT 10,

  -- Reputation
  total_donations           INT DEFAULT 0,
  response_rate_30d         DECIMAL(4,3),   -- null = cold start
  fulfillment_rate          DECIMAL(4,3),
  no_show_count             INT DEFAULT 0,
  declined_after_reveal     INT DEFAULT 0,

  -- Notification prefs
  notif_push_emergency      BOOLEAN DEFAULT true,
  notif_sms_emergency       BOOLEAN DEFAULT true,
  notif_push_high           BOOLEAN DEFAULT true,
  notif_sms_high            BOOLEAN DEFAULT false,
  notif_quiet_start         TIME,
  notif_quiet_end           TIME,
  notif_max_per_day         INT DEFAULT 5,

  updated_at                TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_donor_location ON donor_profiles USING GIST(location);
CREATE INDEX idx_donor_blood_available ON donor_profiles(blood_group, available) WHERE available = true;
```

### org_profiles
```sql
CREATE TABLE org_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id),
  org_name          VARCHAR(255) NOT NULL,
  registration_no   VARCHAR(100) NOT NULL,
  org_type          VARCHAR(20) CHECK (org_type IN ('HOSPITAL','BLOOD_BANK','NGO')),
  address           TEXT,
  pincode           VARCHAR(10),
  license_key       VARCHAR(500),          -- S3 key for uploaded license
  verification_status VARCHAR(20) DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED')),
  verified_at       TIMESTAMPTZ,
  verified_by       UUID REFERENCES users(id),
  location          GEOGRAPHY(POINT, 4326),

  -- Inventory (denormalised for speed — updated on fulfillment events)
  inventory_a_pos   INT DEFAULT 0,
  inventory_a_neg   INT DEFAULT 0,
  inventory_b_pos   INT DEFAULT 0,
  inventory_b_neg   INT DEFAULT 0,
  inventory_ab_pos  INT DEFAULT 0,
  inventory_ab_neg  INT DEFAULT 0,
  inventory_o_pos   INT DEFAULT 0,
  inventory_o_neg   INT DEFAULT 0
);
```

### blood_requests
```sql
CREATE TABLE blood_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id      UUID REFERENCES users(id),      -- any individual or org
  requester_type    VARCHAR(20) NOT NULL CHECK (requester_type IN ('INDIVIDUAL', 'ORG')),
  patient_anonymous BOOLEAN DEFAULT false,          -- ⚠️ FIX: renamed from patient_type ENUM for clarity

  -- Blood details
  blood_group       VARCHAR(3) NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  component         VARCHAR(20) NOT NULL CHECK (component IN ('WHOLE_BLOOD','PLATELETS','PLASMA','RBC')),
  units_needed      INT NOT NULL CHECK (units_needed > 0 AND units_needed <= 10),
  units_confirmed   INT DEFAULT 0,
  urgency           VARCHAR(20) NOT NULL CHECK (urgency IN ('EMERGENCY','HIGH','NORMAL')),
  required_by       TIMESTAMPTZ NOT NULL,

  -- Hospital (denormalised for search / display)
  hospital_name     VARCHAR(255) NOT NULL,
  hospital_id       UUID REFERENCES verified_hospitals(id),  -- null if unverified entry
  hospital_verified BOOLEAN DEFAULT false,
  hospital_city     VARCHAR(100),
  hospital_state    VARCHAR(100),
  hospital_location GEOGRAPHY(POINT, 4326),         -- null if hospital not in verified DB

  -- Sensitive — shown only after contact reveal
  ward_number       VARCHAR(50),
  attending_doctor  VARCHAR(255),
  guardian_phone_override VARCHAR(15),              -- ⚠️ FIX: was missing from blood_requests; needed for org posts on behalf of anonymous patients

  -- Document
  prescription_key  VARCHAR(500),    -- S3 key, optional

  -- Share token (opaque, for WhatsApp links)
  share_token       VARCHAR(64) UNIQUE,              -- ⚠️ FIX: was missing from production schema; present in MVP but not architecture

  -- State machine
  status            VARCHAR(30) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PARTIALLY_FULFILLED','FULFILLED','EXPIRED','CANCELLED')),
  created_at        TIMESTAMPTZ DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  fulfilled_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,

  -- Abuse guards
  notification_last_sent_at TIMESTAMPTZ,
  flag_count        INT DEFAULT 0,
  is_flagged        BOOLEAN DEFAULT false,
  mass_casualty_included BOOLEAN DEFAULT false
);

CREATE INDEX idx_requests_active ON blood_requests(status, blood_group, hospital_city)
  WHERE status = 'ACTIVE';
-- ⚠️ FIX: original index included hospital_location in compound index — but location is nullable.
-- Use a partial index on city for the common case; geospatial queries use a separate GIST index.
CREATE INDEX idx_requests_location ON blood_requests USING GIST(hospital_location)
  WHERE hospital_location IS NOT NULL;
```

### donor_interests
```sql
CREATE TABLE donor_interests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID REFERENCES blood_requests(id),
  donor_id      UUID REFERENCES users(id),
  status        VARCHAR(30) DEFAULT 'INTERESTED'
                  CHECK (status IN ('INTERESTED','REVEAL_PENDING','CONTACT_REVEALED',
                         'CONFIRMED','DONATED','TURNED_AWAY','NO_SHOW','DECLINED','WITHDRAWN')),
  -- ⚠️ FIX: added REVEAL_PENDING and WITHDRAWN states that were described in the FSM (Section 7)
  -- but missing from the donor_interests status enum
  eta           TIMESTAMPTZ,
  outcome_reported_at TIMESTAMPTZ,
  outcome_reason VARCHAR(100),   -- for TURNED_AWAY: reason code
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(request_id, donor_id)
);
```

### contact_reveals
```sql
CREATE TABLE contact_reveals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID REFERENCES blood_requests(id),
  requester_id    UUID REFERENCES users(id),    -- ⚠️ FIX: renamed from patient_id — could be org
  donor_id        UUID REFERENCES users(id),
  initiated_at    TIMESTAMPTZ DEFAULT now(),
  otp_verified_at TIMESTAMPTZ,        -- null until donor enters OTP
  revealed        BOOLEAN DEFAULT false,

  UNIQUE(request_id, donor_id)        -- one reveal record per donor per request
);
-- ⚠️ FIX: removed reveal_count_this_hour denorm column — rate limiting is done in Redis,
-- not as a column on this table. The column was stale and inconsistency-prone.
```

### outcome_reports
```sql
CREATE TABLE outcome_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interest_id       UUID REFERENCES donor_interests(id),
  reporter_id       UUID REFERENCES users(id),              -- ⚠️ FIX: added reporter_id FK
  reporter_role     VARCHAR(20) NOT NULL CHECK (reporter_role IN ('INDIVIDUAL','ORG')),
  -- ⚠️ FIX: was ENUM('DONOR','PATIENT','ORG') — now aligned with the unified role model
  outcome           VARCHAR(30) NOT NULL CHECK (outcome IN ('DONATED','TURNED_AWAY','NO_SHOW','DONOR_DECLINED')),
  outcome_reason    VARCHAR(50) CHECK (outcome_reason IN ('HEMOGLOBIN_LOW','BLOOD_GROUP_MISMATCH','OTHER_MEDICAL',
                         'NO_BED','PERSONAL','PAYMENT_DEMANDED','UNKNOWN')),
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

### notification_log
```sql
CREATE TABLE notification_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id      UUID REFERENCES users(id),
  request_id    UUID REFERENCES blood_requests(id),
  channel       VARCHAR(10) NOT NULL CHECK (channel IN ('PUSH','SMS','EMAIL','IN_APP')),
  sent_at       TIMESTAMPTZ DEFAULT now(),
  delivered_at  TIMESTAMPTZ,    -- populated from delivery receipt
  opened_at     TIMESTAMPTZ,    -- populated from FCM open tracking
  responded     BOOLEAN DEFAULT false  -- did donor take action within 30 min
);
CREATE INDEX idx_notif_donor_day ON notification_log(donor_id, sent_at);
```

### verified_hospitals
```sql
CREATE TABLE verified_hospitals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  aliases     TEXT[],                   -- common short names
  address     TEXT,
  city        VARCHAR(100),
  state       VARCHAR(100),
  pincode     VARCHAR(10),
  location    GEOGRAPHY(POINT, 4326),
  phone       VARCHAR(15),
  nbtc_code   VARCHAR(50),             -- National Blood Transfusion Council code
  verified    BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_hospitals_location ON verified_hospitals USING GIST(location);
CREATE INDEX idx_hospitals_name ON verified_hospitals USING gin(to_tsvector('english', name));
```

### ai_scores
```sql
CREATE TABLE ai_scores (
  donor_id      UUID PRIMARY KEY REFERENCES users(id),
  score         DECIMAL(4,3) NOT NULL DEFAULT 0.5,  -- 0 to 1
  band          VARCHAR(10) GENERATED ALWAYS AS (
                  CASE WHEN score >= 0.7 THEN 'HIGH'
                       WHEN score >= 0.4 THEN 'MEDIUM'
                       ELSE 'LOW' END
                ) STORED,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  interaction_count INT DEFAULT 0   -- < 3 = cold start, neutral score
);
```

---

## 6. API Contract Design

All APIs use JSON. Authentication via `Authorization: Bearer <JWT>` except OTP endpoints. All timestamps are ISO 8601 UTC.

> ⚠️ **FIX**: All API examples previously referenced `axios` in client-side code snippets. Replaced with native `fetch`. See `lib/api.ts` in Section 3 — the thin fetch wrapper handles token injection and refresh transparently.

### Core request patterns

**Create blood request**
```
POST /api/v1/requests
Authorization: Bearer <token>
Body: {
  blood_group: "O+",
  component: "WHOLE_BLOOD",
  units_needed: 2,
  urgency: "EMERGENCY",
  required_by: "2026-06-15T17:00:00Z",
  hospital_name: "Apollo Hospital Vijayawada",
  hospital_id: "uuid-if-found-in-db",
  prescription_key: "uploads/abc123.pdf"  // optional
}

Response 201: {
  id: "uuid",
  status: "ACTIVE",
  share_token: "opaque-token",           // ⚠️ FIX: share_token returned on creation for immediate WhatsApp share
  matching_donors_count: 8,
  expires_at: "2026-06-15T19:00:00Z",
  notification_sent: true
}

Errors:
  429 — rate limit (2 active requests already / 1 emergency per 24h)
  422 — hospital not in verified DB + urgency=EMERGENCY → auto-downgraded to HIGH
  422 — required_by is in the past or more than 72h away (for EMERGENCY/HIGH)
```

**Express donor interest**
```
POST /api/v1/requests/:requestId/interest
Authorization: Bearer <token>
Body: {
  eta: "2026-06-15T15:45:00Z",
  component: "WHOLE_BLOOD"   // validates eligibility for this specific component
}

Response 201: {
  interest_id: "uuid",
  status: "INTERESTED",
  eligibility_check: { eligible: true }
}

Errors:
  403 — donor ineligible (rest period, weight, unverified blood group)
  403 — donor_activated === false (blood group not verified)
  409 — already expressed interest for this request
  403 — requester cannot express interest in own request
  422 — blood group incompatible (rare: client should filter, but server validates)
```

**Initiate contact reveal**
```
POST /api/v1/requests/:requestId/interest/:interestId/reveal
Authorization: Bearer <token>   // request owner or org only
// ⚠️ FIX: was /requests/:requestId/reveal/:donorId — donorId in URL exposes donor UUIDs
// Using interestId scopes the reveal to a specific interest record without leaking donor ID

Response 200: {
  otp_sent: true,
  reveal_id: "uuid",
  donor_preview: {
    blood_group: "O+",
    total_donations: 5,
    trust_badge: "VERIFIED"
  }
}

Errors:
  429 — 3 reveals already initiated this hour for this request
  404 — no expressed interest found for this interestId
  403 — requester is not the request owner or an approved org
```

**Confirm contact reveal (donor enters OTP)**
```
POST /api/v1/reveals/:revealId/confirm
Authorization: Bearer <token>   // donor only — must be the donor in the reveal record
Body: { otp: "483920" }

Response 200: {
  revealed: true,
  patient_phone: "+919876543210",
  hospital_address: "Ward 4, Room 12, ...",
  guardian_name: "Priya S."
}
// Simultaneously, requester's WebSocket receives:
// { event: "contact.revealed", donor_phone: "+91...", donor_name: "Ravi K.", eta: "..." }
```

**Submit outcome report**
```
POST /api/v1/interests/:interestId/outcome
Authorization: Bearer <token>
Body: {
  outcome: "TURNED_AWAY",
  outcome_reason: "HEMOGLOBIN_LOW"
}

Response 200: { recorded: true }
// Triggers:
//   - User Service: update donor reputation (no penalty for TURNED_AWAY medical reasons)
//   - Scoring Service: update AI score features
//   - If NO_SHOW: requester notified, request re-opened for next donor
```

**Report suspicious request (any authenticated user)**
```
POST /api/v1/requests/:requestId/report
Authorization: Bearer <token>
Body: { reason: "FAKE_HOSPITAL" | "SUSPICIOUS_ACTIVITY" | "PAYMENT_DEMANDED" }

Response 200: { flag_count: 2, paused: false }
// paused=true only if flag_count >= 2 AND admin review is pending
// ⚠️ FIX: original said "paused: true" at >= 2 reports — but auto-pausing on 2 reports is
// too aggressive. A request is soft-flagged (shows a warning to requesters + admin sees it)
// but only force-paused after admin review confirms abuse.
```

---

## 7. Request Lifecycle State Machine

```
                        ┌──────────┐
     Patient submits    │          │
     ─────────────────► │  ACTIVE  │
                        │          │
                        └────┬─────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         0 donors       units_confirmed   expires_at
         by expiry      < units_needed    reached
              │              │              │
              ▼              ▼              │
          EXPIRED    PARTIALLY_FULFILLED   │
              │              │              │
    Patient   │     More     │              │
    extends?  │    donors    │              │
    ──────────┘    confirm   │              │
      YES ──► ACTIVE         │              │
      NO  ──► EXPIRED        │              ▼
             (final)         │           EXPIRED
                             │          (final)
                    units_confirmed
                    == units_needed
                             │
                             ▼
                         FULFILLED
                          (final)

    Patient can also explicitly → CANCELLED (final) from any non-final state
```

**Per-request donor slot states:**
```
Interest expressed → INTERESTED
                  → [Patient initiates reveal] → REVEAL_PENDING
                  → [Donor enters OTP] → CONTACT_REVEALED
                  → [Donor sets ETA confirmed] → CONFIRMED
                  → [Outcome reported] → DONATED | TURNED_AWAY | NO_SHOW
                  → [Donor withdraws before OTP] → WITHDRAWN (no penalty)
                  → [Donor withdraws after OTP] → DECLINED_AFTER_REVEAL (soft flag)
```

> ⚠️ **FIX**: `REVEAL_PENDING` state was described in the FSM text but missing from the `donor_interests.status` enum in Section 5. Now corrected in both places. `REVEAL_PENDING` represents the window between "patient tapped Reveal" and "donor entered OTP" — during this window the interest is locked and the donor gets an SMS prompt.

---

## 8. Matching Engine & Blood Compatibility

### Compatibility Matrix

```
Donor Blood Group → Can Donate To (Recipients):
O−  → O−, O+, A−, A+, B−, B+, AB−, AB+   (Universal donor)
O+  → O+, A+, B+, AB+
A−  → A−, A+, AB−, AB+
A+  → A+, AB+
B−  → B−, B+, AB−, AB+
B+  → B+, AB+
AB− → AB−, AB+
AB+ → AB+                                  (Universal recipient — but receives from all)
```

**For platelet compatibility**: largely ABO-independent for transfusion safety; system matches platelet requests to all platelet-eligible donors regardless of blood group (but blood group display still shown for hospital crossmatch).

### Matching Algorithm

```python
def find_matching_donors(request: BloodRequest, session: DB) -> List[RankedDonor]:
    # 1. Get compatible blood groups for this request's blood group
    compatible_groups = COMPATIBILITY_MATRIX[request.blood_group]

    # 2. Determine search radius
    base_radius_km = 10
    if request.blood_group in RARE_GROUPS:  # AB-, B-, A-, O-
        base_radius_km = 25
    if request.urgency == 'EMERGENCY':
        base_radius_km = min(base_radius_km * 1.5, 50)  # ⚠️ FIX: cap expansion at 50km
        # Original had no cap — unbounded expansion on rare groups + emergency could
        # notify donors 75km away who have no realistic way to arrive in time

    # 3. Query strategy: geospatial if hospital_location exists, city-based fallback
    if request.hospital_location:
        donors = session.query(DonorProfile).filter(
            DonorProfile.available == True,
            DonorProfile.blood_group.in_(compatible_groups),
            DonorProfile.blood_group_verified == True,
            _component_eligible(request.component),
            func.ST_DWithin(DonorProfile.location, request.hospital_location, base_radius_km * 1000),
            _not_fatigued()
        ).all()
    else:
        # ⚠️ FIX: city-based fallback for requests without a verified hospital location
        donors = session.query(DonorProfile).filter(
            DonorProfile.available == True,
            DonorProfile.blood_group.in_(compatible_groups),
            DonorProfile.blood_group_verified == True,
            _component_eligible(request.component),
            DonorProfile.city.ilike(request.hospital_city),
            _not_fatigued()
        ).all()

    # 4. Score and rank
    ai_scores = get_ai_scores([d.user_id for d in donors])

    ranked = sorted(donors, key=lambda d: (
        -ai_scores.get(d.user_id, 0.5),     # AI score descending
        -_recency_bonus(d),                   # more recent activity first
        _distance(d.location, request.hospital_location) if request.hospital_location else 0
    ))

    # 5. Mass casualty dedup
    if is_mass_casualty_mode(request.hospital_city):
        ranked = [d for d in ranked if _not_notified_in_last_15_min(d.user_id)]

    return ranked[:MAX_NOTIFY_BATCH]  # typically 8-12 donors per batch
```

---

## 9. Notification Architecture

### Delivery Pipeline

```
matching.donor_batch_selected event
         │
         ▼
Notification Service (Bull Queue worker)
         │
    ┌────┴──────────────────────────────────────────────┐
    │ For each donor in ranked batch:                    │
    │                                                    │
    │  1. Check donor notification prefs                 │
    │  2. Check donor daily cap (notif_max_per_day)      │
    │  3. Check quiet hours                              │
    │  4. Check fatigue guard (3+ unresponded today)     │
    │                                                    │
    │  If EMERGENCY:                                     │
    │    → Send FCM push immediately                     │
    │    → Send SMS simultaneously (dual-channel)        │
    │                                                    │
    │  If HIGH / NORMAL:                                 │
    │    → Send FCM push                                 │
    │    → Set 5-min timer: if no delivery receipt,     │
    │      send SMS as fallback                          │
    │                                                    │
    │  Write notification_log entry                      │
    └───────────────────────────────────────────────────┘
         │
    ┌────▼─────────────────┐    ┌────────────────────┐
    │  FCM (Firebase)      │    │  SMS Gateway       │
    │  → App push (Android │    │  → AWS SNS (India) │
    │    / iOS / PWA)      │    │  → Twilio fallback │
    └────────────────────┘     └────────────────────┘
         │                              │
    Delivery receipt               Delivery report
    (FCM ACK)                      (DLR callback)
         │                              │
         └──────────────┬───────────────┘
                        ▼
              notification_log.delivered_at updated
              → Event: notification.delivered
              → Matching Engine marks donor as "notified"
              → Non-response tracking starts (30-min window)
```

### Fatigue Guard Logic

```
Daily fatigue counter per donor (Redis, TTL = midnight reset):
  - Increments on: each notification SENT
  - Hard cap: donor's notif_max_per_day (default 5)

Non-response deprioritisation:
  - Count: notifications where responded=false AND delivered_at IS NOT NULL
  - If count >= 3 today: donor moves to bottom of ranking for next 24h
  - Reset: daily at midnight OR when donor responds to any request
```

### Mass Casualty Mode

```
Trigger: >10 EMERGENCY requests in same city within 30 minutes

On trigger:
  1. System publishes system.mass_casualty.detected { city, active_request_count }
  2. Notification Service switches to consolidated mode:
     - All matching requests for a donor → single SMS:
       "URGENT: Multiple blood emergencies in [City]. [X] blood types needed. Open app."
     - FCM push similarly consolidated
  3. Home page banner activated for all donors in that city
  4. Per-donor notification interval: max 1 per 15 min (not per request)
  5. Admin dashboard shows mass casualty alert in real-time

De-escalation: when active emergency count drops below 5, normal mode resumes
```

---

## 10. AI Scoring Pipeline

### Feature Engineering

```python
DONOR_FEATURES = {
    # Behavioral
    'response_rate_30d': float,          # (responses / deliveries) last 30 days
    'fulfillment_rate': float,           # (donations / responses) all time
    'avg_response_time_minutes': float,  # median time from delivery to action
    'no_show_rate': float,               # no-shows / confirmed

    # Temporal
    'active_hour_match': float,          # P(donor active at current time of day)
    'days_since_last_donation': int,     # freshness signal
    'donation_frequency_days': float,    # avg days between past donations

    # Geographic
    'distance_km': float,               # to current request hospital
    'past_donation_radius_avg_km': float,  # how far they typically travel

    # Request features
    'request_urgency': int,             # 3=EMERGENCY, 2=HIGH, 1=NORMAL
    'blood_group_rarity': float,        # demand/supply ratio for this group
    'competing_requests_in_city': int,  # donor attention split
    'request_component_match': bool     # exact group match vs compatible
}
```

### Model Architecture (v1)

- **Model**: Gradient Boosted Trees (XGBoost) — interpretable, fast inference, good for tabular data
- **Training**: Supervised binary classification — target = `did_donation_happen` (1) or not (0) given the request + donor context at time of notification
- **Training data**: `outcome_reports` joined with `notification_log` + donor + request features at notification time
- **Inference**: On-demand via `/score` endpoint called by Matching Engine; pre-computed nightly for all active donors
- **Update frequency**: Incremental update on each `donation.outcome_reported` event (SGD step); full retrain nightly

> ⚠️ **FIX — Cold start problem**: New donors all get 0.5 score. But there's no mechanism to graduate them out of cold-start except accumulating 3+ interactions. Added: after the first confirmed donation (outcome = DONATED), score immediately jumps to 0.7 (trusted new donor) rather than waiting for 3 events.

### Score Feedback Loop

```
Notification sent → donor_interest row created (or not)
       │
       ▼
2 hours after ETA → outcome_report created
       │
       ▼
Scoring Service ingests outcome:
  - response_rate feature updates
  - fulfillment_rate feature updates
  - active_hour histogram updates
  - Model re-scored for this donor
  - New score written to ai_scores table + Redis cache invalidated
```

---

## 11. Trust, Safety & Abuse Prevention

### Phone Number Protection

| Stage | What's Visible | Conditions |
|---|---|---|
| Request card (public feed) | Hospital name, blood group, urgency, distance | No patient PII |
| Donor interest → confirmed | Donor: blood group, donation count, trust badge | Pre-reveal; requester decides |
| Pre-reveal modal | Warning text + contact reveal consequences | Must tap through |
| After OTP confirmed | Both phones revealed simultaneously | Logged permanently |
| Ward/room/nurse contact | Shown to donor only after reveal | Sensitive info gated |

### Rate Limits (all enforced server-side, not client-side)

| Action | Limit | Window |
|---|---|---|
| Send OTP (auth) | 3 sends | 1 hour per phone |
| OTP attempts | 5 tries | 10 minutes |
| Blood requests created | 2 active | At any time |
| EMERGENCY requests | 1 | 24 hours |
| Contact reveals per request | 3 | 1 hour |
| Notification blast per request | 1 | 30 minutes |
| Donor express interest | Unlimited | — |
| Report suspicious request | 5 | 24 hours |

### Abuse Scenario Mitigations

**Phone harvesting (S11)**
- Rate limit: 3 reveals per request per hour → collecting many phones at scale is slow
- Auto-flag: reveals > (units_needed × 2) with no confirmed donations → admin review
- Donor reporting: 2 suspicious reports → soft-flag for admin review (not auto-pause)

**Fake donor tracking patients (S12)**
- Blood group proof required before first "I can donate" (not just at toggle-on)
- Ward/room shown only after bilateral OTP reveal
- Patient sees donor trust badge before initiating reveal — "Unverified" label is prominent

**Spam emergency requests (S13)**
- Max 2 active requests per account
- EMERGENCY requires hospital in verified DB
- 1 EMERGENCY per 24h per account
- 0 interest after 30 min → admin flag for review

**Payment demands (S14)**
- In-app report button: "Donor asked for payment" → immediate soft suspension
- Pre-reveal screen: explicit legal warning text (Drugs and Cosmetics Act)
- "Unverified donor" badge visible before patient initiates reveal

**Fake blood bank (S15)**
- Org accounts start in PENDING state — no data access
- Verification requires NBTC database cross-check
- Org accounts see only donors who responded to their specific requests — no directory

### Trust Indicators Shown to Requester (pre-reveal)

| Badge | Meaning |
|---|---|
| ✅ Verified donor | Blood group confirmed by document |
| 🏅 N donations | Historical donation count (immutable) |
| ⚡ High responder | Response rate ≥70% (AI-derived, but not labeled as AI) |
| 🆕 New donor | Fewer than 3 interactions — neutral score |
| ⚠️ Unverified | Blood group not yet confirmed |

---

## 12. Authentication & Authorization

### Auth Flow

```
Primary (all roles):
  Phone → OTP (6-digit, 10-min TTL) → JWT pair issued
  Org only: Password also required after org verification (email+password for org login)
  Admin: Email + password only (no OTP login for admin accounts)

Tokens:
  Access token:  15-minute TTL, signed RS256, contains { userId, role, orgId? }
  Refresh token: 30-day TTL, stored in httpOnly Secure cookie
  Rotation:      refresh token rotated on each use (single-use)

Contact Reveal OTP:
  Separate purpose-scoped OTP ('CONTACT_REVEAL')
  Cannot be used for login
  5-minute TTL
  One-time use, marked consumed in DB on successful reveal
```

### Authorization Matrix

| Endpoint | INDIVIDUAL (inactive) | INDIVIDUAL (donor-capable) | ORG | ADMIN |
|---|---|---|---|---|
| Browse requests | ✅ | ✅ | ✅ | ✅ |
| Create request | ✅ | ✅ | ✅ | ✅ |
| Express interest | ❌ (unverified BG) | ✅ | ❌ | ❌ |
| Toggle availability | ❌ (unverified BG) | ✅ | ❌ | ❌ |
| Initiate contact reveal (own request) | ✅ | ✅ | ✅ | ❌ |
| Express interest in own request | ❌ | ❌ | ❌ | ❌ |
| Mark request fulfilled | ✅ (own request) | ✅ (own request) | ✅ | ✅ |
| Submit outcome report | ✅ | ✅ | ✅ | ❌ |
| Org dashboard / inventory | ❌ | ❌ | ✅ | ❌ |
| Admin controls | ❌ | ❌ | ❌ | ✅ |
| View full donor directory | ❌ | ❌ | ❌ | ✅ |
| Verify orgs | ❌ | ❌ | ❌ | ✅ |
| Suspend accounts | ❌ | ❌ | ❌ | ✅ |

---

## 13. Infrastructure & Deployment

### Deployment Architecture

```
Cloud Provider: AWS (with Cloudflare CDN in front)

┌─────────────────────────────────────────────────────┐
│  Cloudflare (CDN + DDoS)                            │
│  → Next.js static assets served from edge           │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  AWS ALB (Application Load Balancer)                 │
│  → HTTPS termination, health checks                  │
└──────┬───────────┬───────────┬───────────────────────┘
       │           │           │
┌──────▼──┐ ┌──────▼──┐ ┌──────▼──────────────────────┐
│Next.js  │ │ API     │ │ WebSocket Server             │
│(Vercel  │ │ Gateway │ │ (socket.io, ECS Fargate)     │
│or ECS)  │ │ (Kong)  │ │                              │
└─────────┘ └────┬────┘ └──────────────────────────────┘
                 │
     ┌───────────┼────────────────────┐
     │           │                    │
┌────▼────┐ ┌────▼──────┐ ┌───────────▼────┐
│ ECS     │ │  ECS      │ │  ECS Fargate   │
│Fargate  │ │ Fargate   │ │  (Python svcs) │
│(Node.js │ │ (Node.js  │ │  Matching +    │
│ svcs)   │ │ Notification│  Scoring)      │
└────┬────┘ └────┬───────┘ └───────┬────────┘
     │           │                  │
┌────▼───────────▼──────────────────▼────────┐
│              RDS PostgreSQL                  │
│  Multi-AZ, PostGIS extension enabled        │
│  Read replicas for Matching Engine queries  │
└─────────────────────────────────────────────┘
     │
┌────▼────────────────────┐
│  ElastiCache Redis       │
│  - Session cache         │
│  - AI score cache        │
│  - Notification queues   │
│  - Rate limit counters   │
│  - Fatigue counters      │
└─────────────────────────┘
```

### Environment Sizing (Initial)

| Component | Instance | Reasoning |
|---|---|---|
| PostgreSQL | RDS db.t3.medium, Multi-AZ | ACID for critical donation records |
| Redis | ElastiCache r7g.large | Notification queues, rate limiters |
| Node.js services | ECS Fargate 0.5vCPU/1GB, 2 tasks each | Stateless, scale out easily |
| Python services | ECS Fargate 1vCPU/2GB, 2 tasks each | ML inference needs more memory |
| WebSocket | ECS Fargate 0.5vCPU/1GB, sticky sessions via ALB | Session affinity required |

### Scaling Triggers
- Notification Service scales out when Bull queue depth > 1000 jobs
- Matching Engine scales out when P95 response time > 500ms
- Mass casualty mode: pre-scales notification service by 3x via CloudWatch alarm on `emergency_request_rate`

---

## 14. Storage Architecture

### File Storage (S3 / Cloudflare R2)

| Category | Bucket | Access Pattern | TTL |
|---|---|---|---|
| Blood group proof docs | `bloodnet-donor-proofs` | Write-once, admin read | Permanent |
| Org license docs | `bloodnet-org-docs` | Write-once, admin read | Permanent |
| Prescription/lab reports | `bloodnet-prescriptions` | Requester write, donor read after reveal | 90 days |
| Avatar images | `bloodnet-avatars` | Public CDN | Permanent |

All uploads go through a pre-signed URL flow:
```
Client → POST /api/v1/uploads/presign → { upload_url, key }
Client → PUT <upload_url> (direct to S3, no proxy through backend)
Client → POST /api/v1/uploads/confirm { key } → stored in DB
```

Proof documents are never publicly accessible — accessed via signed URL with 15-minute expiry, generated on-demand for admin review or contact-reveal sharing.

---

## 15. Observability & Operations

### Metrics (CloudWatch + Grafana)

**Business metrics (real-time dashboard):**
- Active emergency requests by city
- Notification delivery rate (push vs SMS)
- Median time from request creation to first donor interest
- Donation fulfillment rate (24h, 7d)
- Mass casualty events detected

**System metrics:**
- API p50/p95/p99 latency per endpoint
- OTP delivery success rate by carrier
- SMS DLR success rate
- Matching engine query time
- AI scoring p99 inference time
- Queue depth per Bull worker

### Alerting (PagerDuty)

| Alert | Threshold | Severity |
|---|---|---|
| OTP delivery failure rate | > 5% | P1 |
| Active emergency request with 0 eligible donors | Any | P1 |
| SMS delivery DLR < 80% | 5 min window | P2 |
| Notification queue backup > 5000 | Any | P2 |
| Org verification pending > 24h | Any | P3 |
| DB connection pool > 80% | Any | P2 |

### Audit Log

Every sensitive action is written to an immutable `audit_log` table:
- Contact reveal initiated
- Contact reveal confirmed (OTP verified)
- Account suspended / unsuspended
- Org approved / rejected
- Blood group verified / rejected
- No-show flag added / disputed / resolved
- Mass casualty mode activated

Audit log is write-only for all services. Readable only by Admin Service.

---

## 16. Component Responsibility Map

| Component | Owns | Inputs | Outputs / Side Effects |
|---|---|---|---|
| **Auth Service** | Sessions, OTPs, device trust | Phone, OTP code | JWT tokens, contact-reveal OTP, session revocation |
| **User Service** | User profiles, eligibility, reputation | Profile updates, outcome events | Availability state, eligibility result, reputation scores |
| **Request Service** | Blood requests, interests, reveals, outcomes | Request creation, donor actions, outcome reports | Request status, contact reveal triggers, flag events |
| **Matching Engine** | Donor-request compatibility computation | New request event | Ranked donor list for notification, blood compatibility resolution |
| **Notification Service** | Delivery of alerts, channel selection, fatigue guard | Ranked donor list, mass casualty flag | FCM push, SMS, in-app events, delivery confirmations |
| **AI Scoring Service** | Response likelihood scores per donor | Outcome reports, donor features | Score per donor (0–1), notification priority ranking |
| **Admin Service** | Org verification, flag reviews, disputes | Manual admin actions, flag events | Org status, account suspension, audit log entries |
| **PostgreSQL** | Durable state for all entities | All service writes | Read replicas for Matching Engine |
| **Redis** | Cache, queues, rate limit counters | All service reads/writes | Eviction by TTL, pub/sub for in-app notifications |
| **S3/R2** | Document storage | Pre-signed uploads | Signed URLs on demand |
| **SMS Gateway** | Physical SMS delivery to phones | Notification Service instructions | Delivery receipts (DLR) back to Notification Service |
| **FCM** | Push notification delivery | Notification Service | Delivery ACKs, open events |
| **WebSocket Server** | Real-time browser/app connections | Redis pub/sub events | In-app toasts, request tracker live updates, contact reveal confirm |
| **Next.js App** | All UI rendering | API responses, WebSocket events | User actions → API calls (via native `fetch`, no axios) |

---

## 17. Identified Flaws & Corrections

This section consolidates every `⚠️ FIX` annotation from the document into a single reference table.

| # | Location | Flaw | Correction |
|---|---|---|---|
| F1 | Section 1 / Role model | Donor and Patient were fixed enum roles — same person can be both | Unified as `INDIVIDUAL` role; donor capabilities unlocked by verified blood group |
| F2 | Section 3 / Page routing | Separate `(donor)/` and `(patient)/` route groups caused ambiguity for dual-role users | Merged into single `(app)/` group with tab-based home |
| F3 | Section 3 / Share link URL | `/request/[id]` in share links exposes UUIDs which can be enumerated | Changed to `/r/[shareToken]` with opaque token |
| F4 | Section 3 / Navbar | Three hardcoded navbar variants broke for dual-role users | Single navbar with conditional elements based on user capabilities |
| F5 | Section 3 / Registration | 4-tile role selector (Donor, Patient, Hospital, Org) was misleading | 3-tile: Individual, Hospital/Org, (Admin = no self-reg) |
| F6 | Section 3 / Profile | Separate "Patient profile" existed only because of the flawed role model | Eliminated; patient-convenience fields moved to `users` table |
| F7 | Section 3 / Filter bar | No default city/radius — donors saw requests from all cities | FilterBar defaults to `user.city` and `notificationRadiusKm` |
| F8 | Section 3 / RequestCard | AI score chip visible to donors ("not labeled as AI" = deceptive UX) | Chip removed from donor-facing card; score is internal only |
| F9 | Section 3 / Request feed | Compatible-only was not the default — all groups shown greyed | Default: compatible-only; show-all is opt-in toggle |
| F10 | Section 3 / Patient home | "Find Donors" tab was a browsable donor directory with no requirement | Requires active blood request before showing donor feed |
| F11 | Section 3 / Request creation | Only "Patient" role could create requests | Any authenticated individual or org can create requests |
| F12 | Section 3 / Request creation | No validation on `requiredBy` upper bound | EMERGENCY/HIGH: required_by must be 30 min–72h from now |
| F13 | Section 3 / Contact reveal | "Reveal contact" button triggered OTP immediately without preview | Must open `<ContactRevealModal />` with donor preview first |
| F14 | Section 3 / OTP confirm screen | Location of OTP entry screen was ambiguous (patient or donor?) | Clarified: OTP entry renders in **donor's** app session via SMS deep link |
| F15 | Section 3 / Outcome timer | 2h timer was described as after `required_by` time | Timer is 2h after the **donor's ETA**, not `required_by` |
| F16 | Section 3 / Org dashboard | `DonorContactQueue` implied direct contact access without OTP | Org still uses standard OTP-gated reveal flow per request |
| F17 | Section 4.2 / Eligibility | `donor.weight < 45` failed when weight is null | Added null check: weight gate only applies if weight is entered |
| F18 | Section 4.3 / Auto-flag rule | "≥5 reveals with no closure" was too aggressive for multi-unit requests | Corrected to `reveals > (units_needed × 2) AND units_confirmed == 0 AND age > 2h` |
| F19 | Section 4.4 / Matching | Geospatial match assumed `hospital_location` is never null | Added city-based fallback when location is null |
| F20 | Section 4.4 / Matching | Radius expansion had no cap — rare + emergency could push to 75km+ | Capped at 50km |
| F21 | Section 5 / donor_interests | `REVEAL_PENDING` and `WITHDRAWN` states described in FSM but missing from schema | Added to `status` CHECK constraint |
| F22 | Section 5 / blood_requests | `share_token` column present in MVP schema but missing from production schema | Added to production schema |
| F23 | Section 5 / blood_requests | Compound index included nullable `hospital_location` | Split into two indexes: city index and separate GIST index with WHERE clause |
| F24 | Section 5 / contact_reveals | `reveal_count_this_hour` denorm column was inconsistency-prone | Removed; rate limiting moved to Redis |
| F25 | Section 5 / contact_reveals | `patient_id` FK name was wrong — reveal can be initiated by org | Renamed to `requester_id` |
| F26 | Section 5 / outcome_reports | Reporter role enum still used `DONOR`/`PATIENT` (old roles) | Updated to `INDIVIDUAL`/`ORG` |
| F27 | Section 6 / Reveal endpoint | `/requests/:requestId/reveal/:donorId` exposed donor UUIDs in URL | Changed to `/requests/:requestId/interest/:interestId/reveal` |
| F28 | Section 6 / Report endpoint | Auto-pause at 2 reports was too aggressive | Soft-flag at 2 reports; force-pause only after admin confirms |
| F29 | Section 10 / Cold start | All new donors scored 0.5 indefinitely until 3+ interactions | First confirmed donation immediately bumps score to 0.7 |
| F30 | All client code | `axios` referenced throughout client-side code | Removed; all HTTP via native `fetch` in `lib/api.ts` |

---

## Key Cross-Cutting Design Decisions

### Why separate eligibility enforcement at the API layer, not just UI

The UI disables the toggle, but the API re-validates eligibility on every `POST /interest` and every availability toggle attempt. A motivated bad actor could craft a request directly. The backend is the single source of truth for eligibility state.

### Why contact reveal is bilateral and permanent

Once both phones are in the hands of two parties, the app cannot revoke that information. The UI design must make this explicit before the OTP step. The log is the accountability mechanism, not revocation.

### Why outcome reporting is dual (both sides report)

Single-side reporting is gameable. If only donors report, no-shows self-report as "donated." If only patients report, vindictive patients could down-rate. Discrepancies between the two reports (donor says donated, patient says no-show) are flagged for admin review.

### Why the AI score is never shown to donors as a score

If donors know their score is low, they might spam interactions to game it up. The score informs who gets notified first — it is not a public reputation score.

### Why platelet donors are a separate pool

Platelet apheresis is a fundamentally different procedure (1.5–2 hours, apheresis machine required, 7-day rest instead of 56). Matching platelet requests to whole-blood donors who haven't opted in wastes everyone's time. The `platelet_eligible` flag ensures only self-selected, informed donors appear.

### Why requests never auto-close on confirmed ETA

S5 (no-show scenario) proves this: if the request auto-closes when a donor confirms, and the donor doesn't show, the patient has to start over with no active request and no donors being searched. The request stays ACTIVE until the patient explicitly marks it fulfilled or cancelled. Donor slots are independent from request status.

### Why native fetch instead of axios

Axios adds ~45KB to the bundle for capabilities that native fetch covers natively in all modern browsers and Node.js 18+. The thin `lib/api.ts` wrapper handles token injection, Content-Type defaulting, and a single token-refresh retry. There is no need for an HTTP library dependency.

---

*Document version 2.0 — corrects 30 identified flaws from v1.0; covers all scenarios S1–S20*
