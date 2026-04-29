import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import ChatMessage from "../model/chat.model.js";
import { pubClient, subClient } from "./redis.js";
import { createAdapter } from "@socket.io/redis-adapter";

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
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
  });

  if (redisAvailable) {
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Socket.IO using Redis adapter.");
  } else {
    console.log("Socket.IO using in-memory adapter (Redis not available).");
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
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

    socket.on("message:send", async ({ receiverId, message }, callback) => {
      try {
        if (!receiverId || !message?.trim()) {
          return callback?.({ success: false, error: "Invalid data" });
        }
        if (receiverId === userId) {
          return callback?.({ success: false, error: "Cannot message yourself" });
        }

        message = message.trim();

        const chatMessage = await ChatMessage.create({
          sender: userId,
          receiver: receiverId,
          message,
        });

        const populated = await chatMessage.populate([
          { path: "sender", select: "name profileImage" },
          { path: "receiver", select: "name profileImage" },
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

    socket.on("disconnect", async () => {
      console.log("User disconnected:", userId);
      await removeOnlineUser(userId);
      io.emit("user:offline", { userId });
    });
  });

  return io;
}
