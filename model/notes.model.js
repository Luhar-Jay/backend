import mongoose from "mongoose";

const notesSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    title: {
        type: String,
        default: "",
    },
    content: {
        type: String,
        default: "",
    },
    isArchived: {
        type: Boolean,
        default: false,
    },
    isPinned: {
        type: Boolean,
        default: false,
    },
    /** Preset id: lemon | mint | sky | lilac | peach | paper */
    color: {
        type: String,
        enum: ["lemon", "mint", "sky", "lilac", "peach", "paper"],
        default: "lemon",
    },
    tags: {
        type: [String],
        default: [],
    },
    /** Horizontal position on board (0–100, % from left). */
    positionX: {
        type: Number,
        default: 12,
    },
    /** Vertical position on board (0–100, % from top). */
    positionY: {
        type: Number,
        default: 12,
    },

    attachments: [{
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        name: { type: String, required: true },
        mimeType: { type: String, default: "" },
        size: { type: Number, default: 0 },
    }],

    checklist: [{
        text: { type: String, required: true },
        checked: { type: Boolean, default: false },
    }],

}, { timestamps: true });

notesSchema.index({ user: 1, isArchived: 1 });

const Notes = mongoose.model("Notes", notesSchema);
export default Notes;
