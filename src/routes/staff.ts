// Routes : Équipe (planning, duplication de semaine)
import { Router } from "express";
import type { Database } from "sqlite";
import { requireString, optionalString } from "../middleware/validate.js";
import type { AuditLogger } from "../services/audit.js";

export default function createRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

router.get("/api/staff", async (req, res) => {
try {
  const { start, end } = req.query;
  const staff = await db.all("SELECT * FROM staff WHERE active = 1");
  const result: Array<Record<string, unknown>> = [];
  for (const member of staff) {
    let scheduleRows;
    if (start && end) {
      scheduleRows = await db.all("SELECT * FROM staff_schedule WHERE staff_id = ? AND date >= ? AND date <= ?", [member.id, start, end]);
    } else {
      scheduleRows = await db.all("SELECT * FROM staff_schedule WHERE staff_id = ?", [member.id]);
    }
    
    const schedule = {};
    scheduleRows.forEach((row) => {
      const key = row.date || row.day; 
      if (!schedule[key]) schedule[key] = [];
      schedule[key].push({
        start: row.start_time,
        end: row.end_time,
      });
    });
    
    result.push({
      id: member.id,
      name: member.name,
      role: member.role,
      hourlyRate: member.hourly_rate,
      schedule,
    });
  }
  res.json(result);
} catch (error) {
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch staff" });
}
});
router.post("/api/staff", async (req, res) => {
try {
  if (!requireString(req, res, "name", 100)) return;
  const { id, name, role, hourlyRate, schedule, datesObj } = req.body;
  const roleVal = optionalString(req, "role", 100) || "";
  const rateVal = typeof hourlyRate === "number" && Number.isFinite(hourlyRate) ? hourlyRate : 0;
  const staffId = id || Math.random().toString(36).substring(2, 9);
  await db.run(
    "INSERT OR REPLACE INTO staff (id, name, role, hourly_rate) VALUES (?, ?, ?, ?)",
    [staffId, name, roleVal, rateVal],
  );
  if (schedule) {
    if(datesObj) {
       const dates = Object.values(datesObj);
       if(dates.length > 0) {
         const placeholders = dates.map(() => '?').join(',');
         await db.run(`DELETE FROM staff_schedule WHERE staff_id = ? AND date IN (${placeholders})`, [staffId, ...dates]);
       }
    } else {
       await db.run("DELETE FROM staff_schedule WHERE staff_id = ?", [staffId]);
    }

    for (const dayOrDate of Object.keys(schedule)) {
      for (const slot of schedule[dayOrDate]) {
        await db.run(
          "INSERT INTO staff_schedule (id, staff_id, day, date, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)",
          [
            Math.random().toString(36).substring(2, 9),
            staffId,
            dayOrDate, 
            dayOrDate, 
            slot.start,
            slot.end,
          ],
        );
      }
    }
  }
  await logAudit(req, res, { route: "/api/staff", action: "create", entite: staffId, payload: { apres: { name: name, role: roleVal, hourly_rate: rateVal } } });
  res.json({ status: "success", id: staffId });
} catch (error) {
  console.error(error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to save staff member" });
}
});
router.delete("/api/staff/:id", async (req, res) => {
try {
  await db.run("UPDATE staff SET active = 0 WHERE id = ?", [req.params.id]);
  await logAudit(req, res, { route: "/api/staff/:id", action: "delete", entite: req.params.id, payload: { apres: { active: 0 } } });
  res.json({ status: "success" });
} catch (error) {
  res
    .status(500)
    .json({ status: "error", message: "Failed to delete staff member" });
}
});
router.post("/api/staff/duplicate-week", async (req, res) => {
try {
  const { currentWeekStart, prevWeekStart } = req.body;
  if (!currentWeekStart || !prevWeekStart) return res.status(400).json({ status: "error", message: "Missing dates" });
  
  const currentEndDay = new Date(currentWeekStart);
  currentEndDay.setDate(currentEndDay.getDate() + 6);
  const currentEndStr = currentEndDay.toISOString().split('T')[0];

  const prevEndDay = new Date(prevWeekStart);
  prevEndDay.setDate(prevEndDay.getDate() + 6);
  const prevEndStr = prevEndDay.toISOString().split('T')[0];

  const prevEntries = await db.all("SELECT * FROM staff_schedule WHERE date >= ? AND date <= ?", [prevWeekStart, prevEndStr]);
  await db.run("DELETE FROM staff_schedule WHERE date >= ? AND date <= ?", [currentWeekStart, currentEndStr]);

  for (const entry of prevEntries) {
      const eDate = new Date(entry.date);
      eDate.setUTCDate(eDate.getUTCDate() + 7);
      const newDateStr = eDate.toISOString().split('T')[0];

      await db.run(
          "INSERT INTO staff_schedule (id, staff_id, day, date, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)",
          [
            Math.random().toString(36).substring(2, 9),
            entry.staff_id,
            entry.day,
            newDateStr,
            entry.start_time,
            entry.end_time
          ]
      );
  }
  await logAudit(req, res, { route: "/api/staff/duplicate-week", action: "create", payload: { semaine_source: prevWeekStart, semaine_cible: currentWeekStart, lignes: prevEntries.length } });
  res.json({ status: "success" });
} catch (error) {
  console.error(error);
  res.status(500).json({ status: "error", message: "Failed to duplicate week" });
}
});

  return router;
}
