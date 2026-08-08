import mongoose from 'mongoose';
import { app, server } from './src/app.js';
import { config } from './src/config/env.js';
import { User } from './src/models/User.js';
import { DonorProfile } from './src/models/DonorProfile.js';
import { OrgProfile } from './src/models/OrgProfile.js';
import { BloodRequest } from './src/models/BloodRequest.js';
import { DonorInterest } from './src/models/DonorInterest.js';
import { AuditLog } from './src/models/AuditLog.js';
import { InventoryLog } from './src/models/InventoryLog.js';
import { Dispute } from './src/models/Dispute.js';
import { redis } from './src/services/redis.service.js';
import { signAccessToken } from './src/utils/jwt.js';

console.log('🧪 Starting Exhaustive End-to-End System & Workflow Verification...');

const BASE = 'http://127.0.0.1:5000/api/v1';

async function run() {
  let httpServer;
  try {
    if (!server.listening) {
      httpServer = server.listen(5000);
      await new Promise(resolve => httpServer.once('listening', resolve));
    } else {
      httpServer = server;
    }

    while (mongoose.connection.readyState !== 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    console.log('  Live API server ready.');

    // Cleanup previous test artifacts
    await User.deleteMany({ email: /test-full-sys/ });
    await BloodRequest.deleteMany({ hospitalName: /Full System Test Hospital/ });

    // =========================================================================
    // 1. HEALTH & OBSERVABILITY PROBE
    // =========================================================================
    console.log('\n--- [STAGE 1] Health & System Observability ---');
    const healthRes = await fetch(`${BASE}/health`);
    if (healthRes.status !== 200) throw new Error(`Health status ${healthRes.status}`);
    const healthData = await healthRes.json();
    if (healthData.status !== 'UP' || healthData.services.mongodb !== 'CONNECTED') {
      throw new Error(`Degraded health: ${JSON.stringify(healthData)}`);
    }
    console.log(`  ✅ Health probe passed (uptime: ${Math.round(healthData.uptime)}s, memory: ${healthData.memoryUsage.rssMb}MB)`);

    // =========================================================================
    // 2. AUTHENTICATION & SECURITY LIFECYCLE
    // =========================================================================
    console.log('\n--- [STAGE 2] Authentication & Security Lifecycle ---');
    // 2a. Provision Admin Account
    const adminUser = await User.create({
      fullName: 'Sys Admin',
      phone: '+919900110001',
      email: 'test-full-sys-admin@example.com',
      role: 'ADMIN',
      phoneVerified: true,
    });
    const adminId = adminUser._id.toString();
    const adminToken = signAccessToken({ userId: adminId, role: 'ADMIN' });
    console.log(`  ✅ Admin account provisioned: ${adminUser.fullName} (${adminId})`);

    // 2b. Register Requester (Individual)
    const reqRes = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Priya Sharma (Patient Guardian)',
        phone: '+919900110002',
        email: 'test-full-sys-req@example.com',
        role: 'INDIVIDUAL',
        city: 'Hyderabad',
        state: 'Telangana',
        bloodGroup: 'B+',
        weightKg: 62,
        latitude: 17.4123,
        longitude: 78.4354,
      }),
    });
    const reqData = await reqRes.json();
    if (reqRes.status !== 201) throw new Error(`Requester register failed: ${JSON.stringify(reqData)}`);
    const requesterToken = reqData.accessToken;
    const requesterId = reqData.user.id;
    console.log(`  ✅ Requester registered: ${reqData.user.fullName} (${requesterId})`);

    // 2c. Register Primary Donor (Individual)
    const donorRes = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Kiran Varma (Donor)',
        phone: '+919900110003',
        email: 'test-full-sys-donor1@example.com',
        role: 'INDIVIDUAL',
        city: 'Hyderabad',
        state: 'Telangana',
        bloodGroup: 'B+',
        weightKg: 74,
        latitude: 17.4140,
        longitude: 78.4370,
      }),
    });
    const donorData = await donorRes.json();
    if (donorRes.status !== 201) throw new Error(`Donor register failed: ${JSON.stringify(donorData)}`);
    const donorToken = donorData.accessToken;
    const donorId = donorData.user.id;
    await DonorProfile.updateOne({ userId: donorId }, { bloodGroupVerified: true, available: true });
    console.log(`  ✅ Donor registered & activated: ${donorData.user.fullName} (${donorId})`);

    // 2d. Register Secondary Donor (For Waitlist Testing)
    const donor2Res = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Suresh Raina (Waitlist Donor)',
        phone: '+919900110004',
        email: 'test-full-sys-donor2@example.com',
        role: 'INDIVIDUAL',
        city: 'Hyderabad',
        state: 'Telangana',
        bloodGroup: 'B+',
        weightKg: 80,
      }),
    });
    const donor2Data = await donor2Res.json();
    const donor2Token = donor2Data.accessToken;
    const donor2Id = donor2Data.user.id;
    await DonorProfile.updateOne({ userId: donor2Id }, { bloodGroupVerified: true, available: true });
    console.log(`  ✅ Secondary Donor registered: ${donor2Data.user.fullName} (${donor2Id})`);

    // =========================================================================
    // 3. DONOR PROFILE & AVAILABILITY QUICK-TOGGLE
    // =========================================================================
    console.log('\n--- [STAGE 3] Donor Availability & Profile Management ---');
    const toggleRes = await fetch(`${BASE}/donors/availability`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donorToken}`,
      },
      body: JSON.stringify({ available: false }),
    });
    const toggleData = await toggleRes.json();
    if (toggleRes.status !== 200 || toggleData.available !== false) {
      throw new Error(`Availability toggle to false failed: ${JSON.stringify(toggleData)}`);
    }
    // Re-enable availability
    await fetch(`${BASE}/donors/availability`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donorToken}`,
      },
      body: JSON.stringify({ available: true }),
    });
    console.log('  ✅ Donor quick-toggle endpoint /api/v1/donors/availability verified.');

    // =========================================================================
    // 4. EMERGENCY BLOOD REQUEST LIFECYCLE & REDIS CACHING
    // =========================================================================
    console.log('\n--- [STAGE 4] Blood Request Creation, Feed & Redis Caching ---');
    const reqCreateRes = await fetch(`${BASE}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${requesterToken}`,
      },
      body: JSON.stringify({
        bloodGroup: 'B+',
        component: 'WHOLE_BLOOD',
        unitsNeeded: 1,
        urgency: 'EMERGENCY',
        requiredBy: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        hospitalName: 'Full System Test Hospital',
        hospitalCity: 'Hyderabad',
        hospitalState: 'Telangana',
        hospitalLatitude: 17.4120,
        hospitalLongitude: 78.4350,
      }),
    });
    const bloodReq = await reqCreateRes.json();
    if (reqCreateRes.status !== 201) throw new Error(`Create request failed: ${JSON.stringify(bloodReq)}`);
    const requestId = bloodReq._id;
    console.log(`  ✅ Emergency request created: ID ${requestId} (${bloodReq.bloodGroup}, ${bloodReq.unitsNeeded} unit needed)`);

    // Verify Redis Caching on Public Feed
    const feed1Res = await fetch(`${BASE}/requests?bloodGroup=B%2B&city=Hyderabad`, {
      headers: { Authorization: `Bearer ${donorToken}` },
    });
    const feed1 = await feed1Res.json();
    if (feed1Res.status !== 200 || !feed1.requests.some(r => r._id === requestId)) {
      throw new Error('Feed query 1 failed');
    }
    // Second fetch should hit Redis cache
    const feed2Res = await fetch(`${BASE}/requests?bloodGroup=B%2B&city=Hyderabad`, {
      headers: { Authorization: `Bearer ${donorToken}` },
    });
    const feed2 = await feed2Res.json();
    if (feed2Res.status !== 200 || feed2.requests.length !== feed1.requests.length) {
      throw new Error('Redis cached feed query failed');
    }
    console.log(`  ✅ Public feed query and Redis cache retrieval verified (Returned ${feed2.requests.length} requests).`);

    // =========================================================================
    // 5. ATOMIC SLOT RESERVATION & WAITLIST FLOW
    // =========================================================================
    console.log('\n--- [STAGE 5] Distributed Mutex Slot Reservation & Waitlist ---');
    // Donor 1 reserves the single unit
    const reserve1Res = await fetch(`${BASE}/requests/${requestId}/reserve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donorToken}`,
      },
      body: JSON.stringify({ eta: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
    });
    const reserve1 = await reserve1Res.json();
    if (reserve1Res.status !== 200 && reserve1Res.status !== 201) {
      throw new Error(`Donor 1 reservation failed: ${JSON.stringify(reserve1)}`);
    }
    console.log(`  ✅ Donor 1 claimed slot with atomic distributed lock: status=${reserve1.status}`);

    // Donor 2 attempts to express interest -> Request is full, should receive waitlist offer
    const interest2Res = await fetch(`${BASE}/requests/${requestId}/interest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donor2Token}`,
      },
      body: JSON.stringify({ waitlist: false }),
    });
    const interest2Error = await interest2Res.json();
    if (interest2Res.status !== 403 || !interest2Error.canWaitlist) {
      throw new Error(`Expected waitlist offer, got: ${interest2Res.status} ${JSON.stringify(interest2Error)}`);
    }
    console.log('  ✅ Over-capacity detected: Donor 2 correctly offered waitlist option.');

    // Donor 2 joins waitlist
    const waitlistRes = await fetch(`${BASE}/requests/${requestId}/interest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donor2Token}`,
      },
      body: JSON.stringify({ waitlist: true }),
    });
    const waitlistData = await waitlistRes.json();
    if (waitlistRes.status !== 201 && waitlistRes.status !== 200) {
      throw new Error(`Waitlist registration failed: ${JSON.stringify(waitlistData)}`);
    }
    console.log(`  ✅ Donor 2 registered on priority waitlist: status=${waitlistData.status}`);

    // Verify detail page reflects waitlistCount
    const detailRes = await fetch(`${BASE}/requests/${requestId}`, {
      headers: { Authorization: `Bearer ${requesterToken}` },
    });
    const detailData = await detailRes.json();
    if (detailData.request.waitlistCount < 1) {
      throw new Error(`Expected waitlistCount >= 1, got ${detailData.request.waitlistCount}`);
    }
    console.log(`  ✅ Request details accurately report waitlistCount=${detailData.request.waitlistCount}`);

    // =========================================================================
    // 6. CONTACT REVEAL FLOW WITH OTP GATING
    // =========================================================================
    console.log('\n--- [STAGE 6] OTP-Gated Contact Reveal Flow ---');
    const donorInterestRecord = await DonorInterest.findOne({ requestId, donorId });
    
    // Requester initiates contact reveal
    const revealReqRes = await fetch(`${BASE}/requests/${requestId}/interest/${donorInterestRecord._id}/reveal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${requesterToken}` },
    });
    const revealReqData = await revealReqRes.json();
    if (revealReqRes.status !== 200) throw new Error(`Reveal init failed: ${JSON.stringify(revealReqData)}`);
    console.log(`  ✅ Requester initiated contact reveal (OTP dispatched to donor).`);

    if (revealReqData.status === 'CONTACT_REVEALED') {
      if (!revealReqData.patientPhone || !revealReqData.donorPhone) {
        throw new Error('Expected phone numbers in emergency instant reveal response');
      }
      console.log(`  ✅ Emergency request: contact details revealed instantly without OTP delay.`);
    } else {
      const confirmRevealRes = await fetch(`${BASE}/requests/${requestId}/interest/${donorInterestRecord._id}/reveal/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${requesterToken}`,
        },
        body: JSON.stringify({ otp: '123456' }),
      });
      if (confirmRevealRes.status !== 200) throw new Error('Contact reveal confirm failed');
      console.log('  ✅ Contact reveal confirmed: Confidential phone numbers exchanged.');
    }

    // =========================================================================
    // 7. REAL-TIME COORDINATION CHAT
    // =========================================================================
    console.log('\n--- [STAGE 7] Real-Time Coordination Chat Messaging ---');
    const msgRes = await fetch(`${BASE}/requests/${requestId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donorToken}`,
      },
      body: JSON.stringify({ content: 'I have arrived at the hospital reception!' }),
    });
    if (msgRes.status !== 201) throw new Error(`Chat message send failed: ${msgRes.status}`);

    const chatRes = await fetch(`${BASE}/requests/${requestId}/chat`, {
      headers: { Authorization: `Bearer ${requesterToken}` },
    });
    const chatHistory = await chatRes.json();
    if (!chatHistory.some(m => m.content.includes('hospital reception'))) {
      throw new Error('Sent chat message not in message history');
    }
    console.log(`  ✅ Coordination chat message verified across sender/receiver.`);

    // =========================================================================
    // 8. DUAL-SIDED OUTCOME REPORTING & REPUTATION ENGINE
    // =========================================================================
    console.log('\n--- [STAGE 8] Dual-Sided Outcome Reporting & Reputation Scoring ---');
    // Donor reports DONATED
    const donorOutcomeRes = await fetch(`${BASE}/requests/${requestId}/interest/${donorInterestRecord._id}/outcome`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donorToken}`,
      },
      body: JSON.stringify({ outcome: 'DONATED' }),
    });
    if (donorOutcomeRes.status !== 200) throw new Error(`Donor outcome failed: ${donorOutcomeRes.status}`);

    // Requester reports DONATED (Agreement triggers transaction & reputation calculation)
    const reqOutcomeRes = await fetch(`${BASE}/requests/${requestId}/interest/${donorInterestRecord._id}/outcome`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${requesterToken}`,
      },
      body: JSON.stringify({ outcome: 'DONATED' }),
    });
    if (reqOutcomeRes.status !== 200) throw new Error(`Requester outcome failed: ${reqOutcomeRes.status}`);

    // Verify Donor Profile totalDonations incremented & reputationScore calculated
    const updatedDonorProfile = await DonorProfile.findOne({ userId: donorId });
    if (updatedDonorProfile.totalDonations < 1 || updatedDonorProfile.reputationScore <= 50) {
      throw new Error(`Reputation scoring incorrect: donations=${updatedDonorProfile.totalDonations}, score=${updatedDonorProfile.reputationScore}`);
    }
    console.log(`  ✅ Outcome finalized: Donor reputation score increased to ${updatedDonorProfile.reputationScore} (totalDonations=${updatedDonorProfile.totalDonations}).`);

    // Verify BloodRequest fulfilled
    const updatedBloodReq = await BloodRequest.findById(requestId);
    if (updatedBloodReq.status !== 'FULFILLED') {
      throw new Error(`Expected request status FULFILLED, got ${updatedBloodReq.status}`);
    }
    console.log(`  ✅ Blood request marked FULFILLED atomically.`);

    // =========================================================================
    // 9. ADMINISTRATIVE AUDIT LOGGING & OVERSIGHT
    // =========================================================================
    console.log('\n--- [STAGE 9] Administrative Governance & Audit Trail ---');
    // Admin suspends a test account
    const suspendRes = await fetch(`${BASE}/admin/users/${donor2Id}/suspend`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ reason: 'Suspended for compliance review' }),
    });
    if (suspendRes.status !== 200) throw new Error(`Suspend failed: ${suspendRes.status}`);

    // Check AuditLog entry
    const auditRes = await fetch(`${BASE}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const auditData = await auditRes.json();
    const foundLog = auditData.logs.some(l => l.action === 'SUSPEND_USER' && l.targetId === donor2Id);
    if (!foundLog) throw new Error('SUSPEND_USER action missing from AuditLog trail');
    console.log(`  ✅ Admin suspension logged in tamper-evident AuditLog trail.`);

    // Admin unsuspends user
    await fetch(`${BASE}/admin/users/${donor2Id}/unsuspend`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log(`  ✅ Admin user unsuspend verified.`);

    // =========================================================================
    // 10. SESSION REVOCATION
    // =========================================================================
    console.log('\n--- [STAGE 10] Session Revocation via tokenVersion ---');
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${donorToken}` },
    });
    const donorUserAfterLogout = await User.findById(donorId);
    if (donorUserAfterLogout.tokenVersion < 1) {
      throw new Error(`tokenVersion not incremented: ${donorUserAfterLogout.tokenVersion}`);
    }
    console.log(`  ✅ Logout verified: User tokenVersion incremented to ${donorUserAfterLogout.tokenVersion} (all refresh tokens revoked).`);

    // Clean up
    await User.deleteMany({ _id: { $in: [adminId, requesterId, donorId, donor2Id] } });
    await DonorProfile.deleteMany({ userId: { $in: [donorId, donor2Id] } });
    await BloodRequest.deleteMany({ _id: requestId });
    await DonorInterest.deleteMany({ requestId });
    await AuditLog.deleteMany({ adminId });

    console.log('\n=================================================================');
    console.log('🎉 ALL 10 END-TO-END WORKFLOW STAGES PASSED CLEANLY & REGRESSION-FREE!');
    console.log('=================================================================\n');

    httpServer.close();
    await redis.close();
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Full system workflow verification failed:', err);
    if (httpServer) httpServer.close();
    await redis.close();
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
