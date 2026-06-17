import app from './src/app.js';
import { COMPATIBILITY, compatibleDonorGroups, compatibleRecipientGroups } from './src/utils/bloodCompat.js';
import { computeEligibility } from './src/services/eligibility.service.js';

console.log('🧪 Starting compile-time and module verification tests...');

try {
  // Test 1: Blood compatibility calculations
  console.log('  Testing blood compatibility engine...');
  const oNegDonors = compatibleDonorGroups('O-');
  if (oNegDonors.length !== 1 || oNegDonors[0] !== 'O-') {
    throw new Error(`O- recipient should only match O- donor, got: ${oNegDonors}`);
  }
  
  const abPosDonors = compatibleDonorGroups('AB+');
  if (abPosDonors.length !== 8) {
    throw new Error(`AB+ recipient should accept all 8 donor groups, got: ${abPosDonors.length}`);
  }

  const oNegRecipientGroups = compatibleRecipientGroups('O-');
  if (oNegRecipientGroups.length !== 8) {
    throw new Error(`O- donor should be compatible with all 8 recipient groups, got: ${oNegRecipientGroups.length}`);
  }
  console.log('  ✅ Blood compatibility engine passed.');

  // Test 2: Eligibility computation logic
  console.log('  Testing donor eligibility rules...');
  const dummyProfile = {
    bloodGroupVerified: true,
    weightKg: 70,
    tempDeferralUntil: null,
    lastWholeBloodDonation: null,
  };
  
  const initialCheck = computeEligibility(dummyProfile, 'WHOLE_BLOOD');
  if (!initialCheck.eligible) {
    throw new Error(`Initial eligibility check failed: ${initialCheck.reason}`);
  }

  // Underweight check
  const underweightProfile = { ...dummyProfile, weightKg: 40 };
  const underweightCheck = computeEligibility(underweightProfile, 'WHOLE_BLOOD');
  if (underweightCheck.eligible || underweightCheck.reason !== 'WEIGHT_BELOW_MIN') {
    throw new Error(`Weight gate failed: ${JSON.stringify(underweightCheck)}`);
  }

  // Rest period check
  const recentDonationProfile = {
    ...dummyProfile,
    lastWholeBloodDonation: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
  };
  const recentDonationCheck = computeEligibility(recentDonationProfile, 'WHOLE_BLOOD');
  if (recentDonationCheck.eligible || recentDonationCheck.reason !== 'REST_PERIOD') {
    throw new Error(`Rest period gate failed: ${JSON.stringify(recentDonationCheck)}`);
  }
  console.log('  ✅ Donor eligibility service passed.');

  // Test 3: Express router route checking
  console.log('  Testing route definitions in Express app...');
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) { // routes registered directly on the app
      routes.push(middleware.route);
    } else if (middleware.name === 'router') { // router middleware
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push(handler.route);
        }
      });
    }
  });

  console.log(`  Loaded App with ${routes.length} direct endpoints.`);
  console.log('  ✅ Route definition check passed.');

  console.log('\n========================================');
  console.log('🎉 All compile-time and unit service tests PASSED!');
  console.log('========================================\n');
  process.exit(0);
} catch (error) {
  console.error('❌ Verification test failed:', error);
  process.exit(1);
}
