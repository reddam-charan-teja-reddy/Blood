import { User } from '../models/User.js';
import { DonorProfile } from '../models/DonorProfile.js';
import { OrgProfile } from '../models/OrgProfile.js';
import { BloodRequest } from '../models/BloodRequest.js';

export const getStats = async (req, res, next) => {
  try {
    const activeRequests = await BloodRequest.countDocuments({
      status: 'ACTIVE',
      expiresAt: { $gt: new Date() },
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const fulfilledToday = await BloodRequest.countDocuments({
      status: 'FULFILLED',
      fulfilledAt: { $gte: startOfToday },
    });

    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: startOfToday },
    });

    const openReports = await BloodRequest.countDocuments({
      isFlagged: true,
    });

    const pendingOrgs = await OrgProfile.countDocuments({
      verificationStatus: 'PENDING',
    });

    res.json({
      activeRequests,
      fulfilledToday,
      newUsersToday,
      openReports,
      pendingOrgs,
    });
  } catch (error) {
    next(error);
  }
};

export const getStatsHistory = async (req, res, next) => {
  try {
    // Generate simple aggregation or mock daily stats for the last 30 days
    const mockRequestHistory = [
      { name: 'O+', requests: 12 },
      { name: 'O-', requests: 5 },
      { name: 'A+', requests: 8 },
      { name: 'A-', requests: 2 },
      { name: 'B+', requests: 9 },
      { name: 'B-', requests: 1 },
      { name: 'AB+', requests: 4 },
      { name: 'AB-', requests: 1 },
    ];

    const mockFulfillmentRate = Array.from({ length: 30 }).map((_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return {
        date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        rate: Math.floor(60 + Math.random() * 30), // 60% to 90%
      };
    });

    res.json({
      bloodGroupRequests: mockRequestHistory,
      fulfillmentRate: mockFulfillmentRate,
    });
  } catch (error) {
    next(error);
  }
};

export const getPendingOrgs = async (req, res, next) => {
  try {
    const pendingOrgs = await OrgProfile.find({ verificationStatus: 'PENDING' })
      .populate('userId', 'fullName phone email')
      .lean();
    res.json(pendingOrgs);
  } catch (error) {
    next(error);
  }
};

export const verifyOrg = async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgProfile = await OrgProfile.findById(id);
    if (!orgProfile) {
      return res.status(404).json({ error: 'Org profile not found' });
    }

    orgProfile.verificationStatus = 'VERIFIED';
    orgProfile.verifiedAt = new Date();
    await orgProfile.save();

    res.json({ success: true, message: 'Organization verified successfully' });
  } catch (error) {
    next(error);
  }
};

export const rejectOrg = async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgProfile = await OrgProfile.findById(id);
    if (!orgProfile) {
      return res.status(404).json({ error: 'Org profile not found' });
    }

    orgProfile.verificationStatus = 'REJECTED';
    await orgProfile.save();

    res.json({ success: true, message: 'Organization verification rejected' });
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (req, res, next) => {
  try {
    const { search, role, status } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    if (role) {
      filter.role = role;
    }
    if (status) {
      if (status === 'suspended') filter.suspended = true;
      if (status === 'active') filter.suspended = false;
    }

    const users = await User.find(filter).lean();
    res.json(users);
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let profile = null;
    if (user.role === 'INDIVIDUAL') {
      profile = await DonorProfile.findOne({ userId: id }).lean();
    } else if (user.role === 'ORG') {
      profile = await OrgProfile.findOne({ userId: id }).lean();
    }

    res.json({ user, profile });
  } catch (error) {
    next(error);
  }
};

export const suspendUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'ADMIN') {
      return res.status(400).json({ error: 'Cannot suspend admin accounts' });
    }

    user.suspended = true;
    user.suspendedReason = reason || 'Violation of terms';
    await user.save();

    res.json({ success: true, message: 'User suspended successfully' });
  } catch (error) {
    next(error);
  }
};

export const unsuspendUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.suspended = false;
    user.suspendedReason = null;
    await user.save();

    res.json({ success: true, message: 'User unsuspended successfully' });
  } catch (error) {
    next(error);
  }
};

export const clearNoShows = async (req, res, next) => {
  try {
    const { id } = req.params; // User ID
    const profile = await DonorProfile.findOne({ userId: id });
    if (!profile) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    profile.noShowCount = 0;
    await profile.save();

    res.json({ success: true, message: 'No-show count cleared successfully' });
  } catch (error) {
    next(error);
  }
};

export const getPendingProofs = async (req, res, next) => {
  try {
    const pendingProofs = await DonorProfile.find({
      bloodGroup: { $exists: true, $ne: null },
      bloodGroupVerified: false,
    }).populate('userId', 'fullName phone').lean();

    res.json(pendingProofs);
  } catch (error) {
    next(error);
  }
};

export const approveProof = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const profile = await DonorProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    profile.bloodGroupVerified = true;
    await profile.save();

    res.json({ success: true, message: 'Blood group proof approved' });
  } catch (error) {
    next(error);
  }
};

export const rejectProof = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const profile = await DonorProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    profile.bloodGroupVerified = false;
    profile.bloodGroup = undefined; // reset blood group
    await profile.save();

    res.json({ success: true, message: 'Blood group proof rejected' });
  } catch (error) {
    next(error);
  }
};

export const getFlaggedRequests = async (req, res, next) => {
  try {
    const flaggedRequests = await BloodRequest.find({
      $or: [{ flagCount: { $gt: 0 } }, { isFlagged: true }],
    })
      .sort({ flagCount: -1 })
      .populate('requesterId', 'fullName phone')
      .lean();

    res.json(flaggedRequests);
  } catch (error) {
    next(error);
  }
};

export const clearFlags = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const request = await BloodRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    request.flagCount = 0;
    request.isFlagged = false;
    await request.save();

    res.json({ success: true, message: 'Flags cleared successfully' });
  } catch (error) {
    next(error);
  }
};

export const cancelFlaggedRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const request = await BloodRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    request.status = 'CANCELLED';
    await request.save();

    res.json({ success: true, message: 'Request force-cancelled by admin' });
  } catch (error) {
    next(error);
  }
};
