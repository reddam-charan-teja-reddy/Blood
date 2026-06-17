import { Router } from 'express';
import {
  getStats,
  getStatsHistory,
  getPendingOrgs,
  verifyOrg,
  rejectOrg,
  getUsers,
  getUserById,
  suspendUser,
  unsuspendUser,
  clearNoShows,
  getPendingProofs,
  approveProof,
  rejectProof,
  getFlaggedRequests,
  clearFlags,
  cancelFlaggedRequest,
} from '../controllers/admin.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole('ADMIN'));

// Stats Overview
router.get('/stats', getStats);
router.get('/stats/history', getStatsHistory);

// Org Verification
router.get('/orgs/pending', getPendingOrgs);
router.put('/orgs/:id/verify', verifyOrg);
router.put('/orgs/:id/reject', rejectOrg);

// User Management
router.get('/users', getUsers);
router.put('/users/:id/suspend', suspendUser);
router.put('/users/:id/unsuspend', unsuspendUser);
router.put('/users/:id/clear-noshows', clearNoShows);

// Blood Group Proof Review
router.get('/proofs/pending', getPendingProofs);
router.put('/proofs/:userId/approve', approveProof);
router.put('/proofs/:userId/reject', rejectProof);

// Flagged Requests & Moderation
router.get('/flags', getFlaggedRequests);
router.put('/flags/:requestId/clear', clearFlags);
router.put('/flags/:requestId/cancel', cancelFlaggedRequest);

// Parameterized detail routes (must be at the bottom to avoid clashing)
router.get('/:id', getUserById);

export default router;
