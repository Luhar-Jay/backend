// middleware/authenticate.js
import jwt from "jsonwebtoken";
import User from "../model/user.model.js";

export const authenticateMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ decoded should contain { id, role }
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_INACTIVE",
        message:
          "Your account has been deactivated. You have been signed out. Please contact an administrator if you need access.",
      });
    }

    // ✅ Attach role and _id properly
    req.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: Array.isArray(user.role) ? user.role[0] : user.role,
      managedBy: user.managedBy ?? null,
    };

    next();
  } catch (error) {
    const name = error && typeof error === "object" ? error.name : "";
    if (name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        code: "TOKEN_EXPIRED",
        message: "Access token expired",
      });
    }
    if (name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN",
        message: "Invalid or malformed token",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Error authenticating user",
      error: error.message,
    });
  }
};
