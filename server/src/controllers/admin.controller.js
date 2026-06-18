import { User } from '../models/User.js';
import { DonorProfile } from '../models/DonorProfile.js';
import { OrgProfile } from '../models/OrgProfile.js';
import { BloodRequest } from '../models/BloodRequest.js';
import { DonorInterest } from '../models/DonorInterest.js';
import { Dispute } from '../models/Dispute.js';

export const getStats = async (req, res, next) => {
  try {
    const scope = await getAdminModerationScope(req.user.id);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const activeQuery = {
      status: { $in: ['ACTIVE', 'PARTIALLY_FULFILLED'] },
      expiresAt: { $gt: new Date() },
    };

    const fulfilledQuery = {
      status: 'FULFILLED',
      fulfilledAt: { $gte: startOfToday },
    };

    const userQuery = {
      createdAt: { $gte: startOfToday },
    };

    const openReportsQuery = {
      isFlagged: true,
    };

    const pendingOrgsQuery = {
      verificationStatus: 'PENDING',
    };

    if (scope.hasScope) {
      if (scope.type === 'GEOSPATIAL') {
        const centerSphere = [
          scope.location.coordinates,
          scope.radiusKm / 6378.1
        ];

        activeQuery.hospitalLocation = {
          $geoWithin: { $centerSphere: centerSphere }
        };
        fulfilledQuery.hospitalLocation = {
          $geoWithin: { $centerSphere: centerSphere }
        };
        openReportsQuery.hospitalLocation = {
          $geoWithin: { $centerSphere: centerSphere }
        };

        const donorUserIds = await DonorProfile.find({
          location: {
            $geoWithin: { $centerSphere: centerSphere }
          },
        }).distinct('userId');

        const orgUserIds = await OrgProfile.find({
          location: {
            $geoWithin: { $centerSphere: centerSphere }
          },
        }).distinct('userId');

        userQuery._id = { $in: [...donorUserIds, ...orgUserIds] };
        pendingOrgsQuery.location = {
          $geoWithin: { $centerSphere: centerSphere }
        };
      } else if (scope.type === 'CITY') {
        activeQuery.hospitalCity = { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' };
        fulfilledQuery.hospitalCity = { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' };
        openReportsQuery.hospitalCity = { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' };

        const donorUserIds = await DonorProfile.find({
          city: { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' },
        }).distinct('userId');

        const orgUserIds = await OrgProfile.find({
          city: { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' },
        }).distinct('userId');

        userQuery._id = { $in: [...donorUserIds, ...orgUserIds] };
        pendingOrgsQuery.city = { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' };
      }
    }

    const activeRequests = await BloodRequest.countDocuments(activeQuery);
    const fulfilledToday = await BloodRequest.countDocuments(fulfilledQuery);
    const newUsersToday = await User.countDocuments(userQuery);
    const openReports = await BloodRequest.countDocuments(openReportsQuery);
    const pendingOrgs = await OrgProfile.countDocuments(pendingOrgsQuery);

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
    /**
     * Real blood-group distribution from actual BloodRequest records.
     * Groups every request by bloodGroup and counts them.
     * Replaces the previous hardcoded mock data with Math.random() rates.
     */
    const bloodGroupRequests = await BloodRequest.aggregate([
      {
        $group: {
          _id: '$bloodGroup',
          requests: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          requests: 1,
        },
      },
      { $sort: { requests: -1 } },
    ]);

    /**
     * Real 30-day fulfillment rate trend.
     * For each of the last 30 days we compute:
     *   rate = (fulfilled_on_that_day / created_on_that_day) * 100
     * If a day has zero created requests, rate is reported as 0.
     */
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Requests created per day in the window
    const createdPerDay = await BloodRequest.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' },
          },
          total: { $sum: 1 },
        },
      },
    ]);

    // Requests fulfilled per day in the window
    const fulfilledPerDay = await BloodRequest.aggregate([
      {
        $match: {
          status: 'FULFILLED',
          fulfilledAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$fulfilledAt', timezone: 'Asia/Kolkata' },
          },
          fulfilled: { $sum: 1 },
        },
      },
    ]);

    // Build lookup maps
    const createdMap = Object.fromEntries(createdPerDay.map((d) => [d._id, d.total]));
    const fulfilledMap = Object.fromEntries(fulfilledPerDay.map((d) => [d._id, d.fulfilled]));

    // Produce a continuous 30-day array
    const fulfillmentRate = Array.from({ length: 30 }).map((_, i) => {
      const date = new Date(thirtyDaysAgo);
      date.setDate(date.getDate() + i);
      const key = date.toISOString().slice(0, 10); // 'YYYY-MM-DD'
      const label = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const total = createdMap[key] ?? 0;
      const fulfilled = fulfilledMap[key] ?? 0;
      const rate = total > 0 ? Math.round((fulfilled / total) * 100) : 0;
      return { date: label, rate };
    });

    res.json({
      bloodGroupRequests,
      fulfillmentRate,
    });
  } catch (error) {
    next(error);
  }
};


export const getPendingOrgs = async (req, res, next) => {
  try {
    const scope = await getAdminModerationScope(req.user.id);
    const filter = { verificationStatus: 'PENDING' };

    if (scope.hasScope) {
      if (scope.type === 'GEOSPATIAL') {
        filter.location = {
          $near: {
            $geometry: scope.location,
            $maxDistance: scope.radiusM,
          },
        };
      } else if (scope.type === 'CITY') {
        filter.city = { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' };
      }
    }

    const pendingOrgs = await OrgProfile.find(filter)
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

    const allowed = await checkAdminScopeAccess(req.user.id, 'ORG_PROFILE', id);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Organization is outside your moderation scope' });
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

    const allowed = await checkAdminScopeAccess(req.user.id, 'ORG_PROFILE', id);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Organization is outside your moderation scope' });
    }

    orgProfile.verificationStatus = 'REJECTED';
    orgProfile.documentPath = undefined; // clear rejected document
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
      const escapedSearch = escapeRegex(search);
      filter.$or = [
        { fullName: { $regex: escapedSearch, $options: 'i' } },
        { phone: { $regex: escapedSearch, $options: 'i' } },
      ];
    }
    if (role) {
      filter.role = role;
    }
    if (status) {
      if (status === 'suspended') filter.suspended = true;
      if (status === 'active') filter.suspended = false;
    }

    const scope = await getAdminModerationScope(req.user.id);
    if (scope.hasScope) {
      const profileQuery = {};
      if (scope.type === 'GEOSPATIAL') {
        profileQuery.location = {
          $geoWithin: {
            $centerSphere: [scope.location.coordinates, scope.radiusKm / 6378.1]
          }
        };
      } else if (scope.type === 'CITY') {
        profileQuery.city = { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' };
      }

      const donorUserIds = await DonorProfile.find(profileQuery).distinct('userId');
      const orgUserIds = await OrgProfile.find(profileQuery).distinct('userId');
      const allowedUserIds = [...donorUserIds, ...orgUserIds];

      filter._id = { $in: allowedUserIds };
    }

    const users = await User.find(filter).select('-passwordHash').lean();
    res.json(users);
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-passwordHash').lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const allowed = await checkAdminScopeAccess(req.user.id, 'USER', id);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: User is outside your moderation scope' });
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

    const allowed = await checkAdminScopeAccess(req.user.id, 'USER', id);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: User is outside your moderation scope' });
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

    const allowed = await checkAdminScopeAccess(req.user.id, 'USER', id);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: User is outside your moderation scope' });
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

    const allowed = await checkAdminScopeAccess(req.user.id, 'USER', id);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: User is outside your moderation scope' });
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
    const scope = await getAdminModerationScope(req.user.id);
    const filter = {
      bloodGroup: { $exists: true, $ne: null },
      bloodGroupVerified: false,
      documentPath: { $exists: true, $ne: null },
    };

    if (scope.hasScope) {
      if (scope.type === 'GEOSPATIAL') {
        filter.location = {
          $near: {
            $geometry: scope.location,
            $maxDistance: scope.radiusM,
          },
        };
      } else if (scope.type === 'CITY') {
        filter.city = { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' };
      }
    }

    const pendingProofs = await DonorProfile.find(filter)
      .populate('userId', 'fullName phone')
      .lean();

    // Compute the full document URL for admin to click through
    const origin = process.env.CLIENT_URL
      ? process.env.CLIENT_URL.replace('/api/v1', '')
      : 'http://localhost:5000';

    const proofsWithUrl = pendingProofs.map((p) => ({
      ...p,
      documentUrl: p.documentPath ? `${origin}${p.documentPath}` : null,
    }));

    res.json(proofsWithUrl);
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

    const allowed = await checkAdminScopeAccess(req.user.id, 'USER', userId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Donor is outside your moderation scope' });
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

    const allowed = await checkAdminScopeAccess(req.user.id, 'USER', userId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Donor is outside your moderation scope' });
    }

    profile.bloodGroupVerified = false;
    profile.bloodGroup = undefined; // reset blood group
    profile.documentPath = undefined; // clear rejected document
    await profile.save();

    res.json({ success: true, message: 'Blood group proof rejected' });
  } catch (error) {
    next(error);
  }
};

export const getFlaggedRequests = async (req, res, next) => {
  try {
    const query = {
      $or: [{ flagCount: { $gt: 0 } }, { isFlagged: true }],
    };

    const scope = await getAdminModerationScope(req.user.id);
    if (scope.hasScope) {
      if (scope.type === 'GEOSPATIAL') {
        query.hospitalLocation = {
          $geoWithin: {
            $centerSphere: [scope.location.coordinates, scope.radiusKm / 6378.1]
          }
        };
      } else if (scope.type === 'CITY') {
        query.hospitalCity = { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' };
      }
    }

    const flaggedRequests = await BloodRequest.find(query)
      .sort({ flagCount: -1 })
      .populate('requesterId', 'fullName phone')
      .populate({
        path: 'flaggedBy.userId',
        select: 'fullName phone',
      })
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

    const allowed = await checkAdminScopeAccess(req.user.id, 'BLOOD_REQUEST', requestId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Request is outside your moderation scope' });
    }

    request.flagCount = 0;
    request.isFlagged = false;
    request.flaggedBy = [];
    await request.save();

    res.json({ success: true, message: 'Flags cleared successfully' });
  } catch (error) {
    next(error);
  }
};

export const cancelFlaggedRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { reason, restrictionType } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const request = await BloodRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const allowed = await checkAdminScopeAccess(req.user.id, 'BLOOD_REQUEST', requestId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Request is outside your moderation scope' });
    }

    request.status = 'CANCELLED';
    request.cancellationReason = reason.trim();
    request.cancelledByAdmin = true;
    request.flaggedBy = [];
    request.flagCount = 0;
    request.isFlagged = false;
    await request.save();

    // Cancel all pending interests
    await DonorInterest.updateMany(
      { requestId, status: { $in: ['INTERESTED', 'REVEAL_PENDING'] } },
      { status: 'WITHDRAWN' }
    );

    // Apply requester restriction
    const requesterId = request.requesterId;
    if (restrictionType === 'RESTRICT_REQUEST') {
      await User.findByIdAndUpdate(requesterId, {
        restrictRequestUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      });
    } else if (restrictionType === 'SUSPEND') {
      await User.findByIdAndUpdate(requesterId, {
        suspended: true,
        suspendedReason: reason.trim() || 'Violation of terms (Abusive request flagged by admin)'
      });
    }

    res.json({ success: true, message: 'Request force-cancelled and requester restricted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getDisputes = async (req, res, next) => {
  try {
    const scope = await getAdminModerationScope(req.user.id);
    let disputeQuery = {};

    if (scope.hasScope) {
      const requestQuery = {};
      if (scope.type === 'GEOSPATIAL') {
        requestQuery.hospitalLocation = {
          $geoWithin: {
            $centerSphere: [scope.location.coordinates, scope.radiusKm / 6378.1]
          }
        };
      } else if (scope.type === 'CITY') {
        requestQuery.hospitalCity = { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' };
      }

      const allowedRequests = await BloodRequest.find(requestQuery).distinct('_id');
      const allowedInterests = await DonorInterest.find({ requestId: { $in: allowedRequests } }).distinct('_id');
      disputeQuery.interestId = { $in: allowedInterests };
    }

    const disputes = await Dispute.find(disputeQuery)
      .populate('filedById', 'fullName phone')
      .populate({
        path: 'interestId',
        populate: {
          path: 'requestId',
          select: 'hospitalName bloodGroup component'
        }
      })
      .sort({ createdAt: -1 })
      .lean();

    res.json(disputes);
  } catch (error) {
    next(error);
  }
};

export const resolveDispute = async (req, res, next) => {
  try {
    const { disputeId } = req.params;
    const { status } = req.body; // 'RESOLVED' or 'OVERTURNED'

    if (!['RESOLVED', 'OVERTURNED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid dispute status resolution. Must be RESOLVED or OVERTURNED.' });
    }

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const allowed = await checkAdminScopeAccess(req.user.id, 'DISPUTE', disputeId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Dispute is outside your moderation scope' });
    }

    dispute.status = status;
    await dispute.save();

    if (status === 'OVERTURNED') {
      if (dispute.type === 'RESTRICTION') {
        const user = await User.findById(dispute.filedById);
        if (user) {
          user.restrictRequestUntil = undefined;
          user.suspended = false;
          user.suspendedReason = null;
          await user.save();
        }
      } else {
        const donorProfile = await DonorProfile.findOne({ userId: dispute.filedById });
        if (donorProfile && donorProfile.noShowCount > 0) {
          donorProfile.noShowCount -= 1;
          await donorProfile.save();
        }
      }
    }

    res.json({ success: true, dispute });
  } catch (error) {
    next(error);
  }
};

export const getAllRequests = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = '', status, urgency, requesterType } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const query = {};

    if (search) {
      /**
       * SECURITY — Escape regex special characters in the search term before
       * embedding it in a $regex query.  Without escaping, a user could send
       * "search=.*" or "search=(a+)+" to cause catastrophic backtracking (ReDoS)
       * or bypass intended prefix-match semantics.
       */
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { hospitalName: { $regex: escaped, $options: 'i' } },
        { hospitalCity: { $regex: escaped, $options: 'i' } },
        { bloodGroup: { $regex: `^${escaped}$`, $options: 'i' } }, // exact match for blood group
      ];
    }

    // Optional filters for admin dashboard table
    if (status) query.status = status;
    if (urgency) query.urgency = urgency;
    if (requesterType) query.requesterType = requesterType;

    const scope = await getAdminModerationScope(req.user.id);
    if (scope.hasScope) {
      if (scope.type === 'GEOSPATIAL') {
        query.hospitalLocation = {
          $geoWithin: {
            $centerSphere: [scope.location.coordinates, scope.radiusKm / 6378.1]
          }
        };
      } else if (scope.type === 'CITY') {
        query.hospitalCity = { $regex: `^${escapeRegex(scope.city)}$`, $options: 'i' };
      }
    }

    const total = await BloodRequest.countDocuments(query);
    const requests = await BloodRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('requesterId', 'fullName phone role')
      .lean();

    res.json({
      requests,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin-only view of a single blood request with full detail:
 * - All sensitive fields (ward, doctor, guardian phone)
 * - Uploaded medical document path (served from /uploads)
 * - All donor interests on this request with donor identity
 * - Flag history (flaggedBy array)
 */
export const getRequestByIdAdmin = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const request = await BloodRequest.findById(requestId)
      .populate('requesterId', 'fullName phone email role')
      .populate({
        path: 'flaggedBy.userId',
        select: 'fullName phone',
      })
      .lean();

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const allowed = await checkAdminScopeAccess(req.user.id, 'BLOOD_REQUEST', requestId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Request is outside your moderation scope' });
    }

    // Fetch all donor interests with donor identity (admin sees everything)
    const interests = await DonorInterest.find({ requestId })
      .populate('donorId', 'fullName phone')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ request, interests });
  } catch (error) {
    next(error);
  }
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getAdminModerationScope(adminId) {
  const admin = await User.findById(adminId);
  if (!admin) return { hasScope: false };

  const hasLocation = admin.moderationLocation && 
                      Array.isArray(admin.moderationLocation.coordinates) && 
                      admin.moderationLocation.coordinates.length === 2 &&
                      admin.moderationRadiusKm;

  if (hasLocation) {
    return {
      hasScope: true,
      type: 'GEOSPATIAL',
      location: admin.moderationLocation,
      radiusM: admin.moderationRadiusKm * 1000,
      radiusKm: admin.moderationRadiusKm,
    };
  }

  if (admin.moderationCity) {
    return {
      hasScope: true,
      type: 'CITY',
      city: admin.moderationCity,
    };
  }

  return { hasScope: false };
}

export const updateModerationScope = async (req, res, next) => {
  try {
    const { type, city, latitude, longitude, radiusKm } = req.body;

    const admin = await User.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    if (type === 'NONE') {
      admin.moderationCity = undefined;
      admin.moderationRadiusKm = undefined;
      admin.moderationLocation = undefined;
    } else if (type === 'CITY') {
      if (!city || city.trim() === '') {
        return res.status(400).json({ error: 'City name is required' });
      }
      admin.moderationCity = city.trim();
      admin.moderationRadiusKm = undefined;
      admin.moderationLocation = undefined;
    } else if (type === 'GEOSPATIAL') {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const rad = parseFloat(radiusKm);

      if (isNaN(lat) || isNaN(lng) || isNaN(rad) || rad <= 0) {
        return res.status(400).json({ error: 'Valid latitude, longitude, and positive radius (Km) are required' });
      }

      admin.moderationLocation = {
        type: 'Point',
        coordinates: [lng, lat], // GeoJSON: [longitude, latitude]
      };
      admin.moderationRadiusKm = rad;
      admin.moderationCity = undefined;
    } else {
      return res.status(400).json({ error: 'Invalid scope type. Must be NONE, CITY, or GEOSPATIAL.' });
    }

    await admin.save();

    res.json({
      success: true,
      message: 'Moderation scope updated successfully',
      moderationCity: admin.moderationCity,
      moderationRadiusKm: admin.moderationRadiusKm,
      moderationLocation: admin.moderationLocation,
    });
  } catch (error) {
    next(error);
  }
};

async function checkAdminScopeAccess(adminId, modelType, docId) {
  const scope = await getAdminModerationScope(adminId);
  if (!scope.hasScope) return true; // unrestricted admin

  if (modelType === 'USER') {
    const donorProfile = await DonorProfile.findOne({ userId: docId });
    if (donorProfile && checkProfileScope(donorProfile, scope)) {
      return true;
    }
    const orgProfile = await OrgProfile.findOne({ userId: docId });
    if (orgProfile && checkProfileScope(orgProfile, scope)) {
      return true;
    }
    return false;
  }

  if (modelType === 'ORG_PROFILE') {
    const orgProfile = await OrgProfile.findById(docId);
    if (!orgProfile) return false;
    return checkProfileScope(orgProfile, scope);
  }

  if (modelType === 'DONOR_PROFILE') {
    const donorProfile = await DonorProfile.findById(docId);
    if (!donorProfile) return false;
    return checkProfileScope(donorProfile, scope);
  }

  if (modelType === 'BLOOD_REQUEST') {
    const request = await BloodRequest.findById(docId);
    if (!request) return false;
    return checkRequestScope(request, scope);
  }

  if (modelType === 'DISPUTE') {
    const dispute = await Dispute.findById(docId).populate({
      path: 'interestId',
      populate: { path: 'requestId' }
    });
    if (!dispute || !dispute.interestId?.requestId) return false;
    return checkRequestScope(dispute.interestId.requestId, scope);
  }

  return false;
}

function checkProfileScope(profile, scope) {
  if (scope.type === 'CITY') {
    return profile.city && profile.city.toLowerCase() === scope.city.toLowerCase();
  }
  if (scope.type === 'GEOSPATIAL') {
    if (!profile.location || !Array.isArray(profile.location.coordinates)) return false;
    const dist = calculateDistance(
      scope.location.coordinates[1],
      scope.location.coordinates[0],
      profile.location.coordinates[1],
      profile.location.coordinates[0]
    );
    return dist <= scope.radiusM;
  }
  return false;
}

function checkRequestScope(request, scope) {
  if (scope.type === 'CITY') {
    return request.hospitalCity && request.hospitalCity.toLowerCase() === scope.city.toLowerCase();
  }
  if (scope.type === 'GEOSPATIAL') {
    if (!request.hospitalLocation || !Array.isArray(request.hospitalLocation.coordinates)) return false;
    const dist = calculateDistance(
      scope.location.coordinates[1],
      scope.location.coordinates[0],
      request.hospitalLocation.coordinates[1],
      request.hospitalLocation.coordinates[0]
    );
    return dist <= scope.radiusM;
  }
  return false;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}
