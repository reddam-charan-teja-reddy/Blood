import { Router } from 'express';
import {
  getDashboard,
  updateInventory,
  getInventoryLogs,
  getOwnRequests,
  getSupplyFeed,
  supplyBlood,
  updateOwnProfile,
} from '../controllers/org.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole('ORG'));

// Dashboard & stats
router.get('/dashboard', getDashboard);

// Inventory management
router.put('/inventory', updateInventory);
router.get('/inventory/logs', getInventoryLogs);

// Own requests (requests posted BY this org)
router.get('/requests', getOwnRequests);

// Supply feed — public requests matching org inventory in org's area
router.get('/feed', getSupplyFeed);

// Supply action — org offers to supply blood for a patient request
router.post('/supply/:requestId', supplyBlood);

// Profile update (org details + document upload)
router.put('/profile', upload.single('document'), updateOwnProfile);

export default router;
