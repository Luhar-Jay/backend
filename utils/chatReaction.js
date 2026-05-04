import mongoose from "mongoose";
import ChatMessage from "../model/chat.model.js";

const MAX_EMOJI_LENGTH = 32;

export function normalizeReactionEmoji(raw) {
  if (typeof raw !== "string") return "";
  const s = raw.trim().normalize("NFC");
  if (!s || [...s].length > MAX_EMOJI_LENGTH) return "";
  return s;
}

const reactionPopulate = {
  path: "reactions.user",
  select: "name profileImage",
};

/**
 * One reaction per user per message:
 * — Same emoji again → remove (toggle off).
 * — Different emoji → replace previous reaction(s) for this user with the new emoji.
 * — New reaction → append.
 * $pull by `user` also clears duplicate rows if any existed historically.
 * Only conversation participants may react.
 */
export async function toggleMessageReaction({ messageId, userId, emoji: rawEmoji }) {
  const emoji = normalizeReactionEmoji(rawEmoji);
  if (!emoji) {
    return { ok: false, error: "Invalid emoji" };
  }

  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return { ok: false, error: "Invalid message id" };
  }

  const message = await ChatMessage.findById(messageId).select("sender receiver group reactions");
  if (!message) {
    return { ok: false, error: "Message not found" };
  }

  const uid = userId.toString();
  let isParticipant = message.sender.toString() === uid;
  if (!isParticipant && message.group) {
    // Group message — check membership
    const { default: ChatGroup } = await import("../model/chatGroup.model.js");
    const grp = await ChatGroup.findById(message.group).select("members");
    isParticipant = grp?.members.some((m) => m.toString() === uid) ?? false;
  } else if (!isParticipant && message.receiver) {
    isParticipant = message.receiver.toString() === uid;
  }
  if (!isParticipant) {
    return { ok: false, error: "Not authorized" };
  }

  const list = message.reactions ?? [];
  const mine = list.find((r) => r.user.toString() === uid);

  if (!mine) {
    await ChatMessage.updateOne({ _id: messageId }, { $push: { reactions: { user: userId, emoji } } });
  } else if (mine.emoji === emoji) {
    await ChatMessage.updateOne({ _id: messageId }, { $pull: { reactions: { user: userId } } });
  } else {
    await ChatMessage.updateOne({ _id: messageId }, { $pull: { reactions: { user: userId } } });
    await ChatMessage.updateOne({ _id: messageId }, { $push: { reactions: { user: userId, emoji } } });
  }

  const updated = await ChatMessage.findById(messageId).populate(reactionPopulate).lean();

  return {
    ok: true,
    reactions: updated.reactions ?? [],
    senderId: message.sender.toString(),
    receiverId: message.receiver ? message.receiver.toString() : null,
    groupId: message.group ? message.group.toString() : null,
  };
}

export { reactionPopulate };
