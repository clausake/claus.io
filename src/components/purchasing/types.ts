// T3.2 : extrait de src/components/Purchasing.tsx (extraction pure, byte-exact).
// Déclarations de types seules ; aucun comportement.
export interface ForecastItem {
  inventory_id: string;
  minStock: number;
  quantity: number;
  besoin_recettes: number;
}

export interface OrderItem {
  id: string;
  raw_name?: string;
  raw_price?: number;
  raw_unit?: string;
  inventory_name?: string;
  original_name?: string;
  inventory_id?: string | null;
  in_stock?: boolean;
  quantity?: number;
  unit?: string;
  received_quantity?: number;
}

export interface PurchaseOrder {
  id: string;
  status: string;
  supplier: string;
  date: string;
  items: OrderItem[];
  total_amount: number;
}

  export interface ImportMatch {
  prix_exploitable: boolean;
  matched_inventory_id: string | null;
  [k: string]: unknown;
}

