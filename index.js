import "./loadEnv.js";
import http from "http";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { connectDB } from "./utils/db.js";
import healthCheck from "./routes/healthCheck.js";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import taskRoutes from "./routes/task.routes.js";
import attendanceRoutes from "./routes/attendence.routes.js";
import leaveRoutes from "./routes/leave.routes.js";
import hiringRoutes from "./routes/hiring.route.js";
import salaryRoutes from "./routes/salary.routes.js";
import { generateOpenAPIDocument } from "./swagger/index.js";
import notesRoutes from "./routes/notes.routes.js";
import eventRoutes from "./routes/event.routes.js";
import announcementRoutes from "./routes/announcement.routes.js";
import assetRoutes from "./routes/asset.routes.js";
import timesheetRoutes from "./routes/timesheet.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import organizationRoutes from "./routes/organization.routes.js";
import holidayRoutes from "./routes/holiday.routes.js";
import interviewRoutes from "./routes/interview.routes.js";
import clientRoutes from "./routes/client.routes.js";
import leadRoutes from "./routes/lead.routes.js";
import contactLogRoutes from "./routes/contactLog.routes.js";
import expensesRoutes from "./routes/expenses.routes.js";
import expenseCategoryRoutes from "./routes/expenseCategory.routes.js";

import { startReminderJob } from "./jobs/reminderJob.js";
import { initSocket } from "./utils/socket.js";
import cookieParser from "cookie-parser";

const app = express();
// Avoid 304 Not Modified for API JSON responses (frontend expects a body).
app.set("etag", false);
const allowedOrigins = [
  ...(process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  "https://frontend-zeta-eight-57.vercel.app",
  "http://localhost:5051"
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
// Force APIs to be non-cacheable (prevents browser conditional requests / 304s).
app.use("/api/v1", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});

const PORT = process.env.PORT || 5051;

app.get("/", (req, res) => {
    res.send("Hello World");
});

app.use("/api/v1/health", healthCheck);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/project", projectRoutes);
app.use("/api/v1/task", taskRoutes);
app.use("/api/v1/attendance", attendanceRoutes);
app.use("/api/v1/leave", leaveRoutes);
app.use("/api/v1/hiring", hiringRoutes);
app.use("/api/v1/salary", salaryRoutes);
app.use("/api/v1/notes", notesRoutes);
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/announcements", announcementRoutes);
app.use("/api/v1/assets", assetRoutes);
app.use("/api/v1/timesheets", timesheetRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/organization", organizationRoutes);
app.use("/api/v1/holidays", holidayRoutes);
app.use("/api/v1/interviews", interviewRoutes);
app.use("/api/v1/clients", clientRoutes);
app.use("/api/v1/leads", leadRoutes);
app.use("/api/v1/contact-logs", contactLogRoutes);
app.use("/api/v1/expenses", expensesRoutes);
app.use("/api/v1/expense-categories", expenseCategoryRoutes);

const swaggerDocument = generateOpenAPIDocument();
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get("/api-docs.json", (req, res) => res.json(swaggerDocument));

const server = http.createServer(app);
initSocket(server);

const startServer = async () => {
  await connectDB();
  startReminderJob();
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Swagger UI: http://localhost:${PORT}/api-docs`);
  });
};

startServer();
