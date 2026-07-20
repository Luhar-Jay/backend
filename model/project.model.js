import mongoose from "mongoose";

// Admin-defined custom Kanban statuses (columns) for a project.
// The four base statuses (pending/in_progress/review/completed) are static and
// are NOT stored here — only extra columns the admin adds.
const customStatusSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: String,
      default: "slate",
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const projectSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orgAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    projectName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    customStatuses: {
      type: [customStatusSchema],
      default: [],
    },
    // Base statuses (pending/in_progress/review/completed) that the admin has
    // removed from this project's board.
    hiddenBaseStatuses: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

const Project = mongoose.model("Project", projectSchema);

export default Project;