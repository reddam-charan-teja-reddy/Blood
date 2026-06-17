const otpStore = new Map(); // Map<key, { otp, expiresAt }>

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function sendOTP(identifier, purpose = 'AUTH') {
  const otp = generateOTP();
  const key = `${purpose}:${identifier}`;
  const ttl = purpose === 'CONTACT_REVEAL' ? 15 * 60 * 1000 : 10 * 60 * 1000; // 15 mins for contact reveal, 10 for auth
  
  otpStore.set(key, {
    otp,
    expiresAt: Date.now() + ttl,
  });

  console.log(`\n========================================`);
  console.log(`[MOCK OTP SERVICE]`);
  console.log(`Purpose: ${purpose}`);
  console.log(`Target: ${identifier}`);
  console.log(`OTP Code: ${otp}`);
  console.log(`Expires in: ${ttl / 1000 / 60} minutes`);
  console.log(`========================================\n`);

  return { sent: true, otp }; // Return OTP for testing/seeding convenience if needed, but primarily logs to console
}

export function verifyOTP(identifier, inputOtp, purpose = 'AUTH') {
  const key = `${purpose}:${identifier}`;
  const record = otpStore.get(key);

  if (!record) {
    return { valid: false, reason: 'OTP_NOT_FOUND' };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return { valid: false, reason: 'OTP_EXPIRED' };
  }

  if (record.otp !== inputOtp) {
    return { valid: false, reason: 'OTP_INVALID' };
  }

  otpStore.delete(key); // One-time use
  return { valid: true };
}
