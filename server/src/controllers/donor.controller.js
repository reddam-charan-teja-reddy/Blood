import { DonorProfile } from '../models/DonorProfile.js';
import { BloodRequest } from '../models/BloodRequest.js';
import { DonorInterest } from '../models/DonorInterest.js';
import { Dispute } from '../models/Dispute.js';
import { computeEligibility } from '../services/eligibility.service.js';
import { compatibleDonorGroups } from '../utils/bloodCompat.js';

export const searchDonors = async (req, res, next) => {
  try {
    const { bloodGroup, city, available } = req.query;

    const query = {
      bloodGroupVerified: true,
    };

    if (available === 'true') query.available = true;

    // Admin can search anything
    if (req.user.role !== 'ADMIN') {
      // Find active requests by this user to restrict city
      const activeRequests = await BloodRequest.find({
        requesterId: req.user.id,
        status: { $in: ['ACTIVE', 'PARTIALLY_FULFILLED'] },
        expiresAt: { $gt: new Date() },
      });

      if (activeRequests.length === 0) {
        return res.json({
          donors: [],
          message: 'Post an active blood request first to find matching donors nearby.',
        });
      }

      // Collect request cities and compatibility groups
      const allowedCities = activeRequests.map((req) => req.hospitalCity.toLowerCase());
      
      const compatGroups = new Set();
      activeRequests.forEach(r => {
        compatibleDonorGroups(r.bloodGroup).forEach(g => compatGroups.add(g));
      });

      if (bloodGroup) {
        if (!compatGroups.has(bloodGroup)) {
          return res.json({ donors: [], count: 0 });
        }
        query.bloodGroup = bloodGroup;
      } else {
        query.bloodGroup = { $in: Array.from(compatGroups) };
      }

      if (city) {
        if (!allowedCities.includes(city.toLowerCase())) {
          return res.status(403).json({
            error: 'Access denied',
            hint: 'You can only search for donors in cities where you have active blood requests.',
          });
        }
        query.city = { $regex: `^${city}$`, $options: 'i' };
      } else {
        // Default search to the cities of active requests
        query.city = { $in: allowedCities.map(c => new RegExp(`^${c}$`, 'i')) };
      }
    } else {
      // Admin is searching
      if (bloodGroup) query.bloodGroup = bloodGroup;
      if (city) query.city = { $regex: `^${city}$`, $options: 'i' };
    }

    const donors = await DonorProfile.find(query)
      .populate('userId', 'fullName phone')
      .limit(50)
      .lean();

    // Filter by eligibility for non-admin search
    let filteredDonors = donors;
    if (req.user.role !== 'ADMIN') {
      const activeRequests = await BloodRequest.find({
        requesterId: req.user.id,
        status: { $in: ['ACTIVE', 'PARTIALLY_FULFILLED'] },
        expiresAt: { $gt: new Date() },
      });

      const activeRequestIds = activeRequests.map(r => r._id);
      const donorUserIds = donors.map(d => d.userId?._id || d.userId);
      const existingInterests = await DonorInterest.find({
        requestId: { $in: activeRequestIds },
        donorId: { $in: donorUserIds }
      });
      const requestedDonorIds = new Set(existingInterests.map(i => i.donorId.toString()));

      filteredDonors = donors
        .filter(donor => {
          return activeRequests.some(r => {
            const compatDonors = compatibleDonorGroups(r.bloodGroup);
            if (!compatDonors.includes(donor.bloodGroup)) return false;

            const eligibility = computeEligibility(donor, r.component);
            return eligibility.eligible;
          });
        })
        .map(donor => {
          const donorUserId = donor.userId?._id || donor.userId;
          return {
            ...donor,
            contactRequested: requestedDonorIds.has(donorUserId.toString())
          };
        });
    }

    res.json({ donors: filteredDonors, count: filteredDonors.length });
  } catch (error) {
    next(error);
  }
};

export const getOwnProfile = async (req, res, next) => {
  try {
    const profile = await DonorProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }
    res.json(profile);
  } catch (error) {
    next(error);
  }
};

export const updateOwnProfile = async (req, res, next) => {
  try {
    const profile = await DonorProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    const {
      bloodGroup,
      weightKg,
      city,
      state,
      pincode,
      notificationRadiusKm,
      notifSmsEmergency,
      quietHoursStart,
      quietHoursEnd,
      plateletEligible,
      // GeoJSON location from browser navigator.geolocation
      latitude,
      longitude,
    } = req.body;

    if (bloodGroup && bloodGroup !== profile.bloodGroup) {
      if (profile.bloodGroupVerified) {
        /**
         * Once a blood group has been admin-verified, it becomes immutable
         * via the user's own profile update.  This prevents a donor from
         * switching to a different blood group after approval to game the
         * matching system.  Only an Admin action (rejectProof + re-upload) can
         * change a verified blood group.
         */
        return res.status(403).json({
          error: 'Blood group cannot be changed after it has been verified by an admin.',
          hint: 'If your blood group was incorrectly recorded, contact support.',
        });
      } else if (profile.bloodGroup) {
        // Not yet verified — changing blood group: require new document proof
        if (!req.file) {
          return res.status(400).json({ error: 'Uploading a blood proof document is required to change your blood group.' });
        }
        profile.bloodGroup = bloodGroup;
        profile.bloodGroupVerified = false;
      } else {
        // Setting blood group for the first time
        profile.bloodGroup = bloodGroup;
        profile.bloodGroupVerified = false;
      }
    }

    // Only reset verification if a NEW document is being uploaded.
    // Previously this also reset on any profile update that included a file.
    if (req.file) {
      profile.documentPath = `/uploads/${req.file.filename}`;
      // Reset only if the blood group changed or no document existed before
      if (!profile.bloodGroup || bloodGroup) {
        profile.bloodGroupVerified = false;
      }
    }

    if (weightKg !== undefined) profile.weightKg = parseFloat(weightKg) || undefined;
    if (city !== undefined) profile.city = city;
    if (state !== undefined) profile.state = state;
    if (pincode !== undefined) profile.pincode = pincode;
    if (notificationRadiusKm !== undefined) profile.notificationRadiusKm = parseInt(notificationRadiusKm, 10) || 25;
    if (notifSmsEmergency !== undefined) profile.notifSmsEmergency = notifSmsEmergency === 'true' || notifSmsEmergency === true;
    if (quietHoursStart !== undefined) profile.quietHoursStart = quietHoursStart;
    if (quietHoursEnd !== undefined) profile.quietHoursEnd = quietHoursEnd;
    if (plateletEligible !== undefined) profile.plateletEligible = plateletEligible === 'true' || plateletEligible === true;

    // Update GeoJSON location if browser coordinates provided
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      profile.location = { type: 'Point', coordinates: [lng, lat] }; // GeoJSON: [lng, lat]
    }

    await profile.save();
    res.json(profile);
  } catch (error) {
    next(error);
  }
};



export const toggleAvailability = async (req, res, next) => {
  try {
    const { available } = req.body;

    const profile = await DonorProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    if (available === true) {
      // Perform eligibility check for WHOLE_BLOOD as default availability check
      const eligibility = computeEligibility(profile, 'WHOLE_BLOOD');
      if (!eligibility.eligible) {
        return res.status(403).json({
          error: 'Ineligible to toggle availability',
          reason: eligibility.reason,
          unblockDate: eligibility.unblockDate,
          daysRemaining: eligibility.daysRemaining,
        });
      }
    }

    profile.available = available;
    await profile.save();

    res.json({ available: profile.available });
  } catch (error) {
    next(error);
  }
};

export const getEligibility = async (req, res, next) => {
  try {
    const profile = await DonorProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    const components = ['WHOLE_BLOOD', 'PLATELETS', 'PLASMA', 'RBC'];
    const eligibilityResults = {};

    components.forEach((comp) => {
      eligibilityResults[comp] = computeEligibility(profile, comp);
    });

    res.json(eligibilityResults);
  } catch (error) {
    next(error);
  }
};

export const fileDispute = async (req, res, next) => {
  try {
    const { interestId } = req.params;
    const { reason, evidence } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason for dispute is required' });
    }

    const interest = await DonorInterest.findById(interestId);
    if (!interest) {
      return res.status(404).json({ error: 'Donation interest slot not found' });
    }

    if (interest.donorId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to dispute this donation interest slot' });
    }

    if (interest.status !== 'NO_SHOW') {
      return res.status(400).json({ error: 'You can only dispute donation slots marked as NO_SHOW' });
    }

    const existingDispute = await Dispute.findOne({ interestId });
    if (existingDispute) {
      return res.status(400).json({ error: 'You have already filed a dispute for this donation slot' });
    }

    const dispute = await Dispute.create({
      interestId,
      filedById: req.user.id,
      reason: reason.trim(),
      evidence: evidence ? evidence.trim() : undefined,
    });

    res.status(201).json(dispute);
  } catch (error) {
    next(error);
  }
};

