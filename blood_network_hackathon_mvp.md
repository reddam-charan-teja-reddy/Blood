# Blood Network — 24-Hour Hackathon MVP Plan

> **Goal**: Ship a live, working, demo-able Blood Network in 24 hours
> **Judges see**: Real auth, real data, real flows, clean UI, live deployment
> **Judges don't see**: AI scoring, real SMS, PostGIS, mass casualty mode, platelet sub-pool — cut ruthlessly

> ⚠️ **Revised MVP scope** — the original plan significantly over-scoped the 24h window.
> A 3-developer team has roughly 72 person-hours. Each feature listed below is sized
> against that reality. Features marked `[SOLO-SKIP]` are optional if running alone.

---

## Realistic 24h Checklist — Minimum to Hit

| # | Requirement | How We Hit It | Realistic? |
|---|---|---|---|
| ✔ | Clean folder structure | Monorepo `/client` (Vite React) + `/server` (Express) | ✅ 30 min |
| ✔ | Form validation & error handling | React Hook Form + Zod client; Zod server | ✅ woven throughout |
| ✔ | User authentication | JWT (access) + httpOnly cookie (refresh); phone+OTP via mock, password real | ✅ 2h |
| ✔ | Search, filter & sorting | Request filter by blood group + urgency + city + component | ✅ 1h |
| ✔ | Role-based access control | 3 roles: INDIVIDUAL, ORG, ADMIN — middleware guard per route | ✅ 1h |
| ✔ | Dashboard or analytics page | Org dashboard: stats + request table; Admin stats page | ✅ 3h |
| ✔ | CRUD operations | Full CRUD on blood requests; donor profile update; org inventory update | ✅ 4h |
| ✔ | Deployment | Frontend → Vercel; Backend → Railway; DB → MongoDB Atlas | ✅ 1h |
| ✔ | REST API integration | Frontend calls backend REST via `fetch`; documented in README | ✅ throughout |
| ✔ | README documentation | Template included below | ✅ 30 min |
| ✔ | MongoDB database schema | 4 core collections with indexes | ✅ 1h |
| ✔ | GitHub version control | Commit strategy defined below | ✅ throughout |
| ✔ | Responsive React UI | Tailwind CSS, mobile-first layout | ✅ throughout |
| ✔ | Live deployed link | Vercel URL in README | ✅ Hour 20–22 |

**Beyond minimum — ship if ahead of schedule:**
- Blood compatibility engine (not just exact match)
- Donor eligibility enforcement (56-day rule, weight gate)
- OTP contact reveal flow (mocked — show the modal, log OTP to console)
- Request tracker with per-donor slot status
- WhatsApp share link for requests (just a copy-link button)
- 30s polling to simulate real-time updates
- Donor reputation panel (donation count, response rate)

**Explicitly cut — do not start:**
- Real SMS delivery (Twilio A2P registration takes days)
- PostGIS / geospatial radius (use city string matching instead)
- AI scoring (hard-code "High/Medium/Low" from donation count)
- Mass casualty mode
- File uploads for blood group proof (UI only, skip actual storage)
- Email notifications
- WebSocket (polling works fine for demo)
- React Native app (web PWA covers demo)
- Platelet-specific separate matching pool

---

## Tech Stack

| Layer | Choice | Why (for 24h) |
|---|---|---|
| Frontend | **Vite + React 18 + JavaScript** | Fastest dev server, no SSR complexity |
| Styling | **Tailwind CSS + shadcn/ui** | Pre-built accessible components, no CSS time wasted |
| Client state | **Zustand** | Simpler than Redux, zero boilerplate |
| Server state | **TanStack Query (React Query)** | Caching + refetch interval built-in |
| Forms | **React Hook Form + Zod** | Schema-driven, fastest form setup |
| HTTP client | **Native `fetch` wrapped in `lib/api.js`** | No axios — fetch is native, bundle stays small |
| Backend | **Node.js + Express** | Team knows it, fastest API setup |
| Database | **MongoDB + Mongoose** | Flexible schema during hackathon, Atlas free tier |
| Auth | **JWT (jsonwebtoken) + bcrypt** | Standard, no external service dependency |
| OTP (mock) | **In-memory Map + console.log** | No Twilio needed — show the flow, log the OTP |
| Deployment | **Vercel (FE) + Railway (BE) + Atlas (DB)** | All have free tiers, deploy in minutes |
| Icons | **Lucide React** | Ships with shadcn, no extra dep |
| Charts | **Recharts** | Simple, React-native charts for dashboard |
| Maps | **Skip for MVP** | Too much setup time |

---

## Folder Structure

```
blood-network/                          ← Git root
│
├── README.md
├── .gitignore
├── .env.example
│
├── client/                             ← Vite React app
│   ├── public/
│   └── src/
│       ├── assets/
│       ├── components/
│       │   ├── ui/                     ← shadcn/ui auto-generated
│       │   ├── layout/
│       │   │   ├── Navbar.jsx
│       │   │   └── EmergencyBanner.jsx
│       │   ├── request/
│       │   │   ├── RequestCard.jsx
│       │   │   ├── RequestTracker.jsx
│       │   │   ├── RequestForm.jsx
│       │   │   └── DonorSlot.jsx
│       │   ├── donor/
│       │   │   ├── DonorCard.jsx
│       │   │   ├── EligibilityPanel.jsx
│       │   │   └── AvailabilityToggle.jsx
│       │   ├── auth/
│       │   │   ├── LoginForm.jsx
│       │   │   ├── RegisterForm.jsx
│       │   │   └── RoleSelector.jsx
│       │   └── shared/
│       │       ├── BloodGroupBadge.jsx
│       │       ├── UrgencyChip.jsx
│       │       ├── TrustBadge.jsx
│       │       └── LoadingSpinner.jsx
│       │
│       ├── pages/
│       │   ├── LandingPage.jsx
│       │   ├── LoginPage.jsx
│       │   ├── RegisterPage.jsx
│       │   ├── HomePage.jsx            ← unified home — request feed + find donors tabs
│       │   ├── ProfilePage.jsx         ← unified — donor capability + requester info
│       │   ├── CreateRequestPage.jsx
│       │   ├── RequestDetailPage.jsx   ← tracker (if owner) or detail (if donor browsing)
│       │   ├── org/
│       │   │   └── OrgDashboardPage.jsx
│       │   └── admin/
│       │       └── AdminDashboardPage.jsx
│       │
│       ├── hooks/
│       │   ├── useAuth.js
│       │   ├── useRequests.js
│       │   └── useEligibility.js
│       │
│       ├── store/
│       │   └── authStore.js            ← Zustand store
│       │
│       ├── lib/
│       │   ├── api.js                  ← fetch wrapper (no axios)
│       │   ├── bloodCompat.js          ← Compatibility matrix
│       │   └── eligibility.js          ← Rest period logic
│       │
│       ├── App.jsx                     ← Router setup
│       └── main.jsx
│
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
└── server/                             ← Express API
    └── src/
        ├── config/
        │   ├── db.js                   ← Mongoose connection
        │   └── env.js                  ← Env validation
        │
        ├── models/
        │   ├── User.js
        │   ├── DonorProfile.js
        │   ├── BloodRequest.js
        │   ├── DonorInterest.js
        │   └── OrgProfile.js
        │
        ├── routes/
        │   ├── auth.routes.js
        │   ├── user.routes.js
        │   ├── request.routes.js
        │   ├── donor.routes.js
        │   └── org.routes.js
        │
        ├── controllers/
        │   ├── auth.controller.js
        │   ├── request.controller.js
        │   ├── donor.controller.js
        │   └── org.controller.js
        │
        ├── middleware/
        │   ├── auth.middleware.js       ← JWT verify
        │   ├── role.middleware.js       ← RBAC guard
        │   ├── validate.middleware.js   ← Zod schema validation
        │   └── rateLimit.middleware.js  ← express-rate-limit
        │
        ├── services/
        │   ├── matching.service.js     ← Compatibility + ranking (city-based)
        │   ├── otp.service.js          ← In-memory OTP store + console.log mock
        │   └── eligibility.service.js  ← 56-day rule computation
        │
        ├── utils/
        │   ├── bloodCompat.js
        │   └── jwt.js
        │
        └── app.js                      ← Express app setup + index.js entry point
```

---

## MongoDB Schemas

### Collection 1: `users`

> **Role model**: `INDIVIDUAL` for all regular users (they can both donate AND post requests). `ORG` for hospitals/blood banks. `ADMIN` is seeded manually.

```javascript
const UserSchema = new Schema({
  phone:          { type: String, required: true, unique: true, trim: true },
  phoneVerified:  { type: Boolean, default: false },
  email:          { type: String, unique: true, sparse: true, lowercase: true },
  fullName:       { type: String, required: true, trim: true },

  // INDIVIDUAL = any person (can donate AND post requests)
  // ORG        = verified hospital/blood bank/NGO
  // ADMIN      = platform admin (seeded, not self-registered)
  role: { type: String, enum: ['INDIVIDUAL', 'ORG', 'ADMIN'], required: true },

  passwordHash:   { type: String },
  suspended:      { type: Boolean, default: false },
  suspendedReason:{ type: String },

  // Patient-convenience fields — any individual can fill these when posting a request
  guardianName:   { type: String },
  guardianPhone:  { type: String },
  preferredContact: { type: String, enum: ['PHONE','WHATSAPP','APP'], default: 'PHONE' },
}, { timestamps: true });

UserSchema.index({ phone: 1 });
UserSchema.index({ role: 1 });
```

**What unlocks what for INDIVIDUAL users:**

| Capability | Requirement |
|---|---|
| Browse active requests | Just registered |
| Post a blood request | Just registered |
| Express interest to donate | `donorProfile.bloodGroupVerified === true` |
| Toggle availability | `donorProfile.bloodGroupVerified === true` AND eligibility passed |
| Reveal donor contact (as requester on own request) | Just registered |
| Submit outcome report | Participated in the request |

---

### Collection 2: `donorprofiles`

> Created for every INDIVIDUAL user at registration. `bloodGroup` is optional — filled in when the user wants to activate donor capabilities. Until `bloodGroupVerified` is true, they can only post requests (not express interest).

```javascript
const DonorProfileSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  bloodGroup:         { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-'] },
  bloodGroupVerified: { type: Boolean, default: false },

  // For MVP: blood group is "verified" immediately on self-declaration.
  // In production: admin reviews a photo of a blood group card.
  // donorActivated = bloodGroupVerified (computed in application logic, not schema)

  // Last donation dates (per component)
  lastWholeBloodDonation: { type: Date },
  lastPlateletDonation:   { type: Date },
  lastPlasmaDonation:     { type: Date },

  // Eligibility
  weightKg:             { type: Number },     // null = not entered; weight gate skipped if null
  plateletEligible:     { type: Boolean, default: false },
  tempDeferralUntil:    { type: Date },
  tempDeferralReason:   { type: String },

  // Availability
  available:            { type: Boolean, default: false },

  // Location (city-based for MVP — no PostGIS)
  city:                 { type: String, required: true },
  state:                { type: String, required: true },
  pincode:              { type: String },
  notificationRadiusKm: { type: Number, default: 10 },  // stored but unused in MVP

  // Reputation
  totalDonations:       { type: Number, default: 0 },
  noShowCount:          { type: Number, default: 0 },
  responseRate:         { type: Number, default: null },   // null = cold start

  // Notification preferences
  notifSmsEmergency:    { type: Boolean, default: true },
  notifMaxPerDay:       { type: Number, default: 5 },
  quietHoursStart:      { type: String },   // "22:00"
  quietHoursEnd:        { type: String },   // "07:00"
}, { timestamps: true });

DonorProfileSchema.index({ bloodGroup: 1, available: 1, city: 1 });
```

---

### Collection 3: `bloodrequests`

```javascript
const BloodRequestSchema = new Schema({
  requesterId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  requesterType:  { type: String, enum: ['INDIVIDUAL', 'ORG'], required: true },
  patientAnonymous: { type: Boolean, default: false },  // org posting on behalf of anonymous patient

  // Blood details
  bloodGroup:   { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-'], required: true },
  component:    { type: String, enum: ['WHOLE_BLOOD','PLATELETS','PLASMA','RBC'], required: true },
  unitsNeeded:  { type: Number, required: true, min: 1, max: 10 },
  unitsConfirmed: { type: Number, default: 0 },
  urgency:      { type: String, enum: ['EMERGENCY','HIGH','NORMAL'], required: true },
  requiredBy:   { type: Date, required: true },

  // Hospital
  hospitalName:   { type: String, required: true },
  hospitalCity:   { type: String, required: true },
  hospitalState:  { type: String, required: true },

  // Sensitive — only revealed after OTP contact reveal
  wardNumber:     { type: String },
  attendingDoctor:{ type: String },
  guardianPhoneOverride: { type: String },

  // Status
  status: {
    type: String,
    enum: ['ACTIVE', 'PARTIALLY_FULFILLED', 'FULFILLED', 'EXPIRED', 'CANCELLED'],
    default: 'ACTIVE'
  },
  expiresAt:    { type: Date, required: true },
  fulfilledAt:  { type: Date },

  // Share token (opaque — used in WhatsApp share links)
  shareToken:   { type: String, unique: true, sparse: true },

  // Abuse guard
  flagCount:    { type: Number, default: 0 },
  isFlagged:    { type: Boolean, default: false },
}, { timestamps: true });

BloodRequestSchema.index({ status: 1, bloodGroup: 1, hospitalCity: 1 });
BloodRequestSchema.index({ requesterId: 1 });
// TTL index — MongoDB auto-sets status=EXPIRED when expiresAt passes
// NOTE: TTL in Mongo removes the document, not sets a field. For MVP, use a cron job
// or check expiresAt in the GET /requests query instead of relying on TTL deletion.
// ⚠️ FIX: original had TTL index that deletes the document — that loses all donor interest history.
// Use a scheduled job or query filter instead.
```

---

### Collection 4: `donorinterests`

```javascript
const DonorInterestSchema = new Schema({
  requestId: { type: Schema.Types.ObjectId, ref: 'BloodRequest', required: true },
  donorId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['INTERESTED', 'REVEAL_PENDING', 'CONTACT_REVEALED', 'CONFIRMED',
           'DONATED', 'TURNED_AWAY', 'NO_SHOW', 'DECLINED', 'WITHDRAWN'],
    default: 'INTERESTED'
  },
  eta:               { type: Date },
  contactRevealedAt: { type: Date },
  outcomeReportedAt: { type: Date },
  outcomeReason:     { type: String },
}, { timestamps: true });

DonorInterestSchema.index({ requestId: 1, donorId: 1 }, { unique: true });
DonorInterestSchema.index({ donorId: 1, status: 1 });
```

---

### Collection 5: `orgprofiles`

```javascript
const OrgProfileSchema = new Schema({
  userId:          { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  orgName:         { type: String, required: true },
  registrationNo:  { type: String, required: true },
  orgType:         { type: String, enum: ['HOSPITAL', 'BLOOD_BANK', 'NGO'], required: true },
  address:         { type: String },
  city:            { type: String, required: true },
  state:           { type: String, required: true },
  pincode:         { type: String },
  verificationStatus: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
  verifiedAt:      { type: Date },

  // Blood inventory (units on hand)
  inventory: {
    'A+':  { type: Number, default: 0 },
    'A-':  { type: Number, default: 0 },
    'B+':  { type: Number, default: 0 },
    'B-':  { type: Number, default: 0 },
    'AB+': { type: Number, default: 0 },
    'AB-': { type: Number, default: 0 },
    'O+':  { type: Number, default: 0 },
    'O-':  { type: Number, default: 0 },
  }
}, { timestamps: true });
```

---

## REST API Routes

Base URL: `/api/v1`

### Auth Routes (`/auth`)
```
POST   /auth/register           # Register new user (INDIVIDUAL or ORG)
POST   /auth/login              # Login → returns JWT + sets cookie
POST   /auth/logout             # Clear session
POST   /auth/otp/send           # Send OTP to phone (mock: logs to console)
POST   /auth/otp/verify         # Verify OTP → marks phone verified + issues JWT
GET    /auth/me                 # Get current user (protected)
POST   /auth/refresh            # Refresh access token
```

### Donor Routes (`/donors`)
```
GET    /donors                  # Search donors — query: bloodGroup, city, available
                                # RBAC: any authenticated user
                                # ⚠️ Only returns donors in the requester's active request city
GET    /donors/profile          # Get own donor profile (INDIVIDUAL only)
PUT    /donors/profile          # Update own donor profile (INDIVIDUAL only)
PUT    /donors/availability     # Toggle available on/off (INDIVIDUAL only)
                                # — validates eligibility AND bloodGroupVerified server-side
GET    /donors/eligibility      # Get eligibility status per component (INDIVIDUAL only)
```

### Request Routes (`/requests`)
```
GET    /requests                # List active requests
                                # query: bloodGroup, urgency, component, city, sortBy
                                # Does NOT auto-expire by TTL — filters out expiresAt < now()
POST   /requests                # Create request (INDIVIDUAL or ORG)
GET    /requests/:id            # Get single request (public — for share link)
PUT    /requests/:id            # Update request (owner only, while ACTIVE)
DELETE /requests/:id            # Cancel request (owner or ADMIN)
POST   /requests/:id/fulfil     # Mark fulfilled (owner or ORG)
POST   /requests/:id/extend     # Extend expiry by 24h (owner only, max 2 extensions)
POST   /requests/:id/share      # Generate share token → returns /r/:token URL

# Donor interest sub-resource
POST   /requests/:id/interest                      # Express interest
                                                   # — INDIVIDUAL only, 403 if not donorActivated
                                                   # — 403 if own request
PUT    /requests/:id/interest/:interestId          # Update donor slot (ETA)
POST   /requests/:id/interest/:interestId/reveal   # Initiate contact reveal (owner or ORG)
                                                   # → sends mock OTP to console
POST   /requests/:id/interest/:interestId/reveal/confirm  # Donor enters OTP → both contacts revealed
POST   /requests/:id/interest/:interestId/outcome  # Report donation outcome (donor or requester)
POST   /requests/:id/flag                          # Flag suspicious request (any authenticated)
```

### Org Routes (`/orgs`)
```
GET    /orgs/dashboard          # Dashboard stats (ORG only, VERIFIED only)
PUT    /orgs/inventory          # Update blood inventory (ORG only)
GET    /orgs/requests           # All requests posted by this org (ORG only)
```

### Admin Routes (`/admin`)

> Admin accounts are **seeded directly** in the database. No self-registration path. Admin logs in with email + password — OTP login is blocked for ADMIN role.

```
# Overview
GET    /admin/stats             # Platform-wide stats (ADMIN only)
GET    /admin/stats/history     # Daily stats for last 30 days (for charts)

# Org Verification
GET    /admin/orgs/pending      # All orgs in PENDING state
PUT    /admin/orgs/:id/verify   # Approve org
PUT    /admin/orgs/:id/reject   # Reject org with reason

# User Management
GET    /admin/users             # List all users — searchable by name/phone
GET    /admin/users/:id         # Full user profile + activity summary
PUT    /admin/users/:id/suspend       # Suspend account with reason
PUT    /admin/users/:id/unsuspend     # Lift suspension
PUT    /admin/users/:id/clear-noshows # Clear no-show flags after valid dispute

# Blood Group Proof Review (MVP: simplified — no file upload, just a flag)
GET    /admin/proofs/pending    # Donors with unverified blood group
PUT    /admin/proofs/:userId/approve  # Mark bloodGroupVerified=true
PUT    /admin/proofs/:userId/reject   # Reject with reason → notifies donor

# Reports & Flags
GET    /admin/reports           # All reports — filterable by type/status
PUT    /admin/reports/:id/resolve  # Mark resolved
PUT    /admin/reports/:id/dismiss  # Dismiss

GET    /admin/flags             # Flagged requests — sorted by flag count
PUT    /admin/flags/:requestId/clear  # Clear flags after review
PUT    /admin/flags/:requestId/cancel # Force-cancel
```

---

## Role-Based Access Control

### RBAC Middleware

```javascript
// middleware/role.middleware.js
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Capability gate — checks donorActivated (bloodGroupVerified) server-side
export const requireDonorActivated = async (req, res, next) => {
  const profile = await DonorProfile.findOne({ userId: req.user.id });
  if (!profile?.bloodGroupVerified) {
    return res.status(403).json({
      error: 'Donor profile not set up',
      hint: 'Verify your blood group to activate donor capabilities'
    });
  }
  next();
};

// Prevents user from expressing interest in their own request
export const requireNotOwnRequest = async (req, res, next) => {
  const request = await BloodRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.requesterId.toString() === req.user.id) {
    return res.status(403).json({ error: 'Cannot express interest in your own request' });
  }
  next();
};

// Usage:
router.post('/requests', requireAuth, requireRole('INDIVIDUAL', 'ORG'), createRequest);
router.post('/requests/:id/interest', requireAuth, requireRole('INDIVIDUAL'), requireDonorActivated, requireNotOwnRequest, expressInterest);
router.get('/admin/stats', requireAuth, requireRole('ADMIN'), getAdminStats);
```

### Access Matrix

| Action | INDIVIDUAL (unverified BG) | INDIVIDUAL (donor-capable) | ORG | ADMIN |
|---|:---:|:---:|:---:|:---:|
| Browse requests | ✅ | ✅ | ✅ | ✅ |
| Create request | ✅ | ✅ | ✅ | ✅ |
| Express interest to donate | ❌ | ✅ | ❌ | ❌ |
| Toggle availability | ❌ | ✅ | ❌ | ❌ |
| Initiate contact reveal (own request) | ✅ | ✅ | ✅ | ❌ |
| Express interest in own request | ❌ | ❌ | ❌ | ❌ |
| Mark request fulfilled | ✅ (own) | ✅ (own) | ✅ | ✅ |
| Submit outcome report | ✅ | ✅ | ✅ | ❌ |
| Org dashboard / inventory | ❌ | ❌ | ✅ (verified only) | ❌ |
| Admin controls | ❌ | ❌ | ❌ | ✅ |

---

## Authentication Flow

### Registration
```
Client POSTs:
  { fullName, phone, email?, role, password?, bloodGroup?, city, state }

Server:
  1. Validate with Zod schema
  2. Check phone uniqueness
  3. Hash password if provided
  4. Create User document
  5. If role=INDIVIDUAL: create DonorProfile (bloodGroup optional, verified=false)
  6. If role=ORG: create OrgProfile (verificationStatus=PENDING)
  7. Issue JWT pair
  8. Return { user, accessToken } + set refreshToken httpOnly cookie
```

### Login
```
Client POSTs: { phone OR email, password }

Server:
  1. Find user by phone/email
  2. bcrypt.compare(password, hash)
  3. Issue JWT pair
  4. Return { user, accessToken }

OTP login (for INDIVIDUAL users without password):
  POST /auth/otp/send { phone }
  → Generates 6-digit OTP, stores in Map<phone, {otp, expiresAt: now+10min}>
  → console.log(`[OTP] ${phone}: ${otp}`)   ← mock delivery

  POST /auth/otp/verify { phone, otp }
  → Validates, marks phoneVerified=true, issues JWT pair
```

### JWT Structure
```javascript
// Access token payload:
{ userId: string, role: 'INDIVIDUAL'|'ORG'|'ADMIN', iat: number, exp: number }

// Access token TTL: 15 minutes
// Refresh token TTL: 7 days (httpOnly Secure SameSite=Strict cookie)
// Refresh rotation: new refresh token issued on each refresh call
```

---

## Fetch Wrapper (No Axios)

```javascript
// client/src/lib/api.js
import { useAuthStore } from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_URL;

export async function api(endpoint, options = {}) {
  const token = useAuthStore.getState().accessToken;

  const headers = {
    ...(!(options.body instanceof FormData) && { 'Content-Type': 'application/json' }),
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  let response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  // Attempt token refresh on 401
  if (response.status === 401) {
    try {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',  // send the httpOnly refresh cookie
      });
      if (!refreshRes.ok) throw new Error('Refresh failed');
      const { accessToken, user } = await refreshRes.json();
      useAuthStore.getState().setAuth(user, accessToken);

      // Retry original request with new token
      response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: { ...headers, 'Authorization': `Bearer ${accessToken}` },
      });
    } catch {
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }

  // Return the parsed JSON directly — callers don't need to call .json()
  return response.json();
}
```

### React Query Hooks

```javascript
// hooks/useRequests.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export function useRequests(filters) {
  return useQuery({
    queryKey: ['requests', filters],
    queryFn: () => {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null))
      ).toString();
      return api(`/requests?${qs}`);
    },
    refetchInterval: 30_000,  // poll every 30s — simulates live updates
  });
}

export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api('/requests', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success('Request posted! Matching donors are being notified.');
    },
    onError: (err) => toast.error(err.message ?? 'Failed to create request'),
  });
}
```

---

## Blood Compatibility Engine

```javascript
// lib/bloodCompat.js — shared between client and server (or copy to both)

export const COMPATIBILITY = {
  'O-':  ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+':  ['O+', 'A+', 'B+', 'AB+'],
  'A-':  ['A-', 'A+', 'AB-', 'AB+'],
  'A+':  ['A+', 'AB+'],
  'B-':  ['B-', 'B+', 'AB-', 'AB+'],
  'B+':  ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+'],
};

// Which donor blood groups can donate to a given recipient blood group?
export function compatibleDonorGroups(requestBloodGroup) {
  return Object.entries(COMPATIBILITY)
    .filter(([, canDonateTo]) => canDonateTo.includes(requestBloodGroup))
    .map(([donorGroup]) => donorGroup);
}
```

---

## Donor Eligibility Service

```javascript
// server/src/services/eligibility.service.js

export const REST_PERIODS = {
  WHOLE_BLOOD: 56,  // days
  PLATELETS:    7,
  PLASMA:      28,
  RBC:         56,
};

export function computeEligibility(profile, component) {
  if (!profile.bloodGroupVerified) {
    return { eligible: false, reason: 'UNVERIFIED_BLOOD_GROUP' };
  }
  // Weight gate: only apply if weight is entered
  if (profile.weightKg != null && profile.weightKg < 45) {
    return { eligible: false, reason: 'WEIGHT_BELOW_MIN' };
  }
  if (profile.tempDeferralUntil && new Date() < new Date(profile.tempDeferralUntil)) {
    return { eligible: false, reason: 'TEMP_DEFERRAL', unblockDate: profile.tempDeferralUntil };
  }
  if (component === 'PLATELETS' && !profile.plateletEligible) {
    return { eligible: false, reason: 'NOT_OPT_IN' };
  }

  const lastDonation = getLastDonationDate(profile, component);
  if (lastDonation) {
    const daysSince = Math.floor((Date.now() - new Date(lastDonation).getTime()) / 86_400_000);
    const restPeriod = REST_PERIODS[component] ?? 56;
    if (daysSince < restPeriod) {
      const unblockDate = new Date(new Date(lastDonation).getTime() + restPeriod * 86_400_000);
      return { eligible: false, reason: 'REST_PERIOD', unblockDate, daysRemaining: restPeriod - daysSince };
    }
  }

  return { eligible: true };
}

function getLastDonationDate(profile, component) {
  const map = {
    WHOLE_BLOOD: profile.lastWholeBloodDonation,
    PLATELETS:   profile.lastPlateletDonation,
    PLASMA:      profile.lastPlasmaDonation,
    RBC:         profile.lastWholeBloodDonation,
  };
  return map[component] ?? null;
}
```

---

## OTP Service (Mock)

```javascript
// server/src/services/otp.service.js

const otpStore = new Map(); // Map<key, { otp, expiresAt }>

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function sendOTP(identifier, purpose = 'AUTH') {
  const otp = generateOTP();
  const key = `${purpose}:${identifier}`;
  otpStore.set(key, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });  // 10-min TTL
  console.log(`[OTP] ${purpose} for ${identifier}: ${otp}`);            // mock delivery
  return { sent: true };
}

export function verifyOTP(identifier, inputOtp, purpose = 'AUTH') {
  const key = `${purpose}:${identifier}`;
  const record = otpStore.get(key);

  if (!record) return { valid: false, reason: 'OTP_NOT_FOUND' };
  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return { valid: false, reason: 'OTP_EXPIRED' };
  }
  if (record.otp !== inputOtp) return { valid: false, reason: 'OTP_INVALID' };

  otpStore.delete(key);  // one-time use
  return { valid: true };
}
```

---

## Dashboard & Analytics Pages

### Org Dashboard (`/org/dashboard`)

```
Stats row:
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │  Active Requests │  │  Fulfilled Today  │  │  Donors Pending  │
  │       3          │  │       7           │  │       2          │
  └──────────────────┘  └──────────────────┘  └──────────────────┘

Blood Inventory:
  ┌─────────────────────────────────────────────────────────────┐
  │  A+: 12u   A-: 2u   B+: 8u   B-: 0u                       │
  │  AB+: 4u  AB-: 1u   O+: 15u  O-: 3u    [Update Inventory] │
  └─────────────────────────────────────────────────────────────┘

Recent Requests Table:
  | Blood | Component    | Units | Status       | Donors | Posted  |
  | O+    | Whole Blood  | 2     | ACTIVE       | 3      | 2h ago  |
  | AB-   | Platelets    | 6     | FULFILLED    | 1      | 1d ago  |

Data from:
  GET /orgs/dashboard
  Response: { activeRequests: number, fulfilledToday: number, pendingContacts: number,
              inventory: {}, recentRequests: [] }
```

> ⚠️ **NOTE**: The org dashboard only shows data if `verificationStatus === 'VERIFIED'`. An ORG in PENDING state receives: `{ error: 'Org account pending verification', hint: 'Admin review is in progress' }`.

---

### Admin Dashboard (`/admin/dashboard`)

5 tabs — all backed by real API calls:

```
╔══════════════════════════════════════════════════════════════════╗
║  ADMIN PANEL  |  Overview  Reports  Orgs  Users  Disputes       ║
╚══════════════════════════════════════════════════════════════════╝
```

**TAB 1 — Overview**
```
Stats (GET /admin/stats):
  Active requests | Fulfilled today | New users today | Open reports | Pending orgs

Charts (GET /admin/stats/history):
  Bar chart: requests created per blood group — last 7d
  Line chart: daily fulfillment rate — last 30d
```

**TAB 2 — Reports** (GET /admin/reports)
```
Filter: All | OPEN | RESOLVED | DISMISSED · Type filter
Table: Type | Reporter | Against | Filed | Status | Action
[Review] → full report detail + [Suspend user] [Force-cancel request] [Dismiss] [Resolve]
```

**TAB 3 — Orgs** (GET /admin/orgs/pending)
```
Table: Org Name | Type | City | Reg No. | Submitted | Action
[Review] → org detail + [Verify ✓] [Reject ✗ with reason]
```

**TAB 4 — Users** (GET /admin/users)
```
Search by name / phone | Filter: role, status
Table: Name | Phone | Role | Joined | Donations | Status | Action
[View] → full user detail + [Suspend] [Unsuspend] [Clear no-shows]
         + blood group proof review [Approve proof] [Reject proof]
```

**TAB 5 — No-Show Disputes** (GET /admin/disputes)
```
Table: Donor | Request | Their claim | Filed | Status | Action
[Review] → donor claim + patient report + [Uphold] [Overturn]
```

---

## Frontend State Management

### Zustand Auth Store

```javascript
// store/authStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),
      clearAuth: () => set({ user: null, accessToken: null, isAuthenticated: false }),
    }),
    {
      name: 'blood-network-auth',
      partialize: (state) => ({ user: state.user }),  // only persist user, not token
    }
  )
);
```

---

## Search, Filter & Sorting

### Client-Side Filter Bar

```javascript
// All filters are query params sent to GET /requests
// Default: city from logged-in user's profile, compatible blood groups
const defaultFilters = {
  bloodGroup: user?.donorProfile?.bloodGroup,  // pre-fill from user's blood group
  city: user?.donorProfile?.city,              // pre-fill from user's city
  compatibleOnly: true,                        // donors see only compatible requests by default
  sortBy: 'urgency',                           // emergency first
};
```

### Server-Side Query (MongoDB)

```javascript
// controllers/request.controller.js — GET /requests
export const getRequests = async (req, res) => {
  const { bloodGroup, urgency, component, city, sortBy, compatibleOnly } = req.query;

  const filter = {
    status: 'ACTIVE',
    expiresAt: { $gt: new Date() },   // ⚠️ FIX: filter out expired requests in query — don't rely on TTL deletion
  };

  if (bloodGroup) {
    // Donor browsing: show compatible requests (not just exact match)
    const groups = compatibleOnly === 'true'
      ? compatibleDonorGroups(bloodGroup)  // donor view — show requests their blood can help
      : [bloodGroup];                       // exact match view
    filter.bloodGroup = { $in: groups };
  }

  if (urgency) filter.urgency = urgency;
  if (component) filter.component = component;
  if (city) filter.hospitalCity = { $regex: `^${city}$`, $options: 'i' };  // exact city match

  const sortMap = {
    urgency:      { urgency: -1, createdAt: -1 },
    newest:       { createdAt: -1 },
    expiringSoon: { expiresAt: 1 },
  };
  const sort = sortMap[sortBy] ?? sortMap.urgency;

  const requests = await BloodRequest.find(filter).sort(sort).limit(50).lean();
  res.json({ requests, count: requests.length });
};
```

---

## Form Validation Examples

### Zod Schema — Create Request

```javascript
// Shared between client and server (or duplicated with minor adjustments)
import { z } from 'zod';

export const CreateRequestSchema = z.object({
  bloodGroup: z.enum(['A+','A-','B+','B-','AB+','AB-','O+','O-']),
  component:  z.enum(['WHOLE_BLOOD','PLATELETS','PLASMA','RBC']),
  unitsNeeded: z.number().int().min(1).max(10),
  urgency:    z.enum(['EMERGENCY','HIGH','NORMAL']),
  requiredBy: z.string().datetime(),
  hospitalName:  z.string().min(3).max(200),
  hospitalCity:  z.string().min(2).max(100),
  hospitalState: z.string().min(2).max(100),
  wardNumber:    z.string().optional(),
  guardianName:  z.string().optional(),
  guardianPhone: z.string().regex(/^\+91[6-9]\d{9}$/, 'Invalid Indian phone number').optional(),
}).refine(
  (data) => {
    const reqBy = new Date(data.requiredBy);
    const now = new Date();
    const diffH = (reqBy - now) / 3_600_000;
    if (data.urgency === 'EMERGENCY' || data.urgency === 'HIGH') {
      return diffH >= 0.5 && diffH <= 72;  // 30 min to 72h
    }
    return diffH >= 0.5 && diffH <= 168;   // up to 7 days for NORMAL
  },
  { message: 'Required-by time must be between 30 minutes and 72 hours from now (EMERGENCY/HIGH)', path: ['requiredBy'] }
);
```

### Zod Schema — Register

```javascript
export const RegisterSchema = z.object({
  fullName: z.string().min(2).max(100),
  phone:    z.string().regex(/^\+91[6-9]\d{9}$/, 'Invalid Indian phone number'),
  email:    z.string().email().optional(),
  role:     z.enum(['INDIVIDUAL', 'ORG']),      // ADMIN cannot self-register
  password: z.string().min(8).optional(),
  bloodGroup: z.enum(['A+','A-','B+','B-','AB+','AB-','O+','O-']).optional(),
  city:     z.string().min(2),
  state:    z.string().min(2),
  weightKg: z.number().min(20).max(200).optional(),
}).superRefine((data, ctx) => {
  if (data.role === 'ORG' && !data.password) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: 'Password required for org accounts' });
  }
});
```

### Error Handling Pattern (Express)

```javascript
// middleware/validate.middleware.js
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(422).json({
      error: 'Validation failed',
      details: result.error.flatten().fieldErrors,
    });
  }
  req.body = result.data;
  next();
};

// Global error handler in app.js
app.use((err, req, res, _next) => {
  console.error(err);
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid ID format' });
  if (err.name === 'MongoServerError' && err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate entry — this record already exists' });
  }
  res.status(500).json({ error: 'Internal server error' });
});
```

---

## 24-Hour Execution Timeline (Realistic)

> **Assumption**: 2–3 developers. Dev A = Frontend, Dev B = Backend, Dev C = Full-stack polish + deployment
> **Single dev**: Follow the same order, skip `[SOLO-SKIP]` features if behind schedule.
> **Pacing rule**: If you're behind at Hour 12, cut the Admin dashboard to TAB 1 only (Overview). Ship working > complete.

### Hour 0–1: Setup (Everyone together)

- [ ] Create GitHub repo, invite collaborators, set default branch to `main`
- [ ] Set up monorepo structure (copy folder structure above)
- [ ] `npm create vite@latest client -- --template react`
- [ ] `cd server && npm init -y && npm i express mongoose zod bcryptjs jsonwebtoken cors helmet express-rate-limit`
- [ ] Install Tailwind + shadcn/ui in client
- [ ] MongoDB Atlas: create free cluster, get connection string
- [ ] Create `.env` for both client and server (from `.env.example`)
- [ ] Push initial commit

**Commit**: `chore: initial project scaffold with client/server structure`

---

### Hour 1–3: Backend Auth + Models (Dev B)

- [ ] Define all 5 Mongoose schemas with indexes
- [ ] Implement `POST /auth/register` with Zod validation
- [ ] Implement `POST /auth/login` (password + OTP mock)
- [ ] Implement `POST /auth/otp/send` + `POST /auth/otp/verify`
- [ ] JWT issuance + refresh token in httpOnly cookie
- [ ] `requireAuth`, `requireRole`, `requireDonorActivated`, `requireNotOwnRequest` middleware
- [ ] Test all auth endpoints with Thunder Client / Postman

**Commits**:
```
feat(db): 5 mongoose schemas with indexes
feat(auth): register + login endpoints with JWT
feat(auth): OTP mock send/verify + role middleware
```

---

### Hour 1–4: Frontend Foundation (Dev A)

- [ ] React Router v6 with all page routes (public + protected)
- [ ] Zustand auth store + `api.js` fetch wrapper with token refresh
- [ ] Build `<Navbar />` — public variant, individual variant, org variant
- [ ] Build `<LoginPage />` + `<RegisterPage />` with React Hook Form + Zod
- [ ] Build `<RoleSelector />` — 2 tiles: Individual / Org (Admin = no self-reg)
- [ ] Connect register/login forms to backend API
- [ ] Protected route wrapper (`<ProtectedRoute>`)
- [ ] Role-redirect: individuals go to `/home`, orgs go to `/org/dashboard`, admins to `/admin`

**Commits**:
```
feat(client): router setup with protected routes + role redirect
feat(client): auth store (Zustand) + fetch wrapper (no axios)
feat(client): login and register pages with validation
feat(client): role selector — Individual / Org
```

---

### Hour 4–8: Core Feature — Requests (Both devs)

**Dev B — Backend:**
- [ ] `GET /requests` with all filters (blood group compatibility expansion, urgency, component, city, sortBy)
- [ ] `POST /requests` with validation + urgency downgrade logic
- [ ] `GET /requests/:id` (public — for share link)
- [ ] `POST /requests/:id/interest` (donor only, eligibility + self-request check)
- [ ] `POST /requests/:id/interest/:interestId/reveal` (mock OTP → console.log)
- [ ] `POST /requests/:id/interest/:interestId/reveal/confirm` (OTP verify → mark revealed)
- [ ] `POST /requests/:id/interest/:interestId/outcome` (outcome reporting)
- [ ] `POST /requests/:id/share` (generate shareToken)

**Dev A — Frontend:**
- [ ] `<BloodGroupBadge />`, `<UrgencyChip />`, `<TrustBadge />` shared components
- [ ] `<RequestCard />` with all fields
- [ ] `<FilterBar />` — blood group multiselect, urgency, component, city, sort; defaults to user's city
- [ ] `<HomePage />` — two tabs: "Donate Blood" (request feed) + "Find Donors" (donor cards, only if user has active request)
- [ ] `<CreateRequestPage />` — 3-step form (blood details → hospital → review)

**Commits**:
```
feat(server): GET /requests with compatibility filter and sorting
feat(server): POST /requests with validation and eligibility
feat(server): donor interest, reveal, and outcome endpoints
feat(client): RequestCard + BloodGroupBadge + UrgencyChip
feat(client): FilterBar with city default and compatibility mode
feat(client): unified home page with donate/find-donors tabs
feat(client): 3-step create request form with Zod validation
```

---

### Hour 8–12: Profiles + Eligibility + Tracker (Both devs)

**Dev B:**
- [ ] `GET/PUT /donors/profile`
- [ ] `PUT /donors/availability` — enforces eligibility (bloodGroupVerified + rest period + weight) server-side
- [ ] `GET /donors/eligibility` — returns per-component eligibility result
- [ ] `GET /orgs/dashboard` — stats: activeRequests, fulfilledToday, pendingContacts, recentRequests
- [ ] `PUT /orgs/inventory` — update inventory map
- [ ] `GET /admin/stats` — platform-wide numbers for charts

**Dev A:**
- [ ] `<ProfilePage />` — unified: blood group panel (with verify prompt), eligibility panel, availability toggle, reputation panel, location
- [ ] `<EligibilityPanel />` — rest period, next eligible date per component, disabled toggle messaging
- [ ] `<AvailabilityToggle />` — calls `PUT /donors/availability`; shows ineligibility reason if blocked
- [ ] `<RequestDetailPage />` / `<RequestTracker />` — status timeline, donor slot list, units counter, action bar
- [ ] `<DonorSlot />` — per-donor interest card: status, ETA, "Reveal contact" → `<ContactRevealModal />`
- [ ] `<ContactRevealModal />` — donor preview, consent warnings, "Send OTP" → mock OTP entry → both contacts revealed

**Commits**:
```
feat(server): donor profile CRUD and availability toggle with eligibility
feat(server): org dashboard stats and inventory update
feat(client): profile page — blood group, eligibility, availability toggle
feat(client): request tracker with donor slot timeline
feat(client): contact reveal modal with OTP confirmation flow
```

---

### Hour 12–16: Dashboard + Admin + Polish (All devs)

**Dev B + C:**
- [ ] `GET /admin/stats` + `GET /admin/stats/history` (simple aggregation — count documents by date)
- [ ] `GET/PUT /admin/orgs/pending` + verify/reject
- [ ] `GET/PUT /admin/users` + suspend/unsuspend
- [ ] `POST /requests/:id/flag` + `GET /admin/flags`
- [ ] WhatsApp share token generation + `GET /r/:token` public endpoint

**Dev A + C:**
- [ ] `<OrgDashboardPage />` — stats cards, inventory (editable inline), recent requests table
- [ ] `<AdminDashboardPage />` — TAB 1: Recharts bar + line charts; TAB 2: reports; TAB 3: org queue; TAB 4: users; TAB 5: disputes [SOLO-SKIP: TABs 2–5, just do Overview]
- [ ] `<EmergencyBanner />` — sticky top strip shown to eligible donors matching active emergency requests
- [ ] WhatsApp share button (copy-link + `window.open` WhatsApp URL)
- [ ] Responsive layout pass (mobile-first, test at 375px and 768px)
- [ ] Toast notifications for all actions (success/error via react-hot-toast)

**Commits**:
```
feat(client): org dashboard — stats, inventory, request table
feat(client): admin dashboard — Recharts analytics + org queue
feat(client): emergency banner for matching donors
feat(client): WhatsApp share and copy link
feat(client): responsive layout mobile pass
feat(server): request flag, share token, admin stats endpoints
```

---

### Hour 16–20: Integration + Error Handling + Testing (All devs)

- [ ] Full end-to-end flow test:
  - Register individual → verify OTP → fill blood group → toggle available
  - Register patient → create request (3-step form) → see "0 donors"
  - Login as donor → see the request → "I can donate" → set ETA
  - Back to patient → "1 donor interested" → Reveal contact → OTP modal → contact revealed
  - Both report outcome → donation count updates → request FULFILLED
- [ ] Org flow: Register org (admin verifies) → post request → org manages from dashboard
- [ ] Admin flow: Login → verify pending org → view flagged request
- [ ] Empty states: 0 requests, 0 donors, no active request (Find Donors tab gate)
- [ ] Loading skeletons for request feed + dashboard stats
- [ ] 401/403 handling: redirect to /login on 401; show "Access denied" page on 403
- [ ] Network error fallback: retry button on request failure

**Commits**:
```
fix: end-to-end donor-patient flow integration
fix: error states and empty state UI
feat(client): loading skeletons for request feed and dashboard
fix: 401 redirect and 403 access denied handling
fix: network error retry button
```

---

### Hour 20–22: Deployment

**Backend (Railway):**
```
# server/railway.toml
[build]
builder = "NIXPACKS"
buildCommand = "npm install"

[deploy]
startCommand = "node src/app.js"
```
- Push to GitHub → connect Railway to repo, set root to `/server`
- Add env vars in Railway: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL`, `PORT=5000`
- Test `POST /api/v1/auth/register` from live URL

**Frontend (Vercel):**
```json
// client/vercel.json
{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
```
- Connect Vercel to GitHub repo, set root directory to `/client`
- Add `VITE_API_URL` = Railway API URL
- Deploy → test live link end-to-end

**Commits**:
```
chore: Railway config for backend deployment
chore: Vercel config for frontend deployment
chore: production environment variables documented in .env.example
```

---

### Hour 22–24: README + Final Polish

- [ ] Write README (template below)
- [ ] Run seed script — creates 1 admin, 2 donors, 1 patient, 1 verified org, 3 sample requests
- [ ] Verify seed data appears correctly on live Vercel URL
- [ ] Record 2-minute demo walkthrough (Loom / OBS)
- [ ] Final commit + tag: `git tag v1.0.0 && git push --tags`

**Commit**: `docs: README with live links, API reference, and seed instructions`

---

## GitHub Commit Strategy

### Branch Strategy
```
main         ← production (deployed to Vercel + Railway)
  └── dev    ← integration branch
        ├── feat/auth
        ├── feat/requests
        ├── feat/donor-profile
        ├── feat/org-dashboard
        └── feat/admin
```

### Commit Message Format
```
<type>(<scope>): <short description>

Types:  feat | fix | chore | docs | refactor | test
Scopes: client | server | auth | requests | donor | org | admin | db
```

### Meaningful Commit Schedule (24h)
```
Hour 1:  chore: initial project scaffold with client/server structure
Hour 2:  feat(db): all 5 mongoose schemas with indexes
Hour 3:  feat(auth): register, login, JWT, OTP mock, and role middleware
Hour 4:  feat(client): auth pages, role selector, protected routes, fetch wrapper
Hour 6:  feat(server): GET/POST /requests with compatibility engine
Hour 7:  feat(client): request feed — FilterBar + RequestCard
Hour 9:  feat(server): donor interest, contact reveal (mock OTP), outcome endpoints
Hour 10: feat(client): 3-step create request form with validation
Hour 12: feat(client): request tracker with donor slots + contact reveal modal
Hour 13: feat(server): donor profile, eligibility check, availability toggle
Hour 14: feat(client): profile page — blood group, eligibility panel, availability toggle
Hour 16: feat(client+server): org dashboard + admin analytics
Hour 17: feat(client): emergency banner, WhatsApp share, toast notifications
Hour 18: fix: mobile responsive pass (375px + 768px)
Hour 20: fix: integration testing and error state UI
Hour 22: chore: Railway + Vercel deployment configs
Hour 23: chore: database seed script
Hour 24: docs: README with live links and API reference
```

---

## README Template

````markdown
# 🩸 Blood Network

> Real-time blood donation coordination platform — connecting donors with patients in India

**Live App**: https://blood-network.vercel.app
**API Base**: https://blood-network-api.up.railway.app/api/v1

---

## What it does

Blood Network helps patients find blood donors near them in emergencies. Any registered
user can post a blood request or express interest in donating. Contacts are exchanged
only after both parties consent through an OTP-gated reveal flow. Hospitals can manage
requests on behalf of patients and track blood inventory.

---

## Roles

| Role | What they can do |
|---|---|
| **Individual** | Post blood requests; verify blood group to activate donor capabilities; toggle availability; express interest; report outcomes |
| **Org/Hospital** | Post on behalf of patients, manage blood inventory, track all org requests |
| **Admin** | Verify organisations, review flagged requests, suspend accounts, view platform analytics |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + JavaScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand + TanStack Query |
| HTTP client | Native `fetch` (no axios) |
| Backend | Node.js + Express |
| Database | MongoDB + Mongoose (Atlas) |
| Auth | JWT + bcrypt + OTP (mock — logs to console) |
| Charts | Recharts |
| Deployment | Vercel + Railway + MongoDB Atlas |

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier)

### Setup

```bash
git clone https://github.com/your-org/blood-network
```

**Backend:**
```bash
cd server
cp .env.example .env
# Fill in: MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, PORT=5000, CLIENT_URL
npm install
node src/app.js        # runs on http://localhost:5000
```

**Frontend:**
```bash
cd client
cp .env.example .env
# Fill in: VITE_API_URL=http://localhost:5000/api/v1
npm install
npm run dev            # runs on http://localhost:5173
```

**Seed the database:**
```bash
cd server
node src/seed.js
# Creates: 1 admin, 2 donors, 1 patient, 1 org, 3 sample requests
# Credentials printed to console after seed completes
```

---

## Environment Variables

### Server (`server/.env`)
```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-32-chars-min
JWT_REFRESH_SECRET=your-refresh-secret
PORT=5000
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

### Client (`client/.env`)
```
VITE_API_URL=http://localhost:5000/api/v1
```

---

## API Reference

All endpoints require `Authorization: Bearer <token>` unless marked **Public**.

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Create account |
| POST | `/auth/login` | Public | Login with phone+password |
| POST | `/auth/otp/send` | Public | Send OTP (logged to console) |
| POST | `/auth/otp/verify` | Public | Verify OTP → issues JWT |
| GET | `/auth/me` | Any | Get current user |
| POST | `/auth/refresh` | Cookie | Refresh access token |

### Requests
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/requests` | Any | List requests (filterable) |
| POST | `/requests` | Individual/Org | Create blood request |
| GET | `/requests/:id` | Public | Get single request |
| POST | `/requests/:id/fulfil` | Owner/Org | Mark fulfilled |
| POST | `/requests/:id/interest` | Individual (donor-capable) | Express interest |
| POST | `/requests/:id/interest/:iid/reveal` | Owner/Org | Initiate contact reveal |
| POST | `/requests/:id/interest/:iid/reveal/confirm` | Donor | Enter OTP → contacts revealed |
| POST | `/requests/:id/interest/:iid/outcome` | Donor/Owner | Report outcome |

---

## Features

- ✅ Phone OTP authentication (mocked — OTP logged to console)
- ✅ Unified role model: one account, can donate AND post requests
- ✅ Blood compatibility engine (O− donors see all compatible requests)
- ✅ Donor eligibility enforcement (56-day rest period, weight gate)
- ✅ Request status lifecycle (Active → Partially Fulfilled → Fulfilled → Expired)
- ✅ Multi-step request creation with Zod validation
- ✅ OTP-gated contact reveal (bilateral — both phones shared simultaneously)
- ✅ Donation outcome reporting with reputation tracking
- ✅ Org dashboard with blood inventory management
- ✅ Admin analytics dashboard (Recharts) + org verification + user management
- ✅ WhatsApp share links for blood requests (copy-link button)
- ✅ Responsive UI (mobile-first, 375px+)
- ✅ 30s polling for live-ish updates (no WebSocket in MVP)
- ✅ Request flagging for abuse prevention

---

## Team

| Name | Role |
|---|---|
| Dev A | Frontend |
| Dev B | Backend |
| Dev C | Full-stack + Deployment |
````

---

## What NOT to Build in 24 Hours

> These are explicitly out of scope. Starting any of these will kill your timeline.

| Feature | Why cut |
|---|---|
| Real SMS delivery (Twilio) | A2P DLT registration in India takes 7–10 business days; mock with console.log |
| PostGIS / geospatial radius | Too complex; city string match is good enough for demo |
| AI scoring (ML model) | No training data; hardcode "High" for ≥10 donations, "Medium" 3–9, "Low" <3 |
| Mass casualty mode | Impressive but zero value without real scale data |
| File uploads (proof docs) | Show the upload UI button; skip actual storage; admin manually approves in demo |
| Email notifications | Not needed; OTP via console is enough |
| WebSocket (socket.io) | Use 30-second polling; same demo result |
| React Native app | Web on mobile is fine |
| Separate platelet matching pool | Flag `plateletEligible=true` on donors; skip separate matching |
| Request auto-expiry via MongoDB TTL | TTL deletes the document, losing interest history; use a query filter on `expiresAt` |

---

## Seed Script

```javascript
// server/src/seed.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { addHours, subDays } from 'date-fns';
import { User, DonorProfile, BloodRequest, OrgProfile } from './models/index.js';
import { config } from './config/env.js';

mongoose.connect(config.MONGODB_URI);

async function seed() {
  await Promise.all([User.deleteMany(), DonorProfile.deleteMany(), BloodRequest.deleteMany(), OrgProfile.deleteMany()]);

  const hash = (pw) => bcrypt.hashSync(pw, 10);

  // 1. Admin
  await User.create({ fullName: 'Admin User', phone: '+919000000001', role: 'ADMIN', passwordHash: hash('Admin@1234'), phoneVerified: true });

  // 2. Donor 1 — O+, eligible
  const d1 = await User.create({ fullName: 'Ravi Kumar', phone: '+919000000002', role: 'INDIVIDUAL', passwordHash: hash('Test@1234'), phoneVerified: true });
  await DonorProfile.create({ userId: d1._id, bloodGroup: 'O+', bloodGroupVerified: true, city: 'Vijayawada', state: 'Andhra Pradesh', weightKg: 72, available: true, totalDonations: 5, lastWholeBloodDonation: subDays(new Date(), 62) });

  // 3. Donor 2 — O−, eligible, high reputation
  const d2 = await User.create({ fullName: 'Meena Rao', phone: '+919000000003', role: 'INDIVIDUAL', passwordHash: hash('Test@1234'), phoneVerified: true });
  await DonorProfile.create({ userId: d2._id, bloodGroup: 'O-', bloodGroupVerified: true, city: 'Vijayawada', state: 'Andhra Pradesh', weightKg: 55, available: true, totalDonations: 12, lastWholeBloodDonation: subDays(new Date(), 60) });

  // 4. Patient (individual, no blood group set)
  const patient = await User.create({ fullName: 'Priya Sharma', phone: '+919000000004', role: 'INDIVIDUAL', passwordHash: hash('Test@1234'), phoneVerified: true });
  await DonorProfile.create({ userId: patient._id, city: 'Vijayawada', state: 'Andhra Pradesh' });

  // 5. Org (verified)
  const org = await User.create({ fullName: 'Apollo Hospital Admin', phone: '+919000000005', role: 'ORG', passwordHash: hash('Test@1234'), phoneVerified: true });
  await OrgProfile.create({ userId: org._id, orgName: 'Apollo Hospital Vijayawada', registrationNo: 'AP-HOSP-4521', orgType: 'HOSPITAL', city: 'Vijayawada', state: 'Andhra Pradesh', verificationStatus: 'VERIFIED', inventory: { 'O+': 8, 'A+': 4, 'B+': 6, 'O-': 2 } });

  // 6. Sample requests
  await BloodRequest.create([
    { requesterId: patient._id, requesterType: 'INDIVIDUAL', bloodGroup: 'O+', component: 'WHOLE_BLOOD', unitsNeeded: 2, urgency: 'EMERGENCY', requiredBy: addHours(new Date(), 2), hospitalName: 'Apollo Hospital Vijayawada', hospitalCity: 'Vijayawada', hospitalState: 'Andhra Pradesh', expiresAt: addHours(new Date(), 4) },
    { requesterId: org._id, requesterType: 'ORG', bloodGroup: 'AB-', component: 'WHOLE_BLOOD', unitsNeeded: 3, urgency: 'HIGH', requiredBy: addHours(new Date(), 6), hospitalName: 'Apollo Hospital Vijayawada', hospitalCity: 'Vijayawada', hospitalState: 'Andhra Pradesh', expiresAt: addHours(new Date(), 8) },
    { requesterId: patient._id, requesterType: 'INDIVIDUAL', bloodGroup: 'B+', component: 'PLATELETS', unitsNeeded: 6, urgency: 'NORMAL', requiredBy: addHours(new Date(), 24), hospitalName: 'MNJ Cancer Hospital', hospitalCity: 'Hyderabad', hospitalState: 'Telangana', expiresAt: addHours(new Date(), 26) },
  ]);

  console.log('\n✅ Seed complete\n');
  console.log('Admin:   +919000000001 / Admin@1234');
  console.log('Donor 1: +919000000002 / Test@1234  (O+, available)');
  console.log('Donor 2: +919000000003 / Test@1234  (O−, available)');
  console.log('Patient: +919000000004 / Test@1234');
  console.log('Org:     +919000000005 / Test@1234  (Verified)');
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
```

---

## What Judges Will See

1. **Landing page** — urgency, professional design, clear role options (Individual / Org)
2. **Register as individual** → fill blood group → verify OTP (console) → profile with eligibility panel, availability toggle
3. **Register as patient (same individual account)** → post a blood request (3-step form) → tracker shows 0 donors
4. **Login as donor** → home shows compatible request in Vijayawada → "I can donate" → set ETA
5. **Back to patient account** → "1 donor interested" → Reveal contact → consent modal → mock OTP → contact revealed to both
6. **Both report outcome** → donation count 5 → 6 → tracker shows FULFILLED
7. **Login as org** → dashboard shows inventory, active requests, stats cards
8. **Login as admin** → Recharts analytics, org verification queue, flagged request table, user management

This is a **complete, closed-loop demo** that hits every judge criterion with real data flowing through all layers.
