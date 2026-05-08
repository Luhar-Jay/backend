import ChatMessage from "../model/chat.model.js";
import { reactionPopulate } from "../utils/chatReaction.js";

// GET /api/v1/chat/search?q=&receiverId=&groupId=&sender=&from=&to=&page=&limit=
export const searchMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { q, receiverId, groupId, sender, from, to } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    if (!q?.trim()) {
      return res.status(400).json({ success: false, message: "Search query is required" });
    }

    const filter = {
      message: { $regex: q.trim(), $options: "i" },
      deletedFor: { $nin: [userId] },
    };

    if (groupId) {
      filter.group = groupId;
    } else if (receiverId) {
      filter.$or = [
        { sender: userId, receiver: receiverId },
        { sender: receiverId, receiver: userId },
      ];
    } else {
      // Search across all conversations for this user
      filter.$or = [
        { sender: userId },
        { receiver: userId },
        { group: { $exists: true, $ne: null } },
      ];
    }

    if (sender) {
      filter.sender = sender;
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    const [messages, total] = await Promise.all([
      ChatMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "name profileImage")
        .populate("receiver", "name profileImage")
        .populate("group", "name")
        .populate(reactionPopulate)
        .lean(),
      ChatMessage.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
