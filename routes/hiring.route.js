import express from 'express';
import { authenticateMiddleware } from '../middleware/authenticate.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { createHiring, deleteHiring, getAllHirings, getHiringById, updateHiring, updateStage, convertToUser } from '../controllers/hiring.controller.js';
import { upload } from '../middleware/multer.middleare.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  CreateHiringBodySchema,
  HiringIdParamSchema,
  HiringQuerySchema,
  UpdateHiringBodySchema,
} from '../validation/hiring.validation.js';

const router = express.Router();

router.post('/create', authenticateMiddleware, authorize('admin', 'hr', 'manager'), upload.single('resume'), validate({ body: CreateHiringBodySchema }), createHiring);
router.get('/', authenticateMiddleware, authorize('admin', 'hr', 'manager'), validate({ query: HiringQuerySchema }), getAllHirings);
router.get('/:id', authenticateMiddleware, authorize('admin', 'hr', 'manager'), validate({ params: HiringIdParamSchema }), getHiringById);
router.put('/update/:id', authenticateMiddleware, authorize('admin', 'hr', 'manager'), upload.single('resume'), validate({ params: HiringIdParamSchema, body: UpdateHiringBodySchema }), updateHiring);
router.delete('/:id', authenticateMiddleware, authorize('admin', 'hr'), validate({ params: HiringIdParamSchema }), deleteHiring);
router.patch('/:id/stage', authenticateMiddleware, authorize('admin', 'hr', 'manager'), updateStage);
router.post('/:id/convert', authenticateMiddleware, authorize('admin', 'hr'), convertToUser);

export default router;
