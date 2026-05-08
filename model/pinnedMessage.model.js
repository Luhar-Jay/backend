import mongoose from "mongoose";

const pinnedMessageSchema = new mongoose.Schema(
  {
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatMessage",
      required: true,
    },
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // For group pins
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatGroup",
      default: null,
    },
    // For DM pins — store both participants (dmUser1 < dmUser2 lexicographically)
    dmUser1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dmUser2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

pinnedMessageSchema.index({ group: 1, message: 1 }, { unique: true, sparse: true });
pinnedMessageSchema.index({ dmUser1: 1, dmUser2: 1, message: 1 }, { unique: true, sparse: true });

const PinnedMessage = mongoose.model("PinnedMessage", pinnedMessageSchema);

export default PinnedMessage;
