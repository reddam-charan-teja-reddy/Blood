import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/User.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthenticated', hint: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, config.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Unauthenticated', hint: 'Token has expired' });
      }
      return res.status(401).json({ error: 'Unauthenticated', hint: 'Invalid token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthenticated', hint: 'User no longer exists' });
    }

    if (user.suspended) {
      return res.status(403).json({
        error: 'Account suspended',
        reason: user.suspendedReason || 'No reason specified',
      });
    }

    req.user = {
      id: user.id,
      role: user.role,
      phone: user.phone,
    };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (user && !user.suspended) {
          req.user = {
            id: user.id,
            role: user.role,
            phone: user.phone,
          };
        }
      } catch (err) {
        // Ignore token errors for optional authentication
      }
    }
    next();
  } catch (error) {
    next();
  }
};
