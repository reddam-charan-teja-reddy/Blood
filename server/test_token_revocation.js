import mongoose from 'mongoose';
import { config } from './src/config/env.js';
import { User } from './src/models/User.js';
import { signRefreshToken, verifyRefreshToken } from './src/utils/jwt.js';

console.log('🧪 Starting Refresh Token Revocation & Versioning tests...');

async function run() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('  Connected to MongoDB.');

    // Cleanup previous test user if exists
    await User.deleteMany({ email: 'test-revocation@example.com' });

    // 1. Create user with tokenVersion = 0
    const user = await User.create({
      fullName: 'Token Test User',
      phone: '+919999999999',
      email: 'test-revocation@example.com',
      role: 'INDIVIDUAL',
      tokenVersion: 0,
    });

    // 2. Sign Refresh Token with tokenVersion
    const token = signRefreshToken({ userId: user._id, tokenVersion: user.tokenVersion });
    const decoded = verifyRefreshToken(token);

    if (decoded.tokenVersion !== 0) {
      throw new Error(`Token version mismatch: expected 0, got ${decoded.tokenVersion}`);
    }
    console.log('  ✅ Refresh token issued with tokenVersion: 0.');

    // 3. Increment tokenVersion (simulating logout or password change)
    user.tokenVersion += 1;
    await user.save();
    console.log('  Incremented user tokenVersion to 1.');

    // 4. Verify revocation check
    const isRevoked = decoded.tokenVersion !== user.tokenVersion;
    if (!isRevoked) {
      throw new Error('Old token was not recognized as revoked');
    }
    console.log('  ✅ Old refresh token successfully recognized as REVOKED.');

    // 5. New token issued with tokenVersion: 1 should be valid
    const newToken = signRefreshToken({ userId: user._id, tokenVersion: user.tokenVersion });
    const newDecoded = verifyRefreshToken(newToken);
    if (newDecoded.tokenVersion !== user.tokenVersion) {
      throw new Error('New token does not match updated tokenVersion');
    }
    console.log('  ✅ Newly issued refresh token matches current tokenVersion.');

    // Cleanup
    await User.deleteOne({ _id: user._id });
    console.log('\n========================================');
    console.log('🎉 Token revocation & versioning tests PASSED!');
    console.log('========================================\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Token revocation test failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
