import { Router } from 'express';
import {
  searchDonors,
  getOwnProfile,
  updateOwnProfile,
  toggleAvailability,
  getEligibility,
  fileDispute,
  fileRestrictionChallenge,
} from '../controllers/donor.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

router.use(requireAuth);

router.get('/', searchDonors);
router.get('/profile', requireRole('INDIVIDUAL'), getOwnProfile);
router.put('/profile', requireRole('INDIVIDUAL'), upload.single('document'), updateOwnProfile);
router.put('/availability', requireRole('INDIVIDUAL'), toggleAvailability);
router.get('/eligibility', requireRole('INDIVIDUAL'), getEligibility);
router.post('/interests/:interestId/dispute', requireRole('INDIVIDUAL'), fileDispute);
router.post('/restriction-challenge', fileRestrictionChallenge);

export default router;
