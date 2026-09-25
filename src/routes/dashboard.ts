// Routes : Tableau de bord (stats, couts, stock)
import { Router } from "express";
import type { Database } from "sqlite";
import { jourLocalISO } from "../shared/util.js";

export default function createRouter(db: Database) {
  const router = Router();

router.get("/api/dashboard/stats", async (req, res) => {
try {
  const lowStockItems = await db.all(
    "SELECT id, name, quantity, minStock, unit FROM inventory WHERE quantity <= minStock",
  );
  const lowStockIds =
    lowStockItems.length > 0
      ? lowStockItems.map((i) => "'stock_" + i.id + "'").join(",")
      : "'none'";
  await db.run(
    `DELETE FROM alerts WHERE id LIKE 'stock_%' AND id NOT IN (${lowStockIds})`,
  );
  const stmtAlerts = await db.prepare(
    "INSERT OR IGNORE INTO alerts (id, type, message, severity, status) VALUES (?, ?, ?, ?, ?)",
  );
  try {
    for (const item of lowStockItems) {
      const alertId = `stock_${item.id}`;
      const severity = item.quantity <= 0 ? "high" : "medium";
      const message = `Stock d'alerte : ${item.name} (${item.quantity} ${item.unit} restant pour un minimum de ${item.minStock} ${item.unit} param\xE9tr\xE9)`;
      await stmtAlerts.run(alertId, "stock", message, severity, "active");
    }
  } finally {
    await stmtAlerts.finalize();
  }
  const cost = await db.get(
    "SELECT SUM(quantity * unit_price) as total FROM inventory",
  );
  const alerts = await db.get(
    'SELECT COUNT(*) as count FROM alerts WHERE status = "active"',
  );
  const critical = await db.get(
    'SELECT COUNT(*) as count FROM inventory WHERE status = "critical"',
  );
  const daysOfWeek = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const today = daysOfWeek[new Date().getDay()];
  // Date ISO DU JOUR LOCAL: toISOString() serait UTC et, entre 00:00 et
  // 01:00 en CEST, donnerait la veille -> un cout journalier faux ce creneau-la.
  // Date du jour LOCAL par le helper partage (src/shared/util.ts: jourLocalISO).
  // La raison du LOCAL et non de UTC est consigneee sur le helper, pas ici (une borne
  // dupliquee se perime en silence -- la lecon des BUDGETS d'audit-perf.mjs).
  const todayISO = jourLocalISO(0);
  // ⚠ Le filtre porte sur `date` (la colonne que l'APP ecrit vraiment), pas sur
  // `day` seul. POST /api/staff ecrit day = date = "<ISO>" (StaffPlanning envoie
  // des dates ISO), donc `WHERE day = 'thursday'` ne rapportait AUCUNE ligne et
  // dailyLaborCost restait bloque a 0 chez le client -- prouve par execution sur
  // la base reelle (6 vacations du jour en base, reponse dailyLaborCost: 0).
  // Les bases installees AVANT la colonne `date` gardent day = nom de jour sans
  // date: elles sont defendues par la seconde branche du filtre, pas par la perte
  // de la premiere.
  const staffList = await db.all("SELECT * FROM staff WHERE active = 1");
  let totalLaborCostToday = 0;
  for (const member of staffList) {
    // ⚠ Deux SELECT separes par UNION ALL, et SURTOUT PAS un (a OR b) : mesure
    // complete (scripts/probe-forme-filtre.py, table de 150 001 rangees, ABBA
    // echauffe, validite controlee par un oracle Python independant) :
    //   UNION ALL     ->  7,57 ms  et le plan lit  SEARCH ... (staff_id=? AND date=?)
    //   (a OR b)      -> 140,14 ms  et le plan ne lit plus  SEARCH ... (staff_id=?)
    // Un OR empeche SQLite d'exploiter la SECONDE colonne d'un index composite:
    // le predicat `date` tombe du plan et les rangees du membre sont re-testees
    // une a une (facteur 18,5 de perte). Le piége est invisible a l'oeil: les
    // DEUX formes sont justes et retournent le meme jeu de lignes.
    // La seconde branche defend les bases installees AVANT l'arrivee de la
    // colonne `date` (ou day = nom de jour, date NULL); la premiere, la forme
    // que l'app ecrit aujourd'hui (day = date = "<ISO>", voir staff.ts).
    // `date IS NULL OR date = ''` est ecrit explicitement au lieu de `NOT date = ?`
    // (ou la negation d'un NULL est NULL, donc NOT NULL = NULL = non retenu, ce
    // qui faisait disparaitre les rangees heritees de la selection).
    const slots = await db.all(
      `SELECT start_time, end_time FROM staff_schedule
        WHERE staff_id = ? AND date = ?
       UNION ALL
       SELECT start_time, end_time FROM staff_schedule
        WHERE staff_id = ? AND day = ? AND (date IS NULL OR date = '')`,
      [member.id, todayISO, member.id, today],
    );
    let memberHours = 0;
    slots.forEach((slot) => {
      // start/end sont NULLables au schema: sans ce garde un slot vide faisait
      // crasher le split() et la route retombait sur son catch (500).
      if (!slot.start_time || !slot.end_time) return;
      const [h1, m1] = slot.start_time.split(":").map(Number);
      const [h2, m2] = slot.end_time.split(":").map(Number);
      let diff = h2 * 60 + m2 - (h1 * 60 + m1);
      if (diff < 0) diff += 24 * 60;
      memberHours += diff / 60;
    });
    totalLaborCostToday += memberHours * (member.hourly_rate || 15);
  }
  res.json({
    totalStockValue: cost.total || 0,
    activeAlerts: alerts.count,
    criticalItems: critical.count,
    dailyLaborCost: totalLaborCostToday,
  });
} catch (error) {
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch stats" });
}
});
router.get("/api/dashboard/cost-data", async (req, res) => {
try {
  const { start, end } = req.query;
  // ⚠ Sprint 14.f: les bornes etaient calculees en UTC (toISOString) alors que le
  // calendrier du chef est LOCAL. Entre 00:00 et 02:00 (CEST), UTC est la VEILLE:
  // la fenetre perdait le jour en cours et le tableau affichait une journee
  // fantome. Prouve par execution + porte par la porte D1 sous SIX fuseaux
  // (scripts/matrice-fuseaux-d1.sh). La COUVERTURE de ce jeu n'est pas
  // supposee mais MESUREE par scripts/juge-couverture-fuseaux-d1.py, qui
  // balaie les 24 heures et rend 24/24 pour le jeu a six zones (celui a
  // quatre laissait 5 heures nues, et a cinq en laissait 3, ou la porte
  // dirait VERT sans rien mesurer).
  const startDate = start ? String(start) : jourLocalISO(7);
  const endDate = end ? String(end) : jourLocalISO(0);
  
  const foodCosts = await db.all(`
    SELECT 
      date,
      SUM(total_amount) as total
    FROM documents 
    WHERE date >= ? AND date <= ?
    GROUP BY date
  `, [startDate, endDate]);

  const staffList = await db.all("SELECT * FROM staff WHERE active = 1");
  const scheduleRows = await db.all("SELECT * FROM staff_schedule WHERE date >= ? AND date <= ?", [startDate, endDate]);
  
  const generateDates = (s: string, e: string) => {
    let current = new Date(s);
    const endD = new Date(e);
    const dates: string[] = [];
    while (current <= endD) {
      dates.push(new Date(current).toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const dates = generateDates(startDate, endDate);
  const daysShort = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  
  let totalFood = 0;
  let totalLabor = 0;

  const result = dates.map(dateStr => {
    const foundFood = foodCosts.find(c => c.date === dateStr);
    let dailyLabor = 0;
    
    staffList.forEach(member => {
      const slots = scheduleRows.filter(r => r.staff_id === member.id && r.date === dateStr);
      let memberHours = 0;
      slots.forEach(slot => {
        if(!slot.start_time || !slot.end_time) return;
        const [h1, m1] = slot.start_time.split(":").map(Number);
        const [h2, m2] = slot.end_time.split(":").map(Number);
        let diff = h2 * 60 + m2 - (h1 * 60 + m1);
        if (diff < 0) diff += 24 * 60;
        memberHours += diff / 60;
      });
      dailyLabor += memberHours * (member.hourly_rate || 15);
    });

    const dayName = daysShort[new Date(dateStr).getDay()];
    const dayNum = dateStr.split('-')[2];
    const foodCostDay = foundFood ? foundFood.total : 0;
    
    totalFood += foodCostDay;
    totalLabor += dailyLabor;

    return {
      name: `${dayName} ${dayNum}`,
      date: dateStr,
      cout: foodCostDay,
      labor: dailyLabor
    };
  });

  // LE CONTRAT (Sprint 13): la route rend la FENETRE REELLE, jamais une semaine
  // inventee. Sur une base sans facture ni planning, le result contient les jours
  // du creneau avec cout=0 et labor=0 (l'UI dessine ce qu'il y a, pas ce qu'il
  // n'y a pas). Le fallback FAIT FAUX (Lun 4200 ... Dim) sur zero ligne: c'est la
  // famille de Sprint 10 (« un mode qui ment sur ses donnees »), consigne pour
  // la meme faute sur /api/purchasing/forecast.
  res.json(result);
} catch (error) {
  console.error(error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch cost data" });
}
});
router.get("/api/dashboard/stock-data", async (req, res) => {
try {
  const data = await db.all(
    "SELECT category as name, SUM(quantity * unit_price) as value FROM inventory GROUP BY category",
  );
  const colors = [
    "#ef4444",
    "#f59e0b",
    "#10b981",
    "#6366f1",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
  ];
  res.json(
    data.map((d, i) => ({ ...d, color: colors[i % colors.length] })),
  );
} catch (error) {
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch stock data" });
}
});

  return router;
}
