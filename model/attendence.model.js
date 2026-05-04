import mongoose from "mongoose";

const breakEntrySchema = new mongoose.Schema(
  {
    breakStart: Date,
    breakEnd: Date,
    totalBreakTime: Number,
  },
  { _id: false }
);

const segmentSchema = new mongoose.Schema(
  {
    punchInTime: Date,
    punchOutTime: Date,
    breaks: [breakEntrySchema],
    totalTime: { type: Number, default: 0 },
  },
  { _id: false }
);

const regularizationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reason: { type: String, default: "" },
    requestedPunchIn: { type: Date, default: null },
    requestedPunchOut: { type: Date, default: null },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    requestedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    resolverNote: { type: String, default: "" },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      default: () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
      },
    },
    status: {
      type: String,
      enum: ["not_started", "working", "on_break", "completed", "holiday"],
      default: "not_started",
    },
    punchInTime: { type: Date, default: null },
    punchOutTime: { type: Date, default: null },
    breaks: [breakEntrySchema],
    totalTime: { type: Number, default: 0 },
    segments: { type: [segmentSchema], default: [] },
    /** Sum of completed segment work times for this calendar day. */
    dayTotalMs: { type: Number, default: 0 },
    legacySegmentsMigrated: { type: Boolean, default: false },
    // Correction / audit trail
    isManuallyEdited: { type: Boolean, default: false },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    editedAt: { type: Date, default: null },
    note: { type: String, default: "" },
    // Regularization request (employee-initiated correction)
    regularization: { type: regularizationSchema, default: null },
  },
  { timestamps: true }
);

// One attendance record per user per calendar day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
