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
  getDisputes,
  resolveDispute,
  getAllRequests,
  getRequestByIdAdmin,
  updateModerationScope,
  getAuditLogs,
} from '../controllers/admin.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole('ADMIN'));

// Moderation Scope configuration
router.put('/moderation-scope', updateModerationScope);

// Audit Logs
router.get('/audit-logs', getAuditLogs);

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

// Disputes & Oversight Requests
router.get('/disputes', getDisputes);
router.put('/disputes/:disputeId/resolve', resolveDispute);

// All Requests (with filter + pagination) + individual request detail
router.get('/requests', getAllRequests);
router.get('/requests/:requestId', getRequestByIdAdmin);

// Parameterized user detail (must be at the bottom to avoid clashing with /requests/:id)
router.get('/users/:id', getUserById);

export default router;
