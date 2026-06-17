import { Router } from 'express';
import {
  getRequests,
  createRequest,
  getRequestById,
  getRequestByShareToken,
  updateRequest,
  deleteRequest,
  fulfilRequest,
  extendRequest,
  expressInterest,
  updateInterestSlot,
  revealContact,
  confirmReveal,
  reportOutcome,
  flagRequest,
} from '../controllers/request.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole, requireDonorActivated, requireNotOwnRequest } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { CreateRequestSchema } from '../utils/validation.js';

const router = Router();

// Public routes
router.get('/r/:token', getRequestByShareToken);

// Protected routes (require registration/login)
router.use(requireAuth);

router.get('/', getRequests);
router.post('/', validate(CreateRequestSchema), createRequest);
router.get('/:id', getRequestById);
router.put('/:id', updateRequest);
router.delete('/:id', deleteRequest);
router.post('/:id/fulfil', fulfilRequest);
router.post('/:id/extend', extendRequest);

// Interest sub-resource
router.post('/:id/interest', requireRole('INDIVIDUAL'), requireDonorActivated, requireNotOwnRequest, expressInterest);
router.put('/:id/interest/:interestId', updateInterestSlot);
router.post('/:id/interest/:interestId/reveal', revealContact);
router.post('/:id/interest/:interestId/reveal/confirm', confirmReveal);
router.post('/:id/interest/:interestId/outcome', reportOutcome);
router.post('/:id/flag', flagRequest);

export default router;
