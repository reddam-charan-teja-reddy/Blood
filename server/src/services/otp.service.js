import twilio from 'twilio';
import { config } from '../config/env.js';
import { redis } from './redis.service.js';

let twilioClient = null;
if (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOTP(identifier, purpose = 'AUTH') {
  const otp = generateOTP();
  const key = `otp:${purpose}:${identifier}`;
  const ttlSeconds = purpose === 'CONTACT_REVEAL' ? 15 * 60 : 10 * 60;

  await redis.set(
    key,
    JSON.stringify({
      otp,
      attempts: 0,
      createdAt: Date.now(),
    }),
    ttlSeconds
  );

  console.log(`\n========================================`);
  console.log(`[OTP SERVICE]`);
  console.log(`Purpose: ${purpose}`);
  console.log(`Target: ${identifier}`);
  console.log(`OTP Code: ${otp}`);
  console.log(`Expires in: ${ttlSeconds / 60} minutes`);
  console.log(`========================================\n`);

  if (twilioClient && config.TWILIO_PHONE_NUMBER) {
    const messageBody = purpose === 'CONTACT_REVEAL'
      ? `🩸 Blood Network: Enter OTP ${otp} to verify and reveal contact details. Exp in 15 mins.`
      : `🩸 Blood Network: Your login OTP is ${otp}. Exp in 10 mins.`;

    twilioClient.messages
      .create({
        body: messageBody,
        from: config.TWILIO_PHONE_NUMBER,
        to: identifier,
      })
      .then((message) => console.log(`[Twilio SMS Sent] SID: ${message.sid}`))
      .catch((err) => console.error(`[Twilio SMS Error]`, err));
  }

  return { sent: true, otp };
}

export async function verifyOTP(identifier, inputOtp, purpose = 'AUTH') {
  if (config.BYPASS_OTP === true && inputOtp === '123456') {
    return { valid: true };
  }

  const key = `otp:${purpose}:${identifier}`;
  const raw = await redis.get(key);

  if (!raw) {
    return { valid: false, reason: 'OTP_NOT_FOUND' };
  }

  let record;
  try {
    record = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    record = { otp: raw, attempts: 0 };
  }

  // Brute-force protection: max 5 attempts per OTP
  if (record.attempts >= 5) {
    await redis.del(key);
    return { valid: false, reason: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect attempts. Please request a new OTP.' };
  }

  if (record.otp !== inputOtp) {
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts >= 5) {
      await redis.del(key);
      return { valid: false, reason: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect attempts. Please request a new OTP.' };
    }
    await redis.set(key, JSON.stringify(record), 600);
    return { valid: false, reason: 'OTP_INVALID', attemptsRemaining: 5 - record.attempts };
  }

  // Success - single use
  await redis.del(key);
  return { valid: true };
}
