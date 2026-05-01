import mongoose from "mongoose";

const leaveSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: ["paidLeave", "unpaidLeave"],
    default: "unpaidLeave",
  },
  days: {
    type: String,
    enum: ["single", "multiple"],
    required: true,
  },
  subType: {
    type: String,
    enum: ["halfDay", "fullDay"],
    default: "fullDay",
  },
  fromDate: {
    type: Date,
    required: true,
  },
  toDate: {
    type: Date,
  },
  reason: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  adminComment: {
    type: String,
  },
  /** Days reserved from paid pool at apply time (for accurate refund on reject) */
  deductedFromPaid: { type: Number, default: 0 },
  /** Days reserved from annual totalBalance at apply time */
  deductedFromAnnual: { type: Number, default: 0 },
  /** Calendar days minus holidays — authoritative day count for balance ops */
  workingDays: { type: Number, default: null },
}, { timestamps: true });

// Prevents duplicate leave records from concurrent submissions (BUG-011)
leaveSchema.index({ user: 1, fromDate: 1, toDate: 1 }, { unique: true });

const Leave = mongoose.model("Leave", leaveSchema);
export default Leave;
