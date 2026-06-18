import mongoose from 'mongoose';
import { config } from './src/config/env.js';
import { BloodRequest } from './src/models/BloodRequest.js';
import { DonorInterest } from './src/models/DonorInterest.js';
import { OrgProfile } from './src/models/OrgProfile.js';
import { InventoryLog } from './src/models/InventoryLog.js';
import { User } from './src/models/User.js';
import { reportOutcome } from './src/controllers/request.controller.js';

console.log('🧪 Starting integration tests for admin resolution & org inventory decrement...');

async function run() {
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('  Connected to MongoDB.');

    // 2. Clear test data if any
    const testEmailPrefix = 'test-workflow-';
    // Find users with test email pattern and remove them
    const testUsers = await User.find({ email: new RegExp(`^${testEmailPrefix}`) });
    const testUserIds = testUsers.map(u => u._id);
    
    await User.deleteMany({ _id: { $in: testUserIds } });
    await BloodRequest.deleteMany({ requesterId: { $in: testUserIds } });
    await DonorInterest.deleteMany({ donorId: { $in: testUserIds } });
    await OrgProfile.deleteMany({ userId: { $in: testUserIds } });
    
    // 3. Create test users: Requester (INDIVIDUAL), Donor (ORG), Admin (ADMIN)
    console.log('  Creating test users...');
    const requester = await User.create({
      fullName: 'Test Requester',
      phone: '+919999999901',
      email: `${testEmailPrefix}requester@example.com`,
      role: 'INDIVIDUAL',
      phoneVerified: true,
    });

    const donorOrg = await User.create({
      fullName: 'Test Org Donor',
      phone: '+919999999902',
      email: `${testEmailPrefix}org-donor@example.com`,
      role: 'ORG',
      phoneVerified: true,
    });

    const orgProfile = await OrgProfile.create({
      userId: donorOrg._id,
      orgName: 'Test Org Donor Hospital',
      registrationNo: '12345678',
      orgType: 'HOSPITAL',
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      verificationStatus: 'VERIFIED',
      inventory: {
        'A+': 5,
        'A-': 0,
        'B+': 0,
        'B-': 0,
        'AB+': 0,
        'AB-': 0,
        'O+': 0,
        'O-': 0,
      }
    });

    const admin = await User.create({
      fullName: 'Test Admin',
      phone: '+919999999903',
      email: `${testEmailPrefix}admin@example.com`,
      role: 'ADMIN',
      phoneVerified: true,
    });

    // 4. Create blood request for A+ Whole Blood
    console.log('  Creating blood request...');
    const request = await BloodRequest.create({
      requesterId: requester._id,
      requesterType: 'INDIVIDUAL',
      bloodGroup: 'A+',
      component: 'WHOLE_BLOOD',
      unitsNeeded: 1,
      urgency: 'HIGH',
      requiredBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      hospitalName: 'Apollo Hospital',
      hospitalCity: 'Vijayawada',
      hospitalState: 'Andhra Pradesh',
      status: 'ACTIVE',
    });

    // 5. Create DonorInterest coordination slot
    console.log('  Creating donor interest coordination slot...');
    const interest = await DonorInterest.create({
      requestId: request._id,
      donorId: donorOrg._id,
      status: 'CONTACT_REVEALED',
    });

    // 6. Test Admin Force-Resolution
    console.log('  Testing admin force-resolution...');
    // We mock req, res, next
    const req = {
      params: { interestId: interest._id.toString() },
      body: { outcome: 'DONATED', outcomeReason: '' },
      user: { id: admin._id.toString(), role: 'ADMIN' },
    };

    let responseData = null;
    const res = {
      status(code) {
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    const next = (err) => {
      if (err) throw err;
    };

    await reportOutcome(req, res, next);

    if (!responseData || !responseData.success) {
      throw new Error(`reportOutcome failed: ${JSON.stringify(responseData)}`);
    }

    // Reload documents from database to verify status updates
    const updatedInterest = await DonorInterest.findById(interest._id);
    const updatedRequest = await BloodRequest.findById(request._id);
    const updatedOrgProfile = await OrgProfile.findOne({ userId: donorOrg._id });
    const inventoryLogs = await InventoryLog.find({ orgId: orgProfile._id });

    // Assertions
    console.log('  Verifying outcomes...');
    if (updatedInterest.donorOutcome !== 'DONATED' || updatedInterest.requesterOutcome !== 'DONATED') {
      throw new Error('Admin force-resolution did not set both outcomes to DONATED');
    }
    if (updatedInterest.status !== 'DONATED') {
      throw new Error(`Interest status is not DONATED, got ${updatedInterest.status}`);
    }
    if (updatedRequest.unitsConfirmed !== 1 || updatedRequest.status !== 'FULFILLED') {
      throw new Error(`Request unitsConfirmed or status not updated correctly, got unitsConfirmed: ${updatedRequest.unitsConfirmed}, status: ${updatedRequest.status}`);
    }

    // Verify Org Inventory decrement
    console.log('  Verifying ORG inventory decrement...');
    if (updatedOrgProfile.inventory['A+'] !== 4) {
      throw new Error(`Org inventory for A+ should be 4, got: ${updatedOrgProfile.inventory['A+']}`);
    }

    // Verify InventoryLog
    console.log('  Verifying InventoryLog creation...');
    if (inventoryLogs.length !== 1) {
      throw new Error(`Expected exactly 1 inventory log, got: ${inventoryLogs.length}`);
    }
    const log = inventoryLogs[0];
    if (log.bloodGroup !== 'A+' || log.delta !== -1) {
      throw new Error(`InventoryLog mismatch: bloodGroup = ${log.bloodGroup}, delta = ${log.delta}`);
    }

    console.log('  ✅ Admin resolution & Org inventory auto-decrement integration tests passed successfully!');

    // Cleanup
    await User.deleteMany({ _id: { $in: [requester._id, donorOrg._id, admin._id] } });
    await BloodRequest.deleteMany({ _id: request._id });
    await DonorInterest.deleteMany({ _id: interest._id });
    await OrgProfile.deleteMany({ _id: orgProfile._id });
    await InventoryLog.deleteMany({ orgId: orgProfile._id });

    console.log('  Cleanup completed.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  }
}

run();
