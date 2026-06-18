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
  requestDonor,
  reserveRequest,
  revealContact,
  confirmReveal,
  reportOutcome,
  flagRequest,
  getChatMessages,
  sendChatMessage,
} from '../controllers/request.controller.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { requireRole, requireDonorActivated, requireNotOwnRequest } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { CreateRequestSchema } from '../utils/validation.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

// Public routes
router.get('/r/:token', getRequestByShareToken);
router.get('/:id', optionalAuth, getRequestById);

// Protected routes (require registration/login)
router.use(requireAuth);

router.get('/', getRequests);
router.post(
  '/',
  upload.single('document'),
  (req, res, next) => {
    if (!req.file) {
      return res.status(422).json({
        error: 'Validation failed',
        details: { document: ['Medical proof document is mandatory for request creation'] },
      });
    }
    if (req.body.unitsNeeded) {
      req.body.unitsNeeded = parseInt(req.body.unitsNeeded, 10);
    }
    next();
  },
  validate(CreateRequestSchema),
  createRequest
);
router.put('/:id', updateRequest);
router.delete('/:id', deleteRequest);
router.post('/:id/fulfil', fulfilRequest);
router.post('/:id/extend', extendRequest);

// Interest sub-resource
router.post('/:id/interest', requireRole('INDIVIDUAL'), requireDonorActivated, requireNotOwnRequest, expressInterest);
router.post('/:id/reserve', requireRole('INDIVIDUAL'), requireDonorActivated, requireNotOwnRequest, reserveRequest);
router.post('/:id/request-donor/:donorUserId', requestDonor);
router.put('/:id/interest/:interestId', updateInterestSlot);
router.post('/:id/interest/:interestId/reveal', revealContact);
router.post('/:id/interest/:interestId/reveal/confirm', confirmReveal);
router.post('/:id/interest/:interestId/outcome', reportOutcome);
router.post('/:id/flag', flagRequest);

// Chat sub-resource
router.get('/:id/chat', getChatMessages);
router.post('/:id/chat', sendChatMessage);

export default router;
