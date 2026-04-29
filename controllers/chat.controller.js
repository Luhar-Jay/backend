import ChatMessage from "../model/chat.model.js";
import User from "../model/user.model.js";
import { getOnlineUsers } from "../utils/socket.js";
import { getOrgCreatorUserIds, resolveOrgAdminId } from "../utils/teamScope.js";

// GET /api/v1/chat/:receiverId — paginated message history between two users
export const getMessages = async (req, res) => {
  try {
    const { receiverId } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await ChatMessage.find({
      $or: [
        { sender: userId, receiver: receiverId },
        { sender: receiverId, receiver: userId },
      ],
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "name profileImage")
      .populate("receiver", "name profileImage");

    const total = await ChatMessage.countDocuments({
      $or: [
        { sender: userId, receiver: receiverId },
        { sender: receiverId, receiver: userId },
      ],
    });

    res.status(200).json({
      success: true,
      data: messages.reverse(),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/v1/chat/users — users in the same org for chat (any authenticated user)
export const getChatUsers = async (req, res) => {
  try {
    const currentUser = req.user;
    const role = Array.isArray(currentUser.role) ? currentUser.role[0] : currentUser.role;

    let userIds = null; // null means "all" (super-admin only)

    if (role === "super-admin") {
      // Super-admin sees everyone — leave userIds as null
    } else if (role === "admin") {
      // Admin sees all org members: users they directly manage AND users who
      // joined via invite/join-request (stored in Organization.members)
      userIds = await getOrgCreatorUserIds(currentUser._id);
    } else {
      // Employee/HR/Manager: resolve their org admin, then load that full org
      const orgAdminId = resolveOrgAdminId(currentUser);
      if (orgAdminId) {
        userIds = await getOrgCreatorUserIds(orgAdminId);
      } else {
        // No org linkage — only show themselves
        userIds = [currentUser._id];
      }
    }

    const query = userIds
      ? { isActive: true, _id: { $in: userIds } }
      : { isActive: true };

    const users = await User.find(query)
      .select("name email profileImage role isActive")
      .lean();

    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/v1/chat/online — list of currently connected user IDs
export const getOnlineUsersList = async (_req, res) => {
  try {
    const users = await getOnlineUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
