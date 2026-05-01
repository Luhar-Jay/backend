import express from 'express';
import { authenticateMiddleware } from '../middleware/authenticate.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import {
  createLead,
  deleteLead,
  getLeadById,
  getLeads,
  revenueForecast,
  updateLead,
  updateLeadStage,
} from '../controllers/lead.controller.js';

const router = express.Router();

router.post('/', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), createLead);
router.get('/', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), getLeads);
// /forecast must be before /:id to avoid being matched as an id
router.get('/forecast', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), revenueForecast);
router.get('/:id', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), getLeadById);
router.put('/:id', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), updateLead);
router.patch('/:id/stage', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), updateLeadStage);
router.delete('/:id', authenticateMiddleware, authorize('admin', 'hr', 'super-admin'), deleteLead);

export default router;
