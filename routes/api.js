import express from 'express';
import {
  asyncHandler,
  requireUser,
  requireWriter,
  requireAdmin,
  checkCsrf,
  csrfToken,
} from '../middleware/workspaceAuth.js';
import {
  workspaceState,
  addInventory,
  adjustStock,
  createRequest,
  changeRequest,
  receiveDelivery,
  updateUserAccess,
} from '../services/inventoryService.js';
const api = express.Router();
api.use(requireUser);
api.get(
  '/workspace',
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ...(await workspaceState(req.user)), csrfToken: csrfToken(req) });
  }),
);
api.use(checkCsrf, requireWriter);
api.post(
  '/users/:id/access',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await updateUserAccess(req.user, Number(req.params.id), req.body);
    res.json({ message: 'Account access updated. The user can refresh their workspace.' });
  }),
);
api.post(
  '/inventory',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await addInventory(req.user, req.body);
    res.status(201).json({ message: 'Product inventory saved.' });
  }),
);
api.post(
  '/inventory/:id/adjust',
  asyncHandler(async (req, res) => {
    await adjustStock(req.user, Number(req.params.id), req.body);
    res.json({ message: 'Stock count updated. Adjustment recorded.' });
  }),
);
api.post(
  '/requests',
  asyncHandler(async (req, res) => {
    const request = await createRequest(req.user, req.body);
    res.status(201).json({ message: `REQ-${request.id} submitted for approval.` });
  }),
);
api.post(
  '/requests/:reference/receive',
  asyncHandler(async (req, res) => {
    await receiveDelivery(req.user, req.params.reference, req.body);
    res.json({ message: 'Delivery recorded. Inventory updated.' });
  }),
);
api.post(
  '/requests/:reference/:action',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await changeRequest(req.user, req.params.reference, req.params.action);
    res.json({ message: 'Request updated.' });
  }),
);
export default api;
