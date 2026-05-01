import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import ChatMessage from "../model/chat.model.js";
import { pubClient, subClient } from "./redis.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { COOKIE_ACCESS, parseCookieHeader } from "./authCookies.js";

const redisAvailable = pubClient !== null && subClient !== null;

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

    socket.on("message:send", async ({ receiverId, message, attachments, replyToId }, callback) => {
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
        });

        const populated = await chatMessage.populate([
          { path: "sender", select: "name profileImage" },
          { path: "receiver", select: "name profileImage" },
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

    socket.on("message:delete", async({ messageId, receiverId }, callback) => {
      // Relay the deletion to the other participant so their UI updates live
      try {
        const message = await ChatMessage.findById(messageId)

        if (!message) {
          return callback?. ({ success: false, error: "Message not found" });
        }

        if (message.sender.toString() !== socket.userId){
          return callback?. ({ success: false, error: "Not authorized to delete this message" });
        }

        //Delete form DB
        await ChatMessage.findByIdAndDelete(messageId);

        // Emit both users
        io.to(receiverId).emit("message:delete", { messageId });
        io.to(socket.userId).emit("message:delete", { messageId });
        callback?. ({ success: true });
      } catch (error) {
        console.error("Message delete error:", error);
        callback?. ({ success: false, error: "Server error" });
      }
    });

    socket.on("message:edit", async({ messageId, message, receiverId }, callback) => {
      try {
        if (!message || !message.trim()) {
          return callback?. ({ success: false, error: "Invalid message" });
        }

        const chatMessage = await ChatMessage.findById(messageId)

        if (!chatMessage) {
          return callback?. ({ success: false, error: "Message not found" });
        }

        if (chatMessage.sender.toString() !== socket.userId){
          return callback?. ({ success: false, error: "Not authorized to edit this message" });
        }

        chatMessage.message = message.trim();
        await chatMessage.save()

        io.to(receiverId).emit("message:edit", {
          messageId,
          message: chatMessage.message,
        });
        io.to(socket.userId).emit("message:edit", {
          messageId,
          message: chatMessage.message,
        });
    
        callback?.({ success: true });
      } catch (err) {
        console.error("Edit error:", err);
        callback?.({ success: false, error: "Server error" });
      }
    });

    socket.on("disconnect", async () => {
      console.log("User disconnected:", userId);
      await removeOnlineUser(userId);
      io.emit("user:offline", { userId });
    });
  });

  return io;
}
