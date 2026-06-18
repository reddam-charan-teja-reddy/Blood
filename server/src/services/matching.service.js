import { DonorProfile } from '../models/DonorProfile.js';
import { OrgProfile } from '../models/OrgProfile.js';
import { compatibleDonorGroups } from '../utils/bloodCompat.js';
import { computeEligibility } from './eligibility.service.js';

/**
 * Finds eligible matching donors for a given blood request.
 *
 * Matching strategy (geospatial-first, city-string fallback):
 *
 *  1. If the blood request has `hospitalLocation` (GeoJSON Point), use `$near`
 *     to find donors within their own `notificationRadiusKm` from the hospital.
 *     This is the accurate real-world matching: a donor who set 10 km radius
 *     only gets matched if the hospital is within 10 km.
 *
 *  2. If no `hospitalLocation` (legacy data or user denied geolocation permission),
 *     fall back to case-insensitive city string match — same as before migration.
 *
 * After the DB query, eligibility is re-validated in JavaScript because
 * donor rest period dates cannot be expressed in a single MongoDB operator.
 */
export const findMatchingDonors = async (bloodRequest) => {
  try {
    const donorGroups = compatibleDonorGroups(bloodRequest.bloodGroup);

    let potentialDonors;

    const hasHospitalLocation =
      bloodRequest.hospitalLocation &&
      Array.isArray(bloodRequest.hospitalLocation.coordinates) &&
      bloodRequest.hospitalLocation.coordinates.length === 2;

    if (hasHospitalLocation) {
      // ── Geospatial path ───────────────────────────────────────────────────
      // $geoWithin + $centerSphere allows variable radius per donor.
      // But each donor has a DIFFERENT radius preference, so we cannot do this
      // in a single $geoWithin query per donor.
      //
      // Approach: use $near with a generous outer radius (MAX_SEARCH_RADIUS_KM)
      // to fetch candidates, then JS-filter by each donor's own notificationRadiusKm.
      // This is optimal for the typical use case where most donors are within
      // a city (< 50 km). For very sparse rural areas, the outer cap keeps
      // the result set manageable.
      //
      // GeoJSON $near requires: { $geometry: Point, $maxDistance: metres }
      const MAX_SEARCH_RADIUS_KM = 100; // outer cap for the initial DB query

      potentialDonors = await DonorProfile.find({
        bloodGroup: { $in: donorGroups },
        available: true,
        bloodGroupVerified: true,
        userId: { $ne: bloodRequest.requesterId },
        location: {
          $near: {
            $geometry: bloodRequest.hospitalLocation,
            $maxDistance: MAX_SEARCH_RADIUS_KM * 1000, // metres
          },
        },
      }).populate('userId', 'fullName phone');

      // JS-filter: keep only donors whose personal radius covers this hospital
      const [hosLng, hosLat] = bloodRequest.hospitalLocation.coordinates;
      potentialDonors = potentialDonors.filter((donor) => {
        if (!donor.location?.coordinates?.length) return false;
        const [donorLng, donorLat] = donor.location.coordinates;
        const distKm = haversineKm(hosLat, hosLng, donorLat, donorLng);
        return distKm <= (donor.notificationRadiusKm || 25);
      });
    } else {
      // ── City-string fallback ───────────────────────────────────────────────
      // Used when either:
      //   a) The blood request was created before GeoJSON migration, OR
      //   b) The requester denied geolocation permission in the browser.
      potentialDonors = await DonorProfile.find({
        bloodGroup: { $in: donorGroups },
        available: true,
        bloodGroupVerified: true,
        city: { $regex: `^${escapeRegex(bloodRequest.hospitalCity)}$`, $options: 'i' },
        userId: { $ne: bloodRequest.requesterId },
      }).populate('userId', 'fullName phone');
    }

    // Filter by actual eligibility (rest period check)
    const matchedDonors = potentialDonors.filter((profile) => {
      const eligibility = computeEligibility(profile, bloodRequest.component);
      return eligibility.eligible;
    });

    return matchedDonors;
  } catch (error) {
    console.error('[matching.service] findMatchingDonors error:', error);
    throw error;
  }
};

/**
 * Finds verified organisations near a blood request that have the requested
 * blood group in stock. Used to fan-out notifications to blood banks / hospitals.
 *
 * @param {Object} bloodRequest - BloodRequest document
 * @returns {OrgProfile[]} Array of matching org profiles
 */
export const findMatchingOrgs = async (bloodRequest) => {
  try {
    const inventoryField = `inventory.${bloodRequest.bloodGroup}`;

    const hasHospitalLocation =
      bloodRequest.hospitalLocation &&
      Array.isArray(bloodRequest.hospitalLocation.coordinates) &&
      bloodRequest.hospitalLocation.coordinates.length === 2;

    let query = {
      verificationStatus: 'VERIFIED',
      [inventoryField]: { $gt: 0 }, // org has stock of this blood group
    };

    if (hasHospitalLocation) {
      // Find orgs within their own serviceRadiusKm of the hospital
      const MAX_ORG_SEARCH_KM = 150;
      const orgs = await OrgProfile.find({
        ...query,
        location: {
          $near: {
            $geometry: bloodRequest.hospitalLocation,
            $maxDistance: MAX_ORG_SEARCH_KM * 1000,
          },
        },
      }).populate('userId', 'fullName phone');

      const [hosLng, hosLat] = bloodRequest.hospitalLocation.coordinates;
      return orgs.filter((org) => {
        if (!org.location?.coordinates?.length) return false;
        const [orgLng, orgLat] = org.location.coordinates;
        const distKm = haversineKm(hosLat, hosLng, orgLat, orgLng);
        return distKm <= (org.serviceRadiusKm || 50);
      });
    } else {
      // City-string fallback
      return await OrgProfile.find({
        ...query,
        city: { $regex: `^${escapeRegex(bloodRequest.hospitalCity)}$`, $options: 'i' },
      }).populate('userId', 'fullName phone');
    }
  } catch (error) {
    console.error('[matching.service] findMatchingOrgs error:', error);
    throw error;
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Haversine formula — great-circle distance between two lat/lng points.
 * Returns distance in kilometres.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's mean radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Escapes special regex characters in a string to prevent ReDoS.
 * Used before inserting user-supplied city names into $regex queries.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
