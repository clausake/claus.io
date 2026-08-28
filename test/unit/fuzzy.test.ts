import { describe, it, expect } from "vitest";
import { findMatchingInventoryItem } from "../../src/shared/fuzzy.js";

// Fake db (interface sqlite : .all / .run / .get)
function makeDb(items: Array<{ id: string; name: string; unit: string }>) {
  return {
    all: async (_sql: string) => items,
  };
}

describe("findMatchingInventoryItem (fuzzy matching)", () => {
  const db = makeDb([
    { id: "1", name: "Tomate", unit: "kg" },
    { id: "2", name: "Beurre AOP", unit: "kg" },
    { id: "3", name: "Basilic frais", unit: "g" },
  ]);

  it("match exact (insensible à la casse)", async () => {
    const m = await findMatchingInventoryItem(db, "TOMATE");
    expect(m?.id).toBe("1");
  });

  it("match flou avec variations d'orthographe", async () => {
    const m = await findMatchingInventoryItem(db, "tomates");
    expect(m?.id).toBe("1");
  });

  it("retourne null si aucun match proche", async () => {
    const m = await findMatchingInventoryItem(db, "kvmx zzzz");
    expect(m).toBeNull();
  });

  it("retourne null sur entrée vide", async () => {
    const m = await findMatchingInventoryItem(db, "");
    expect(m).toBeNull();
  });
});
