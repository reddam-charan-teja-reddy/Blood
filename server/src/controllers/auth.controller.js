import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { DonorProfile } from '../models/DonorProfile.js';
import { OrgProfile } from '../models/OrgProfile.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { sendOTP, verifyOTP } from '../services/otp.service.js';

export const register = async (req, res, next) => {
  try {
    const { fullName, phone, email, role, password, bloodGroup, city, state, weightKg } = req.body;

    // Check duplicate phone
    const existingUserByPhone = await User.findOne({ phone });
    if (existingUserByPhone) {
      return res.status(409).json({ error: 'Duplicate entry — phone number already registered' });
    }

    // Check duplicate email if provided
    if (email && email.trim() !== '') {
      const existingUserByEmail = await User.findOne({ email });
      if (existingUserByEmail) {
        return res.status(409).json({ error: 'Duplicate entry — email already registered' });
      }
    }

    let passwordHash = null;
    if (password && password.trim() !== '') {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Create user
    const user = await User.create({
      fullName,
      phone,
      email: email || undefined,
      role,
      passwordHash,
      phoneVerified: false, // will require verification or verified via OTP
    });

    // Create corresponding profile
    if (role === 'INDIVIDUAL') {
      await DonorProfile.create({
        userId: user._id,
        bloodGroup,
        bloodGroupVerified: false, // Always starts unverified for MVP
        city,
        state,
        weightKg,
        available: false,
      });
    } else if (role === 'ORG') {
      await OrgProfile.create({
        userId: user._id,
        orgName: fullName,
        registrationNo: `REG-${Math.floor(100000 + Math.random() * 900000)}`, // Auto-generated for demo
        orgType: 'HOSPITAL', // default
        city,
        state,
        verificationStatus: 'PENDING',
      });
    }

    // Issue tokens
    const accessToken = signAccessToken({ userId: user._id, role: user.role });
    const refreshToken = signRefreshToken({ userId: user._id });

    // Set cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        phoneVerified: user.phoneVerified,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { phone, email, password } = req.body;

    let user;
    if (phone) {
      user = await User.findOne({ phone });
    } else if (email) {
      user = await User.findOne({ email });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.suspended) {
      return res.status(403).json({
        error: 'Account suspended',
        reason: user.suspendedReason || 'No reason specified',
      });
    }

    // For ADMIN and ORG, password is required
    if (user.role === 'ADMIN' || user.role === 'ORG') {
      if (!password) {
        return res.status(400).json({ error: 'Password required' });
      }
      const isMatch = await bcrypt.compare(password, user.passwordHash || '');
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    } else {
      // INDIVIDUAL can log in via password OR OTP. If password is provided, verify it.
      if (password) {
        const isMatch = await bcrypt.compare(password, user.passwordHash || '');
        if (!isMatch) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
      } else {
        // No password provided -> trigger OTP send
        sendOTP(user.phone, 'AUTH');
        return res.json({
          otpRequired: true,
          phone: user.phone,
          message: 'OTP sent to your phone number',
        });
      }
    }

    // Log in
    const accessToken = signAccessToken({ userId: user._id, role: user.role });
    const refreshToken = signRefreshToken({ userId: user._id });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        phoneVerified: user.phoneVerified,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const otpSend = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    // Check if user exists. If not, we still allow sending OTP for register verification in frontend.
    sendOTP(phone, 'AUTH');
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    next(error);
  }
};

export const otpVerify = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP are required' });
    }

    const verification = verifyOTP(phone, otp, 'AUTH');
    if (!verification.valid) {
      return res.status(400).json({ error: verification.reason || 'Invalid OTP' });
    }

    // Find or create user if logging in / verifying
    let user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ error: 'User not found. Please register first.' });
    }

    if (!user.phoneVerified) {
      user.phoneVerified = true;
      await user.save();
    }

    const accessToken = signAccessToken({ userId: user._id, role: user.role });
    const refreshToken = signRefreshToken({ userId: user._id });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        phoneVerified: user.phoneVerified,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token missing' });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    if (user.suspended) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    const accessToken = signAccessToken({ userId: user._id, role: user.role });
    const newRefreshToken = signRefreshToken({ userId: user._id });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        phoneVerified: user.phoneVerified,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let profile = null;
    if (user.role === 'INDIVIDUAL') {
      profile = await DonorProfile.findOne({ userId: user._id });
    } else if (user.role === 'ORG') {
      profile = await OrgProfile.findOne({ userId: user._id });
    }

    res.json({
      id: user._id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role,
      phoneVerified: user.phoneVerified,
      profile,
    });
  } catch (error) {
    next(error);
  }
};
