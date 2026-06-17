import { OrgProfile } from '../models/OrgProfile.js';
import { BloodRequest } from '../models/BloodRequest.js';
import { DonorInterest } from '../models/DonorInterest.js';

export const getDashboard = async (req, res, next) => {
  try {
    const orgProfile = await OrgProfile.findOne({ userId: req.user.id });
    if (!orgProfile) {
      return res.status(404).json({ error: 'Organization profile not found' });
    }

    if (orgProfile.verificationStatus !== 'VERIFIED') {
      return res.status(403).json({
        error: 'Org account pending verification',
        hint: 'Admin review is in progress',
      });
    }

    // Active requests count
    const activeRequests = await BloodRequest.countDocuments({
      requesterId: req.user.id,
      status: 'ACTIVE',
      expiresAt: { $gt: new Date() },
    });

    // Fulfilled today count
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const fulfilledToday = await BloodRequest.countDocuments({
      requesterId: req.user.id,
      status: 'FULFILLED',
      fulfilledAt: { $gte: startOfToday },
    });

    // Pending contact reveals on requests posted by this org
    const orgRequestIds = await BloodRequest.find({ requesterId: req.user.id }).distinct('_id');
    const pendingContacts = await DonorInterest.countDocuments({
      requestId: { $in: orgRequestIds },
      status: 'REVEAL_PENDING',
    });

    // Recent requests
    const recentRequests = await BloodRequest.find({ requesterId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Map interest counts for each request
    const recentRequestsWithInterestCount = await Promise.all(
      recentRequests.map(async (request) => {
        const donorCount = await DonorInterest.countDocuments({ requestId: request._id });
        return {
          ...request,
          donorCount,
        };
      })
    );

    res.json({
      activeRequests,
      fulfilledToday,
      pendingContacts,
      inventory: orgProfile.inventory,
      recentRequests: recentRequestsWithInterestCount,
    });
  } catch (error) {
    next(error);
  }
};

export const updateInventory = async (req, res, next) => {
  try {
    const orgProfile = await OrgProfile.findOne({ userId: req.user.id });
    if (!orgProfile) {
      return res.status(404).json({ error: 'Organization profile not found' });
    }

    if (orgProfile.verificationStatus !== 'VERIFIED') {
      return res.status(403).json({
        error: 'Org account pending verification',
        hint: 'Admin review is in progress',
      });
    }

    const { inventory } = req.body;
    if (!inventory) {
      return res.status(400).json({ error: 'Inventory details are required' });
    }

    // Update inventory map
    Object.keys(inventory).forEach((bloodGroup) => {
      if (orgProfile.inventory[bloodGroup] !== undefined) {
        const val = parseInt(inventory[bloodGroup], 10);
        if (!isNaN(val) && val >= 0) {
          orgProfile.inventory[bloodGroup] = val;
        }
      }
    });

    await orgProfile.save();
    res.json({ success: true, inventory: orgProfile.inventory });
  } catch (error) {
    next(error);
  }
};

export const getRequests = async (req, res, next) => {
  try {
    const orgProfile = await OrgProfile.findOne({ userId: req.user.id });
    if (!orgProfile) {
      return res.status(404).json({ error: 'Organization profile not found' });
    }

    if (orgProfile.verificationStatus !== 'VERIFIED') {
      return res.status(403).json({
        error: 'Org account pending verification',
        hint: 'Admin review is in progress',
      });
    }

    const requests = await BloodRequest.find({ requesterId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const requestsWithInterestCount = await Promise.all(
      requests.map(async (request) => {
        const donorCount = await DonorInterest.countDocuments({ requestId: request._id });
        return {
          ...request,
          donorCount,
        };
      })
    );

    res.json({ requests: requestsWithInterestCount });
  } catch (error) {
    next(error);
  }
};
