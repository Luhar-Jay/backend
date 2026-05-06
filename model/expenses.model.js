import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be greater than 0"],
    },

    expenseDate: {
      type: Date,
      required: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    receiptUrl: {
      type: String,
      default: null,
    },

    receiptPublicId: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected", "reimbursed"],
      default: "pending",
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: "",
    },

    reimbursedAt: {
      type: Date,
      default: null,
    },

    payrollIncluded: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

expenseSchema.index({ employee: 1, expenseDate: -1 });
expenseSchema.index({ organization: 1, status: 1 });
expenseSchema.index({ organization: 1, expenseDate: -1 });

const Expense = mongoose.model("Expense", expenseSchema);
export default Expense;