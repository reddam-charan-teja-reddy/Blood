import { OrgProfile } from '../models/OrgProfile.js';
import { BloodRequest } from '../models/BloodRequest.js';
import { DonorInterest } from '../models/DonorInterest.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { Notification } from '../models/Notification.js';

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

    // Active requests count (includes PARTIALLY_FULFILLED — they still need donors)
    const activeRequests = await BloodRequest.countDocuments({
      requesterId: req.user.id,
      status: { $in: ['ACTIVE', 'PARTIALLY_FULFILLED'] },
      expiresAt: { $gt: new Date() },
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const fulfilledToday = await BloodRequest.countDocuments({
      requesterId: req.user.id,
      status: 'FULFILLED',
      fulfilledAt: { $gte: startOfToday },
    });

    const orgRequestIds = await BloodRequest.find({ requesterId: req.user.id }).distinct('_id');
    const pendingContacts = await DonorInterest.countDocuments({
      requestId: { $in: orgRequestIds },
      status: 'REVEAL_PENDING',
    });

    // Recent requests (own)
    const recentRequests = await BloodRequest.find({ requesterId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const recentRequestsWithInterestCount = await Promise.all(
      recentRequests.map(async (request) => {
        const donorCount = await DonorInterest.countDocuments({ requestId: request._id });
        return { ...request, donorCount };
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

    const logsToCreate = [];
    Object.keys(inventory).forEach((bloodGroup) => {
      if (orgProfile.inventory[bloodGroup] !== undefined) {
        const newVal = parseInt(inventory[bloodGroup], 10);
        if (!isNaN(newVal) && newVal >= 0) {
          const oldVal = orgProfile.inventory[bloodGroup];
          const delta = newVal - oldVal;
          if (delta !== 0) {
            logsToCreate.push({
              orgId: orgProfile._id,
              bloodGroup,
              delta,
              reason: 'Manual Inventory Adjustment',
            });
          }
          orgProfile.inventory[bloodGroup] = newVal;
        }
      }
    });

    await orgProfile.save();
    if (logsToCreate.length > 0) {
      await InventoryLog.insertMany(logsToCreate);
    }

    res.json({ success: true, inventory: orgProfile.inventory });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /orgs/requests
 * Returns requests POSTED BY this org.
 */
export const getOwnRequests = async (req, res, next) => {
  try {
    const orgProfile = await OrgProfile.findOne({ userId: req.user.id });
    if (!orgProfile) {
      return res.status(404).json({ error: 'Organization profile not found' });
    }

    if (orgProfile.verificationStatus !== 'VERIFIED') {
      return res.status(403).json({ error: 'Org account pending verification' });
    }

    const requests = await BloodRequest.find({ requesterId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const requestsWithInterestCount = await Promise.all(
      requests.map(async (request) => {
        const donorCount = await DonorInterest.countDocuments({ requestId: request._id });
        return { ...request, donorCount };
      })
    );

    res.json({ requests: requestsWithInterestCount });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /orgs/feed
 * Returns public blood requests that this org can potentially supply from inventory.
 *
 * Filtering logic:
 *  - Request must be ACTIVE or PARTIALLY_FULFILLED
 *  - Request's blood group must be in org's inventory (> 0 units)
 *  - If org has location: requests within org's serviceRadiusKm
 *  - Fallback: requests in the same city as the org
 *
 * This is the "org-as-supplier" feed — the core missing workflow.
 */
export const getSupplyFeed = async (req, res, next) => {
  try {
    const orgProfile = await OrgProfile.findOne({ userId: req.user.id });
    if (!orgProfile) {
      return res.status(404).json({ error: 'Organization profile not found' });
    }

    if (orgProfile.verificationStatus !== 'VERIFIED') {
      return res.status(403).json({ error: 'Org account pending verification' });
    }

    // Build list of blood groups the org currently has in stock
    const bloodGroupsInStock = Object.entries(orgProfile.inventory)
      .filter(([, units]) => units > 0)
      .map(([group]) => group);

    if (bloodGroupsInStock.length === 0) {
      return res.json({
        requests: [],
        message: 'Your blood inventory is currently empty. Update inventory to see matching requests.',
      });
    }

    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const baseFilter = {
      status: { $in: ['ACTIVE', 'PARTIALLY_FULFILLED'] },
      expiresAt: { $gt: new Date() },
      bloodGroup: { $in: bloodGroupsInStock },
      requesterId: { $ne: req.user.id }, // don't show org's own requests
    };

    const hasOrgLocation =
      orgProfile.location &&
      Array.isArray(orgProfile.location.coordinates) &&
      orgProfile.location.coordinates.length === 2;

    let requests;
    let total;

    if (hasOrgLocation) {
      // Geospatial: find requests with hospitals near this org's location
      const serviceRadiusM = (orgProfile.serviceRadiusKm || 50) * 1000;

      const geoFilter = {
        ...baseFilter,
        hospitalLocation: {
          $near: {
            $geometry: orgProfile.location,
            $maxDistance: serviceRadiusM,
          },
        },
      };

      const countFilter = {
        ...baseFilter,
        hospitalLocation: {
          $geoWithin: {
            $centerSphere: [
              orgProfile.location.coordinates,
              (orgProfile.serviceRadiusKm || 50) / 6378.1
            ]
          }
        }
      };

      total = await BloodRequest.countDocuments(countFilter);
      requests = await BloodRequest.find(geoFilter)
        .populate('requesterId', 'fullName role')
        .skip(skip)
        .limit(limitNum)
        .lean();
    } else {
      // City-string fallback
      const cityFilter = {
        ...baseFilter,
        hospitalCity: { $regex: `^${escapeRegex(orgProfile.city)}$`, $options: 'i' },
      };

      total = await BloodRequest.countDocuments(cityFilter);
      requests = await BloodRequest.find(cityFilter)
        .populate('requesterId', 'fullName role')
        .sort({ urgency: 1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();
    }

    res.json({
      requests,
      count: requests.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      bloodGroupsInStock,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /orgs/supply/:requestId
 * Org "supplies" blood from its inventory to a patient request.
 *
 * This reuses the DonorInterest model to track the supply handshake:
 *   - Creates a DonorInterest with status = 'INTERESTED' for this org's userId
 *   - Org is treated as a special donor in the interest flow
 *   - Contact reveal is immediate (EMERGENCY) or via OTP (HIGH/NORMAL)
 *   - On reportOutcome(DONATED), inventory is decremented
 *
 * Why reuse DonorInterest? Avoids duplicating the entire slot/reveal/outcome
 * pipeline for orgs. The org "donates" blood the same way a person donates —
 * they confirm contact, coordinate logistics, and report the outcome.
 */
export const supplyBlood = async (req, res, next) => {
  try {
    const { requestId } = req.params;

    const orgProfile = await OrgProfile.findOne({ userId: req.user.id });
    if (!orgProfile) {
      return res.status(404).json({ error: 'Organization profile not found' });
    }

    if (orgProfile.verificationStatus !== 'VERIFIED') {
      return res.status(403).json({ error: 'Org account pending verification' });
    }

    const bloodRequest = await BloodRequest.findById(requestId);
    if (!bloodRequest) {
      return res.status(404).json({ error: 'Blood request not found' });
    }

    if (!['ACTIVE', 'PARTIALLY_FULFILLED'].includes(bloodRequest.status)) {
      return res.status(400).json({ error: 'This request is no longer accepting supply offers' });
    }

    // Org cannot supply its own requests
    if (bloodRequest.requesterId.toString() === req.user.id) {
      return res.status(403).json({ error: 'Cannot supply your own blood request' });
    }

    // Check org has sufficient inventory of this blood group
    const requiredGroup = bloodRequest.bloodGroup;
    const currentStock = orgProfile.inventory[requiredGroup] || 0;
    if (currentStock === 0) {
      return res.status(400).json({
        error: `Insufficient inventory: your org has 0 units of ${requiredGroup}`,
      });
    }

    // Check duplicate
    const existing = await DonorInterest.findOne({
      requestId,
      donorId: req.user.id,
    });
    if (existing) {
      return res.status(400).json({ error: 'Your organization has already offered to supply this request' });
    }

    const interest = await DonorInterest.create({
      requestId,
      donorId: req.user.id, // org's userId acts as the "donor"
      status: 'INTERESTED',
    });

    // Notify the requester that an org has offered to supply
    await Notification.create({
      userId: bloodRequest.requesterId,
      type: 'NEW_REQUEST_MATCH',
      title: `${orgProfile.orgName} can supply ${requiredGroup}`,
      message: `${orgProfile.orgName} has offered to supply ${bloodRequest.bloodGroup} for your request at ${bloodRequest.hospitalName}`,
      relatedRequestId: bloodRequest._id,
      link: `/request/${bloodRequest._id}`,
    });

    res.status(201).json({
      success: true,
      message: 'Supply offer submitted. The requester will be notified and can initiate contact reveal.',
      interest,
    });
  } catch (error) {
    next(error);
  }
};

export const updateOwnProfile = async (req, res, next) => {
  try {
    const orgProfile = await OrgProfile.findOne({ userId: req.user.id });
    if (!orgProfile) {
      return res.status(404).json({ error: 'Organization profile not found' });
    }

    const {
      orgName,
      address,
      city,
      state,
      pincode,
      serviceRadiusKm,
      // GeoJSON location from browser geolocation
      latitude,
      longitude,
    } = req.body;

    if (orgName !== undefined) orgProfile.orgName = orgName;
    if (address !== undefined) orgProfile.address = address;
    if (city !== undefined) orgProfile.city = city;
    if (state !== undefined) orgProfile.state = state;
    if (pincode !== undefined) orgProfile.pincode = pincode;
    if (serviceRadiusKm !== undefined) orgProfile.serviceRadiusKm = parseInt(serviceRadiusKm, 10);

    // Update GeoJSON location if coordinates provided
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      orgProfile.location = { type: 'Point', coordinates: [lng, lat] };
    }

    if (req.file) {
      orgProfile.documentPath = `/uploads/${req.file.filename}`;
      // Re-verify required when document changes. Dashboard access gated until re-approved.
      orgProfile.verificationStatus = 'PENDING';
      orgProfile.verifiedAt = undefined;
    }

    await orgProfile.save();
    res.json(orgProfile);
  } catch (error) {
    next(error);
  }
};

export const getInventoryLogs = async (req, res, next) => {
  try {
    const orgProfile = await OrgProfile.findOne({ userId: req.user.id });
    if (!orgProfile) {
      return res.status(404).json({ error: 'Organization profile not found' });
    }

    const logs = await InventoryLog.find({ orgId: orgProfile._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.json(logs);
  } catch (error) {
    next(error);
  }
};

// ── Helper ───────────────────────────────────────────────────────────────────
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
