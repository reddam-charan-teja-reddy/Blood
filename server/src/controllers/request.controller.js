import crypto from 'crypto';
import { BloodRequest } from '../models/BloodRequest.js';
import { DonorInterest } from '../models/DonorInterest.js';
import { DonorProfile } from '../models/DonorProfile.js';
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';
import { Notification } from '../models/Notification.js';
import { compatibleRecipientGroups } from '../utils/bloodCompat.js';
import { sendOTP, verifyOTP } from '../services/otp.service.js';
import { computeEligibility } from '../services/eligibility.service.js';
import { findMatchingDonors } from '../services/matching.service.js';
import { OrgProfile } from '../models/OrgProfile.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { redis } from '../services/redis.service.js';
import { emitToRequest, emitToUser } from '../services/socket.service.js';
import { withTransaction } from '../config/db.js';

export const getRequests = async (req, res, next) => {
  try {
    const { bloodGroup, urgency, component, city, sortBy, compatibleOnly, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const cacheKey = `cache:requests:${bloodGroup || 'all'}:${urgency || 'all'}:${component || 'all'}:${city || 'all'}:${sortBy || 'default'}:${compatibleOnly || 'false'}:p${pageNum}:l${limitNum}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      try {
        return res.json(JSON.parse(cachedData));
      } catch {}
    }

    const filter = {
      // Show both ACTIVE and PARTIALLY_FULFILLED — a partially filled request
      // still needs donors. Hiding it would deprive patients of potential help.
      status: { $in: ['ACTIVE', 'PARTIALLY_FULFILLED'] },
      expiresAt: { $gt: new Date() },
    };

    if (bloodGroup) {
      const groups = compatibleOnly === 'true'
        ? compatibleRecipientGroups(bloodGroup)
        : [bloodGroup];
      filter.bloodGroup = { $in: groups };
    }

    if (urgency) filter.urgency = urgency;
    if (component) filter.component = component;
    if (city) filter.hospitalCity = { $regex: `^${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };

    const sortMap = {
      urgency: { urgency: 1, createdAt: -1 }, // E < H < N
      newest: { createdAt: -1 },
      expiringSoon: { expiresAt: 1 },
    };
    const sort = sortMap[sortBy] ?? sortMap.urgency;

    const total = await BloodRequest.countDocuments(filter);
    const requests = await BloodRequest.find(filter)
      .populate('requesterId', 'fullName role')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const responsePayload = {
      requests,
      count: requests.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    };

    // Cache results in Redis with 30s TTL
    await redis.set(cacheKey, JSON.stringify(responsePayload), 30);

    res.json(responsePayload);
  } catch (error) {
    next(error);
  }
};

export const createRequest = async (req, res, next) => {
  try {
    const {
      bloodGroup,
      component,
      unitsNeeded,
      urgency,
      requiredBy,
      hospitalName,
      hospitalCity,
      hospitalState,
      wardNumber,
      attendingDoctor,
      guardianPhoneOverride,
      // GeoJSON coordinates from browser geolocation — optional
      hospitalLatitude,
      hospitalLongitude,
    } = req.body;

    // Restriction Check: Check if user request creation is restricted by admin
    const dbUser = await User.findById(req.user.id);
    if (dbUser && dbUser.restrictRequestUntil && new Date(dbUser.restrictRequestUntil) > new Date()) {
      return res.status(403).json({
        error: 'Abuse check failed',
        hint: `Your request creation privileges are temporarily suspended until ${new Date(dbUser.restrictRequestUntil).toLocaleString('en-IN')}`,
      });
    }

    // Abuse Check: max 2 active requests per user
    const activeRequests = await BloodRequest.countDocuments({
      requesterId: req.user.id,
      status: { $in: ['ACTIVE', 'PARTIALLY_FULFILLED'] },
      expiresAt: { $gt: new Date() },
    });

    if (activeRequests >= 2) {
      return res.status(403).json({
        error: 'Abuse check failed',
        hint: 'You have reached the maximum of 2 active requests. Close or cancel existing requests first.',
      });
    }

    const expiresAt = new Date(requiredBy);
    const shareToken = crypto.randomBytes(16).toString('hex');

    // Build hospitalLocation GeoJSON if coordinates were supplied
    let hospitalLocation;
    const lat = parseFloat(hospitalLatitude);
    const lng = parseFloat(hospitalLongitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      hospitalLocation = { type: 'Point', coordinates: [lng, lat] }; // GeoJSON: [lng, lat]
    }

    const request = await BloodRequest.create({
      requesterId: req.user.id,
      requesterType: req.user.role,
      bloodGroup,
      component,
      unitsNeeded,
      urgency,
      requiredBy: new Date(requiredBy),
      hospitalName,
      hospitalCity,
      hospitalState,
      hospitalLocation,
      wardNumber,
      attendingDoctor,
      guardianPhoneOverride,
      expiresAt,
      shareToken,
      documentPath: req.file ? `/uploads/${req.file.filename}` : undefined,
    });

    // ── Donor Matching & Notification Fan-out ───────────────────────────────
    // Run asynchronously so we don't delay the HTTP response to the requester.
    // Errors here are logged but do not fail the request creation.
    setImmediate(async () => {
      try {
        const matched = await findMatchingDonors(request);
        if (matched.length > 0) {
          const notifications = matched.map((donorProfile) => ({
            userId: donorProfile.userId?._id || donorProfile.userId,
            type: urgency === 'EMERGENCY' ? 'EMERGENCY_REQUEST' : 'NEW_REQUEST_MATCH',
            title: urgency === 'EMERGENCY'
              ? `🚨 Emergency ${bloodGroup} needed at ${hospitalName}`
              : `New ${bloodGroup} request near you`,
            message: `${unitsNeeded} unit(s) of ${component} needed at ${hospitalName}, ${hospitalCity}`,
            relatedRequestId: request._id,
            link: `/request/${request._id}`,
          }));
          await Notification.insertMany(notifications);
          // Broadcast real-time notifications to online matching donors
          notifications.forEach((notif) => {
            emitToUser(notif.userId.toString(), 'new_notification', notif);
          });
        }
      } catch (err) {
        console.error('[createRequest] Matching fan-out error:', err.message);
      }
    });

    await redis.delByPattern('cache:requests:*');
    res.status(201).json(request);
  } catch (error) {
    next(error);
  }
};

export const getRequestById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const request = await BloodRequest.findById(id).populate('requesterId', 'fullName role phone');

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const isOwner = req.user && request.requesterId._id.toString() === req.user.id;
    const isAdmin = req.user && req.user.role === 'ADMIN';

    // Check if the user is a donor who has contact revealed status
    let isRevealedDonor = false;
    if (req.user) {
      const interest = await DonorInterest.findOne({
        requestId: id,
        donorId: req.user.id,
        status: { $in: ['CONTACT_REVEALED', 'CONFIRMED', 'DONATED'] },
      });
      if (interest) isRevealedDonor = true;
    }

    const revealSensitive = isOwner || isAdmin || isRevealedDonor;

    // Convert to object to edit
    const requestObj = request.toObject();

    // Mask sensitive fields if not authorized
    if (!revealSensitive) {
      delete requestObj.wardNumber;
      delete requestObj.attendingDoctor;
      delete requestObj.guardianPhoneOverride;
      delete requestObj.flagCount;
      if (requestObj.requesterId) {
        delete requestObj.requesterId.phone;
      }
    }

    // Active reservations are those within 1 hour; stale ones are cleaned up asynchronously by cron
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Check if request is currently reserved
    const activeReservation = await DonorInterest.findOne({
      requestId: id,
      status: 'RESERVED',
      reservedAt: { $gt: oneHourAgo }
    });
    requestObj.isReserved = !!activeReservation;
    requestObj.reservedByMe = activeReservation && req.user && activeReservation.donorId.toString() === req.user.id;
    requestObj.waitlistCount = await DonorInterest.countDocuments({ requestId: id, status: 'WAITLISTED' });

    // If owner or admin, fetch donor interests
    let interests = [];
    if (isOwner || isAdmin) {
      const dbInterests = await DonorInterest.find({ requestId: id }).populate('donorId', 'fullName phone');
      interests = dbInterests.map((interest) => {
        const interestObj = interest.toObject();
        if (
          !isAdmin &&
          interestObj.donorId &&
          !['CONTACT_REVEALED', 'CONFIRMED', 'DONATED'].includes(interestObj.status)
        ) {
          delete interestObj.donorId.phone;
        }
        return interestObj;
      });
    } else if (req.user) {
      const myDbInterest = await DonorInterest.findOne({ requestId: id, donorId: req.user.id }).populate('donorId', 'fullName phone');
      if (myDbInterest) {
        const interestObj = myDbInterest.toObject();
        if (
          interestObj.donorId &&
          !['CONTACT_REVEALED', 'CONFIRMED', 'DONATED'].includes(interestObj.status)
        ) {
          delete interestObj.donorId.phone;
        }
        interests = [interestObj];
      }
    }


    res.json({
      request: requestObj,
      interests,
    });
  } catch (error) {
    next(error);
  }
};

export const getRequestByShareToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const request = await BloodRequest.findOne({ shareToken: token }).populate('requesterId', 'fullName role');

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const requestObj = request.toObject();
    delete requestObj.wardNumber;
    delete requestObj.attendingDoctor;
    delete requestObj.guardianPhoneOverride;
    delete requestObj.flagCount;
    if (requestObj.requesterId) {
      delete requestObj.requesterId.phone;
    }

    res.json({ request: requestObj });
  } catch (error) {
    next(error);
  }
};

export const updateRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const request = await BloodRequest.findById(id);

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.requesterId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized — you do not own this request' });
    }

    if (!['ACTIVE', 'PARTIALLY_FULFILLED'].includes(request.status)) {
      return res.status(400).json({ error: 'Request is no longer active and cannot be updated' });
    }

    /**
     * SECURITY — ALLOWLIST only the fields a user is permitted to change.
     * Previously used Object.assign(request, req.body) with a denylist,
     * which allowed attackers to override flagCount, isFlagged, flaggedBy,
     * shareToken, expiresAt, etc. by just sending those keys in the body.
     * An allowlist is the correct pattern — anything not listed is silently ignored.
     */
    const ALLOWED_UPDATE_FIELDS = [
      'hospitalName',
      'hospitalCity',
      'hospitalState',
      'wardNumber',
      'attendingDoctor',
      'guardianPhoneOverride',
      'requiredBy',
      'unitsNeeded',
    ];

    ALLOWED_UPDATE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        request[field] = req.body[field];
      }
    });

    // Keep expiresAt in sync if requiredBy is being updated
    if (req.body.requiredBy) {
      request.expiresAt = new Date(req.body.requiredBy);
    }

    await request.save();
    await redis.delByPattern('cache:requests:*');

    res.json(request);
  } catch (error) {
    next(error);
  }
};

export const deleteRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, restrictionType } = req.body;
    const request = await BloodRequest.findById(id);

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const isOwner = request.requesterId.toString() === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    request.status = 'CANCELLED';

    // If an Admin performs the cancellation on another user's request
    if (isAdmin && !isOwner) {
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'Cancellation reason is required' });
      }
      request.cancellationReason = reason.trim();
      request.cancelledByAdmin = true;

      // Apply requester restriction
      const requesterId = request.requesterId;
      if (restrictionType === 'RESTRICT_REQUEST') {
        await User.findByIdAndUpdate(requesterId, {
          restrictRequestUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        });
      } else if (restrictionType === 'SUSPEND') {
        await User.findByIdAndUpdate(requesterId, {
          suspended: true,
          suspendedReason: reason.trim() || 'Violation of terms (Abusive request cancelled by admin)'
        });
      }
    }

    await request.save();

    // Cancel all pending interests
    await DonorInterest.updateMany(
      { requestId: id, status: { $in: ['INTERESTED', 'REVEAL_PENDING'] } },
      { status: 'WITHDRAWN' }
    );

    await redis.delByPattern('cache:requests:*');
    res.json({ success: true, message: 'Request cancelled successfully' });
  } catch (error) {
    next(error);
  }
};

export const fulfilRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const request = await BloodRequest.findById(id);

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const isOwner = request.requesterId.toString() === req.user.id;
    const isOrg = req.user.role === 'ORG'; // Any org can fulfil (e.g. hospital receiving it)

    if (!isOwner && !isOrg) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    request.status = 'FULFILLED';
    request.fulfilledAt = new Date();
    await request.save();
    await redis.delByPattern('cache:requests:*');

    res.json({ success: true, message: 'Request marked fulfilled successfully', request });
  } catch (error) {
    next(error);
  }
};

export const extendRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const request = await BloodRequest.findById(id);

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.requesterId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!['ACTIVE', 'PARTIALLY_FULFILLED'].includes(request.status)) {
      return res.status(400).json({ error: 'Only active requests can be extended' });
    }

    // Enforce maximum 2 extensions — prevents indefinite extension abuse
    const MAX_EXTENSIONS = 2;
    if ((request.extensionCount || 0) >= MAX_EXTENSIONS) {
      return res.status(400).json({
        error: `Maximum ${MAX_EXTENSIONS} extensions allowed. Please create a new request if still needed.`,
      });
    }

    request.expiresAt = new Date(request.expiresAt.getTime() + 24 * 60 * 60 * 1000);
    request.requiredBy = new Date(request.requiredBy.getTime() + 24 * 60 * 60 * 1000);
    request.extensionCount = (request.extensionCount || 0) + 1;
    await request.save();

    res.json({
      success: true,
      message: `Request extended by 24 hours (${request.extensionCount}/${MAX_EXTENSIONS} extensions used)`,
      request,
    });
  } catch (error) {
    next(error);
  }
};

export const expressInterest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { eta } = req.body;

    const request = await BloodRequest.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (!['ACTIVE', 'PARTIALLY_FULFILLED'].includes(request.status)) {
      return res.status(400).json({ error: 'Request is no longer active' });
    }

    // Verify donor eligibility
    const donorProfile = await DonorProfile.findOne({ userId: req.user.id });
    if (!donorProfile) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }
    const eligibility = computeEligibility(donorProfile, request.component);
    if (!eligibility.eligible) {
      return res.status(403).json({
        error: 'You are currently ineligible to donate for this component.',
        reason: eligibility.reason,
        unblockDate: eligibility.unblockDate,
        daysRemaining: eligibility.daysRemaining
      });
    }

    // Check if the request is already fully covered by active reservations/coordinations
    const unitsRemaining = request.unitsNeeded - (request.unitsConfirmed || 0);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const activeCoordinationsCount = await DonorInterest.countDocuments({
      requestId: id,
      status: { $in: ['RESERVED', 'REVEAL_PENDING', 'CONTACT_REVEALED', 'CONFIRMED'] },
      $or: [
        { status: { $ne: 'RESERVED' } },
        { status: 'RESERVED', reservedAt: { $gt: oneHourAgo } }
      ]
    });

    let isWaitlist = false;
    if (activeCoordinationsCount >= unitsRemaining) {
      const userIsActiveCoordinator = await DonorInterest.findOne({
        requestId: id,
        donorId: req.user.id,
        status: { $in: ['RESERVED', 'REVEAL_PENDING', 'CONTACT_REVEALED', 'CONFIRMED'] },
        $or: [
          { status: { $ne: 'RESERVED' } },
          { status: 'RESERVED', reservedAt: { $gt: oneHourAgo } }
        ]
      });
      if (!userIsActiveCoordinator) {
        if (req.body.waitlist === true) {
          isWaitlist = true;
        } else {
          return res.status(403).json({
            error: 'This request is temporarily fully reserved by other donors for travel coordination.',
            canWaitlist: true,
            message: 'You can join the waitlist to be automatically promoted if a slot becomes available.',
          });
        }
      }
    }

    // Check duplicate interest
    const existingInterest = await DonorInterest.findOne({ requestId: id, donorId: req.user.id });
    if (existingInterest) {
      if (['RESERVED', 'WITHDRAWN', 'DECLINED', 'WAITLISTED'].includes(existingInterest.status)) {
        existingInterest.status = isWaitlist ? 'WAITLISTED' : 'INTERESTED';
        if (eta) {
          existingInterest.eta = new Date(eta);
        } else {
          existingInterest.eta = undefined;
        }
        await existingInterest.save();
        return res.status(200).json(existingInterest);
      }
      return res.status(400).json({ error: 'You have already expressed interest in this request' });
    }

    const interest = await DonorInterest.create({
      requestId: id,
      donorId: req.user.id,
      status: isWaitlist ? 'WAITLISTED' : 'INTERESTED',
      eta: eta ? new Date(eta) : undefined,
    });

    res.status(201).json(interest);
  } catch (error) {
    next(error);
  }
};

export const reserveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { eta } = req.body;

    const request = await BloodRequest.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (!['ACTIVE', 'PARTIALLY_FULFILLED'].includes(request.status)) {
      return res.status(400).json({ error: 'Request is no longer active' });
    }

    // Verify donor eligibility
    const donorProfile = await DonorProfile.findOne({ userId: req.user.id });
    if (!donorProfile) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }
    const eligibility = computeEligibility(donorProfile, request.component);
    if (!eligibility.eligible) {
      return res.status(403).json({
        error: 'You are currently ineligible to donate for this component.',
        reason: eligibility.reason,
        unblockDate: eligibility.unblockDate,
        daysRemaining: eligibility.daysRemaining
      });
    }

    // Acquire atomic lock for slot capacity check and reservation
    const lockKey = `lock:reserve:${id}`;
    const lockToken = await redis.acquireLock(lockKey, 5);
    if (!lockToken) {
      return res.status(409).json({ error: 'Another donor is coordinating this slot right now. Please retry in a few seconds.' });
    }

    try {
      // Check if the request is already fully covered by active reservations/coordinations
      const unitsRemaining = request.unitsNeeded - (request.unitsConfirmed || 0);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const activeCoordinationsCount = await DonorInterest.countDocuments({
        requestId: id,
        status: { $in: ['RESERVED', 'REVEAL_PENDING', 'CONTACT_REVEALED', 'CONFIRMED'] },
        $or: [
          { status: { $ne: 'RESERVED' } },
          { status: 'RESERVED', reservedAt: { $gt: oneHourAgo } }
        ]
      });

      if (activeCoordinationsCount >= unitsRemaining) {
        const userIsActiveCoordinator = await DonorInterest.findOne({
          requestId: id,
          donorId: req.user.id,
          status: { $in: ['RESERVED', 'REVEAL_PENDING', 'CONTACT_REVEALED', 'CONFIRMED'] },
          $or: [
            { status: { $ne: 'RESERVED' } },
            { status: 'RESERVED', reservedAt: { $gt: oneHourAgo } }
          ]
        });
        if (!userIsActiveCoordinator) {
          return res.status(403).json({ error: 'This request is temporarily fully reserved by other donors for travel coordination.' });
        }
      }

      // Check duplicate interest
      const existingInterest = await DonorInterest.findOne({ requestId: id, donorId: req.user.id });
      if (existingInterest) {
        existingInterest.status = 'RESERVED';
        existingInterest.reservedAt = new Date();
        if (eta) existingInterest.eta = new Date(eta);
        await existingInterest.save();
        return res.json({ success: true, interest: existingInterest });
      }

      const interest = await DonorInterest.create({
        requestId: id,
        donorId: req.user.id,
        status: 'RESERVED',
        reservedAt: new Date(),
        eta: eta ? new Date(eta) : undefined,
      });

      res.status(201).json(interest);
    } finally {
      await redis.releaseLock(lockKey, lockToken);
    }
  } catch (error) {
    next(error);
  }
};

export const updateInterestSlot = async (req, res, next) => {
  try {
    const { interestId } = req.params;
    const { eta } = req.body;

    const interest = await DonorInterest.findById(interestId);
    if (!interest) {
      return res.status(404).json({ error: 'Donor interest record not found' });
    }

    if (interest.donorId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized — you did not create this record' });
    }

    if (eta) {
      interest.eta = new Date(eta);
    }
    await interest.save();

    res.json({ success: true, interest });
  } catch (error) {
    next(error);
  }
};

export const revealContact = async (req, res, next) => {
  try {
    const { id, interestId } = req.params;
    const request = await BloodRequest.findById(id).populate('requesterId');
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const isOwner = request.requesterId._id.toString() === req.user.id;

    if (!isOwner) {
      return res.status(403).json({ error: 'Unauthorized — only the request owner can initiate reveal' });
    }

    const interest = await DonorInterest.findById(interestId).populate('donorId');
    if (!interest) {
      return res.status(404).json({ error: 'Donor interest record not found' });
    }

    if (!['INTERESTED', 'RESERVED'].includes(interest.status)) {
      return res.status(400).json({ error: 'Contact reveal can only be initiated on INTERESTED or RESERVED state' });
    }

    if (request.urgency === 'EMERGENCY') {
      interest.status = 'CONTACT_REVEALED';
      interest.contactRevealedAt = new Date();
      await interest.save();

      // NOTE: We do NOT change unitsConfirmed or request status here.
      // Contact revealed ≠ donation happened. Status is updated in reportOutcome
      // when the donor reports outcome === 'DONATED'.

      const patientPhone = request.guardianPhoneOverride || request.requesterId.phone;
      const donorPhone = interest.donorId.phone;

      return res.json({
        success: true,
        otpSent: false,
        interestId: interest._id,
        status: 'CONTACT_REVEALED',
        patientPhone,
        donorPhone,
        message: 'Emergency request: contact details revealed instantly without OTP verification.',
      });
    }

    interest.status = 'REVEAL_PENDING';
    await interest.save();

    // Trigger OTP sending to donor's phone
    await sendOTP(interest.donorId.phone, 'CONTACT_REVEAL');

    res.json({
      success: true,
      otpSent: true,
      interestId: interest._id,
      message: 'OTP has been sent to the donor to confirm contact details reveal',
    });
  } catch (error) {
    next(error);
  }
};

export const confirmReveal = async (req, res, next) => {
  try {
    const { interestId } = req.params;
    const { otp } = req.body;

    const interest = await DonorInterest.findById(interestId).populate('donorId');
    if (!interest) {
      return res.status(404).json({ error: 'Donor interest record not found' });
    }

    // Verify it is the donor entering the OTP
    if (interest.donorId._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized — only the donor can confirm contact reveal' });
    }

    if (interest.status !== 'REVEAL_PENDING') {
      return res.status(400).json({ error: 'Reveal is not pending for this donor' });
    }

    // Verify OTP
    const verification = await verifyOTP(interest.donorId.phone, otp, 'CONTACT_REVEAL');
    if (!verification.valid) {
      return res.status(400).json({
        error: verification.reason || 'Invalid OTP',
        message: verification.message,
        attemptsRemaining: verification.attemptsRemaining,
      });
    }

    interest.status = 'CONTACT_REVEALED';
    interest.contactRevealedAt = new Date();
    await interest.save();

    // Fetch request to return contact details.
    // We intentionally do NOT increment unitsConfirmed here.
    // Contact reveal is a mutual consent step, not a donation confirmation.
    // unitsConfirmed is updated in reportOutcome when outcome === 'DONATED'.
    const request = await BloodRequest.findById(interest.requestId).populate('requesterId');

    const patientPhone = request
      ? (request.guardianPhoneOverride || request.requesterId?.phone)
      : null;
    const donorPhone = interest.donorId.phone;

    res.json({
      success: true,
      patientPhone,
      donorPhone,
      message: 'Contacts revealed successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const reportOutcome = async (req, res, next) => {
  try {
    const { interestId } = req.params;
    const { outcome, outcomeReason } = req.body;

    if (!['DONATED', 'TURNED_AWAY', 'NO_SHOW', 'DECLINED'].includes(outcome)) {
      return res.status(400).json({ error: 'Invalid outcome value' });
    }

    const interest = await DonorInterest.findById(interestId);
    if (!interest) {
      return res.status(404).json({ error: 'Interest slot not found' });
    }

    // Lock outcomes that are already finalized
    if (['DONATED', 'TURNED_AWAY', 'NO_SHOW', 'DECLINED'].includes(interest.status)) {
      return res.status(400).json({ error: 'Outcome has already been resolved and cannot be modified.' });
    }

    const request = await BloodRequest.findById(interest.requestId);
    if (!request) {
      return res.status(404).json({ error: 'Associated request not found' });
    }

    const isAdmin = req.user && req.user.role === 'ADMIN';
    const isDonor = interest.donorId.toString() === req.user.id;
    const isRequester = request.requesterId.toString() === req.user.id;

    if (!isDonor && !isRequester && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized to report outcome' });
    }

    // Idempotency: Prevent overriding already submitted outcome for a side
    if (!isAdmin) {
      if (isDonor && interest.donorOutcome) {
        return res.status(400).json({ error: 'You have already submitted your outcome for this donation slot.' });
      }
      if (isRequester && interest.requesterOutcome) {
        return res.status(400).json({ error: 'You have already submitted your outcome for this donation slot.' });
      }
    }

    // Set the specific outcome fields
    if (isAdmin) {
      interest.donorOutcome = outcome;
      interest.requesterOutcome = outcome;
    } else if (isDonor) {
      interest.donorOutcome = outcome;
    } else if (isRequester) {
      interest.requesterOutcome = outcome;
    }

    // Check if both sides have submitted outcomes
    if (interest.donorOutcome && interest.requesterOutcome) {
      if (interest.donorOutcome === interest.requesterOutcome) {
        // Both sides agree, finalize the outcome atomically with transaction support
        await withTransaction(async (session) => {
          interest.status = outcome;
          interest.outcomeReportedAt = new Date();
          if (outcomeReason) interest.outcomeReason = outcomeReason;
          await interest.save(session ? { session } : undefined);

          if (outcome === 'DONATED') {
            // 1. Update donor profile reputation + last donation date
            const donorQuery = DonorProfile.findOne({ userId: interest.donorId });
            const donorProfile = session ? await donorQuery.session(session) : await donorQuery;
            if (donorProfile) {
              donorProfile.totalDonations += 1;
              donorProfile.reputationScore = Math.max(0, Math.min(100, Math.round(50 + (donorProfile.totalDonations * 10) - ((donorProfile.noShowCount || 0) * 25))));
              if (request.component === 'PLATELETS') {
                donorProfile.lastPlateletDonation = new Date();
              } else if (request.component === 'PLASMA') {
                donorProfile.lastPlasmaDonation = new Date();
              } else {
                donorProfile.lastWholeBloodDonation = new Date();
              }
              await donorProfile.save(session ? { session } : undefined);
            }

            // Automatically decrement from OrgProfile inventory if donor is an ORG
            const donorUserQuery = User.findById(interest.donorId);
            const donorUser = session ? await donorUserQuery.session(session) : await donorUserQuery;
            if (donorUser && donorUser.role === 'ORG') {
              const orgQuery = OrgProfile.findOne({ userId: interest.donorId });
              const orgProfile = session ? await orgQuery.session(session) : await orgQuery;
              if (orgProfile) {
                const bg = request.bloodGroup;
                const currentInv = orgProfile.inventory[bg] || 0;
                const newInv = Math.max(0, currentInv - 1);
                orgProfile.inventory[bg] = newInv;
                await orgProfile.save(session ? { session } : undefined);

                await InventoryLog.create([{
                  orgId: orgProfile._id,
                  bloodGroup: bg,
                  delta: -1,
                  reason: `Blood Request Fulfilment: Request ID ${request._id}`,
                }], session ? { session } : undefined);
              }
            }

            // 2. Increment unitsConfirmed on the BloodRequest
            request.unitsConfirmed = (request.unitsConfirmed || 0) + 1;
            if (request.unitsConfirmed >= request.unitsNeeded) {
              request.status = 'FULFILLED';
              request.fulfilledAt = new Date();
            } else {
              request.status = 'PARTIALLY_FULFILLED';
            }
            await request.save(session ? { session } : undefined);
          } else if (outcome === 'NO_SHOW') {
            const donorQuery = DonorProfile.findOne({ userId: interest.donorId });
            const donorProfile = session ? await donorQuery.session(session) : await donorQuery;
            if (donorProfile) {
              donorProfile.noShowCount += 1;
              donorProfile.reputationScore = Math.max(0, Math.min(100, Math.round(50 + (donorProfile.totalDonations * 10) - (donorProfile.noShowCount * 25))));
              await donorProfile.save(session ? { session } : undefined);
            }
          }
        });
      } else {
        // Outcomes mismatch - save outcomes but do not resolve the status
        await interest.save();
      }
    } else {
      // Only one side reported so far - save but do not resolve the status yet
      await interest.save();
    }

    res.json({ success: true, message: 'Outcome reported successfully', interest, request });
  } catch (error) {
    next(error);
  }
};

export const flagRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'Reason for reporting is required' });
    }

    const request = await BloodRequest.findById(id);

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Prevent the requester from flagging their own request
    if (request.requesterId.toString() === userId) {
      return res.status(400).json({ error: 'You cannot flag your own request' });
    }

    /**
     * Enforce one-flag-per-user-per-request.
     * `flaggedBy` is an array of subdocuments. We check membership by userId.
     */
    const alreadyFlagged = request.flaggedBy?.some(
      (f) => f.userId.toString() === userId
    );
    if (alreadyFlagged) {
      return res.status(400).json({ error: 'You have already reported this request' });
    }

    request.flaggedBy = [...(request.flaggedBy ?? []), { userId, reason: reason.trim() }];
    request.flagCount = request.flaggedBy.length;

    // Auto-elevate to isFlagged when 5 or more distinct users have reported it
    if (request.flagCount >= 5) {
      request.isFlagged = true;
    }

    await request.save();

    res.json({ success: true, message: 'Request reported successfully' });
  } catch (error) {
    next(error);
  }
};

export const requestDonor = async (req, res, next) => {
  try {
    const { id, donorUserId } = req.params; // id is requestId
    const request = await BloodRequest.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.requesterId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized — you do not own this request' });
    }

    // Check duplicate interest
    const existingInterest = await DonorInterest.findOne({ requestId: id, donorId: donorUserId });
    if (existingInterest) {
      return res.status(400).json({ error: 'You have already requested contact from this donor' });
    }

    const interest = await DonorInterest.create({
      requestId: id,
      donorId: donorUserId,
      status: 'INTERESTED',
    });

    res.status(201).json(interest);
  } catch (error) {
    next(error);
  }
};

export const getChatMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const request = await BloodRequest.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const isOwner = request.requesterId.toString() === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    let isRevealedDonor = false;
    if (!isOwner && !isAdmin) {
      const interest = await DonorInterest.findOne({
        requestId: id,
        donorId: req.user.id,
        status: { $in: ['INTERESTED', 'RESERVED', 'REVEAL_PENDING', 'CONTACT_REVEALED', 'CONFIRMED', 'DONATED'] },
      });
      if (interest) {
        isRevealedDonor = true;
      }
    }

    if (!isOwner && !isAdmin && !isRevealedDonor) {
      return res.status(403).json({ error: 'Unauthorized to view chat messages' });
    }

    const messages = await Message.find({ requestId: id })
      .sort({ createdAt: 1 })
      .populate('senderId', 'fullName role');

    res.json(messages);
  } catch (error) {
    next(error);
  }
};

export const sendChatMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const request = await BloodRequest.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const isOwner = request.requesterId.toString() === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    let isRevealedDonor = false;
    if (!isOwner && !isAdmin) {
      const interest = await DonorInterest.findOne({
        requestId: id,
        donorId: req.user.id,
        status: { $in: ['INTERESTED', 'RESERVED', 'REVEAL_PENDING', 'CONTACT_REVEALED', 'CONFIRMED', 'DONATED'] },
      });
      if (interest) {
        isRevealedDonor = true;
      }
    }

    if (!isOwner && !isAdmin && !isRevealedDonor) {
      return res.status(403).json({ error: 'Unauthorized to send chat messages' });
    }

    const message = await Message.create({
      requestId: id,
      senderId: req.user.id,
      content: content.trim(),
    });

    const populatedMessage = await message.populate('senderId', 'fullName role');

    // Real-time broadcast to request room
    emitToRequest(id, 'new_message', populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (error) {
    next(error);
  }
};

