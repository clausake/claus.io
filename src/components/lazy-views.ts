import { lazy } from "react";

// Chaque wrapper est isolé → chunk par vue (lazy loading)
export const DashboardOverview = lazy(() =>
  import("./DashboardOverview").then(m => ({ default: m.DashboardOverview })));
export const InventoryAudit = lazy(() =>
  import("./InventoryAudit").then(m => ({ default: m.InventoryAudit })));
export const MenuAnalysis = lazy(() =>
  import("./MenuAnalysis").then(m => ({ default: m.MenuAnalysis })));
export const FichesTechniques = lazy(() =>
  import("./FichesTechniques").then(m => ({ default: m.FichesTechniques })));
export const DocumentManager = lazy(() =>
  import("./DocumentManager").then(m => ({ default: m.DocumentManager })));
export const AntiWaste = lazy(() =>
  import("./AntiWaste").then(m => ({ default: m.AntiWaste })));
export const ProductionPlan = lazy(() =>
  import("./ProductionPlan").then(m => ({ default: m.ProductionPlan })));
export const QualityControl = lazy(() =>
  import("./QualityControl").then(m => ({ default: m.QualityControl })));
export const SettingsView = lazy(() =>
  import("./SettingsView").then(m => ({ default: m.SettingsView })));
// Sprint 17 : CulinaryChat est importé DIRECTEMENT par MenuAnalysis (l'atelier
// vit dans Ingenierie des Menus) — plus d'export lazy autonome : l'onglet
// « Chat Culinaire » de la sidebar est retiré (deux entrees pointaient le meme
// onglet, deux onglets actifs a la fois).

export const RobotManagement = lazy(() =>
  import("./RobotManagement").then(m => ({ default: m.RobotManagement })));
export const StaffPlanning = lazy(() =>
  import("./StaffPlanning").then(m => ({ default: m.StaffPlanning })));
// PurchasingTab et Haccp tirent jspdf + date-fns : leur sortir du bundle principal
// est ce qui fait baisser le chunk index (HaccpModules suit Haccp dans son chunk).
export const PurchasingTab = lazy(() =>
  import("./Purchasing").then(m => ({ default: m.PurchasingTab })));
export const Haccp = lazy(() =>
  import("./Haccp").then(m => ({ default: m.Haccp })));
export const EpicureStudio = lazy(() =>
  import("./EpicureStudio").then(m => ({ default: m.EpicureStudio })));
// Chantier 1 : la page comptes du maitre vit dans son propre chunk (elle est
// la seule vue a parler a /api/users, maitre-only).
export const AccountsView = lazy(() =>
  import("./AccountsView").then(m => ({ default: m.AccountsView })));
