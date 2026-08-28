// Données statiques du menu (rotation 7 jours + données démo dashboard)
export const COST_DATA = [
  { name: "Lun", cout: 400 },
  { name: "Mar", cout: 300 },
  { name: "Mer", cout: 550 },
  { name: "Jeu", cout: 450 },
  { name: "Ven", cout: 700 },
  { name: "Sam", cout: 800 },
  { name: "Dim", cout: 600 },
];

export const STOCK_DISTRIBUTION = [
  { name: "Viandes", value: 400, color: "#ef4444" },
  { name: "Crémerie", value: 300, color: "#f59e0b" },
  { name: "Légumes", value: 300, color: "#10b981" },
  { name: "Sec", value: 200, color: "#6366f1" },
];

export const ALERTS = [
  {
    id: 1,
    type: "price",
    message: "Hausse de prix >10% sur le Beurre Doux (Fournisseur A)",
    severity: "high",
  },
  {
    id: 2,
    type: "stock",
    message: "Rupture imminente : Crème liquide 35%",
    severity: "high",
  },
  {
    id: 3,
    type: "yield",
    message:
      "Écart de consommation : +15% sur les Pommes de terre (Semaine 14)",
    severity: "medium",
  },
];

export const INITIAL_CART = [
  {
    id: "1",
    item: "Filet de Boeuf",
    inventory_id: "41",
    quantity: 5,
    quantity_per_person: 0.5,
    guests: 10,
    unit: "kg",
    supplier: "Passion Froid",
    price: 28.5,
    total: 142.5,
    sourceRecipeId: "r1",
    recipeName: "Boeuf Wellington",
  },
  {
    id: "2",
    item: "Légumes de saison",
    inventory_id: "42",
    quantity: 15,
    quantity_per_person: 1.5,
    guests: 10,
    unit: "kg",
    supplier: "Charles Martin",
    price: 3.2,
    total: 48.0,
    sourceRecipeId: "r1",
    recipeName: "Boeuf Wellington",
  },
];

export const MENU_ROTATION = {
  1: [
    { jour: "Lundi", dejeuner: "Poisson", diner: "Poulet" },
    { jour: "Mardi", dejeuner: "Pâtes de blé", diner: "Porc" },
    { jour: "Mercredi", dejeuner: "Bœuf", diner: "Veau" },
    { jour: "Jeudi", dejeuner: "Poulet", diner: "Saucisses" },
    {
      jour: "Vendredi",
      dejeuner: "Pâtes fraîches ou plat vegan",
      diner: "Poisson",
    },
    { jour: "Samedi", dejeuner: "Dinde", diner: "Agneau" },
    {
      jour: "Dimanche",
      dejeuner: "Stock résiduel ou Salade de pâtes",
      diner: "Plat ++",
    },
  ],
  2: [
    { jour: "Lundi", dejeuner: "Porc", diner: "Poulet" },
    { jour: "Mardi", dejeuner: "Bœuf", diner: "Pâtes de blé" },
    { jour: "Mercredi", dejeuner: "Dinde", diner: "Saucisses" },
    { jour: "Jeudi", dejeuner: "Poulet", diner: "Veau" },
    {
      jour: "Vendredi",
      dejeuner: "Pâtes fraîches ou plat vegan",
      diner: "Poisson",
    },
    {
      jour: "Samedi",
      dejeuner: "Stock résiduel ou Salade de riz",
      diner: "Omelette ou œufs brouillés",
    },
    { jour: "Dimanche", dejeuner: "Canard", diner: "Plat ++" },
  ],
  3: [
    { jour: "Lundi", dejeuner: "Pâtes de blé", diner: "Bœuf" },
    { jour: "Mardi", dejeuner: "Agneau", diner: "Saucisses" },
    { jour: "Mercredi", dejeuner: "Poisson", diner: "Pâtes de blé" },
    { jour: "Jeudi", dejeuner: "Poulet", diner: "Porc" },
    {
      jour: "Vendredi",
      dejeuner: "Pâtes fraîches ou plat vegan",
      diner: "Poisson",
    },
    { jour: "Samedi", dejeuner: "Dinde", diner: "Veau" },
    {
      jour: "Dimanche",
      dejeuner: "Stock résiduel ou Salade de pâtes",
      diner: "Plat ++",
    },
  ],
  4: [
    { jour: "Lundi", dejeuner: "Saucisses", diner: "Dinde" },
    { jour: "Mardi", dejeuner: "Pâtes de blé", diner: "Veau" },
    { jour: "Mercredi", dejeuner: "Bœuf", diner: "Canard" },
    { jour: "Jeudi", dejeuner: "Poulet", diner: "Porc" },
    {
      jour: "Vendredi",
      dejeuner: "Pâtes fraîches ou plat vegan",
      diner: "Poisson",
    },
    {
      jour: "Samedi",
      dejeuner: "Stock résiduel ou Salade de riz",
      diner: "Omelette",
    },
    { jour: "Dimanche", dejeuner: "Lapin", diner: "Plat ++" },
  ],
};
