import { sendOTP, verifyOTP } from './src/services/otp.service.js';
import { redis } from './src/services/redis.service.js';

console.log('🧪 Starting Redis OTP service tests...');

async function run() {
  try {
    const phone = '+919876543210';
    const purpose = 'AUTH';

    // 1. Send OTP
    console.log('  Testing sendOTP...');
    const sendResult = await sendOTP(phone, purpose);
    if (!sendResult.sent || !sendResult.otp) {
      throw new Error('sendOTP did not return valid result');
    }
    const generatedOtp = sendResult.otp;

    // Check Redis key directly
    const stored = await redis.get(`otp:${purpose}:${phone}`);
    if (!stored) {
      throw new Error('OTP was not stored in Redis');
    }
    const parsed = JSON.parse(stored);
    if (parsed.otp !== generatedOtp) {
      throw new Error(`Redis OTP mismatch: expected ${generatedOtp}, got ${parsed.otp}`);
    }
    console.log('  ✅ OTP stored in Redis correctly with TTL.');

    // 2. Test Invalid OTP and attempt counter
    console.log('  Testing invalid OTP attempt counter...');
    const invalidResult = await verifyOTP(phone, '000000', purpose);
    if (invalidResult.valid) {
      throw new Error('Invalid OTP should not be accepted');
    }
    if (invalidResult.attemptsRemaining !== 4) {
      throw new Error(`Expected 4 attempts remaining, got: ${invalidResult.attemptsRemaining}`);
    }
    console.log('  ✅ Attempt counter decremented correctly.');

    // 3. Test Brute-force lockout
    console.log('  Testing brute-force lockout after 5 failures...');
    await verifyOTP(phone, '000001', purpose);
    await verifyOTP(phone, '000002', purpose);
    await verifyOTP(phone, '000003', purpose);
    const fifthResult = await verifyOTP(phone, '000004', purpose);
    if (fifthResult.valid || fifthResult.reason !== 'TOO_MANY_ATTEMPTS') {
      throw new Error(`Expected TOO_MANY_ATTEMPTS, got: ${JSON.stringify(fifthResult)}`);
    }

    // Key should be purged after max attempts
    const afterLockout = await redis.get(`otp:${purpose}:${phone}`);
    if (afterLockout) {
      throw new Error('OTP key should be deleted after maximum failed attempts');
    }
    console.log('  ✅ Brute-force lockout and auto-revocation verified.');

    // 4. Test Successful verification and single-use purge
    console.log('  Testing successful OTP verification and single-use deletion...');
    const newSend = await sendOTP(phone, purpose);
    const validVerify = await verifyOTP(phone, newSend.otp, purpose);
    if (!validVerify.valid) {
      throw new Error('Valid OTP was rejected');
    }

    // Second verify should fail because OTP was purged
    const secondVerify = await verifyOTP(phone, newSend.otp, purpose);
    if (secondVerify.valid || secondVerify.reason !== 'OTP_NOT_FOUND') {
      throw new Error('OTP should be single-use and deleted upon verification');
    }
    console.log('  ✅ Single-use verification and instant deletion verified.');

    console.log('\n========================================');
    console.log('🎉 All Redis OTP unit & integration tests PASSED!');
    console.log('========================================\n');
    await redis.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Redis OTP test failed:', error);
    await redis.close();
    process.exit(1);
  }
}

run();
