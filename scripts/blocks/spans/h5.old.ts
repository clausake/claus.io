router.post("/api/haccp/production", async (req, res) => {
try {
  const { recipe_id, batch_ids } = req.body;
  const productionId = Date.now().toString();
  await db.run(
    "INSERT INTO production_records (id, recipe_id) VALUES (?, ?)",
    [productionId, recipe_id],
  );
  for (const batchId of batch_ids) {
    await db.run(
      "INSERT INTO production_batches (production_id, batch_id) VALUES (?, ?)",
      [productionId, batchId],
    );
  }
  res.json({ status: "success", productionId });
} catch (error) {
  res.status(500).json({ error: "Failed to record production" });
}
});