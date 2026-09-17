router.post("/api/haccp/temperature", async (req, res) => {
try {
  const { equipment_name, temperature, user, recorded_at, entry_type, sensor_mode } = req.body;
  const id = Math.random().toString(36).substr(2, 9);
  const timestamp = recorded_at || new Date().toISOString();
  await db.run(
    "INSERT INTO temperature_logs (id, equipment_name, temperature, user, recorded_at, entry_type, sensor_mode) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, equipment_name, temperature, user || 'SYSTÈME', timestamp, entry_type || 'manuel', sensor_mode || 'online'],
  );
  res.json({ status: "success" });
} catch (error) {
  res
    .status(500)
    .json({ status: "error", message: "Failed to log temperature" });
}
});