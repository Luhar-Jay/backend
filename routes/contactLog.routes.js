import express from 'express';
import { authenticateMiddleware } from '../middleware/authenticate.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import {
  createContactLog,
  deleteContactLog,
  getContactLogs,
} from '../controllers/contactLog.controller.js';

const router = express.Router();

router.post('/', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), createContactLog);
router.get('/', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), getContactLogs);
router.delete('/:id', authenticateMiddleware, authorize('admin', 'hr', 'super-admin'), deleteContactLog);

export default router;
