// T3.2 : extrait de src/components/DocumentManager.tsx (extraction pure, byte-exact).
// Déclarations de types seules ; aucun comportement. Le type InitialState est
// conservé tel quel (mesuré : déclaré, non référencé) — suppression hors périmètre.
export interface Document {
  id: string;
  type: string;
  supplier: string;
  date: string;
  total_amount: number;
  source_image_url: string | null;
  items: Item[];
  status?: string;
}

export interface Item {
  inventory_name: string;
  name: string;
  quantity_per_person: string | number;
  unit: string;
  unit_price: number;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface InitialState {
  documents: Document[];
  inventory: string[];
  suppliersList: Supplier[];
}

export interface DocumentManagerProps {
  t: Record<string, string>;
}
