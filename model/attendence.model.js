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
    punchInTime: {
      type: Date,
      default: null,
    },
    punchOutTime: {
      type: Date,
      default: null,
    },
    breaks: [breakEntrySchema],
    totalTime: {
      type: Number,
      default: 0,
    },
    /** Finished in/out segments today (ms worked per segment, breaks applied). */
    segments: {
      type: [segmentSchema],
      default: [],
    },
    /** Sum of `segments[].totalTime` — resets on a new calendar day (new doc). */
    dayTotalMs: {
      type: Number,
      default: 0,
    },
    /** Once true, legacy completed-day single-session data was copied into `segments` (punch-in idempotency). */
    legacySegmentsMigrated: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
