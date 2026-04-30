import Organization from "../model/organization.model.js";
import OrganizationInvite from "../model/organizationInvite.model.js";
import OrganizationJoinRequest from "../model/organizationJoinRequest.model.js";
import User from "../model/user.model.js";
import { sendEmail } from "../utils/mailService/sendMail.js";
import { orgInviteTemplate } from "../utils/mailService/orgInviteTemplate.js";
import { joinRequestTemplate } from "../utils/mailService/joinRequestTemplate.js";

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

// POST /organization — admin creates an organization
export const createOrganization = async (req, res) => {
  try {
    const { name } = req.body;
    const adminId = req.user._id;

    const existing = await Organization.findOne({ createdBy: adminId });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You already have an organization. An admin can only manage one organization.",
      });
    }

    const org = await Organization.create({
      name,
      createdBy: adminId,
      updatedBy: adminId,
      members: [adminId],
    });

    await User.findByIdAndUpdate(adminId, { organization: org._id });

    return res.status(201).json({
      success: true,
      message: "Organization created successfully",
      organization: org,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create organization",
      error: error.message,
    });
  }
};

// GET /organization/my-context — returns both the org the user owns and the org they joined
export const getMyOrgContext = async (req, res) => {
  try {
    const userId = req.user._id;

    const populate = [
      { path: "createdBy", select: "name email profileImage role" },
      { path: "members", select: "name email profileImage role" },
    ];

    // Org this user owns (created)
    const ownedOrg = await Organization.findOne({ createdBy: userId })
      .populate(populate);

    // Org this user joined as a member (not as owner).
    // Check new `memberOrganization` field first; fall back to legacy `organization` field
    // for users whose records pre-date this change.
    const user = await User.findById(userId).select("memberOrganization organization");
    let memberOrg = null;

    const memberOrgId = user?.memberOrganization || user?.organization;
    if (memberOrgId) {
      const candidate = await Organization.findOne({
        _id: memberOrgId,
        createdBy: { $ne: userId }, // must be someone else's org
        members: userId,
      }).populate(populate);
      memberOrg = candidate || null;
    }

    // Retroactive fix: ensure every org member has managedBy pointing to this admin.
    // This silently repairs members who joined before the managedBy field was set
    // (e.g. via the old invite/join flow), so they appear correctly in task
    // assignment lists, employee screens, and chat.
    // IMPORTANT: Only set role:"employee" for members who do NOT own their own org.
    // Members who own an org are admins there — their global role must stay "admin".
    if (ownedOrg) {
      const memberIds = ownedOrg.members
        .map((m) => (m._id ? m._id : m))
        .filter((id) => id.toString() !== userId.toString());

      if (memberIds.length > 0) {
        // Members without their own org → set employee role + managedBy
        await User.updateMany(
          { _id: { $in: memberIds }, managedBy: null, organization: null },
          { $set: { managedBy: userId, role: ["employee"] } }
        );
        // Members who own their own org → only set managedBy, preserve admin role
        await User.updateMany(
          { _id: { $in: memberIds }, managedBy: null, organization: { $ne: null } },
          { $set: { managedBy: userId } }
        );
      }
    }

    // Self-healing: if this user owns an org but their role was incorrectly set to
    // "employee" (e.g. by a previous bug), restore it to "admin".
    if (ownedOrg) {
      const currentUser = await User.findById(userId).select("role");
      if (currentUser && (!currentUser.role.includes("admin") && !currentUser.role.includes("super-admin"))) {
        await User.findByIdAndUpdate(userId, { role: ["admin"] });
      }
    }

    return res.status(200).json({ success: true, ownedOrg: ownedOrg || null, memberOrg: memberOrg || null });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch organization context",
      error: error.message,
    });
  }
};

// GET /organization/my — get the organization the current user belongs to
export const getMyOrganization = async (req, res) => {
  try {
    const userId = req.user._id;

    const org = await Organization.findOne({ members: userId })
      .populate("createdBy", "name email profileImage role")
      .populate("members", "name email profileImage role");

    if (!org) {
      return res.status(404).json({
        success: false,
        message: "You are not part of any organization",
      });
    }

    return res.status(200).json({ success: true, organization: org });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch organization",
      error: error.message,
    });
  }
};

// POST /organization/invite — admin sends invite to a registered user
export const sendInvite = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { userId } = req.body;

    const org = await Organization.findOne({ createdBy: adminId });
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "You don't have an organization yet. Please create one first.",
      });
    }

    const userToInvite = await User.findById(userId);
    if (!userToInvite) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const alreadyMember = org.members.some(
      (m) => String(m) === String(userId)
    );
    if (alreadyMember) {
      return res.status(400).json({
        success: false,
        message: "User is already a member of this organization",
      });
    }

    const existingInvite = await OrganizationInvite.findOne({
      organization: org._id,
      invitedUser: userId,
      status: "pending",
    });
    if (existingInvite) {
      return res.status(400).json({
        success: false,
        message: "A pending invite already exists for this user",
      });
    }

    const invite = await OrganizationInvite.create({
      organization: org._id,
      invitedBy: adminId,
      invitedUser: userId,
    });

    const inviteUrl = `${getFrontendUrl()}/invites`;
    sendEmail(
      userToInvite.email,
      `You've been invited to join ${org.name}`,
      orgInviteTemplate({
        userName: userToInvite.name,
        adminName: req.user.name,
        orgName: org.name,
        inviteUrl,
      })
    ).catch((err) => console.error("Invite email failed:", err));

    return res.status(201).json({
      success: true,
      message: `Invitation sent to ${userToInvite.name}`,
      invite,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to send invite",
      error: error.message,
    });
  }
};

// GET /organization/invites — admin views all invites they sent
export const getAdminInvites = async (req, res) => {
  try {
    const adminId = req.user._id;

    const org = await Organization.findOne({ createdBy: adminId });
    if (!org) {
      return res.status(200).json({ success: true, invites: [] });
    }

    const invites = await OrganizationInvite.find({ organization: org._id })
      .populate("invitedUser", "name email profileImage role")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, invites });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch invites",
      error: error.message,
    });
  }
};

// GET /organization/invites/my — user views their pending invites
export const getMyInvites = async (req, res) => {
  try {
    const userId = req.user._id;

    const invites = await OrganizationInvite.find({
      invitedUser: userId,
      status: "pending",
    })
      .populate("organization", "name createdAt")
      .populate("invitedBy", "name email profileImage")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, invites });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch invites",
      error: error.message,
    });
  }
};

// PATCH /organization/invites/:id/accept — user accepts an invite
export const acceptInvite = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const invite = await OrganizationInvite.findOne({
      _id: id,
      invitedUser: userId,
      status: "pending",
    });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: "Invite not found or already responded to",
      });
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "This invitation has expired",
      });
    }

    await Organization.findByIdAndUpdate(invite.organization, {
      $addToSet: { members: userId },
      updatedBy: invite.invitedBy,
    });

    // Store in memberOrganization so it doesn't overwrite the user's own org (if they have one).
    // Also assign the employee role and link them to the admin who invited them.
    // IMPORTANT: Only change role to "employee" if the user does NOT already own their own org.
    // If they own an org they are an admin there, and we must not corrupt that global role.
    const invitedUserDoc = await User.findById(userId).select("organization");
    const inviteUpdateData = {
      memberOrganization: invite.organization,
      managedBy: invite.invitedBy,
    };
    if (!invitedUserDoc?.organization) {
      inviteUpdateData.role = ["employee"];
    }
    await User.findByIdAndUpdate(userId, inviteUpdateData);

    invite.status = "accepted";
    await invite.save();

    return res.status(200).json({
      success: true,
      message: "You have joined the organization successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to accept invite",
      error: error.message,
    });
  }
};

// PATCH /organization/invites/:id/reject — user rejects an invite
export const rejectInvite = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const invite = await OrganizationInvite.findOne({
      _id: id,
      invitedUser: userId,
      status: "pending",
    });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: "Invite not found or already responded to",
      });
    }

    invite.status = "rejected";
    await invite.save();

    return res.status(200).json({ success: true, message: "Invitation declined" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to reject invite",
      error: error.message,
    });
  }
};

// GET /organization/all — list all organizations (for users to browse and request to join)
export const getAllOrganizations = async (req, res) => {
  try {
    const orgs = await Organization.find()
      .populate("createdBy", "name email profileImage")
      .select("name members createdAt createdBy")
      .sort({ createdAt: -1 });

    const result = orgs.map((org) => ({
      _id: org._id,
      name: org.name,
      createdBy: org.createdBy,
      memberCount: org.members?.length ?? 0,
      createdAt: org.createdAt,
    }));

    return res.status(200).json({ success: true, organizations: result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch organizations",
      error: error.message,
    });
  }
};

// POST /organization/join-request — user sends a request to join an organization
export const sendJoinRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { organizationId, message } = req.body;

    const org = await Organization.findById(organizationId);
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    const alreadyMember = org.members.some(
      (m) => String(m) === String(userId)
    );
    if (alreadyMember) {
      return res.status(400).json({
        success: false,
        message: "You are already a member of this organization",
      });
    }

    const existingRequest = await OrganizationJoinRequest.findOne({
      organization: organizationId,
      requestedBy: userId,
      status: "pending",
    });
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending join request for this organization",
      });
    }

    const joinRequest = await OrganizationJoinRequest.create({
      organization: organizationId,
      requestedBy: userId,
      message: message || "",
    });

    // Notify the org admin via email
    const admin = await User.findById(org.createdBy);
    if (admin?.email) {
      sendEmail(
        admin.email,
        `New join request for ${org.name}`,
        joinRequestTemplate({
          adminName: admin.name,
          userName: req.user.name,
          userEmail: req.user.email,
          orgName: org.name,
          message: message || "",
          frontendUrl: getFrontendUrl(),
        })
      ).catch((err) => console.error("Join request email failed:", err));
    }

    return res.status(201).json({
      success: true,
      message: `Join request sent to ${org.name}`,
      joinRequest,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to send join request",
      error: error.message,
    });
  }
};

// GET /organization/join-requests — admin views all join requests for their org
export const getJoinRequests = async (req, res) => {
  try {
    const adminId = req.user._id;

    const org = await Organization.findOne({ createdBy: adminId });
    if (!org) {
      return res.status(200).json({ success: true, joinRequests: [] });
    }

    const joinRequests = await OrganizationJoinRequest.find({
      organization: org._id,
    })
      .populate("requestedBy", "name email profileImage role")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, joinRequests });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch join requests",
      error: error.message,
    });
  }
};

// GET /organization/join-requests/my — user views their own join requests
export const getMyJoinRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const joinRequests = await OrganizationJoinRequest.find({
      requestedBy: userId,
    })
      .populate("organization", "name createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, joinRequests });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch join requests",
      error: error.message,
    });
  }
};

// PATCH /organization/join-requests/:id/accept — admin accepts a join request
export const acceptJoinRequest = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { id } = req.params;

    const joinRequest = await OrganizationJoinRequest.findById(id);
    if (!joinRequest || joinRequest.status !== "pending") {
      return res.status(404).json({
        success: false,
        message: "Join request not found or already responded to",
      });
    }

    const org = await Organization.findOne({
      _id: joinRequest.organization,
      createdBy: adminId,
    });
    if (!org) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to manage this organization",
      });
    }

    await Organization.findByIdAndUpdate(org._id, {
      $addToSet: { members: joinRequest.requestedBy },
      updatedBy: adminId,
    });

    // Store in memberOrganization so it doesn't overwrite the user's own org (if they have one).
    // Also assign the employee role and link them to the org admin.
    // IMPORTANT: Only change role to "employee" if the user does NOT already own their own org.
    const requestingUserDoc = await User.findById(joinRequest.requestedBy).select("organization");
    const joinUpdateData = {
      memberOrganization: org._id,
      managedBy: adminId,
    };
    if (!requestingUserDoc?.organization) {
      joinUpdateData.role = ["employee"];
    }
    await User.findByIdAndUpdate(joinRequest.requestedBy, joinUpdateData);

    joinRequest.status = "accepted";
    await joinRequest.save();

    return res.status(200).json({
      success: true,
      message: "Join request accepted. User has been added to the organization.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to accept join request",
      error: error.message,
    });
  }
};

// PATCH /organization/join-requests/:id/reject — admin rejects a join request
export const rejectJoinRequest = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { id } = req.params;

    const joinRequest = await OrganizationJoinRequest.findById(id);
    if (!joinRequest || joinRequest.status !== "pending") {
      return res.status(404).json({
        success: false,
        message: "Join request not found or already responded to",
      });
    }

    const org = await Organization.findOne({
      _id: joinRequest.organization,
      createdBy: adminId,
    });
    if (!org) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to manage this organization",
      });
    }

    joinRequest.status = "rejected";
    await joinRequest.save();

    return res.status(200).json({
      success: true,
      message: "Join request rejected",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to reject join request",
      error: error.message,
    });
  }
};

// GET /organization/invitable-users — returns all DB users the admin can invite
// (anyone not already a member of the admin's org, and not the admin themselves)
export const getInvitableUsers = async (req, res) => {
  try {
    const adminId = req.user._id;

    const org = await Organization.findOne({ createdBy: adminId });
    const excludeIds = org ? [...org.members.map(String), String(adminId)] : [String(adminId)];

    const users = await User.find({ _id: { $nin: excludeIds } }).select(
      "_id name email profileImage role"
    );

    return res.status(200).json({ success: true, users });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch invitable users",
      error: error.message,
    });
  }
};

// DELETE /organization/:orgId/members/:userId — admin removes a member
export const removeMember = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { orgId, userId } = req.params;

    const org = await Organization.findOne({ _id: orgId, createdBy: adminId });
    if (!org) {
      return res.status(403).json({
        success: false,
        message: "Organization not found or you don't have permission",
      });
    }

    if (String(userId) === String(adminId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot remove yourself from the organization",
      });
    }

    await Organization.findByIdAndUpdate(orgId, {
      $pull: { members: userId },
      updatedBy: adminId,
    });

    // Clear org membership, restore the standalone admin role, and unlink from the org admin.
    await User.findByIdAndUpdate(userId, {
      $unset: { memberOrganization: "", organization: "" },
      role: ["admin"],
      managedBy: null,
    });

    return res.status(200).json({
      success: true,
      message: "Member removed from organization",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to remove member",
      error: error.message,
    });
  }
};
