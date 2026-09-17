router.post("/api/haccp/webhook/iot-report", async (req, res) => {
const { id, token, temperature, battery } = req.body;
try {
  const sensor = await db.get("SELECT * FROM iot_sensors WHERE id = ?", [id]);
  if (!sensor) {
    return res.status(404).json({ error: "Sensor not found in registry." });
  }
  if (token && sensor.webhook_token && sensor.webhook_token !== token) {
    return res.status(403).json({ error: "Invalid token" });
  }
  const tempVal = parseFloat(temperature);
  if (isNaN(tempVal)) {
    return res.status(400).json({ error: "Invalid temperature format" });
  }
  const batVal = battery !== undefined ? parseInt(battery, 10) : (sensor.battery || 100);
  const now = new Date().toISOString();

  await db.run(
    "UPDATE iot_sensors SET last_reading = ?, last_reading_at = ?, battery = ? WHERE id = ?",
    [tempVal, now, batVal, id]
  );

  const logId = Math.random().toString(36).substring(2, 11);
  await db.run(
    "INSERT INTO temperature_logs (id, equipment_name, temperature, user, recorded_at, entry_type, sensor_mode, sensor_id) VALUES (?, ?, ?, ?, ?, 'iot', 'online', ?)",
    [logId, `[IoT] ${sensor.name}`, tempVal, "CAPTEUR IoT Webhook", now, id]
  );

  // Le capteur vient de poster : on reveille les tablettes ouvertes plutot que
  // de les attendre sur leur polling. L'echec de diffusion ne doit jamais
  // faire echouer l'ingestion (la releve HACCP est deja en base, conforme).
  try {
    sensorHub.publishReading({
      id,
      name: sensor.name,
      type: sensor.type,
      equipment_type: sensor.equipment_type,
      temperature: tempVal,
      battery: batVal,
      last_reading_at: now,
    });
  } catch (pushErr) {
    console.error("[SSE] diffusion capteur ignoree:", pushErr);
  }

  res.json({ status: "success", message: `Data compiled for ${sensor.name}. Log logged to HACCP table.`, temperature: tempVal });
} catch (err) {
  console.error("Webhook ingestion error:", err);
  res.status(500).json({ error: "Server database error" });
}
});