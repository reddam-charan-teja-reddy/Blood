import crypto from 'crypto';
import { BloodRequest } from '../models/BloodRequest.js';
import { DonorInterest } from '../models/DonorInterest.js';
import { DonorProfile } from '../models/DonorProfile.js';
import { User } from '../models/User.js';
import { compatibleRecipientGroups } from '../utils/bloodCompat.js';
import { sendOTP, verifyOTP } from '../services/otp.service.js';

export const getRequests = async (req, res, next) => {
  try {
    const { bloodGroup, urgency, component, city, sortBy, compatibleOnly } = req.query;

    const filter = {
      status: 'ACTIVE',
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
    if (city) filter.hospitalCity = { $regex: `^${city}$`, $options: 'i' };

    const sortMap = {
      urgency: { urgency: 1, createdAt: -1 }, // E < H < N
      newest: { createdAt: -1 },
      expiringSoon: { expiresAt: 1 },
    };
    const sort = sortMap[sortBy] ?? sortMap.urgency;

    const requests = await BloodRequest.find(filter)
      .populate('requesterId', 'fullName role')
      .sort(sort)
      .limit(50)
      .lean();

    res.json({ requests, count: requests.length });
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
    } = req.body;

    // Abuse Check: max 2 active requests per user
    const activeRequests = await BloodRequest.countDocuments({
      requesterId: req.user.id,
      status: 'ACTIVE',
      expiresAt: { $gt: new Date() },
    });

    if (activeRequests >= 2) {
      return res.status(403).json({
        error: 'Abuse check failed',
        hint: 'You have reached the maximum of 2 active requests. Close or cancel existing requests first.',
      });
    }

    // Set expiry
    const expiresAt = new Date(requiredBy);

    const shareToken = crypto.randomBytes(16).toString('hex');

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
      wardNumber,
      attendingDoctor,
      guardianPhoneOverride,
      expiresAt,
      shareToken,
    });

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

    // If owner or admin, fetch donor interests
    let interests = [];
    if (isOwner || isAdmin) {
      interests = await DonorInterest.find({ requestId: id }).populate('donorId', 'fullName phone');
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

    if (request.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Request is no longer active and cannot be updated' });
    }

    const updates = req.body;
    // Do not allow updating status directly here
    delete updates.status;
    delete updates.requesterId;
    delete updates.requesterType;

    Object.assign(request, updates);
    await request.save();

    res.json(request);
  } catch (error) {
    next(error);
  }
};

export const deleteRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
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
    await request.save();

    // Cancel all pending interests
    await DonorInterest.updateMany(
      { requestId: id, status: { $in: ['INTERESTED', 'REVEAL_PENDING'] } },
      { status: 'WITHDRAWN' }
    );

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

    if (request.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only active requests can be extended' });
    }

    // Set extension max 24h
    request.expiresAt = new Date(request.expiresAt.getTime() + 24 * 60 * 60 * 1000);
    request.requiredBy = new Date(request.requiredBy.getTime() + 24 * 60 * 60 * 1000);
    await request.save();

    res.json({ success: true, message: 'Request extended by 24 hours', request });
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

    if (request.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Request is no longer active' });
    }

    // Check duplicate interest
    const existingInterest = await DonorInterest.findOne({ requestId: id, donorId: req.user.id });
    if (existingInterest) {
      return res.status(400).json({ error: 'You have already expressed interest in this request' });
    }

    const interest = await DonorInterest.create({
      requestId: id,
      donorId: req.user.id,
      status: 'INTERESTED',
      eta: eta ? new Date(eta) : undefined,
    });

    res.status(201).json(interest);
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
    const request = await BloodRequest.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const isOwner = request.requesterId.toString() === req.user.id;
    const isOrg = req.user.role === 'ORG';

    if (!isOwner && !isOrg) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const interest = await DonorInterest.findById(interestId).populate('donorId');
    if (!interest) {
      return res.status(404).json({ error: 'Donor interest record not found' });
    }

    if (interest.status !== 'INTERESTED') {
      return res.status(400).json({ error: 'Contact reveal can only be initiated on INTERESTED state' });
    }

    interest.status = 'REVEAL_PENDING';
    await interest.save();

    // Trigger OTP sending to donor's phone
    sendOTP(interest.donorId.phone, 'CONTACT_REVEAL');

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
    const verification = verifyOTP(interest.donorId.phone, otp, 'CONTACT_REVEAL');
    if (!verification.valid) {
      return res.status(400).json({ error: verification.reason || 'Invalid OTP' });
    }

    interest.status = 'CONTACT_REVEALED';
    interest.contactRevealedAt = new Date();
    await interest.save();

    // Also update request units confirmed (for MVP, let's treat contact reveal as a soft confirmation)
    const request = await BloodRequest.findById(interest.requestId).populate('requesterId');
    if (request) {
      request.unitsConfirmed = (request.unitsConfirmed || 0) + 1;
      if (request.unitsConfirmed >= request.unitsNeeded) {
        request.status = 'PARTIALLY_FULFILLED';
      }
      await request.save();
    }

    // Return contacts of both sides
    const patientPhone = request.guardianPhoneOverride || request.requesterId.phone;
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

    const request = await BloodRequest.findById(interest.requestId);
    if (!request) {
      return res.status(404).json({ error: 'Associated request not found' });
    }

    const isDonor = interest.donorId.toString() === req.user.id;
    const isRequester = request.requesterId.toString() === req.user.id;

    if (!isDonor && !isRequester) {
      return res.status(403).json({ error: 'Unauthorized to report outcome' });
    }

    interest.status = outcome;
    interest.outcomeReportedAt = new Date();
    interest.outcomeReason = outcomeReason;
    await interest.save();

    // Reputation update on donor profile
    const donorProfile = await DonorProfile.findOne({ userId: interest.donorId });
    if (donorProfile) {
      if (outcome === 'DONATED') {
        donorProfile.totalDonations += 1;
        // Update last donation date based on request component
        if (request.component === 'PLATELETS') {
          donorProfile.lastPlateletDonation = new Date();
        } else if (request.component === 'PLASMA') {
          donorProfile.lastPlasmaDonation = new Date();
        } else {
          donorProfile.lastWholeBloodDonation = new Date();
        }
      } else if (outcome === 'NO_SHOW') {
        donorProfile.noShowCount += 1;
      }
      await donorProfile.save();
    }

    res.json({ success: true, message: 'Outcome reported successfully', interest });
  } catch (error) {
    next(error);
  }
};

export const flagRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const request = await BloodRequest.findById(id);

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    request.flagCount = (request.flagCount || 0) + 1;
    if (request.flagCount >= 5) {
      request.isFlagged = true;
    }
    await request.save();

    res.json({ success: true, message: 'Request flagged successfully' });
  } catch (error) {
    next(error);
  }
};
