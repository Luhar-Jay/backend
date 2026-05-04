import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import ChatMessage from "../model/chat.model.js";
import ChatGroup from "../model/chatGroup.model.js";
import { reactionPopulate } from "./chatReaction.js";
import { pubClient, subClient } from "./redis.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { COOKIE_ACCESS, parseCookieHeader } from "./authCookies.js";

const redisAvailable = pubClient !== null && subClient !== null;

/** Set in initSocket — used to broadcast chat reaction updates */
let ioSingleton = null;

export function notifyChatMessageReactionsUpdated(senderId, receiverId, groupId, payload) {
  if (!ioSingleton) return;
  if (groupId) {
    ioSingleton.to(`group:${groupId}`).emit("message:reactions-updated", payload);
  } else {
    ioSingleton.to(String(senderId)).emit("message:reactions-updated", payload);
    if (receiverId) ioSingleton.to(String(receiverId)).emit("message:reactions-updated", payload);
  }
}

// Fallback in-memory set when Redis is not available
const localOnlineUsers = new Set();

export async function getOnlineUsers() {
  if (redisAvailable) {
    return await pubClient.smembers("online_users");
  }
  return [...localOnlineUsers];
}

async function addOnlineUser(userId) {
  if (redisAvailable) {
    await pubClient.sadd("online_users", userId);
  } else {
    localOnlineUsers.add(userId);
  }
}

async function removeOnlineUser(userId) {
  if (redisAvailable) {
    await pubClient.srem("online_users", userId);
  } else {
    localOnlineUsers.delete(userId);
  }
}

export function initSocket(httpServer) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const cors = {
    origin: allowedOrigins,
    credentials: true,
  };
  const io = new Server(httpServer, { cors });
  ioSingleton = io;

  if (redisAvailable) {
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Socket.IO using Redis adapter.");
  } else {
    console.log("Socket.IO using in-memory adapter (Redis not available).");
  }

  io.use((socket, next) => {
    const raw = socket.handshake.headers.cookie;
    const cookies = parseCookieHeader(raw);
    const token = cookies[COOKIE_ACCESS];
    if (!token) return next(new Error("Authentication required"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    console.log("User connected:", userId);

    await addOnlineUser(userId);
    io.emit("user:online", { userId });
    socket.join(userId);

    // Join all group rooms the user belongs to
    try {
      const groups = await ChatGroup.find({ members: userId }).select("_id");
      for (const g of groups) {
        socket.join(`group:${g._id}`);
      }
    } catch (err) {
      console.error("Failed to join group rooms:", err);
    }

    // ── DM events ──────────────────────────────────────────────────────────

    socket.on("message:send", async ({ receiverId, message, attachments, replyToId, mentions }, callback) => {
      try {
        const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
        if (!receiverId || (!message?.trim() && !hasAttachments)) {
          return callback?.({ success: false, error: "Invalid data" });
        }
        if (receiverId === userId) {
          return callback?.({ success: false, error: "Cannot message yourself" });
        }

        message = message?.trim() ?? "";

        const chatMessage = await ChatMessage.create({
          sender: userId,
          receiver: receiverId,
          message,
          attachments: hasAttachments ? attachments : [],
          replyTo: replyToId ?? null,
          mentions: Array.isArray(mentions) ? mentions : [],
        });

        const populated = await chatMessage.populate([
          { path: "sender", select: "name profileImage" },
          { path: "receiver", select: "name profileImage" },
          { path: "mentions", select: "name profileImage" },
          reactionPopulate,
          {
            path: "replyTo",
            select: "_id message attachments sender",
            populate: { path: "sender", select: "name" },
          },
        ]);

        io.to(receiverId).emit("message:receive", populated);
        io.to(userId).emit("message:receive", populated);
        callback?.({ success: true, data: populated });
      } catch (err) {
        console.error("Message error:", err);
        callback?.({ success: false, error: "Server error" });
      }
    });

    socket.on("typing:start", ({ receiverId }) => {
      io.to(receiverId).emit("typing:start", { userId });
    });

    socket.on("typing:stop", ({ receiverId }) => {
      io.to(receiverId).emit("typing:stop", { userId });
    });

    socket.on("message:read", async ({ senderId }) => {
      await ChatMessage.updateMany(
        { sender: senderId, receiver: userId, isRead: false },
        { isRead: true }
      );
      io.to(senderId).emit("message:read", { readBy: userId });
    });

    socket.on("message:delete", async ({ messageId, receiverId }, callback) => {
      try {
        const message = await ChatMessage.findById(messageId);
        if (!message) return callback?.({ success: false, error: "Message not found" });
        if (message.sender.toString() !== socket.userId) {
          return callback?.({ success: false, error: "Not authorized to delete this message" });
        }
        await ChatMessage.findByIdAndDelete(messageId);
        io.to(receiverId).emit("message:delete", { messageId });
        io.to(socket.userId).emit("message:delete", { messageId });
        callback?.({ success: true });
      } catch (error) {
        console.error("Message delete error:", error);
        callback?.({ success: false, error: "Server error" });
      }
    });

    socket.on("message:edit", async ({ messageId, message, receiverId }, callback) => {
      try {
        if (!message?.trim()) return callback?.({ success: false, error: "Invalid message" });
        const chatMessage = await ChatMessage.findById(messageId);
        if (!chatMessage) return callback?.({ success: false, error: "Message not found" });
        if (chatMessage.sender.toString() !== socket.userId) {
          return callback?.({ success: false, error: "Not authorized to edit this message" });
        }
        chatMessage.message = message.trim();
        chatMessage.isEdited = true;
        await chatMessage.save();
        io.to(receiverId).emit("message:edit", { messageId, message: chatMessage.message });
        io.to(socket.userId).emit("message:edit", { messageId, message: chatMessage.message });
        callback?.({ success: true });
      } catch (err) {
        console.error("Edit error:", err);
        callback?.({ success: false, error: "Server error" });
      }
    });

    // ── Group events ───────────────────────────────────────────────────────

    socket.on("group:message:send", async ({ groupId, message, attachments, replyToId, mentions }, callback) => {
      try {
        const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
        if (!groupId || (!message?.trim() && !hasAttachments)) {
          return callback?.({ success: false, error: "Invalid data" });
        }

        const group = await ChatGroup.findById(groupId).select("members");
        if (!group) return callback?.({ success: false, error: "Group not found" });
        if (!group.members.some((m) => m.toString() === userId)) {
          return callback?.({ success: false, error: "Not a member of this group" });
        }

        message = message?.trim() ?? "";

        const chatMessage = await ChatMessage.create({
          sender: userId,
          group: groupId,
          message,
          attachments: hasAttachments ? attachments : [],
          replyTo: replyToId ?? null,
          mentions: Array.isArray(mentions) ? mentions : [],
        });

        const populated = await chatMessage.populate([
          { path: "sender", select: "name profileImage" },
          { path: "mentions", select: "name profileImage" },
          reactionPopulate,
          {
            path: "replyTo",
            select: "_id message attachments sender",
            populate: { path: "sender", select: "name" },
          },
        ]);

        io.to(`group:${groupId}`).emit("group:message:receive", { groupId, message: populated });
        callback?.({ success: true, data: populated });
      } catch (err) {
        console.error("Group message error:", err);
        callback?.({ success: false, error: "Server error" });
      }
    });

    socket.on("group:typing:start", ({ groupId }) => {
      socket.to(`group:${groupId}`).emit("group:typing:start", { userId, groupId });
    });

    socket.on("group:typing:stop", ({ groupId }) => {
      socket.to(`group:${groupId}`).emit("group:typing:stop", { userId, groupId });
    });

    socket.on("group:message:delete", async ({ messageId, groupId }, callback) => {
      try {
        const message = await ChatMessage.findById(messageId);
        if (!message) return callback?.({ success: false, error: "Message not found" });
        if (message.sender.toString() !== socket.userId) {
          return callback?.({ success: false, error: "Not authorized" });
        }
        await ChatMessage.findByIdAndDelete(messageId);
        io.to(`group:${groupId}`).emit("group:message:delete", { messageId, groupId });
        callback?.({ success: true });
      } catch (err) {
        console.error("Group delete error:", err);
        callback?.({ success: false, error: "Server error" });
      }
    });

    socket.on("group:message:edit", async ({ messageId, message, groupId }, callback) => {
      try {
        if (!message?.trim()) return callback?.({ success: false, error: "Invalid message" });
        const chatMessage = await ChatMessage.findById(messageId);
        if (!chatMessage) return callback?.({ success: false, error: "Message not found" });
        if (chatMessage.sender.toString() !== socket.userId) {
          return callback?.({ success: false, error: "Not authorized" });
        }
        chatMessage.message = message.trim();
        chatMessage.isEdited = true;
        await chatMessage.save();
        io.to(`group:${groupId}`).emit("group:message:edit", {
          messageId,
          message: chatMessage.message,
          groupId,
        });
        callback?.({ success: true });
      } catch (err) {
        console.error("Group edit error:", err);
        callback?.({ success: false, error: "Server error" });
      }
    });

    // Join a newly created group room
    socket.on("group:join", ({ groupId }) => {
      socket.join(`group:${groupId}`);
    });

    socket.on("disconnect", async () => {
      console.log("User disconnected:", userId);
      await removeOnlineUser(userId);
      io.emit("user:offline", { userId });
    });
  });

  return io;
}
