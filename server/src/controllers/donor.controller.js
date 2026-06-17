import { DonorProfile } from '../models/DonorProfile.js';
import { BloodRequest } from '../models/BloodRequest.js';
import { computeEligibility } from '../services/eligibility.service.js';

export const searchDonors = async (req, res, next) => {
  try {
    const { bloodGroup, city, available } = req.query;

    const query = {
      bloodGroupVerified: true,
    };

    if (bloodGroup) query.bloodGroup = bloodGroup;
    if (available === 'true') query.available = true;

    // Admin can search anything
    if (req.user.role !== 'ADMIN') {
      // Find active requests by this user to restrict city
      const activeRequests = await BloodRequest.find({
        requesterId: req.user.id,
        status: 'ACTIVE',
        expiresAt: { $gt: new Date() },
      });

      if (activeRequests.length === 0) {
        return res.json({
          donors: [],
          message: 'Post an active blood request first to find matching donors nearby.',
        });
      }

      // Collect request cities
      const allowedCities = activeRequests.map((req) => req.hospitalCity.toLowerCase());
      
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
      if (city) query.city = { $regex: `^${city}$`, $options: 'i' };
    }

    const donors = await DonorProfile.find(query)
      .populate('userId', 'fullName phone')
      .limit(50)
      .lean();

    res.json({ donors, count: donors.length });
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
    } = req.body;

    if (bloodGroup) {
      profile.bloodGroup = bloodGroup;
      // In MVP, self-declared blood group is auto-verified immediately
      profile.bloodGroupVerified = true;
    }

    if (weightKg !== undefined) profile.weightKg = weightKg;
    if (city !== undefined) profile.city = city;
    if (state !== undefined) profile.state = state;
    if (pincode !== undefined) profile.pincode = pincode;
    if (notificationRadiusKm !== undefined) profile.notificationRadiusKm = notificationRadiusKm;
    if (notifSmsEmergency !== undefined) profile.notifSmsEmergency = notifSmsEmergency;
    if (quietHoursStart !== undefined) profile.quietHoursStart = quietHoursStart;
    if (quietHoursEnd !== undefined) profile.quietHoursEnd = quietHoursEnd;
    if (plateletEligible !== undefined) profile.plateletEligible = plateletEligible;

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
