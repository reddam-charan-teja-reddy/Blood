export const REST_PERIODS = {
  WHOLE_BLOOD: 56,  // days
  PLATELETS:    7,
  PLASMA:      28,
  RBC:         56,
};

export function computeEligibility(profile, component) {
  if (!profile.bloodGroupVerified) {
    return { eligible: false, reason: 'UNVERIFIED_BLOOD_GROUP' };
  }
  
  // Weight gate: only apply if weight is entered
  if (profile.weightKg != null && profile.weightKg < 45) {
    return { eligible: false, reason: 'WEIGHT_BELOW_MIN' };
  }
  
  if (profile.tempDeferralUntil && new Date() < new Date(profile.tempDeferralUntil)) {
    return { eligible: false, reason: 'TEMP_DEFERRAL', unblockDate: profile.tempDeferralUntil };
  }
  
  if (component === 'PLATELETS' && !profile.plateletEligible) {
    return { eligible: false, reason: 'NOT_OPT_IN' };
  }

  const lastDonation = getLastDonationDate(profile, component);
  if (lastDonation) {
    const daysSince = Math.floor((Date.now() - new Date(lastDonation).getTime()) / 86_400_000);
    const restPeriod = REST_PERIODS[component] ?? 56;
    if (daysSince < restPeriod) {
      const unblockDate = new Date(new Date(lastDonation).getTime() + restPeriod * 86_400_000);
      return { 
        eligible: false, 
        reason: 'REST_PERIOD', 
        unblockDate, 
        daysRemaining: restPeriod - daysSince 
      };
    }
  }

  return { eligible: true };
}

function getLastDonationDate(profile, component) {
  const map = {
    WHOLE_BLOOD: profile.lastWholeBloodDonation,
    PLATELETS:   profile.lastPlateletDonation,
    PLASMA:      profile.lastPlasmaDonation,
    RBC:         profile.lastWholeBloodDonation,
  };
  return map[component] ?? null;
}
