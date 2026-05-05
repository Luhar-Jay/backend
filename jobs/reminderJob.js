import cron from "node-cron";
import mongoose from "mongoose";
import Event from "../model/event.model.js";
import User from "../model/user.model.js";
import { sendEmail } from "../utils/mailService/sendMail.js";

function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function eventReminderTemplate(ev) {
  const startStr = new Date(ev.start).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `
  <div style="font-family: system-ui, sans-serif; max-width: 480px; line-height: 1.5;">
    <h2 style="margin: 0 0 12px;">${escapeHtml(ev.title)}</h2>
    <p style="margin: 0 0 8px;"><strong>Starts:</strong> ${escapeHtml(startStr)}</p>
    <p style="margin: 0 0 8px;"><strong>Type:</strong> ${escapeHtml(ev.type || "")}</p>
    ${ev.location ? `<p style="margin: 0 0 8px;"><strong>Location:</strong> ${escapeHtml(ev.location)}</p>` : ""}
    ${ev.description ? `<p style="margin: 16px 0 0;"><strong>Description</strong></p><p style="margin: 4px 0 0;">${escapeHtml(ev.description)}</p>` : ""}
  </div>`;
}

async function collectRecipients(ev) {
  const emails = new Set();

  for (const a of ev.attendees || []) {
    const raw = a.email && String(a.email).trim();
    if (raw && raw.includes("@")) {
      emails.add(raw);
      continue;
    }
    const uid = a.userId;
    if (uid) {
      const id =
        typeof uid === "object" && uid !== null && uid.toString
          ? uid.toString()
          : String(uid);
      if (mongoose.isValidObjectId(id)) {
        const u = await User.findById(id).select("email").lean();
        const em = u?.email && String(u.email).trim();
        if (em && em.includes("@")) emails.add(em);
      }
    }
  }

  const rawCreator = ev.createdBy;
  if (typeof rawCreator === "object" && rawCreator !== null && rawCreator.email) {
    const em = String(rawCreator.email).trim();
    if (em.includes("@")) emails.add(em);
  } else {
    const id =
      typeof rawCreator === "object" && rawCreator !== null && rawCreator._id != null
        ? rawCreator._id
        : rawCreator;
    if (id && mongoose.isValidObjectId(String(id))) {
      const u = await User.findById(id).select("email").lean();
      const em = u?.email && String(u.email).trim();
      if (em && em.includes("@")) emails.add(em);
    }
  }

  return [...emails];
}

function baseDueReminderFilter(now) {
  return {
    reminderSent: false,
    reminderMinutes: { $gt: 0 },
    end: { $gt: now },
    recurrence: { $nin: ["daily", "weekly", "biweekly", "monthly"] },
    // Reminder time (start − offset) has passed — evaluated in MongoDB so we don’t rely only on cron timing
    $expr: {
      $lte: [
        {
          $subtract: [
            "$start",
            {
              $multiply: [{ $toDouble: { $ifNull: ["$reminderMinutes", 0] } }, 60_000],
            },
          ],
        },
        now,
      ],
    },
  };
}

/**
 * Send reminder for one event if still due (caller may skip time re-check).
 * @returns {"sent"|"skipped"|"failed"}
 */
async function trySendReminderForEvent(ev) {
  const mins = Number(ev.reminderMinutes);
  if (!Number.isFinite(mins) || mins <= 0) return "skipped";

  const startMs = new Date(ev.start).getTime();
  if (Number.isNaN(startMs)) return "skipped";
  const reminderAt = startMs - mins * 60_000;
  if (reminderAt > Date.now()) return "skipped";

  const html = eventReminderTemplate(ev);
  const recipients = await collectRecipients(ev);
  if (recipients.length === 0) {
    console.warn("[reminderJob] No recipients (add attendees with accounts or valid emails)", {
      id: String(ev._id),
      title: ev.title,
    });
    return "failed";
  }

  // sendEmail disabled — uncomment to send event reminder emails to attendees
  // let sentOk = 0;
  // for (const to of recipients) {
  //   try {
  //     await sendEmail(to, `Reminder: ${ev.title}`, html);
  //     sentOk += 1;
  //   } catch (err) {
  //     console.error("[reminderJob] Email failed", { to, id: String(ev._id), err: err.message });
  //   }
  // }
  let sentOk = 0;

  if (sentOk > 0) {
    await Event.updateOne({ _id: ev._id }, { $set: { reminderSent: true } });
    console.log("[reminderJob] Reminder sent", {
      id: String(ev._id),
      title: ev.title,
      recipients: recipients.length,
      sentOk,
    });
    return "sent";
  }

  console.error("[reminderJob] All sends failed; reminderSent left false for retry", {
    id: String(ev._id),
    title: ev.title,
  });
  return "failed";
}

export async function processReminderTick() {
  const now = new Date();
  const events = await Event.find(baseDueReminderFilter(now)).lean();

  if (process.env.REMINDER_DEBUG === "true") {
    console.log("[reminderJob] tick", {
      at: now.toISOString(),
      dueCount: events.length,
    });
  }

  for (const ev of events) {
    await trySendReminderForEvent(ev);
  }
}

/** Call after create/update so users are not waiting up to one minute for the cron tick. */
export function queueReminderCheckForEvent(eventId) {
  const id = eventId?.toString?.() ?? String(eventId);
  if (!mongoose.isValidObjectId(id)) return;
  setImmediate(() => {
    runReminderCheckForEventId(id).catch((err) =>
      console.error("[reminderJob] queueReminderCheckForEvent", err)
    );
  });
}

async function runReminderCheckForEventId(id) {
  const now = new Date();
  const ev = await Event.findOne({ _id: id, ...baseDueReminderFilter(now) }).lean();
  if (!ev) return;
  await trySendReminderForEvent(ev);
}

export function startReminderJob() {
  cron.schedule("* * * * *", () => {
    processReminderTick().catch((err) => console.error("reminderJob error", err));
  });

  const firstSec = Number(process.env.REMINDER_FIRST_RUN_SEC ?? 8);
  if (firstSec >= 0) {
    setTimeout(() => {
      processReminderTick().catch((err) => console.error("reminderJob error", err));
    }, firstSec * 1000);
  }

  console.log("Reminder cron scheduled (* * * * * — every minute). Set REMINDER_DEBUG=true for logs.");
}
