import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    orgAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null = national (visible to all orgs)
    },
    name: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    type: {
      type: String,
      enum: ["national", "company"],
      default: "company",
    },
  },
  { timestamps: true }
);

holidaySchema.index({ orgAdmin: 1, date: 1 });

const Holiday = mongoose.model("Holiday", holidaySchema);
export default Holiday;
