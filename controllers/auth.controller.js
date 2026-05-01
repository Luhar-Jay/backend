import User from "../model/user.model.js";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import {
  canAccessUserProfile,
  resolveOrgAdminId,
} from "../utils/teamScope.js";
import crypto from "crypto";
import { sendEmail } from "../utils/mailService/sendMail.js";
import { verifyEmailTemplate } from "../utils/mailService/verifyEmailTemplate.js";
import {
  setAuthCookies,
  setAccessCookie,
  clearAuthCookies,
} from "../utils/authCookies.js";

const buildLoginRedirectUrl = () => {
  if (process.env.FRONTEND_LOGIN_URL) return process.env.FRONTEND_LOGIN_URL;
  if (process.env.FRONTEND_URL) return `${process.env.FRONTEND_URL.replace(/\/$/, "")}/login`;
  return "http://localhost:5173/login";
};

const ADMIN_ASSIGNABLE_ROLES = ["employee", "hr", "manager"];

function getBackendBaseUrl(req) {
  return (
    process.env.BACKEND_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
}

function getFrontendBaseUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

function buildGoogleRedirectUri(req) {
  return `${getBackendBaseUrl(req)}/api/v1/auth/google/callback`;
}

function buildFrontendLoginUrl(pathAndQuery = "/login") {
  const base = getFrontendBaseUrl();
  const p = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  return `${base}${p}`;
}

function signJwtForUser(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
}

function refreshJwtSecret() {
  return process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
}

/** Long-lived refresh token (separate secret optional). Payload must include typ so access JWTs cannot be used here. */
function signRefreshTokenForUser(user) {
  return jwt.sign(
    { id: user._id, typ: "refresh" },
    refreshJwtSecret(),
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d" }
  );
}

export const registerUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      profileImage,
      address,
      phone,
      skills,
      education,
      experience,
      leaves,
      dob,
      aadharCardNumber,
      panCardNumber,
      bankAccountNo,
      bankName,
      bankIFSC,
      bankBranch,
      gender,
    } = req.body;

    // Step 1: Required field validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    // Step 2: Check for existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    const emailVerificationToken = crypto.randomBytes(32).toString("hex");
    const emailVerificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Step 3: Create a new user (auto-hash via pre('save'))
    const newUser = await User.create({
      name,
      email,
      password,
      profileImage,
      address,
      phone,
      skills,
      education,
      experience,
      leaves,
      dob,
      aadharCardNumber,
      panCardNumber,
      bankAccountNo,
      bankName,
      bankIFSC,
      bankBranch,
      gender,
      isEmailVerified: false,
      emailVerificationToken,
      emailVerificationExpiresAt,
    });

    const verifyLink = `${process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`}/api/v1/auth/verify-email?token=${emailVerificationToken}`;

    try {
      await sendEmail(
        newUser.email,
        "Verify your email address",
        verifyEmailTemplate({
          name: newUser.name,
          verifyUrl: verifyLink,
          expiryMinutes: 10,
          appName: "Task Management System",
          supportEmail: process.env.SUPPORT_EMAIL || "",
        })
      );
    } catch (mailError) {
      console.error("Error sending verification email:", mailError);
    }

    // Step 4: Prepare response (exclude password)
    const userResponse = newUser.toObject();
    delete userResponse.password;

    // Step 5: Send response
    return res.status(201).json({
      success: true,
      message: "User registered successfully. Please verify your email before login.",
      user: userResponse,
    });
  } catch (error) {
    console.error("Error registering user:", error);
    return res.status(500).json({
      success: false,
      message: "Error registering user",
      error: error.message,
    });
  }
};

/** Admin or super-admin creates a user with an explicit role (skips email verification). */
export const createUserByAdmin = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role: roleInput,
      phone,
      gender,
      dob,
      profileImage,
      address,
      skills,
      education,
      experience,
      leaves,
      aadharCardNumber,
      panCardNumber,
      bankAccountNo,
      bankName,
      bankIFSC,
      bankBranch,
    } = req.body;

    const actorRole = Array.isArray(req.user?.role)
      ? req.user.role[0]
      : req.user?.role;
    const requestedRole = Array.isArray(roleInput) ? roleInput[0] : roleInput;

    if (!name?.trim() || !email?.trim() || !password || !requestedRole) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password, and role are required",
      });
    }

    if (actorRole !== "admin" && actorRole !== "super-admin") {
      return res.status(403).json({
        success: false,
        message: "Only an admin or super-admin can create users this way",
      });
    }

    if (actorRole === "admin") {
      if (!ADMIN_ASSIGNABLE_ROLES.includes(requestedRole)) {
        return res.status(403).json({
          success: false,
          message:
            "You can only create users with roles: employee, hr, or manager",
        });
      }
    }

    const existingUser = await User.findOne({ email: email.trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    let managedBy = null;
    if (actorRole === "admin" && ADMIN_ASSIGNABLE_ROLES.includes(requestedRole)) {
      managedBy = req.user._id;
    }

    const newUser = await User.create({
      name: name.trim(),
      email: email.trim(),
      password,
      role: [requestedRole],
      managedBy,
      profileImage: profileImage ?? undefined,
      address: address ?? undefined,
      phone: phone ?? undefined,
      gender: gender ?? undefined,
      dob: dob ? new Date(dob) : undefined,
      skills: skills ?? undefined,
      education: education ?? undefined,
      experience: experience ?? undefined,
      leaves: leaves ?? undefined,
      aadharCardNumber: aadharCardNumber ?? undefined,
      panCardNumber: panCardNumber ?? undefined,
      bankAccountNo: bankAccountNo ?? undefined,
      bankName: bankName ?? undefined,
      bankIFSC: bankIFSC ?? undefined,
      bankBranch: bankBranch ?? undefined,
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    });

    const userResponse = newUser.toObject();
    delete userResponse.password;

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("Error creating user by admin:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating user",
      error: error.message,
    });
  }
};

export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "All fields are required",
    });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before logging in",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_INACTIVE",
        message:
          "Your account has been deactivated. Please contact an administrator.",
      });
    }

    const isPasswordCorrect = await user.comparePassword(password);

    if (!isPasswordCorrect) {
      return res.status(400).json({
        success: false,
        message: "Invalid password",
      });
    }

    // 🔐 Generate tokens
    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const refreshToken = signRefreshTokenForUser(user);

    setAuthCookies(res, accessToken, refreshToken);

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: userResponse,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error logging in",
      error: error.message,
    });
  }
};

export const verifyUserEmail = async (req, res) => {
  try {
    const { token } = req.query;
    const redirectUrl = buildLoginRedirectUrl();

    if (!token) {
      return res.redirect(`${redirectUrl}?verified=false&reason=missing_token`);
    }

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res.redirect(`${redirectUrl}?verified=false&reason=invalid_or_expired`);
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpiresAt = null;
    await user.save();

    return res.redirect(`${redirectUrl}?verified=true`);
  } catch (error) {
    console.error("Error verifying email:", error);
    return res.redirect(`${buildLoginRedirectUrl()}?verified=false&reason=server_error`);
  }
};

export const getSessionUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error loading session",
      error: error.message,
    });
  }
};

export const getUser = async (req, res) => {
  const userId = req.params.id;
  try {
    const allowed = await canAccessUserProfile(req.user, userId);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view this user",
      });
    }
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "User fetched successfully",
      user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: error.message,
    });
  }
};

const parseField = (value) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

export const updateUser = async (req, res) => {
  const userId = req.params.id;

  const {
    name,
    email,
    password,
    role,
    phone,
    dob,
    aadharCardNumber,
    panCardNumber,
    bankAccountNo,
    bankName,
    bankIFSC,
    bankBranch,
    gender,
    isActive,
  } = req.body;

  const profileImage = req.file ? req.file.path : req.body.profileImage;

  const address = parseField(req.body.address);
  const skills = parseField(req.body.skills);
  const education = parseField(req.body.education);
  const experience = parseField(req.body.experience);
  const leaves = parseField(req.body.leaves);

  try {
    if (role !== undefined) {
      const actorRole = req.user?.role;
      const normalizedRoles = Array.isArray(role) ? role : [role];

      if (!["super-admin", "admin"].includes(actorRole)) {
        return res.status(403).json({
          success: false,
          message: "Only admin or super-admin can change roles",
        });
      }

      if (
        actorRole === "admin" &&
        normalizedRoles.some((requestedRole) => !ADMIN_ASSIGNABLE_ROLES.includes(requestedRole))
      ) {
        return res.status(403).json({
          success: false,
          message: "Admin can assign only employee, hr, or manager roles",
        });
      }
    }

    const normalizedRole = role !== undefined ? (Array.isArray(role) ? role : [role]) : undefined;

    const targetBefore = await User.findById(userId).select("role managedBy");
    if (targetBefore) {
      const canEdit = await canAccessUserProfile(req.user, userId);
      if (!canEdit) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to update this user",
        });
      }
    }

    const actorRoleFlat =
      Array.isArray(req.user?.role) ? req.user.role[0] : req.user?.role;

    if (isActive !== undefined) {
      if (!["super-admin", "admin"].includes(actorRoleFlat)) {
        return res.status(403).json({
          success: false,
          message: "Only an admin or super-admin can change account active status",
        });
      }
      if (userId === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          message: "You cannot change the active status of your own account",
        });
      }
      const targetRoles = targetBefore?.role
        ? Array.isArray(targetBefore.role)
          ? targetBefore.role
          : [targetBefore.role]
        : [];
      if (actorRoleFlat === "admin" && targetRoles.includes("super-admin")) {
        return res.status(403).json({
          success: false,
          message: "Only a super-admin can change status for a super-admin account",
        });
      }
    }

    const updateData = {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(password !== undefined && { password }),
      ...(normalizedRole !== undefined && { role: normalizedRole }),
      ...(profileImage !== undefined && { profileImage }),
      ...(phone !== undefined && { phone }),
      ...(dob !== undefined && { dob }),
      ...(aadharCardNumber !== undefined && { aadharCardNumber }),
      ...(panCardNumber !== undefined && { panCardNumber }),
      ...(bankAccountNo !== undefined && { bankAccountNo }),
      ...(bankName !== undefined && { bankName }),
      ...(bankIFSC !== undefined && { bankIFSC }),
      ...(bankBranch !== undefined && { bankBranch }),
      ...(gender !== undefined && { gender }),
      ...(address !== undefined && { address }),
      ...(skills !== undefined && { skills }),
      ...(education !== undefined && { education }),
      ...(experience !== undefined && { experience }),
      ...(leaves !== undefined && { leaves }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    };

    if (actorRoleFlat === "admin" && userId !== req.user._id.toString()) {
      const effectiveRoles = normalizedRole
        ? normalizedRole
        : targetBefore?.role
          ? Array.isArray(targetBefore.role)
            ? targetBefore.role
            : [targetBefore.role]
          : [];
      const isTeamRole = effectiveRoles.some((r) =>
        ADMIN_ASSIGNABLE_ROLES.includes(r)
      );
      const isAdminRole = effectiveRoles.some((r) => r === "admin");
      if (isAdminRole) {
        updateData.managedBy = null;
      } else if (isTeamRole) {
        updateData.managedBy = req.user._id;
      }
    }

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select("-password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating user",
      error: error.message,
    });
  }
};

/**
 * Lightweight team directory available to ANY authenticated user in the org.
 * Returns just the fields needed to render a birthday feed / team list.
 */
export const getTeamBirthdays = async (req, res) => {
  try {
    const actorRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;

    let query;
    if (actorRole === "super-admin") {
      query = {};
    } else {
      const orgAdminId = resolveOrgAdminId(req.user);
      if (!orgAdminId) {
        query = { _id: req.user._id };
      } else {
        query = {
          $or: [
            { _id: req.user._id },
            { _id: orgAdminId },
            { managedBy: orgAdminId },
          ],
        };
      }
    }

    const users = await User.find(query)
      .select("_id name profileImage role dob")
      .lean();

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching team birthdays",
      error: error.message,
    });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const actorRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
    let query = {};

    if (actorRole === "super-admin") {
      query = {};
    } else if (actorRole === "admin") {
      // If the admin is viewing their joined-org context, scope to that org's users.
      if (req.query.orgContext === "member" && req.user.managedBy) {
        query = {
          $or: [{ _id: req.user._id }, { managedBy: req.user.managedBy }],
        };
      } else {
        query = {
          $or: [{ _id: req.user._id }, { managedBy: req.user._id }],
        };
      }
    } else if (actorRole === "hr") {
      const orgAdminId = resolveOrgAdminId(req.user, req.query.orgContext ?? null);
      if (!orgAdminId) {
        query = { _id: req.user._id };
      } else {
        query = {
          $or: [
            { _id: req.user._id },
            { _id: orgAdminId },
            { managedBy: orgAdminId },
          ],
        };
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Not authorized to list users",
      });
    }

    const users = await User.find(query).select("-password");

    return res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      users,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching all users",
      error: error.message,
    });
  }
};

export const deleteUser = async (req, res) => {
  const userId = req.params.id;

  try {
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account here",
      });
    }

    const allowed = await canAccessUserProfile(req.user, userId);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this user",
      });
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
      user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error deleting user",
      error: error.message,
    });
  }
};

export const logoutUser = async (req, res) => {
  try {
    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error during logout",
      error: error.message,
    });
  }
};

export const refreshToken = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  try {
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, refreshJwtSecret());
    } catch (e) {
      const name = e && typeof e === "object" ? e.name : "";
      const message =
        name === "TokenExpiredError"
          ? "Refresh token expired. Please sign in again."
          : "Invalid refresh token. Please sign in again.";
      return res.status(401).json({
        success: false,
        code: "REFRESH_INVALID",
        message,
      });
    }
    if (!decoded || decoded.typ !== "refresh" || !decoded.id) {
      return res.status(401).json({
        success: false,
        code: "REFRESH_INVALID",
        message: "Invalid refresh token. Please sign in again.",
      });
    }
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        code: "REFRESH_INVALID",
        message: "User not found. Please sign in again.",
      });
    }
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_INACTIVE",
        message:
          "Your account has been deactivated. Please contact an administrator to restore access.",
      });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });
    setAccessCookie(res, token);
    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error refreshing token",
      error: error.message,
    });
  }
};

export const googleAuthStart = async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({
        success: false,
        message: "GOOGLE_CLIENT_ID is not configured on the backend",
      });
    }

    const redirectUri = buildGoogleRedirectUri(req);
    const state = crypto.randomBytes(16).toString("hex");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", "select_account");

    return res.redirect(authUrl.toString());
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to start Google authentication",
      error: error.message,
    });
  }
};

export const googleAuthCallback = async (req, res) => {
  const frontendLogin = buildFrontendLoginUrl("/login");
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(
        `${frontendLogin}?google=fail&reason=missing_google_config`
      );
    }

    const { code, error } = req.query;
    if (error) {
      return res.redirect(
        `${frontendLogin}?google=fail&reason=${encodeURIComponent(String(error))}`
      );
    }
    if (!code) {
      return res.redirect(`${frontendLogin}?google=fail&reason=missing_code`);
    }

    const redirectUri = buildGoogleRedirectUri(req);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      return res.redirect(
        `${frontendLogin}?google=fail&reason=token_exchange_failed&message=${encodeURIComponent(
          tokenJson?.error_description || tokenJson?.error || "Token exchange failed"
        )}`
      );
    }

    const idToken = tokenJson?.id_token;
    if (!idToken) {
      return res.redirect(`${frontendLogin}?google=fail&reason=missing_id_token`);
    }

    const oAuthClient = new OAuth2Client(clientId);
    const ticket = await oAuthClient.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();

    const email = payload?.email;
    if (!email) {
      return res.redirect(`${frontendLogin}?google=fail&reason=missing_email`);
    }

    let user = await User.findOne({ email: email.trim().toLowerCase() });

    if (user && user.isActive === false) {
      const msg = encodeURIComponent(
        "Your account has been deactivated. Please contact an administrator to restore access."
      );
      return res.redirect(`${frontendLogin}?reason=account_inactive&message=${msg}`);
    }

    if (!user) {
      const randomPassword = crypto.randomBytes(24).toString("hex");
      user = await User.create({
        name: payload?.name || email.split("@")[0],
        email: email.trim().toLowerCase(),
        password: randomPassword,
        profileImage: payload?.picture || null,
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      });
    } else {
      // Keep user profile reasonably fresh; do not overwrite intentionally managed data.
      const updates = {};
      if (!user.isEmailVerified) updates.isEmailVerified = true;
      if (!user.profileImage && payload?.picture) updates.profileImage = payload.picture;
      if (Object.keys(updates).length) {
        user = await User.findByIdAndUpdate(user._id, updates, { new: true });
      }
    }

    const accessToken = signJwtForUser(user);
    const refreshJwt = signRefreshTokenForUser(user);
    setAuthCookies(res, accessToken, refreshJwt);
    return res.redirect(`${frontendLogin}?provider=google`);
  } catch (err) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String(err.message)
        : "Unknown error";
    console.error("Google auth callback error:", err);
    return res.redirect(
      `${frontendLogin}?google=fail&reason=server_error&message=${encodeURIComponent(
        message
      )}`
    );
  }
};