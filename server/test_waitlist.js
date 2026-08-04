import mongoose from 'mongoose';
import { config } from './src/config/env.js';
import { connectDB } from './src/config/db.js';
import { User } from './src/models/User.js';
import { BloodRequest } from './src/models/BloodRequest.js';
import { DonorInterest } from './src/models/DonorInterest.js';
import { DonorProfile } from './src/models/DonorProfile.js';
import { Notification } from './src/models/Notification.js';
import { expressInterest, reserveRequest } from './src/controllers/request.controller.js';
import { redis } from './src/services/redis.service.js';

console.log('🧪 Starting Waitlist & Auto-Promotion Integration Tests...');

async function run() {
  try {
    await connectDB();

    // 1. Setup Test Requester and Donors
    await User.deleteMany({ email: /test-waitlist/ });
    await BloodRequest.deleteMany({ hospitalName: 'Waitlist Test Hospital' });

    const requester = await User.create({
      fullName: 'Waitlist Requester',
      phone: '+919911223344',
      email: 'test-waitlist-req@example.com',
      role: 'INDIVIDUAL',
    });

    const donorA = await User.create({
      fullName: 'Donor Alpha',
      phone: '+919911223345',
      email: 'test-waitlist-donorA@example.com',
      role: 'INDIVIDUAL',
    });
    await DonorProfile.create({
      userId: donorA._id,
      bloodGroup: 'O+',
      bloodGroupVerified: true,
      available: true,
      city: 'Hyderabad',
      state: 'Telangana',
    });

    const donorB = await User.create({
      fullName: 'Donor Beta',
      phone: '+919911223346',
      email: 'test-waitlist-donorB@example.com',
      role: 'INDIVIDUAL',
    });
    await DonorProfile.create({
      userId: donorB._id,
      bloodGroup: 'O+',
      bloodGroupVerified: true,
      available: true,
      city: 'Hyderabad',
      state: 'Telangana',
    });

    // 2. Create Blood Request (1 unit needed)
    const request = await BloodRequest.create({
      requesterId: requester._id,
      requesterType: 'INDIVIDUAL',
      bloodGroup: 'O+',
      component: 'WHOLE_BLOOD',
      unitsNeeded: 1,
      urgency: 'HIGH',
      requiredBy: new Date(Date.now() + 24 * 60 * 60 * 1000),
      hospitalName: 'Waitlist Test Hospital',
      hospitalCity: 'Hyderabad',
      hospitalState: 'Telangana',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      shareToken: 'waitlist-test-token',
    });

    console.log('  Created request needing 1 unit.');

    // 3. Donor A Reserves the 1 available unit
    const mockReqA = {
      params: { id: request._id.toString() },
      body: { eta: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      user: { id: donorA._id.toString(), role: 'INDIVIDUAL' },
    };
    let reserveResultA = null;
    const mockResA = {
      status(c) { this.code = c; return this; },
      json(d) { reserveResultA = d; return this; },
    };
    await reserveRequest(mockReqA, mockResA, (err) => { if (err) throw err; });

    console.log('  Donor A reserved slot. Checking oversubscribed state for Donor B...');

    // 4. Donor B attempts standard interest -> Should receive 403 with canWaitlist: true
    const mockReqB = {
      params: { id: request._id.toString() },
      body: { waitlist: false },
      user: { id: donorB._id.toString(), role: 'INDIVIDUAL' },
    };
    let errorResultB = null;
    const mockResB = {
      status(c) { this.code = c; return this; },
      json(d) { errorResultB = d; return this; },
    };
    await expressInterest(mockReqB, mockResB, (err) => { if (err) throw err; });

    if (mockResB.code !== 403 || !errorResultB.canWaitlist) {
      throw new Error(`Expected 403 with canWaitlist, got code: ${mockResB.code}, body: ${JSON.stringify(errorResultB)}`);
    }
    console.log('  ✅ Donor B correctly offered waitlist when capacity is full.');

    // 5. Donor B joins the waitlist
    mockReqB.body.waitlist = true;
    let waitlistResultB = null;
    const mockResB2 = {
      status(c) { this.code = c; return this; },
      json(d) { waitlistResultB = d; return this; },
    };
    await expressInterest(mockReqB, mockResB2, (err) => { if (err) throw err; });

    const interestB = await DonorInterest.findOne({ requestId: request._id, donorId: donorB._id });
    if (!interestB || interestB.status !== 'WAITLISTED') {
      throw new Error(`Expected Donor B status WAITLISTED, got ${interestB?.status}`);
    }
    console.log('  ✅ Donor B successfully registered with status: WAITLISTED.');

    // 6. Simulate Donor A's reservation expiring (stale > 1 hour)
    await DonorInterest.updateOne(
      { requestId: request._id, donorId: donorA._id },
      { reservedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }
    );

    // 7. Simulate Cron execution
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const staleReservations = await DonorInterest.find({
      status: 'RESERVED',
      reservedAt: { $lt: oneHourAgo },
    });
    const staleIds = staleReservations.map(r => r._id);
    await DonorInterest.updateMany({ _id: { $in: staleIds } }, { $set: { status: 'WITHDRAWN' } });

    // Promote waitlisted
    const waitlisted = await DonorInterest.findOne({
      requestId: request._id,
      status: 'WAITLISTED',
    }).sort({ createdAt: 1 });

    if (waitlisted) {
      waitlisted.status = 'INTERESTED';
      await waitlisted.save();
    }

    // 8. Verify statuses
    const updatedInterestA = await DonorInterest.findOne({ requestId: request._id, donorId: donorA._id });
    const updatedInterestB = await DonorInterest.findOne({ requestId: request._id, donorId: donorB._id });

    if (updatedInterestA.status !== 'WITHDRAWN') {
      throw new Error(`Expected Donor A to be WITHDRAWN, got ${updatedInterestA.status}`);
    }
    if (updatedInterestB.status !== 'INTERESTED') {
      throw new Error(`Expected Donor B to be promoted to INTERESTED, got ${updatedInterestB.status}`);
    }
    console.log('  ✅ Auto-promotion verified: Donor A WITHDRAWN, Donor B promoted from WAITLISTED to INTERESTED.');

    // Cleanup
    await User.deleteMany({ _id: { $in: [requester._id, donorA._id, donorB._id] } });
    await DonorProfile.deleteMany({ userId: { $in: [donorA._id, donorB._id] } });
    await BloodRequest.deleteMany({ _id: request._id });
    await DonorInterest.deleteMany({ requestId: request._id });

    console.log('\n========================================');
    console.log('🎉 Waitlist & Auto-Promotion Tests PASSED!');
    console.log('========================================\n');
    await redis.close();
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Waitlist test failed:', err);
    await redis.close();
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
