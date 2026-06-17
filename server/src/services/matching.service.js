import { DonorProfile } from '../models/DonorProfile.js';
import { compatibleDonorGroups } from '../utils/bloodCompat.js';
import { computeEligibility } from './eligibility.service.js';

/**
 * Finds eligible matching donors for a given blood request.
 * Matches based on:
 * - Compatible blood group
 * - Same city (case-insensitive regex)
 * - Available = true
 * - Eligible to donate the specific component (checked using eligibility service)
 * - Not the requester themselves
 */
export const findMatchingDonors = async (bloodRequest) => {
  try {
    const donorGroups = compatibleDonorGroups(bloodRequest.bloodGroup);
    
    // Find active available donors in the city with compatible blood groups
    const potentialDonors = await DonorProfile.find({
      bloodGroup: { $in: donorGroups },
      available: true,
      city: { $regex: `^${bloodRequest.hospitalCity}$`, $options: 'i' },
      userId: { $ne: bloodRequest.requesterId }, // Exclude the requester
    }).populate('userId');

    // Filter by actual eligibility
    const matchedDonors = potentialDonors.filter((profile) => {
      const eligibility = computeEligibility(profile, bloodRequest.component);
      return eligibility.eligible;
    });

    return matchedDonors;
  } catch (error) {
    console.error('Error finding matching donors:', error);
    throw error;
  }
};
