import React from "react";
import {
  BookOpen, ChefHat, ClipboardList, LayoutDashboard, PackageSearch, Settings, ShieldCheck, ShoppingCart, X, Bot, FlaskConical, CheckCircle2, FileText, Calendar, Thermometer, Sparkles,
} from "lucide-react";
import * as motionSlim from "motion/react-m";
import { NavItem } from "./views";
import type { Utilisateur } from "./AuthGate";

interface SidebarProps {
  t: Record<string, string>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isMobile: boolean;
  user: Utilisateur | null;
}

export function Sidebar({
  t, activeTab, setActiveTab, isSidebarOpen, setIsSidebarOpen,
  isMobile, user,
}: SidebarProps) {
  return (
    <>

      {/* Sidebar - Mobile: drawer, Desktop: always visible/toggleable */}
      <aside
        className={`${isSidebarOpen ? "w-full md:w-72" : "hidden md:flex md:w-20"} fixed md:static inset-y-0 left-0 bg-obsidian border-r border-white/5 flex flex-col transition-all duration-500 ease-in-out z-50 shadow-2xl shadow-black`}
      >
        {/* Mobile close button */}
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden p-4 absolute top-2 right-2 text-white"
        >
          <X />
        </button>

        <div className="h-16 md:h-20 flex items-center px-4 md:px-6 mb-2">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-500 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/20 glow-emerald">
              <ChefHat className="w-6 h-6 md:w-7 md:h-7 text-obsidian" />
            </div>
            {isSidebarOpen && (
              <motionSlim.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col"
              >
                <span className="text-xl font-black text-white tracking-tighter leading-none">
                  claus.io
                </span>
                <span className="text-[10px] font-mono text-brand-500 uppercase tracking-widest mt-1">
                  claus.io
                </span>
              </motionSlim.div>
            )}
          </div>
        </div>

        <nav className="flex-1 px-1 py-1 overflow-y-auto custom-scrollbar">
          <div className="mb-2">
            {isSidebarOpen && (
              <p className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">
                {t.principal}
              </p>
            )}
              <NavItem
                icon={<LayoutDashboard className="w-6 h-6" />}
                label={t.dashboard}
                isActive={activeTab === "dashboard"}
                onClick={() => {
                  setActiveTab("dashboard");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                isOpen={isSidebarOpen}
              />
            <NavItem
              icon={<PackageSearch className="w-6 h-6" />}
              label={t.inventory}
              isActive={activeTab === "inventory"}
              onClick={() => {
                setActiveTab("inventory");
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              isOpen={isSidebarOpen}
            />
          </div>
          <div className="mb-2">
            {isSidebarOpen && (
              <p className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">
                {t.operations}
              </p>
            )}
              <>
                <NavItem
                  icon={<BookOpen className="w-6 h-6" />}
                  label={t.menus}
                  isActive={activeTab === "menus"}
                  onClick={() => {
                    setActiveTab("menus");
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                  isOpen={isSidebarOpen}
                />
                <NavItem
                  icon={<ClipboardList className="w-6 h-6" />}
                  label={t.recipes}
                  isActive={activeTab === "recipes"}
                  onClick={() => {
                    setActiveTab("recipes");
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                  isOpen={isSidebarOpen}
                />
                <NavItem
                  icon={<CheckCircle2 className="w-6 h-6" />}
                  label={t.productionPlan || "Plan Production"}
                  isActive={activeTab === "production"}
                  onClick={() => {
                    setActiveTab("production");
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                  isOpen={isSidebarOpen}
                />
                <NavItem
                  icon={<ShoppingCart className="w-6 h-6" />}
                  label={t.purchasing}
                  isActive={activeTab === "purchasing"}
                  onClick={() => {
                    setActiveTab("purchasing");
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                  isOpen={isSidebarOpen}
                />
              </>
            <NavItem
              icon={<FileText className="w-6 h-6" />}
              label={t.documents}
              isActive={activeTab === "documents"}
              onClick={() => {
                setActiveTab("documents");
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              isOpen={isSidebarOpen}
            />
              <NavItem
                icon={<Calendar className="w-6 h-6" />}
                label={t.staffPlanning || "Gestion du Personnel"}
                isActive={activeTab === "staff-planning"}
                onClick={() => {
                  setActiveTab("staff-planning");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                isOpen={isSidebarOpen}
              />
            <NavItem
              icon={<Thermometer className="w-6 h-6" />}
              label={t.haccp}
              isActive={activeTab === "haccp"}
              onClick={() => {
                setActiveTab("haccp");
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              isOpen={isSidebarOpen}
            />
              <NavItem
                icon={<Sparkles className="w-6 h-6" />}
                label={t.antiWaste}
                isActive={activeTab === "anti-waste"}
                onClick={() => {
                  setActiveTab("anti-waste");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                isOpen={isSidebarOpen}
              />
          </div>

            <div className="mb-2">
              {isSidebarOpen && (
                <p className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">
                  {t.intelligence}
                </p>
              )}
              {/* Sprint 17 : l'entree « Chat Culinaire » est RETIREE — le chat
                  vit dans Ingenierie des Menus (il y est rendu), et deux entrees
                  de sidebar pointant le MEME onglet affichaient deux onglets
                  actifs a la fois (defaut mesure le 15/10 sur le parcours
                  reel). Une section « Intelligence artificielle » avec deux
                  entrees vers le meme endroit n'est pas une navigation. */}
              <NavItem
                icon={<Bot className="w-6 h-6" />}
                label={t.robots}
                isActive={activeTab === "robots"}
                onClick={() => {
                  setActiveTab("robots");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                isOpen={isSidebarOpen}
              />
              <NavItem
                icon={<FlaskConical className="w-6 h-6" />}
                label={t.epicureStudio || "Studio Epicure"}
                isActive={activeTab === "epicure-studio"}
                onClick={() => {
                  setActiveTab("epicure-studio");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                isOpen={isSidebarOpen}
              />
            </div>
        </nav>

        <div className="p-4 border-t border-white/5 space-y-1">
          {user?.role === "maitre" && (
            <NavItem
              icon={<ShieldCheck className="w-5 h-5" />}
              label={t.accounts || "Comptes"}
              isActive={activeTab === "comptes"}
              onClick={() => {
                setActiveTab("comptes");
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              isOpen={isSidebarOpen}
            />
          )}
          <NavItem
            icon={<Settings className="w-5 h-5" />}
            label={t.settings}
            isActive={activeTab === "settings"}
            onClick={() => {
              setActiveTab("settings");
              if (window.innerWidth < 768) setIsSidebarOpen(false);
            }}
            isOpen={isSidebarOpen}
          />
        </div>
      </aside>
    </>
  );
}
