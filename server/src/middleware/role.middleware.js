import { DonorProfile } from '../models/DonorProfile.js';
import { BloodRequest } from '../models/BloodRequest.js';

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

export const requireDonorActivated = async (req, res, next) => {
  try {
    const profile = await DonorProfile.findOne({ userId: req.user.id });
    if (!profile || !profile.bloodGroupVerified) {
      return res.status(403).json({
        error: 'Donor profile not set up',
        hint: 'Verify your blood group to activate donor capabilities',
      });
    }
    next();
  } catch (error) {
    console.error('requireDonorActivated middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const requireNotOwnRequest = async (req, res, next) => {
  try {
    const request = await BloodRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.requesterId.toString() === req.user.id) {
      return res.status(403).json({ error: 'Cannot express interest in your own request' });
    }
    next();
  } catch (error) {
    console.error('requireNotOwnRequest middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
