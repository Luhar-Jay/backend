import express from 'express';
import {
  createUserByAdmin,
  deleteUser,
  getAllUsers,
  getTeamBirthdays,
  getSessionUser,
  getUser,
  googleAuthCallback,
  googleAuthStart,
  loginUser,
  logoutUser,
  registerUser,
  updateUser,
  refreshToken,
  verifyUserEmail,
  testMail,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js';
import { authenticateMiddleware } from '../middleware/authenticate.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { uploadImage } from '../middleware/multer.middleare.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  AdminCreateUserBodySchema,
  LoginBodySchema,
  RegisterBodySchema,
  UpdateUserBodySchema,
  UserIdParamSchema,
} from '../validation/auth.validation.js';
import { authLimiter, refreshLimiter } from '../utils/rateLimit.js';

const router = express.Router();

router.post('/register', authLimiter, validate({ body: RegisterBodySchema }), registerUser);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);
// Dev-only: POST /auth/test-mail?to=you@example.com  — tests SMTP config
router.post('/test-mail', testMail);
router.post('/login', authLimiter, validate({ body: LoginBodySchema }), loginUser);
router.get('/google', authLimiter, googleAuthStart);
router.get('/google/callback', authLimiter, googleAuthCallback);
router.get('/verify-email', verifyUserEmail);
router.post('/logout', authenticateMiddleware, logoutUser);
router.post('/refresh-token', refreshLimiter, refreshToken);
router.get('/me', authenticateMiddleware, getSessionUser);

router.post(
  '/create-user',
  authenticateMiddleware,
  authorize('super-admin', 'admin'),
  validate({ body: AdminCreateUserBodySchema }),
  createUserByAdmin
);

router.get('/team/birthdays', authenticateMiddleware, getTeamBirthdays);
router.get('/', authenticateMiddleware, authorize('super-admin', 'admin', 'hr'), getAllUsers);
router.get('/:id', authenticateMiddleware, validate({ params: UserIdParamSchema }), getUser);
router.put('/:id', authenticateMiddleware, uploadImage.single('profileImage'), validate({ params: UserIdParamSchema, body: UpdateUserBodySchema }), updateUser);
router.delete('/:id', authenticateMiddleware, authorize('admin'), validate({ params: UserIdParamSchema }), deleteUser);

export default router;
