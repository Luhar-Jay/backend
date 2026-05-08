import mongoose from "mongoose";

const messageBookmarkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatMessage",
      required: true,
    },
    note: {
      type: String,
      default: "",
      maxlength: 200,
      trim: true,
    },
  },
  { timestamps: true }
);

messageBookmarkSchema.index({ user: 1, message: 1 }, { unique: true });
messageBookmarkSchema.index({ user: 1, createdAt: -1 });

const MessageBookmark = mongoose.model("MessageBookmark", messageBookmarkSchema);

export default MessageBookmark;
