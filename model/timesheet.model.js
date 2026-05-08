import mongoose from "mongoose";

const timesheetEntrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    hours: {
      type: Number,
      required: true,
      min: 0.25,
      max: 24,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    billable: {
      type: Boolean,
      default: true,
    },
    weekNumber: {
      type: Number,
    },
    year: {
      type: Number,
    },
  },
  { timestamps: true }
);

// Auto-compute weekNumber and year before saving
timesheetEntrySchema.pre("save", function (next) {
  const d = new Date(this.date);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d - jan1) / 86400000);
  this.weekNumber = Math.ceil((dayOfYear + jan1.getDay() + 1) / 7);
  this.year = d.getFullYear();
  next();
});

timesheetEntrySchema.index({ user: 1, date: 1 });

const TimesheetEntry = mongoose.model("TimesheetEntry", timesheetEntrySchema);
export default TimesheetEntry;
