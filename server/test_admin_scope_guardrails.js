import mongoose from 'mongoose';
import { config } from './src/config/env.js';
import { BloodRequest } from './src/models/BloodRequest.js';
import { User } from './src/models/User.js';
import { DonorProfile } from './src/models/DonorProfile.js';
import { OrgProfile } from './src/models/OrgProfile.js';
import {
  getRequestByIdAdmin,
  getUserById,
  verifyOrg,
  clearFlags,
  getStats,
  updateModerationScope,
} from './src/controllers/admin.controller.js';

console.log('🧪 Starting regional admin moderation scope guardrail integration tests...');

async function run() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('  Connected to MongoDB.');

    // Cleanup previous test data
    const testPrefix = 'guardrail-test-';
    const oldUsers = await User.find({ email: new RegExp(`^${testPrefix}`) });
    const oldUserIds = oldUsers.map(u => u._id);
    await User.deleteMany({ _id: { $in: oldUserIds } });
    await BloodRequest.deleteMany({ hospitalName: new RegExp(`^${testPrefix}`) });
    await DonorProfile.deleteMany({ userId: { $in: oldUserIds } });
    await OrgProfile.deleteMany({ userId: { $in: oldUserIds } });

    // 1. Create scoped admin user (limited to Vijayawada)
    const adminUser = await User.create({
      fullName: 'Vijayawada Scoped Admin',
      phone: '+919999999201',
      email: `${testPrefix}admin@example.com`,
      role: 'ADMIN',
      phoneVerified: true,
      moderationCity: 'Vijayawada',
    });

    // 2. Create requester
    const requester = await User.create({
      fullName: 'Test Requester',
      phone: '+919999999202',
      email: `${testPrefix}requester@example.com`,
      role: 'INDIVIDUAL',
      phoneVerified: true,
    });

    // 3. Create Blood Requests in different cities
    const requestVijayawada = await BloodRequest.create({
      requesterId: requester._id,
      requesterType: 'INDIVIDUAL',
      bloodGroup: 'A+',
      component: 'WHOLE_BLOOD',
      unitsNeeded: 3,
      urgency: 'HIGH',
      requiredBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      hospitalName: `${testPrefix}Vijayawada Clinic`,
      hospitalCity: 'Vijayawada',
      hospitalState: 'Andhra Pradesh',
    });

    const requestHyderabad = await BloodRequest.create({
      requesterId: requester._id,
      requesterType: 'INDIVIDUAL',
      bloodGroup: 'A+',
      component: 'WHOLE_BLOOD',
      unitsNeeded: 3,
      urgency: 'HIGH',
      requiredBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      hospitalName: `${testPrefix}Hyderabad Clinic`,
      hospitalCity: 'Hyderabad',
      hospitalState: 'Telangana',
    });

    // 4. Create Org Profiles (one in-scope, one out-of-scope)
    const orgUserIn = await User.create({
      fullName: 'In-Scope Hospital',
      phone: '+919999999203',
      email: `${testPrefix}orgin@example.com`,
      role: 'ORG',
      phoneVerified: true,
    });
    const orgProfileIn = await OrgProfile.create({
      userId: orgUserIn._id,
      orgName: `${testPrefix}In-Scope Hospital`,
      registrationNo: 'REG-123456',
      orgType: 'HOSPITAL',
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      verificationStatus: 'PENDING',
    });

    const orgUserOut = await User.create({
      fullName: 'Out-of-Scope Hospital',
      phone: '+919999999204',
      email: `${testPrefix}orgout@example.com`,
      role: 'ORG',
      phoneVerified: true,
    });
    const orgProfileOut = await OrgProfile.create({
      userId: orgUserOut._id,
      orgName: `${testPrefix}Out-of-Scope Hospital`,
      registrationNo: 'REG-654321',
      orgType: 'HOSPITAL',
      city: 'Hyderabad',
      state: 'Telangana',
      verificationStatus: 'PENDING',
    });

    // Helper to generate req/res mocks
    const mockRequest = (user, params = {}, body = {}, query = {}) => ({
      user: { id: user._id.toString(), role: user.role },
      params,
      body,
      query,
    });

    const mockResponse = () => {
      const res = {};
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.data = data;
        return res;
      };
      return res;
    };

    const next = (err) => {
      if (err) throw err;
    };

    // --- TEST 1: Scoped Stats ---
    console.log('  Testing scoped getStats...');
    const statsReq = mockRequest(adminUser);
    const statsRes = mockResponse();
    await getStats(statsReq, statsRes, next);

    if (statsRes.statusCode === 403) {
      throw new Error('Stats call should be allowed for scoped admin');
    }
    // There is 1 active request in Vijayawada and 1 pending org in Vijayawada
    console.log(`    Vijayawada stats: activeRequests=${statsRes.data.activeRequests}, pendingOrgs=${statsRes.data.pendingOrgs}`);
    if (statsRes.data.activeRequests < 1) {
      throw new Error(`Expected at least 1 active request in Vijayawada scope, got ${statsRes.data.activeRequests}`);
    }

    // --- TEST 2: In-Scope Read Action ---
    console.log('  Testing in-scope request details query...');
    const detailReqIn = mockRequest(adminUser, { requestId: requestVijayawada._id.toString() });
    const detailResIn = mockResponse();
    await getRequestByIdAdmin(detailReqIn, detailResIn, next);

    if (detailResIn.statusCode === 403) {
      throw new Error('Vijayawada request details should be accessible');
    }
    console.log('    ✅ Accessible inside scope.');

    // --- TEST 3: Out-of-Scope Read Action (Guardrail Block) ---
    console.log('  Testing out-of-scope request details query (should be blocked)...');
    const detailReqOut = mockRequest(adminUser, { requestId: requestHyderabad._id.toString() });
    const detailResOut = mockResponse();
    await getRequestByIdAdmin(detailReqOut, detailResOut, next);

    if (detailResOut.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for out-of-scope request view, got status: ${detailResOut.statusCode || 200}`);
    }
    console.log('    ✅ Blocked with 403 Forbidden.');

    // --- TEST 4: In-Scope Org Modification ---
    console.log('  Testing in-scope org verification...');
    const verifyReqIn = mockRequest(adminUser, { id: orgProfileIn._id.toString() });
    const verifyResIn = mockResponse();
    await verifyOrg(verifyReqIn, verifyResIn, next);

    if (verifyResIn.statusCode === 403) {
      throw new Error('In-scope org verification should be allowed');
    }
    console.log('    ✅ Org verified successfully.');

    // --- TEST 5: Out-of-Scope Org Modification (Guardrail Block) ---
    console.log('  Testing out-of-scope org verification (should be blocked)...');
    const verifyReqOut = mockRequest(adminUser, { id: orgProfileOut._id.toString() });
    const verifyResOut = mockResponse();
    await verifyOrg(verifyReqOut, verifyResOut, next);

    if (verifyResOut.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for out-of-scope verification, got status: ${verifyResOut.statusCode || 200}`);
    }
    console.log('    ✅ Blocked with 403 Forbidden.');

    // --- TEST 6: Out-of-Scope Flags Clear (Guardrail Block) ---
    console.log('  Testing out-of-scope flags clearance (should be blocked)...');
    const clearFlagsReq = mockRequest(adminUser, { requestId: requestHyderabad._id.toString() });
    const clearFlagsRes = mockResponse();
    await clearFlags(clearFlagsReq, clearFlagsRes, next);

    if (clearFlagsRes.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for out-of-scope flag clear, got status: ${clearFlagsRes.statusCode || 200}`);
    }
    console.log('    ✅ Blocked with 403 Forbidden.');

    // --- TEST 7: Update Moderation Scope ---
    console.log('  Testing updateModerationScope endpoint...');
    const updateReq = mockRequest(
      adminUser,
      {},
      {
        type: 'GEOSPATIAL',
        latitude: 16.5062,
        longitude: 80.6480,
        radiusKm: 15,
      }
    );
    const updateRes = mockResponse();
    await updateModerationScope(updateReq, updateRes, next);

    if (updateRes.data.moderationRadiusKm !== 15) {
      throw new Error(`Expected moderationRadiusKm to be 15, got: ${updateRes.data.moderationRadiusKm}`);
    }
    if (updateRes.data.moderationLocation.coordinates[1] !== 16.5062) {
      throw new Error(`Expected latitude 16.5062, got: ${updateRes.data.moderationLocation.coordinates[1]}`);
    }
    console.log('    ✅ Scope successfully updated to geospatial coordinates.');

    // Cleanup
    await User.deleteMany({ _id: { $in: [adminUser._id, requester._id, orgUserIn._id, orgUserOut._id] } });
    await BloodRequest.deleteMany({ _id: { $in: [requestVijayawada._id, requestHyderabad._id] } });
    await OrgProfile.deleteMany({ _id: { $in: [orgProfileIn._id, orgProfileOut._id] } });

    console.log('  ✅ Regional moderation scope guardrail integration tests passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Integration tests failed:', error);
    process.exit(1);
  }
}

run();
