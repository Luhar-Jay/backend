import mongoose from "mongoose";

const chatGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: "", trim: true, maxlength: 300 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    groupImage: { type: String, default: null },
  },
  { timestamps: true }
);

chatGroupSchema.index({ members: 1 });

const ChatGroup = mongoose.model("ChatGroup", chatGroupSchema);
export default ChatGroup;
