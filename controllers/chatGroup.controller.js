import ChatGroup from "../model/chatGroup.model.js";
import ChatMessage from "../model/chat.model.js";
import { reactionPopulate } from "../utils/chatReaction.js";
import { prepareMessageForViewer } from "../utils/chatUtils.js";

const replyToPopulate = {
  path: "replyTo",
  select: "_id message attachments sender deletedFor",
  populate: { path: "sender", select: "name" },
};

const groupPopulate = [
  { path: "members", select: "name profileImage" },
  { path: "admins", select: "name profileImage" },
  { path: "createdBy", select: "name profileImage" },
];

// POST /api/v1/chat/groups
export const createGroup = async (req, res) => {
  try {
    const { name, description, memberIds, groupImage } = req.body;
    const userId = req.user._id.toString();

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: "Group name is required" });
    }

    const uniqueMembers = [...new Set([userId, ...(Array.isArray(memberIds) ? memberIds : [])])];

    const group = await ChatGroup.create({
      name: name.trim(),
      description: description?.trim() ?? "",
      createdBy: userId,
      members: uniqueMembers,
      admins: [userId],
      groupImage:
        typeof groupImage === "string" && groupImage.trim() ? groupImage.trim() : null,
    });

    const populated = await ChatGroup.findById(group._id).populate(groupPopulate);
    return res.status(201).json({ success: true, data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/v1/chat/groups
export const getGroups = async (req, res) => {
  try {
    const userId = req.user._id;
    const groups = await ChatGroup.find({ members: userId })
      .populate(groupPopulate)
      .sort({ updatedAt: -1 });
    return res.status(200).json({ success: true, data: groups });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/v1/chat/groups/:groupId
export const getGroupById = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id.toString();

    const group = await ChatGroup.findById(groupId).populate(groupPopulate);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }
    if (!group.members.some((m) => m._id.toString() === userId)) {
      return res.status(403).json({ success: false, message: "Not a member of this group" });
    }
    return res.status(200).json({ success: true, data: group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/v1/chat/groups/:groupId
export const updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, description, addMembers, removeMembers, groupImage } = req.body;
    const userId = req.user._id.toString();

    const group = await ChatGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }
    if (!group.admins.some((a) => a.toString() === userId)) {
      return res.status(403).json({ success: false, message: "Only group admins can update" });
    }

    if (name?.trim()) group.name = name.trim();
    if (description !== undefined) {
      group.description = typeof description === "string" ? description.trim() : "";
    }
    if (groupImage !== undefined) {
      if (groupImage === null || groupImage === "") {
        group.groupImage = null;
      } else if (typeof groupImage === "string") {
        const g = groupImage.trim();
        group.groupImage = g || null;
      }
    }

    if (Array.isArray(addMembers) && addMembers.length) {
      const existing = group.members.map((m) => m.toString());
      const toAdd = addMembers.filter((id) => !existing.includes(id));
      group.members.push(...toAdd);
    }

    if (Array.isArray(removeMembers) && removeMembers.length) {
      const creatorId = group.createdBy.toString();
      group.members = group.members.filter(
        (m) => !removeMembers.includes(m.toString()) || m.toString() === creatorId
      );
      group.admins = group.admins.filter(
        (a) => !removeMembers.includes(a.toString()) || a.toString() === creatorId
      );
    }

    await group.save();
    const populated = await ChatGroup.findById(group._id).populate(groupPopulate);
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/v1/chat/groups/:groupId
export const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id.toString();

    const group = await ChatGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }
    if (group.createdBy.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Only the group creator can delete" });
    }

    await ChatMessage.deleteMany({ group: groupId });
    await ChatGroup.findByIdAndDelete(groupId);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/v1/chat/groups/:groupId/messages
export const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id.toString();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const group = await ChatGroup.findById(groupId).select("members");
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }
    if (!group.members.some((m) => m.toString() === userId)) {
      return res.status(403).json({ success: false, message: "Not a member of this group" });
    }

    const messages = await ChatMessage.find({ group: groupId, deletedFor: { $nin: [userId] } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "name profileImage")
      .populate("mentions", "name profileImage")
      .populate(replyToPopulate)
      .populate(reactionPopulate);

    const total = await ChatMessage.countDocuments({
      group: groupId,
      deletedFor: { $nin: [userId] },
    });

    const prepared = messages
      .map((m) => m.toObject())
      .map((m) => prepareMessageForViewer(m, userId))
      .reverse();

    return res.status(200).json({
      success: true,
      data: prepared,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/v1/chat/groups/:groupId/clear
export const clearGroupChat = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    await ChatMessage.updateMany(
      { group: groupId, deletedFor: { $nin: [userId] } },
      { $addToSet: { deletedFor: userId } }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/v1/chat/groups/:groupId/leave
export const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id.toString();

    const group = await ChatGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }
    if (group.createdBy.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: "Creator cannot leave. Delete the group instead.",
      });
    }

    group.members = group.members.filter((m) => m.toString() !== userId);
    group.admins = group.admins.filter((a) => a.toString() !== userId);
    await group.save();
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
