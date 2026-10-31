// T3.2 : extrait de src/components/InventoryAudit.tsx (extraction pure, byte-exact).
// Fonction pure (mesuré : ni state, ni props, ni fetch ; 1 seul appel, ligne 151
// de l'original). Le corps est Copié tel quel.
export const normalizeCategory = (cat: string) => {
  const map: Record<string, string> = {
    Dry: "Sec",
    Sec: "Sec",
    Dairy: "Crémerie",
    Crémerie: "Crémerie",
    Meat: "Viande",
    Viandes: "Viande",
    Viande: "Viande",
    Fish: "Poisson",
    Poisson: "Poisson",
    Vegetables: "Légumes",
    Légumes: "Légumes",
    Fruits: "Fruits",
    Pastry: "Pâtisserie",
    Pâtisserie: "Pâtisserie",
    Bakery: "Pâtisserie",
  };
  return map[cat] || cat;
};
