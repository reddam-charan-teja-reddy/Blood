import { Router } from 'express';
import { register, login, logout, otpSend, otpVerify, refresh, me } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { RegisterSchema, LoginSchema } from '../utils/validation.js';

const router = Router();

router.post('/register', validate(RegisterSchema), register);
router.post('/login', validate(LoginSchema), login);
router.post('/logout', logout);
router.post('/otp/send', otpSend);
router.post('/otp/verify', otpVerify);
router.get('/me', requireAuth, me);
router.post('/refresh', refresh);

export default router;
