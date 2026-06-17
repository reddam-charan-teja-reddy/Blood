export const REST_PERIODS = {
  WHOLE_BLOOD: 56,  // days
  PLATELETS:    7,
  PLASMA:      28,
  RBC:         56,
};

export const COMPONENT_LABELS = {
  WHOLE_BLOOD: 'Whole Blood',
  PLATELETS: 'Platelets',
  PLASMA: 'Plasma',
  RBC: 'Double Red Blood Cells (RBC)',
};

export function computeEligibility(profile, component) {
  if (!profile || !profile.bloodGroupVerified) {
    return { eligible: false, reason: 'UNVERIFIED_BLOOD_GROUP', message: 'Blood group must be verified to donate.' };
  }
  
  if (profile.weightKg != null && profile.weightKg < 45) {
    return { eligible: false, reason: 'WEIGHT_BELOW_MIN', message: 'Weight is below the minimum required (45 kg).' };
  }
  
  if (profile.tempDeferralUntil && new Date() < new Date(profile.tempDeferralUntil)) {
    const dateStr = new Date(profile.tempDeferralUntil).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    return { 
      eligible: false, 
      reason: 'TEMP_DEFERRAL', 
      unblockDate: profile.tempDeferralUntil,
      message: `Temporarily deferred until ${dateStr}. Reason: ${profile.tempDeferralReason || 'None'}` 
    };
  }
  
  if (component === 'PLATELETS' && !profile.plateletEligible) {
    return { eligible: false, reason: 'NOT_OPT_IN', message: 'You must opt-in for platelet donations in your profile settings.' };
  }

  const lastDonation = getLastDonationDate(profile, component);
  if (lastDonation) {
    const daysSince = Math.floor((Date.now() - new Date(lastDonation).getTime()) / 86400000);
    const restPeriod = REST_PERIODS[component] ?? 56;
    if (daysSince < restPeriod) {
      const unblockDate = new Date(new Date(lastDonation).getTime() + restPeriod * 86400000);
      const dateStr = unblockDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      return { 
        eligible: false, 
        reason: 'REST_PERIOD', 
        unblockDate, 
        daysRemaining: restPeriod - daysSince,
        message: `Rest period in progress. Next eligible on ${dateStr} (${restPeriod - daysSince} days remaining).`
      };
    }
  }

  return { eligible: true, message: 'You are eligible to donate!' };
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
