import ChatMessage from "../model/chat.model.js";
import User from "../model/user.model.js";
import { getOnlineUsers, notifyChatMessageReactionsUpdated } from "../utils/socket.js";
import { toggleMessageReaction, reactionPopulate } from "../utils/chatReaction.js";
import { getOrgCreatorUserIds, resolveOrgAdminId } from "../utils/teamScope.js";

// POST /api/v1/chat/upload — upload a file/image for chat (returns url + metadata)
export const uploadChatFileController = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file provided" });
    }
    return res.status(200).json({
      success: true,
      data: {
        url: req.file.path,
        name: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/v1/chat/clear/:otherUserId — soft-delete all messages in a conversation for the requester only
export const clearChat = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const userId = req.user._id;

    await ChatMessage.updateMany(
      {
        $or: [
          { sender: userId, receiver: otherUserId },
          { sender: otherUserId, receiver: userId },
        ],
        deletedFor: { $nin: [userId] },
      },
      { $addToSet: { deletedFor: userId } }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/v1/chat/message/:messageId — edit a message's text (sender only)
export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: "Message text is required" });
    }

    const existing = await ChatMessage.findById(messageId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    if (existing.sender.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this message" });
    }

    const updated = await ChatMessage.findByIdAndUpdate(
      messageId,
      { message: message.trim(), isEdited: true },
      { new: true }
    )
      .populate("sender", "name profileImage")
      .populate("receiver", "name profileImage")
      .populate(reactionPopulate);

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/v1/chat/message/:messageId — delete a message for the requester or for everyone
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { deleteFor } = req.query; // "me" | "everyone"
    const userId = req.user._id;

    const message = await ChatMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    // Only the sender can delete
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this message" });
    }

    if (deleteFor === "everyone") {
      await ChatMessage.findByIdAndDelete(messageId);
    } else {
      // "me" — soft-delete by adding userId to deletedFor array (avoid duplicates)
      await ChatMessage.findByIdAndUpdate(messageId, {
        $addToSet: { deletedFor: userId },
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/v1/chat/message/:messageId/reaction — one emoji per user: toggle off same emoji; replace other emoji
export const toggleReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body ?? {};
    const result = await toggleMessageReaction({
      messageId,
      userId: req.user._id,
      emoji,
    });

    if (!result.ok) {
      const status =
        result.error === "Message not found"
          ? 404
          : result.error === "Not authorized"
            ? 403
            : 400;
      return res.status(status).json({ success: false, message: result.error });
    }

    notifyChatMessageReactionsUpdated(result.senderId, result.receiverId, {
      messageId,
      reactions: result.reactions,
    });

    return res.status(200).json({ success: true, data: { reactions: result.reactions } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

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
      deletedFor: { $nin: [userId] },
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "name profileImage")
      .populate("receiver", "name profileImage")
      .populate({
        path: "replyTo",
        select: "_id message attachments sender",
        populate: { path: "sender", select: "name" },
      })
      .populate(reactionPopulate);

    const total = await ChatMessage.countDocuments({
      $or: [
        { sender: userId, receiver: receiverId },
        { sender: receiverId, receiver: userId },
      ],
      deletedFor: { $nin: [userId] },
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

    const orgContext = req.query.orgContext ?? null;
    let userIds = null; // null means "all" (super-admin only)

    if (role === "super-admin") {
      // Super-admin sees everyone — leave userIds as null
    } else {
      // Resolve the correct org admin based on the active context
      // (owned org → their own _id, member org → their managedBy)
      const orgAdminId = resolveOrgAdminId(currentUser, orgContext);
      if (orgAdminId) {
        userIds = await getOrgCreatorUserIds(orgAdminId);
      } else {
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
