import express from 'express';
import { authenticateMiddleware } from '../middleware/authenticate.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import {
  createClient,
  deleteClient,
  getClientById,
  getClients,
  updateClient,
} from '../controllers/client.controller.js';

const router = express.Router();

router.post('/', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), createClient);
router.get('/', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), getClients);
router.get('/:id', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), getClientById);
router.put('/:id', authenticateMiddleware, authorize('admin', 'hr', 'manager', 'super-admin'), updateClient);
router.delete('/:id', authenticateMiddleware, authorize('admin', 'hr', 'super-admin'), deleteClient);

export default router;
