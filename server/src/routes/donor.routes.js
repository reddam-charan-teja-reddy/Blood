import { Router } from 'express';
import {
  searchDonors,
  getOwnProfile,
  updateOwnProfile,
  toggleAvailability,
  getEligibility,
} from '../controllers/donor.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.use(requireAuth);

router.get('/', searchDonors);
router.get('/profile', requireRole('INDIVIDUAL'), getOwnProfile);
router.put('/profile', requireRole('INDIVIDUAL'), updateOwnProfile);
router.put('/availability', requireRole('INDIVIDUAL'), toggleAvailability);
router.get('/eligibility', requireRole('INDIVIDUAL'), getEligibility);

export default router;
