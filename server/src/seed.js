import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, DonorProfile, BloodRequest, OrgProfile, DonorInterest } from './models/index.js';
import { config } from './config/env.js';

const subDays = (date, days) => new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
const addHours = (date, hours) => new Date(date.getTime() + hours * 60 * 60 * 1000);

async function seed() {
  console.log('🌱 Starting database seeding...');
  
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('📡 Connected to MongoDB for seeding');

    // Clean all collections
    await Promise.all([
      User.deleteMany(),
      DonorProfile.deleteMany(),
      BloodRequest.deleteMany(),
      OrgProfile.deleteMany(),
      DonorInterest.deleteMany(),
    ]);
    console.log('🧹 Cleaned existing database collections');

    const hash = (pw) => bcrypt.hashSync(pw, 10);

    // 1. Admin
    const admin = await User.create({
      fullName: 'Admin User',
      phone: '+919000000001',
      role: 'ADMIN',
      passwordHash: hash('Admin@1234'),
      phoneVerified: true,
    });
    console.log('👤 Created Admin user');

    // 2. Donor 1 — O+, eligible
    const d1 = await User.create({
      fullName: 'Ravi Kumar',
      phone: '+919000000002',
      role: 'INDIVIDUAL',
      passwordHash: hash('Test@1234'),
      phoneVerified: true,
    });
    await DonorProfile.create({
      userId: d1._id,
      bloodGroup: 'O+',
      bloodGroupVerified: true,
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      weightKg: 72,
      available: true,
      totalDonations: 5,
      lastWholeBloodDonation: subDays(new Date(), 62),
      location: { type: 'Point', coordinates: [80.6470, 16.5050] }, // [lng, lat]
    });
    console.log('👤 Created Donor 1 (Ravi Kumar - O+, Vijayawada)');

    // 3. Donor 2 — O−, eligible, high reputation
    const d2 = await User.create({
      fullName: 'Meena Rao',
      phone: '+919000000003',
      role: 'INDIVIDUAL',
      passwordHash: hash('Test@1234'),
      phoneVerified: true,
    });
    await DonorProfile.create({
      userId: d2._id,
      bloodGroup: 'O-',
      bloodGroupVerified: true,
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      weightKg: 55,
      available: true,
      totalDonations: 12,
      lastWholeBloodDonation: subDays(new Date(), 60),
      location: { type: 'Point', coordinates: [80.6490, 16.5070] },
    });
    console.log('👤 Created Donor 2 (Meena Rao - O-, Vijayawada)');

    // 4. Patient (individual, no blood group set initially)
    const patient = await User.create({
      fullName: 'Priya Sharma',
      phone: '+919000000004',
      role: 'INDIVIDUAL',
      passwordHash: hash('Test@1234'),
      phoneVerified: true,
    });
    await DonorProfile.create({
      userId: patient._id,
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      location: { type: 'Point', coordinates: [80.6460, 16.5040] },
    });
    console.log('👤 Created Patient (Priya Sharma - Individual, Vijayawada)');

    // 5. Org (verified hospital)
    const orgUser = await User.create({
      fullName: 'Apollo Hospital Admin',
      phone: '+919000000005',
      role: 'ORG',
      passwordHash: hash('Test@1234'),
      phoneVerified: true,
    });
    const orgProfile = await OrgProfile.create({
      userId: orgUser._id,
      orgName: 'Apollo Hospital Vijayawada',
      registrationNo: 'AP-HOSP-4521',
      orgType: 'HOSPITAL',
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      location: { type: 'Point', coordinates: [80.6480, 16.5062] },
      serviceRadiusKm: 50,
      inventory: {
        'A+': 8,
        'A-': 4,
        'B+': 6,
        'B-': 0,
        'AB+': 12,
        'AB-': 2,
        'O+': 8,
        'O-': 2,
      },
    });
    console.log('🏢 Created Org profile (Apollo Hospital, Vijayawada - Verified)');

    // 6. Sample requests
    await BloodRequest.create([
      {
        requesterId: patient._id,
        requesterType: 'INDIVIDUAL',
        bloodGroup: 'O+',
        component: 'WHOLE_BLOOD',
        unitsNeeded: 2,
        urgency: 'EMERGENCY',
        requiredBy: addHours(new Date(), 2),
        hospitalName: 'Apollo Hospital Vijayawada',
        hospitalCity: 'Vijayawada',
        hospitalState: 'Andhra Pradesh',
        hospitalLocation: { type: 'Point', coordinates: [80.6480, 16.5062] },
        expiresAt: addHours(new Date(), 4),
        shareToken: 'share-token-o-positive-emergency',
      },
      {
        requesterId: orgUser._id,
        requesterType: 'ORG',
        bloodGroup: 'AB-',
        component: 'WHOLE_BLOOD',
        unitsNeeded: 3,
        urgency: 'HIGH',
        requiredBy: addHours(new Date(), 6),
        hospitalName: 'Apollo Hospital Vijayawada',
        hospitalCity: 'Vijayawada',
        hospitalState: 'Andhra Pradesh',
        hospitalLocation: { type: 'Point', coordinates: [80.6480, 16.5062] },
        expiresAt: addHours(new Date(), 8),
        shareToken: 'share-token-ab-negative-high',
      },
      {
        requesterId: patient._id,
        requesterType: 'INDIVIDUAL',
        bloodGroup: 'B+',
        component: 'PLATELETS',
        unitsNeeded: 6,
        urgency: 'NORMAL',
        requiredBy: addHours(new Date(), 24),
        hospitalName: 'MNJ Cancer Hospital',
        hospitalCity: 'Hyderabad',
        hospitalState: 'Telangana',
        hospitalLocation: { type: 'Point', coordinates: [78.4867, 17.3850] },
        expiresAt: addHours(new Date(), 26),
        shareToken: 'share-token-b-positive-platelets',
      },
    ]);
    console.log('🩸 Created sample requests');

    console.log('\n========================================');
    console.log('✅ Seed Complete successfully!');
    console.log('========================================');
    console.log('Admin login:');
    console.log('  Phone:    +919000000001');
    console.log('  Password: Admin@1234');
    console.log('----------------------------------------');
    console.log('Donor 1 login (O+, Available):');
    console.log('  Phone:    +919000000002');
    console.log('  Password: Test@1234');
    console.log('----------------------------------------');
    console.log('Donor 2 login (O-, Available):');
    console.log('  Phone:    +919000000003');
    console.log('  Password: Test@1234');
    console.log('----------------------------------------');
    console.log('Patient login:');
    console.log('  Phone:    +919000000004');
    console.log('  Password: Test@1234');
    console.log('----------------------------------------');
    console.log('Org login (Verified):');
    console.log('  Phone:    +919000000005');
    console.log('  Password: Test@1234');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  }
}

seed();
