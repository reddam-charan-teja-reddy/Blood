import { Router } from 'express';
import { getDashboard, updateInventory, getRequests } from '../controllers/org.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole('ORG'));

router.get('/dashboard', getDashboard);
router.put('/inventory', updateInventory);
router.get('/requests', getRequests);

export default router;
