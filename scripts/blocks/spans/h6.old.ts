router.post("/api/haccp/batches", async (req, res) => {
try {
  const {
    inventory_id,
    lot_number,
    expiration_date,
    source_image_url,
    quantity,
    unit,
    reception_temp,
    packaging_ok,
  } = req.body;
  await db.run(
    "INSERT INTO batches (id, inventory_id, lot_number, expiration_date, source_image_url, quantity, unit, reception_temp, packaging_ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      Date.now().toString(),
      inventory_id,
      lot_number,
      expiration_date,
      source_image_url || null,
      quantity || 0,
      unit || "",
      reception_temp || null,
      packaging_ok ? 1 : 0,
    ],
  );
  res.json({ status: "success" });
} catch (error) {
  console.error("Save batch error:", error);
  res.status(500).json({ error: "Failed to save batch" });
}
});