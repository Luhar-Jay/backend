import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema({
  interviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  rating: { type: Number, min: 1, max: 5, default: null },
  notes: { type: String, default: "" },
  recommendation: {
    type: String,
    enum: ["proceed", "hold", "reject"],
    default: "hold",
  },
  submittedAt: { type: Date, default: null },
});

const interviewSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hiring",
      required: true,
    },
    orgAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    scheduledAt: { type: Date, required: true },
    interviewers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    feedback: [feedbackSchema],
    result: {
      type: String,
      enum: ["pending", "passed", "failed"],
      default: "pending",
    },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

const Interview = mongoose.model("Interview", interviewSchema);
export default Interview;
