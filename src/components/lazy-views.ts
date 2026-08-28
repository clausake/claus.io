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
export const CulinaryChat = lazy(() =>
  import("./CulinaryChat").then(m => ({ default: m.CulinaryChat })));
export const RobotManagement = lazy(() =>
  import("./RobotManagement").then(m => ({ default: m.RobotManagement })));
