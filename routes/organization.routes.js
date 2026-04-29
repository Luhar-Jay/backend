import express from "express";
import {
  createOrganization,
  getMyOrganization,
  getMyOrgContext,
  getAllOrganizations,
  getInvitableUsers,
  sendInvite,
  getAdminInvites,
  getMyInvites,
  acceptInvite,
  rejectInvite,
  removeMember,
  sendJoinRequest,
  getJoinRequests,
  getMyJoinRequests,
  acceptJoinRequest,
  rejectJoinRequest,
} from "../controllers/organization.controller.js";
import { authenticateMiddleware } from "../middleware/authenticate.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  CreateOrganizationBodySchema,
  SendInviteBodySchema,
  InviteIdParamSchema,
  OrgMemberParamSchema,
  SendJoinRequestBodySchema,
  JoinRequestIdParamSchema,
} from "../validation/organization.validation.js";

const router = express.Router();

router.post(
  "/",
  authenticateMiddleware,
  authorize("admin", "super-admin"),
  validate({ body: CreateOrganizationBodySchema }),
  createOrganization
);

router.get("/my", authenticateMiddleware, getMyOrganization);
router.get("/my-context", authenticateMiddleware, getMyOrgContext);

router.get(
  "/invitable-users",
  authenticateMiddleware,
  authorize("admin", "super-admin"),
  getInvitableUsers
);

router.get("/all", authenticateMiddleware, getAllOrganizations);

router.post(
  "/invite",
  authenticateMiddleware,
  authorize("admin", "super-admin"),
  validate({ body: SendInviteBodySchema }),
  sendInvite
);

router.get(
  "/invites",
  authenticateMiddleware,
  authorize("admin", "super-admin"),
  getAdminInvites
);

router.get("/invites/my", authenticateMiddleware, getMyInvites);

router.patch(
  "/invites/:id/accept",
  authenticateMiddleware,
  validate({ params: InviteIdParamSchema }),
  acceptInvite
);

router.patch(
  "/invites/:id/reject",
  authenticateMiddleware,
  validate({ params: InviteIdParamSchema }),
  rejectInvite
);

// Join request routes
router.post(
  "/join-request",
  authenticateMiddleware,
  validate({ body: SendJoinRequestBodySchema }),
  sendJoinRequest
);

router.get(
  "/join-requests",
  authenticateMiddleware,
  authorize("admin", "super-admin"),
  getJoinRequests
);

router.get("/join-requests/my", authenticateMiddleware, getMyJoinRequests);

router.patch(
  "/join-requests/:id/accept",
  authenticateMiddleware,
  authorize("admin", "super-admin"),
  validate({ params: JoinRequestIdParamSchema }),
  acceptJoinRequest
);

router.patch(
  "/join-requests/:id/reject",
  authenticateMiddleware,
  authorize("admin", "super-admin"),
  validate({ params: JoinRequestIdParamSchema }),
  rejectJoinRequest
);

router.delete(
  "/:orgId/members/:userId",
  authenticateMiddleware,
  authorize("admin", "super-admin"),
  validate({ params: OrgMemberParamSchema }),
  removeMember
);

export default router;
