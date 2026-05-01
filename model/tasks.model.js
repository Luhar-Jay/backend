import mongoose from "mongoose";

const querySchema = new mongoose.Schema({
  message: {
    type: String,
    required: true,
  },
  reply: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ["open", "resolved"],
    default: "open",
  },
}, {timestamps: true});

const subtaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  order: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

const commentSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
  },
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }],
}, { timestamps: true });

const attachmentSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  mimetype: {
    type: String,
    default: "",
  },
  size: {
    type: Number,
    default: 0,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
}, { timestamps: true });

const taskSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    taskName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    dueDate: {
      type: Date,
      default: null,
    },
    archived: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "urgent"],
      default: "low",
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "review", "completed"],
      default: "pending",
    },
    queries:{
      type: [querySchema],
    },
    subtasks: {
      type: [subtaskSchema],
      default: [],
    },
    comments: {
      type: [commentSchema],
      default: [],
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    timeEstimate: {
      type: Number,
      default: null,
    },
    timeLogged: {
      type: Number,
      default: 0,
    },
    templateName: {
      type: String,
      default: null,
      trim: true,
    },
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },
    totalTime: {
      type: String,
    },
  },
  { timestamps: true }
);

taskSchema.pre("save", async function (next) {
  if (this.isModified("status")) {
    if (this.status === "in_progress" && !this.startTime) {
      this.startTime = new Date();
    }
    if (this.status === "completed" && !this.endTime) {
      this.endTime = new Date();
      if (this.startTime) {
        this.totalTime = this.endTime.getTime() - this.startTime.getTime();
      }
    }
  }
  next();
});

const Task = mongoose.model("Task", taskSchema)
export default Task