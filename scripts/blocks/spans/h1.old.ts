router.post("/api/haccp/iot-sensors", async (req, res) => {
try {
  const { id, name, type, equipment_type } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: "ID and Name are required" });
  }
  const token = "token_" + Math.random().toString(36).substring(2, 8);
  await db.run(
    "INSERT INTO iot_sensors (id, name, type, equipment_type, battery, last_reading, last_reading_at, webhook_token) VALUES (?, ?, ?, ?, 100, 20.0, ?, ?)",
    [id, name, type || "ambient", equipment_type || "Froid", new Date().toISOString(), token]
  );
  res.json({ status: "success", token });
  // Un onglet HACCP deja ouvert doit voir le capteur sans rafraichissement.
  try {
    const list = await db.all("SELECT * FROM iot_sensors");
    sensorHub.publishList(list.map((s: any) => ({
      id: s.id, name: s.name, type: s.type, equipment_type: s.equipment_type,
      temperature: s.last_reading ?? 20.0, battery: s.battery ?? 100,
      last_reading_at: s.last_reading_at,
    })));
  } catch (pushErr) {
    console.error("[SSE] diffusion liste ignoree:", pushErr);
  }
} catch (err) {
  res.status(500).json({ error: "Failed to register sensor. May already exist." });
}
});