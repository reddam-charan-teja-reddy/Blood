import mongoose from 'mongoose';
import { config } from './src/config/env.js';
import { BloodRequest } from './src/models/BloodRequest.js';
import { User } from './src/models/User.js';
import { DonorProfile } from './src/models/DonorProfile.js';
import { OrgProfile } from './src/models/OrgProfile.js';
import { getAllRequests, getUsers, getFlaggedRequests } from './src/controllers/admin.controller.js';

console.log('🧪 Starting regional admin moderation scoping tests...');

async function run() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('  Connected to MongoDB.');

    // Cleanup previous test data
    const testPrefix = 'scoped-admin-test-';
    const oldUsers = await User.find({ email: new RegExp(`^${testPrefix}`) });
    const oldUserIds = oldUsers.map(u => u._id);
    await User.deleteMany({ _id: { $in: oldUserIds } });
    await BloodRequest.deleteMany({ hospitalName: new RegExp(`^${testPrefix}`) });
    await DonorProfile.deleteMany({ userId: { $in: oldUserIds } });
    await OrgProfile.deleteMany({ userId: { $in: oldUserIds } });

    // 1. Create scoped admin user (limited to Vijayawada)
    const adminUser = await User.create({
      fullName: 'Vijayawada Scoped Admin',
      phone: '+919999999101',
      email: `${testPrefix}admin@example.com`,
      role: 'ADMIN',
      phoneVerified: true,
      moderationCity: 'Vijayawada',
    });

    // 2. Create requester
    const requester = await User.create({
      fullName: 'Test Requester',
      phone: '+919999999102',
      email: `${testPrefix}requester@example.com`,
      role: 'INDIVIDUAL',
      phoneVerified: true,
    });

    // 3. Create Blood Requests in different cities
    const requestVijayawada = await BloodRequest.create({
      requesterId: requester._id,
      requesterType: 'INDIVIDUAL',
      bloodGroup: 'O+',
      component: 'WHOLE_BLOOD',
      unitsNeeded: 2,
      urgency: 'NORMAL',
      requiredBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      hospitalName: `${testPrefix}Hospital Vijayawada`,
      hospitalCity: 'Vijayawada',
      hospitalState: 'Andhra Pradesh',
    });

    const requestHyderabad = await BloodRequest.create({
      requesterId: requester._id,
      requesterType: 'INDIVIDUAL',
      bloodGroup: 'O+',
      component: 'WHOLE_BLOOD',
      unitsNeeded: 2,
      urgency: 'NORMAL',
      requiredBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      hospitalName: `${testPrefix}Hospital Hyderabad`,
      hospitalCity: 'Hyderabad',
      hospitalState: 'Telangana',
    });

    // 4. Test getAllRequests for scoped admin
    console.log('  Testing getAllRequests moderation scoping...');
    const req = {
      query: { page: '1', limit: '10' },
      user: { id: adminUser._id.toString(), role: 'ADMIN' },
    };

    let responseData = null;
    const res = {
      json(data) {
        responseData = data;
      }
    };

    const next = (err) => {
      if (err) throw err;
    };

    await getAllRequests(req, res, next);

    if (!responseData || !responseData.requests) {
      throw new Error('getAllRequests did not return data');
    }

    const requests = responseData.requests.filter(r => r.hospitalName.startsWith(testPrefix));
    console.log(`  Filtered requests count: ${requests.length}`);
    if (requests.length !== 1) {
      throw new Error(`Expected exactly 1 request matching the scope, got: ${requests.length}`);
    }
    if (requests[0].hospitalCity !== 'Vijayawada') {
      throw new Error(`Expected request in Vijayawada, got city: ${requests[0].hospitalCity}`);
    }
    console.log('  ✅ getAllRequests scoping verified.');

    // 5. Test getUsers moderation scoping
    console.log('  Testing getUsers moderation scoping...');
    // Create a donor in Vijayawada and another in Hyderabad
    const donorVijayawada = await User.create({
      fullName: 'Donor Vijayawada',
      phone: '+919999999103',
      email: `${testPrefix}donor-vij@example.com`,
      role: 'INDIVIDUAL',
      phoneVerified: true,
    });
    await DonorProfile.create({
      userId: donorVijayawada._id,
      bloodGroup: 'O+',
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      bloodGroupVerified: true,
    });

    const donorHyderabad = await User.create({
      fullName: 'Donor Hyderabad',
      phone: '+919999999104',
      email: `${testPrefix}donor-hyd@example.com`,
      role: 'INDIVIDUAL',
      phoneVerified: true,
    });
    await DonorProfile.create({
      userId: donorHyderabad._id,
      bloodGroup: 'O+',
      city: 'Hyderabad',
      state: 'Telangana',
      bloodGroupVerified: true,
    });

    const usersReq = {
      query: { role: 'INDIVIDUAL' },
      user: { id: adminUser._id.toString(), role: 'ADMIN' },
    };

    let usersResponse = null;
    const usersRes = {
      json(data) {
        usersResponse = data;
      }
    };

    await getUsers(usersReq, usersRes, next);

    const testUsers = usersResponse.filter(u => u.email && u.email.startsWith(testPrefix) && u.role === 'INDIVIDUAL' && u._id.toString() !== requester._id.toString());
    console.log(`  Filtered users count: ${testUsers.length}`);
    if (testUsers.length !== 1) {
      throw new Error(`Expected exactly 1 user in the scope, got: ${testUsers.length}`);
    }
    if (testUsers[0].fullName !== 'Donor Vijayawada') {
      throw new Error(`Expected 'Donor Vijayawada', got: ${testUsers[0].fullName}`);
    }
    console.log('  ✅ getUsers scoping verified.');

    // Cleanup
    await User.deleteMany({ _id: { $in: [adminUser._id, requester._id, donorVijayawada._id, donorHyderabad._id] } });
    await BloodRequest.deleteMany({ _id: { $in: [requestVijayawada._id, requestHyderabad._id] } });
    await DonorProfile.deleteMany({ userId: { $in: [donorVijayawada._id, donorHyderabad._id] } });

    console.log('  ✅ Regional moderation scope integration tests passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Regional scoping test failed:', error);
    process.exit(1);
  }
}

run();
