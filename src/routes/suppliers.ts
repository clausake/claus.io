// Routes : Fournisseurs + prévisions/ordres d'achat
import { Router } from "express";
import type { Database } from "sqlite";
import { requireString, optionalString, requireArray } from "../middleware/validate.js";

export default function createRouter(db: Database) {
  const router = Router();

router.get("/api/suppliers", async (req, res) => {
try {
  const suppliers = await db.all(
    "SELECT * FROM suppliers ORDER BY name ASC",
  );
  res.json(suppliers);
} catch (error) {
  console.error("Error fetching suppliers:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch suppliers" });
}
});
router.get("/api/purchasing/forecast", async (req, res) => {
try {
  const inventory = await db.all("SELECT * FROM inventory");
  const prices = await db.all(
    "SELECT * FROM inventory_prices ORDER BY updated_at DESC",
  );
  const forecast = inventory.map((item) => {
    const history = prices
      .filter((p) => p.inventory_id === item.id)
      .map((p) => ({ price: p.price, date: p.updated_at }));
    return {
      inventory_id: item.id,
      name: item.name,
      quantity: item.quantity,
      minStock: item.minStock,
      unit: item.unit,
      unit_price: item.unit_price || 0,
      price_history: history,
      besoin_recettes: 0,
    };
  });
  res.json(forecast);
} catch (error) {
  console.error("Error fetching purchasing forecast:", error);
  res.status(500).json({
    status: "error",
    message: "Failed to fetch purchasing forecast",
  });
}
});
router.post("/api/purchasing/order", async (req, res) => {
try {
  if (!requireArray(req, res, "items")) return;
  const { items, supplier } = req.body;
  const supplierVal = optionalString(req, "supplier", 200) || "";
  const documentId = Date.now().toString();
  const totalAmount = items.reduce(
    (sum, item) => sum + (typeof item.quantity === "number" ? item.quantity : 0) * (typeof item.unit_price === "number" ? item.unit_price : 0),
    0,
  );
  await db.run(
    "INSERT INTO documents (id, type, supplier, date, total_amount, status) VALUES (?, ?, ?, ?, ?, ?)",
    [
      documentId,
      "COMMANDE",
      supplierVal,
      new Date().toISOString(),
      totalAmount,
      "PENDING",
    ],
  );
  for (const item of items) {
    await db.run(
      "INSERT INTO document_items (id, document_id, inventory_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)",
      [
        Date.now().toString() + Math.random(),
        documentId,
        item.inventory_id,
        item.quantity,
        item.unit_price,
      ],
    );
  }
  res.json({ status: "success", documentId });
} catch (error) {
  console.error("Error creating order:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to create order" });
}
});
router.post("/api/suppliers", async (req, res) => {
try {
  if (!requireString(req, res, "name", 200)) return;
  const name = req.body.name;
  const email = optionalString(req, "email", 200) || "";
  const phone = optionalString(req, "phone", 50) || "";
  const id = Date.now().toString();
  await db.run(
    "INSERT INTO suppliers (id, name, email, phone) VALUES (?, ?, ?, ?)",
    [id, name, email, phone],
  );
  res.json({
    id,
    name,
    email,
    phone,
    status: "ACTIVE",
  });
} catch (error) {
  console.error("Error creating supplier:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to create supplier" });
}
});
router.delete("/api/suppliers/:id", async (req, res) => {
try {
  await db.run("DELETE FROM suppliers WHERE id = ?", [req.params.id]);
  res.json({ status: "success" });
} catch (error) {
  console.error("Error deleting supplier:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to delete supplier" });
}
});
router.put("/api/suppliers/:id", async (req, res) => {
try {
  const { name, email, phone } = req.body;
  await db.run(
    "UPDATE suppliers SET name = ?, email = ?, phone = ? WHERE id = ?",
    [name, email || "", phone || "", req.params.id],
  );
  res.json({
    id: req.params.id,
    name,
    email: email || "",
    phone: phone || "",
    status: "success",
  });
} catch (error) {
  console.error("Error updating supplier:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to update supplier" });
}
});

  return router;
}
