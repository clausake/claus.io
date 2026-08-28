// Routes : Prix fournisseurs (import, comparaison)
import { Router } from "express";
import type { Database } from "sqlite";
import { calculatePricePerRef } from "../shared/util.js";

interface InvItem {
  id: string;
  name: string;
  unit: string;
}

interface SupplierPriceRow {
  id: string;
  supplier_id: string;
  inventory_id: string;
  raw_unit_price: number;
  unit: string;
  calculated_price_per_ref: number | null;
  is_verified_from_invoice: number;
  valid_until: string | null;
  supplier_name: string;
  inventory_name: string;
  inventory_unit: string;
  inventory_unit_price?: number | null;
}

export default function createRouter(db: Database) {
  const router = Router();

// Supplier Prices API
router.get("/api/supplier-prices", async (req, res) => {
try {
  const prices = await db.all(`
    SELECT sp.*, s.name as supplier_name, i.name as inventory_name, i.unit as inventory_unit
    FROM supplier_prices sp
    JOIN suppliers s ON sp.supplier_id = s.id
    JOIN inventory i ON sp.inventory_id = i.id
    ORDER BY i.name ASC, sp.calculated_price_per_ref ASC
  `);
  res.json(prices);
} catch (error) {
  console.error("Error fetching supplier prices:", error);
  res.status(500).json({ status: "error", message: "Failed to fetch supplier prices" });
}
});

router.post("/api/supplier-prices", async (req, res) => {
try {
  const { id, supplier_id, inventory_id, raw_unit_price, unit, valid_until, is_verified_from_invoice } = req.body;
  const inv = await db.get("SELECT unit FROM inventory WHERE id = ?", [inventory_id]);
  if (!inv) {
    return res.status(404).json({ status: "error", message: "Inventory item not found" });
  }
  const inventoryUnit = inv.unit;
  const calculated_price_per_ref = calculatePricePerRef(Number(raw_unit_price), unit, inventoryUnit);
  const priceId = id || (Date.now().toString() + Math.random().toString().substring(2, 7));
  
  if (id) {
    await db.run(`
      UPDATE supplier_prices 
      SET supplier_id = ?, inventory_id = ?, raw_unit_price = ?, unit = ?, calculated_price_per_ref = ?, valid_until = ?, is_verified_from_invoice = ?
      WHERE id = ?
    `, [supplier_id, inventory_id, Number(raw_unit_price), unit, calculated_price_per_ref, valid_until || null, is_verified_from_invoice ? 1 : 0, id]);
  } else {
    await db.run(`
      INSERT INTO supplier_prices (id, supplier_id, inventory_id, raw_unit_price, unit, calculated_price_per_ref, valid_until, is_verified_from_invoice)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [priceId, supplier_id, inventory_id, Number(raw_unit_price), unit, calculated_price_per_ref, valid_until || null, is_verified_from_invoice ? 1 : 0]);
  }
  res.json({ status: "success", id: priceId });
} catch (error) {
  console.error("Error saving supplier price:", error);
  res.status(500).json({ status: "error", message: "Failed to save supplier price" });
}
});

router.delete("/api/supplier-prices/:id", async (req, res) => {
try {
  await db.run("DELETE FROM supplier_prices WHERE id = ?", [req.params.id]);
  res.json({ status: "success" });
} catch (error) {
  console.error("Error deleting supplier price:", error);
  res.status(500).json({ status: "error", message: "Failed to delete supplier price" });
}
});

router.post("/api/supplier-prices/import-analyze", async (req, res) => {
try {
  const { supplier_id, items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ status: "error", message: "items must be an array" });
  }
  const inventory = await db.all("SELECT id, name, unit FROM inventory");
  
  const fuzzyMatch = (importedName: string, inventoryItems: InvItem[]) => {
    const normImported = importedName.toLowerCase().trim();
    const cleanTokens = (str: string) =>
      str.toLowerCase().replace(/[^\w\s\u00C0-\u00FF]/g, " ").split(/\s+/).filter(Boolean);

    const importedTokens = cleanTokens(normImported);
    if (importedTokens.length === 0) return null;

    let bestMatch: InvItem | null = null;
    let highestScore = -1;
    
    for (const item of inventoryItems) {
      const itemTokens = cleanTokens(item.name);
      if (itemTokens.length === 0) continue;
      
      const matchCount = itemTokens.filter(tok => importedTokens.includes(tok)).length;
      const score = matchCount / itemTokens.length;
      const isSubstring = normImported.includes(item.name.toLowerCase());
      const finalScore = score + (isSubstring ? 0.5 : 0);
      
      if (matchCount > 0 && finalScore > highestScore) {
        highestScore = finalScore;
        bestMatch = item;
      }
    }
    return bestMatch ? { item: bestMatch, confidence: highestScore } : null;
  };

  const results = items.map((itm) => {
    const match = fuzzyMatch(itm.raw_name || "", inventory);
    return {
      raw_name: itm.raw_name,
      raw_price: Number(itm.raw_price) || 0,
      raw_unit: itm.raw_unit || "kg",
      matched_inventory_id: match ? match.item.id : null,
      matched_inventory_name: match ? match.item.name : null,
      confidence: match ? match.confidence : 0
    };
  });
  res.json({ status: "success", matches: results });
} catch (error) {
  console.error("Error analyzing import:", error);
  res.status(500).json({ status: "error", message: "Failed to analyze import items" });
}
});

router.post("/api/supplier-prices/import-confirm", async (req, res) => {
try {
  const { supplier_id, matches } = req.body;
  if (!supplier_id || !Array.isArray(matches)) {
    return res.status(400).json({ status: "error", message: "Invalid payload" });
  }
  const inventory = await db.all("SELECT id, name, unit FROM inventory");
  const invMap = new Map(
    (inventory as Array<{ id: string; name: string; unit: string }>).map(
      (item) => [item.id, item],
    ),
  );
  
  await db.run("BEGIN TRANSACTION");
  try {
    for (const match of matches) {
      if (!match.matched_inventory_id) continue;
      const inv = invMap.get(match.matched_inventory_id);
      const inventoryUnit = inv ? inv.unit : "kg";
      const purchaseUnit = match.raw_unit || inventoryUnit;
      const calculated_price_per_ref = calculatePricePerRef(Number(match.raw_price), purchaseUnit, inventoryUnit);
      
      const existing = await db.get(
        "SELECT id FROM supplier_prices WHERE supplier_id = ? AND inventory_id = ?",
        [supplier_id, match.matched_inventory_id]
      );
      if (existing) {
        await db.run(`
          UPDATE supplier_prices 
          SET raw_unit_price = ?, unit = ?, calculated_price_per_ref = ?, is_verified_from_invoice = 0
          WHERE id = ?
        `, [Number(match.raw_price), purchaseUnit, calculated_price_per_ref, existing.id]);
      } else {
        const priceId = Date.now().toString() + Math.random().toString().substring(2, 7);
        await db.run(`
          INSERT INTO supplier_prices (id, supplier_id, inventory_id, raw_unit_price, unit, calculated_price_per_ref, is_verified_from_invoice)
          VALUES (?, ?, ?, ?, ?, ?, 0)
        `, [priceId, supplier_id, match.matched_inventory_id, Number(match.raw_price), purchaseUnit, calculated_price_per_ref]);
      }
    }
    await db.run("COMMIT");
    res.json({ status: "success" });
  } catch (err) {
    await db.run("ROLLBACK");
    throw err;
  }
} catch (error) {
  console.error("Error confirming import:", error);
  res.status(500).json({ status: "error", message: "Failed to confirm import" });
}
});

router.get("/api/supplier-prices/comparison", async (req, res) => {
try {
  const rawPrices = await db.all(`
    SELECT sp.*, s.name as supplier_name, i.name as inventory_name, i.unit as inventory_unit, i.unit_price as inventory_unit_price
    FROM supplier_prices sp
    JOIN suppliers s ON sp.supplier_id = s.id
    JOIN inventory i ON sp.inventory_id = i.id
  `);
  const groups: Record<string, any> = {};
  for (const p of rawPrices) {
    if (!groups[p.inventory_id]) {
      groups[p.inventory_id] = {
        inventory_id: p.inventory_id,
        inventory_name: p.inventory_name,
        inventory_unit: p.inventory_unit,
        current_inventory_price: p.inventory_unit_price || 0,
        supplier_prices: []
      };
    }
    groups[p.inventory_id].supplier_prices.push({
      id: p.id,
      supplier_id: p.supplier_id,
      supplier_name: p.supplier_name,
      raw_unit_price: p.raw_unit_price,
      unit: p.unit,
      calculated_price_per_ref: p.calculated_price_per_ref,
      is_verified_from_invoice: p.is_verified_from_invoice,
      valid_until: p.valid_until
    });
  }
  const comparisonList = Object.values(groups).map((group: any) => {
    let bestPriceEntry: SupplierPriceRow | null = null;
    for (const sp of group.supplier_prices as SupplierPriceRow[]) {
      if (!bestPriceEntry || sp.calculated_price_per_ref !== null && sp.calculated_price_per_ref < (bestPriceEntry.calculated_price_per_ref ?? Infinity)) {
        bestPriceEntry = sp;
      }
    }
    const currentPrice = group.current_inventory_price;
    const bestPrice = bestPriceEntry ? bestPriceEntry.calculated_price_per_ref : currentPrice;
    const savingsPercent = currentPrice > 0 && bestPrice < currentPrice 
      ? Math.round(((currentPrice - bestPrice) / currentPrice) * 100)
      : 0;
    return {
      ...group,
      best_supplier_price: bestPriceEntry,
      best_price: bestPrice,
      savings_percent: savingsPercent
    };
  });
  res.json(comparisonList);
} catch (error) {
  console.error("Error fetching comparison:", error);
  res.status(500).json({ status: "error", message: "Failed to fetch price comparison" });
}
});

  return router;
}
