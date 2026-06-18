import { User } from '../models/User.js';
import { DonorProfile } from '../models/DonorProfile.js';
import { OrgProfile } from '../models/OrgProfile.js';
import { BloodRequest } from '../models/BloodRequest.js';
import { DonorInterest } from '../models/DonorInterest.js';
import { Dispute } from '../models/Dispute.js';

export const getStats = async (req, res, next) => {
  try {
    const activeRequests = await BloodRequest.countDocuments({
      status: { $in: ['ACTIVE', 'PARTIALLY_FULFILLED'] },
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
    /**
     * Only return donors who have BOTH:
     *   a) a blood group set
     *   b) a document uploaded (documentPath exists and is not null)
     *
     * Previously this returned all unverified donors including those who
     * just selected a blood group at signup with no document attached \u2014
     * giving admin an empty/useless verification queue.
     */
    const pendingProofs = await DonorProfile.find({
      bloodGroup: { $exists: true, $ne: null },
      bloodGroupVerified: false,
      documentPath: { $exists: true, $ne: null },
    }).populate('userId', 'fullName phone').lean();

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
    profile.documentPath = undefined; // clear rejected document
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

export const getDisputes = async (req, res, next) => {
  try {
    const disputes = await Dispute.find()
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

    dispute.status = status;
    await dispute.save();

    if (status === 'OVERTURNED') {
      const donorProfile = await DonorProfile.findOne({ userId: dispute.filedById });
      if (donorProfile && donorProfile.noShowCount > 0) {
        donorProfile.noShowCount -= 1;
        await donorProfile.save();
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
      .populate('flaggedBy', 'fullName phone')
      .lean();

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
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
