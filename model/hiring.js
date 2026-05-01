import mongoose from "mongoose";

const hiringSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        required: true,
    },
    resume:{
        type: String,
        required: true,
    },
    currentSalary:{
        type: Number
    },
    expectedSalary:{
        type: Number
    },
    noticePeriod:{
        type: String
    },
    skills:{
        type: [String]
    },
    experience:{
        type: String
    },
    linkedInProfile:{
        type: String
    },
    gitHubLink:{
        type: String
    },
    portfolioLink:{
        type: String
    },
    status:{
        type: String,
        enum: ["pending", "shortlisted", "rejected", "hired"],
        default: "pending",
    },
    note:{
        type: String
    },
    stage: {
        type: String,
        enum: ["applied", "screening", "interview_scheduled", "offer", "hired", "rejected"],
        default: "applied",
    },
    orgAdmin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
}, {timestamps: true});

const Hiring = mongoose.model("Hiring", hiringSchema);
export default Hiring;