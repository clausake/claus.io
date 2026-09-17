router.post("/api/haccp/corrective-action", async (req, res) => {
try {
  const { log_id, action_taken } = req.body;
  await db.run(
    "INSERT INTO corrective_actions (id, log_id, action_taken) VALUES (?, ?, ?)",
    [Date.now().toString(), log_id, action_taken],
  );
  res.json({ status: "success" });
} catch (error) {
  res.status(500).json({ error: "Failed to save corrective action" });
}
});