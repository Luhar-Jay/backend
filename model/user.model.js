import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: [String],
      enum: ["super-admin", "admin", "employee", "hr", "manager"],
      default: "admin",
    },
    profileImage: {
      type: String,
      default: null,
    },
    address: [
      {
        address: {
          type: String,
        },
        city: {
          type: String,
        },
      },
    ],
    phone: {
      type: String,
      default: null,
    },
    skills: [
      {
        skill: {
          type: String,
        },
        yearsOfExperience: {
          type: Number,
        },
      },
    ],
    education: [
      {
        degree: String,
        institution: String,
        year: Number,
        specialization: String,
      },
    ],
    experience: [
      {
        company: {
          type: String,
        },
        position: {
          type: String,
        },
        startDate: {
          type: Date,
        },
        endDate: {
          type: Date,
        },
      },
    ],

    leaves: [
      {
        totalBalance: {
          type: Number,
          default: 24,
        },

        paidLeave: {
          type: Number,
          default: 12,
        },
        leaveTaken: {
          type: Number,
          default: 0,
        },
      },
    ],

    dob: {
      type: Date,
      default: null,
    },
    aadharCardNumber: { type: String },
    panCardNumber: { type: String },
    bankAccountNo: { type: String },
    bankName: { type: String },
    bankIFSC: { type: String },
    bankBranch: { type: String },
    gender: {
      type: String,
      enum: ["male", "female"],
      default: "male",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /** Admin who manages this user (employees / hr / manager under an admin). */
    managedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /** The organization this user created and owns (admin context). */
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    /** The organization this user joined as a member/employee (not as owner). */
    memberOrganization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
    },
    emailVerificationExpiresAt: {
      type: Date,
      default: null,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
