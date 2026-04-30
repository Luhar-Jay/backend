import mongoose from "mongoose";
import User from "../model/user.model.js";
import Organization from "../model/organization.model.js";

/**
 * Returns all user IDs that belong to the same org as the given admin.
 *
 * Sources (unioned):
 *   1. Users whose `managedBy` === orgAdminId  (created via "Create User" form)
 *   2. Members listed in the Organization document created by orgAdminId
 *      (users who joined via invite or join-request)
 */
export async function getOrgCreatorUserIds(orgAdminId) {
  if (!orgAdminId) return [];

  const adminObjId = mongoose.Types.ObjectId.isValid(orgAdminId)
    ? new mongoose.Types.ObjectId(orgAdminId)
    : orgAdminId;

  // Source 1: directly managed users
  const directTeam = await User.find({ managedBy: adminObjId }).select("_id").lean();

  // Source 2: org members (covers invite/join-request flow)
  const org = await Organization.findOne({ createdBy: adminObjId }).select("members").lean();
  const orgMemberIds = org?.members ?? [];

  // Union, preserving ObjectId instances, no duplicates
  const seen = new Map();
  seen.set(adminObjId.toString(), adminObjId);

  for (const u of directTeam) {
    seen.set(u._id.toString(), u._id);
  }
  for (const id of orgMemberIds) {
    const str = id.toString();
    if (!seen.has(str)) {
      seen.set(str, mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id);
    }
  }

  return [...seen.values()];
}

/**
 * Resolves the "org admin" for the acting request user.
 * super-admin → null (global scope)
 * admin       → their own _id
 * others      → their managedBy (the admin who owns them)
 *
 * @param {object} reqUser  - The authenticated user attached by middleware.
 * @param {string|null} orgContext - "member" when the frontend is showing the
 *   joined-org context (user has two orgs and switched to the one they joined).
 *   In that case we scope to managedBy instead of _id, even for admins.
 */
export function resolveOrgAdminId(reqUser, orgContext = null) {
  const role = Array.isArray(reqUser.role) ? reqUser.role[0] : reqUser.role;
  const { _id, managedBy } = reqUser;
  if (role === "super-admin") return null;
  // When the frontend is in "member" context the user is viewing the org they
  // joined, not the one they own.  Scope to managedBy (the other org's admin).
  if (orgContext === "member" && managedBy) return managedBy;
  if (role === "admin") return _id;
  return managedBy || null;
}

/**
 * Returns true if userId is in the org owned by orgAdminId.
 * Checks both managedBy link and Organization.members array.
 */
export async function userBelongsToOrg(userId, orgAdminId) {
  if (!userId || !orgAdminId) return false;
  if (userId.toString() === orgAdminId.toString()) return true;

  // Check direct managedBy link
  const u = await User.findById(userId).select("managedBy").lean();
  if (u?.managedBy?.toString() === orgAdminId.toString()) return true;

  // Check org membership list
  const org = await Organization.findOne({
    createdBy: orgAdminId,
    members: userId,
  })
    .select("_id")
    .lean();
  return !!org;
}

export async function canAccessUserProfile(actor, targetUserId) {
  const actorRole = Array.isArray(actor.role) ? actor.role[0] : actor.role;
  if (actorRole === "super-admin") return true;

  const target = await User.findById(targetUserId).select("managedBy").lean();
  if (!target) return false;

  const tid = target._id.toString();
  if (tid === actor._id.toString()) return true;

  if (actorRole === "admin") {
    if (target.managedBy?.toString() === actor._id.toString()) return true;
    // Also allow if target is in the admin's org
    return await userBelongsToOrg(targetUserId, actor._id);
  }

  const orgAdminId = resolveOrgAdminId(actor);
  if (!orgAdminId) return false;
  if (tid === orgAdminId.toString()) return true;
  return await userBelongsToOrg(targetUserId, orgAdminId);
}
