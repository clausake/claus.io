router.post("/api/haccp/cleaning", async (req, res) => {
try {
  const { zone_name } = req.body;
  await db.run(
    "INSERT INTO cleaning_records (id, zone_name, completed_by) VALUES (?, ?, ?)",
    [Date.now().toString(), zone_name, "SYSTÈME"],
  );
  res.json({ status: "success" });
} catch (error) {
  res.status(500).json({ error: "Failed to save record" });
}
});