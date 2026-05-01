import Holiday from "../model/holiday.model.js";
import { resolveOrgAdminId } from "../utils/teamScope.js";

// ─── Shared utilities (imported by leave + attendance controllers) ────────────

/** Returns a Set of "YYYY-M-D" strings for all holidays in range for the org. */
export async function getOrgHolidayDatesInRange(orgAdminId, fromDate, toDate) {
  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);
  const to = new Date(toDate);
  to.setHours(23, 59, 59, 999);

  const holidays = await Holiday.find({
    $or: [{ orgAdmin: null }, ...(orgAdminId ? [{ orgAdmin: orgAdminId }] : [])],
    date: { $gte: from, $lte: to },
  })
    .select("date")
    .lean();

  return new Set(
    holidays.map((h) => {
      const d = new Date(h.date);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );
}

/** Counts calendar days between fromDate and toDate (inclusive) minus holidays. */
export function countWorkingDays(fromDate, toDate, holidaySet) {
  const cursor = new Date(fromDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);

  let count = 0;
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (!holidaySet.has(key)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Returns true if the given date falls on a holiday for the org. */
export async function isHolidayDate(orgAdminId, date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const next = new Date(d);
  next.setDate(next.getDate() + 1);

  const hit = await Holiday.findOne({
    $or: [{ orgAdmin: null }, ...(orgAdminId ? [{ orgAdmin: orgAdminId }] : [])],
    date: { $gte: d, $lt: next },
  })
    .select("name")
    .lean();

  return hit ? hit.name : null;
}

// ─── CRUD handlers ────────────────────────────────────────────────────────────

export const createHoliday = async (req, res) => {
  try {
    const orgAdminId = resolveOrgAdminId(req.user);
    const { name, date, type } = req.body;

    if (!name || !date) {
      return res.status(400).json({ success: false, message: "name and date are required" });
    }

    const holiday = await Holiday.create({
      orgAdmin: orgAdminId ?? null,
      name,
      date: new Date(date),
      type: type || "company",
    });

    return res.status(201).json({ success: true, holiday });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getHolidays = async (req, res) => {
  try {
    const orgAdminId = resolveOrgAdminId(req.user, req.query.orgContext ?? null);
    const { year } = req.query;

    const filter = {
      $or: [{ orgAdmin: null }, ...(orgAdminId ? [{ orgAdmin: orgAdminId }] : [])],
    };

    if (year) {
      const y = parseInt(year);
      filter.date = { $gte: new Date(y, 0, 1), $lte: new Date(y, 11, 31, 23, 59, 59) };
    }

    const holidays = await Holiday.find(filter).sort({ date: 1 }).lean();
    return res.status(200).json({ success: true, holidays });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Holiday.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Holiday not found" });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    if (
      req.user.role !== "super-admin" &&
      existing.orgAdmin?.toString() !== orgAdminId?.toString()
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { name, date, type } = req.body;
    if (name !== undefined) existing.name = name;
    if (date !== undefined) existing.date = new Date(date);
    if (type !== undefined) existing.type = type;
    await existing.save();

    return res.status(200).json({ success: true, holiday: existing });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Holiday.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Holiday not found" });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    if (
      req.user.role !== "super-admin" &&
      existing.orgAdmin?.toString() !== orgAdminId?.toString()
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    await Holiday.findByIdAndDelete(id);
    return res.status(200).json({ success: true, message: "Holiday deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
