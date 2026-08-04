import mongoose from 'mongoose';
import { config } from './src/config/env.js';
import { User } from './src/models/User.js';
import { DonorProfile } from './src/models/DonorProfile.js';
import { BloodRequest } from './src/models/BloodRequest.js';
import { DonorInterest } from './src/models/DonorInterest.js';
import { reserveRequest } from './src/controllers/request.controller.js';

console.log('🧪 Starting Concurrency Slot Locking & Race Condition tests...');

async function run() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('  Connected to MongoDB.');

    await User.deleteMany({ email: /test-concurrency/ });
    await BloodRequest.deleteMany({ hospitalName: 'Concurrency Test Hospital' });

    // 1. Create Requester and Two Donors
    const requester = await User.create({
      fullName: 'Concurrency Requester',
      phone: '+919999999970',
      email: 'test-concurrency-req@example.com',
      role: 'INDIVIDUAL',
      phoneVerified: true,
    });

    const donorA = await User.create({
      fullName: 'Donor Alpha',
      phone: '+919999999971',
      email: 'test-concurrency-d1@example.com',
      role: 'INDIVIDUAL',
      phoneVerified: true,
    });

    await DonorProfile.create({
      userId: donorA._id,
      bloodGroup: 'O+',
      bloodGroupVerified: true,
      city: 'Hyderabad',
      state: 'Telangana',
      available: true,
    });

    const donorB = await User.create({
      fullName: 'Donor Beta',
      phone: '+919999999972',
      email: 'test-concurrency-d2@example.com',
      role: 'INDIVIDUAL',
      phoneVerified: true,
    });

    await DonorProfile.create({
      userId: donorB._id,
      bloodGroup: 'O+',
      bloodGroupVerified: true,
      city: 'Hyderabad',
      state: 'Telangana',
      available: true,
    });

    // 2. Create BloodRequest with only 1 unit needed
    const request = await BloodRequest.create({
      requesterId: requester._id,
      requesterType: 'INDIVIDUAL',
      bloodGroup: 'O+',
      component: 'WHOLE_BLOOD',
      unitsNeeded: 1,
      urgency: 'EMERGENCY',
      requiredBy: new Date(Date.now() + 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      hospitalName: 'Concurrency Test Hospital',
      hospitalCity: 'Hyderabad',
      hospitalState: 'Telangana',
      status: 'ACTIVE',
    });

    // 3. Fire simultaneous reservation attempts for the single remaining unit
    console.log('  Simulating concurrent reservation attempts by Donor A and Donor B...');

    const makeReserveCall = async (user) => {
      let code = 200;
      let body = null;
      const mockReq = {
        params: { id: request._id.toString() },
        body: {},
        user: { id: user._id.toString(), role: 'INDIVIDUAL' },
      };
      const mockRes = {
        status(c) { code = c; return this; },
        json(d) { body = d; return this; }
      };
      const mockNext = (err) => { throw err; };

      await reserveRequest(mockReq, mockRes, mockNext);
      return { code, body };
    };

    const results = await Promise.all([
      makeReserveCall(donorA),
      makeReserveCall(donorB),
    ]);

    const successes = results.filter(r => r.code === 200 || r.code === 201);
    const rejections = results.filter(r => r.code === 403 || r.code === 409);

    console.log(`  Results: ${successes.length} approved, ${rejections.length} rejected.`);

    // 4. Assert that only 1 reservation was created
    const totalInterests = await DonorInterest.countDocuments({
      requestId: request._id,
      status: 'RESERVED',
    });

    if (totalInterests !== 1) {
      throw new Error(`Race condition occurred! Expected exactly 1 reserved interest, got: ${totalInterests}`);
    }

    if (successes.length !== 1 || rejections.length !== 1) {
      throw new Error(`Expected 1 success and 1 rejection, got successes=${successes.length}, rejections=${rejections.length}`);
    }

    console.log('  ✅ Concurrency lock strictly prevented double-reservation of the last unit.');

    // Cleanup
    await User.deleteMany({ _id: { $in: [requester._id, donorA._id, donorB._id] } });
    await DonorProfile.deleteMany({ userId: { $in: [donorA._id, donorB._id] } });
    await BloodRequest.deleteMany({ _id: request._id });
    await DonorInterest.deleteMany({ requestId: request._id });

    console.log('\n========================================');
    console.log('🎉 Concurrency slot locking tests PASSED!');
    console.log('========================================\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Concurrency lock test failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
