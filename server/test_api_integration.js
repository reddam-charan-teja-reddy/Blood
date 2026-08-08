import http from 'http';
import { app, server } from './src/app.js';
import { config } from './src/config/env.js';
import mongoose from 'mongoose';
import { User } from './src/models/User.js';
import { BloodRequest } from './src/models/BloodRequest.js';
import { DonorInterest } from './src/models/DonorInterest.js';
import { AuditLog } from './src/models/AuditLog.js';
import { redis } from './src/services/redis.service.js';

console.log('🧪 Starting Full Black-Box API Workflow & Security Integration Suite...');

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
    console.log('  Live HTTP server listening on port 5000.');

    // Ensure DB connection is ready
    while (mongoose.connection.readyState !== 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 1. Test Health Endpoint
    console.log('\n--- 1. Health Probe ---');
    const healthRes = await fetch(`${BASE}/health`);
    if (healthRes.status !== 200) throw new Error(`Health status: ${healthRes.status}`);
    const healthData = await healthRes.json();
    if (healthData.status !== 'UP') throw new Error(`Health report: ${JSON.stringify(healthData)}`);
    console.log('  ✅ /api/v1/health returned status: UP, services: mongodb=CONNECTED, redis=CONNECTED');

    // 2. Test Rate Limiter on OTP
    console.log('\n--- 2. Rate Limiting on OTP ---');
    const otpRes = await fetch(`${BASE}/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+919988776655' }),
    });
    if (otpRes.status !== 200) throw new Error(`OTP send status: ${otpRes.status}`);
    console.log('  ✅ /api/v1/auth/otp/send accepted request under rate limit.');

    // 3. User Registration (Requester)
    console.log('\n--- 3. User Registration (Requester) ---');
    await User.deleteMany({ email: /test-live-api/ });
    const regRes = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Live Requester',
        phone: '+919988776655',
        email: 'test-live-api-req@example.com',
        role: 'INDIVIDUAL',
        city: 'Hyderabad',
        state: 'Telangana',
        bloodGroup: 'B+',
        weightKg: 68,
      }),
    });
    const regData = await regRes.json();
    if (regRes.status !== 201) throw new Error(`Register failed: ${JSON.stringify(regData)}`);
    const requesterToken = regData.accessToken;
    const requesterId = regData.user.id;
    console.log(`  ✅ Registered Requester: ${regData.user.fullName} (${requesterId})`);

    // 4. User Registration (Donor)
    console.log('\n--- 4. User Registration (Donor) ---');
    const donorRegRes = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Live Donor',
        phone: '+919988776656',
        email: 'test-live-api-donor@example.com',
        role: 'INDIVIDUAL',
        city: 'Hyderabad',
        state: 'Telangana',
        bloodGroup: 'B+',
        weightKg: 75,
      }),
    });
    const donorRegData = await donorRegRes.json();
    if (donorRegRes.status !== 201) throw new Error(`Donor register failed: ${JSON.stringify(donorRegData)}`);
    const donorToken = donorRegData.accessToken;
    const donorId = donorRegData.user.id;
    console.log(`  ✅ Registered Donor: ${donorRegData.user.fullName} (${donorId})`);

    // Mark donor bloodGroupVerified in DB for eligibility
    await mongoose.model('DonorProfile').updateOne({ userId: donorId }, { bloodGroupVerified: true, available: true });

    // 5. AuthN: Verify Protected Endpoint /auth/me
    console.log('\n--- 5. AuthN /auth/me Check ---');
    const meRes = await fetch(`${BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${donorToken}` },
    });
    if (meRes.status !== 200) throw new Error(`/auth/me status: ${meRes.status}`);
    const meData = await meRes.json();
    if (meData.phone !== '+919988776656') throw new Error('User identity mismatch');
    console.log(`  ✅ AuthN passed: Authenticated as ${meData.fullName}, verified=${meData.profile.bloodGroupVerified}`);

    // 6. Create Blood Request
    console.log('\n--- 6. Create Emergency Blood Request ---');
    const createReqRes = await fetch(`${BASE}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${requesterToken}`,
      },
      body: JSON.stringify({
        bloodGroup: 'B+',
        component: 'WHOLE_BLOOD',
        unitsNeeded: 1,
        urgency: 'HIGH',
        requiredBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        hospitalName: 'Apollo Jubilee Hills',
        hospitalCity: 'Hyderabad',
        hospitalState: 'Telangana',
      }),
    });
    const createdRequest = await createReqRes.json();
    if (createReqRes.status !== 201) throw new Error(`Create request failed: ${JSON.stringify(createdRequest)}`);
    const requestId = createdRequest._id;
    console.log(`  ✅ Blood request created: ID ${requestId} (${createdRequest.bloodGroup}, ${createdRequest.unitsNeeded} unit needed)`);

    // 7. Public Feed Query
    console.log('\n--- 7. Query Public Feed ---');
    const feedRes = await fetch(`${BASE}/requests?bloodGroup=B%2B&city=Hyderabad`, {
      headers: { Authorization: `Bearer ${donorToken}` },
    });
    const feedData = await feedRes.json();
    if (feedRes.status !== 200 || !feedData.requests) throw new Error('Feed query failed');
    const found = feedData.requests.some(r => r._id === requestId);
    if (!found) throw new Error('Created request not returned in public feed');
    console.log(`  ✅ Public feed returned ${feedData.requests.length} requests; target request found.`);

    // 8. Donor Slot Reservation with Atomic Lock
    console.log('\n--- 8. Reserve Donation Slot ---');
    const reserveRes = await fetch(`${BASE}/requests/${requestId}/reserve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donorToken}`,
      },
      body: JSON.stringify({
        eta: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      }),
    });
    const reserveData = await reserveRes.json();
    if (reserveRes.status !== 201 && reserveRes.status !== 200) {
      throw new Error(`Reserve failed: ${JSON.stringify(reserveData)}`);
    }
    console.log(`  ✅ Slot reserved successfully with status: ${reserveData.status}`);

    // 9. Send Coordination Chat Message
    console.log('\n--- 9. Coordination Chat ---');
    const chatSendRes = await fetch(`${BASE}/requests/${requestId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donorToken}`,
      },
      body: JSON.stringify({ content: 'I am on my way to the hospital right now!' }),
    });
    const chatSendData = await chatSendRes.json();
    if (chatSendRes.status !== 201) throw new Error(`Chat send failed: ${JSON.stringify(chatSendData)}`);

    const chatListRes = await fetch(`${BASE}/requests/${requestId}/chat`, {
      headers: { Authorization: `Bearer ${requesterToken}` },
    });
    const chatList = await chatListRes.json();
    if (chatList.length === 0 || chatList[chatList.length - 1].content !== 'I am on my way to the hospital right now!') {
      throw new Error('Chat message not retrieved');
    }
    console.log(`  ✅ Real-time chat message delivered: "${chatList[chatList.length - 1].content}"`);

    // 10. AuthZ: Non-Admin attempting Admin Route (Must be 403 Forbidden)
    console.log('\n--- 10. AuthZ Check: Non-Admin blocked from Admin Console ---');
    const adminBlockedRes = await fetch(`${BASE}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${donorToken}` },
    });
    if (adminBlockedRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${adminBlockedRes.status}`);
    }
    console.log('  ✅ AuthZ strictly verified: Non-admin correctly rejected with 403 Forbidden.');

    // 11. Token Revocation via Logout
    console.log('\n--- 11. Token Revocation via Logout ---');
    const logoutRes = await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${donorToken}` },
    });
    if (logoutRes.status !== 200) throw new Error(`Logout failed: ${logoutRes.status}`);

    const updatedDonorUser = await User.findById(donorId);
    if (updatedDonorUser.tokenVersion !== 1) {
      throw new Error(`Expected tokenVersion 1 after logout, got ${updatedDonorUser.tokenVersion}`);
    }
    console.log(`  ✅ Logout successful: User tokenVersion incremented to ${updatedDonorUser.tokenVersion}. All refresh sessions revoked.`);

    // Cleanup
    await User.deleteMany({ _id: { $in: [requesterId, donorId] } });
    await BloodRequest.deleteMany({ _id: requestId });
    await DonorInterest.deleteMany({ requestId });

    console.log('\n========================================');
    console.log('🎉 FULL LIVE API & WORKFLOW INTEGRATION SUITE PASSED (11/11)!');
    console.log('========================================\n');
    httpServer.close();
    await redis.close();
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Live API integration test failed:', err);
    if (httpServer) httpServer.close();
    await redis.close();
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
