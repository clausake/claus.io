import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  Bot,
  Clock,
  ShoppingCart,
  Sun,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LazyMotion, domAnimation } from "motion/react";
import * as motionSlim from "motion/react-m";

export function DashboardOverview({ t, settings }: { t: Record<string, string>; settings: Record<string, unknown> }) {
  const [stats, setStats] = useState({
    totalStockValue: 0,
    activeAlerts: 0,
    criticalItems: 0,
    monthlyTrend: "0%",
    dailyLaborCost: 0,
  });
  const [costData, setCostData] = useState<any[]>([]);
  const [stockData, setStockData] = useState<any[]>([]);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 7))
      .toISOString()
      .split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  const testSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 250" width="300" height="250" fill="none">
    <path stroke="#555" stroke-width="1.2" d="M30,170 Q150,210 270,170 Q150,130 30,170" />
    <path stroke="#555" stroke-width="0.8" d="M40,170 Q150,200 260,170" opacity="0.5" />
    <path stroke="#d4ab28" stroke-width="1.5" d="M100,160 Q120,130 150,120 Q180,130 200,160 Q180,180 150,185 Q120,180 100,160" />
    <path stroke="#d4ab28" stroke-width="1" d="M110,150 Q130,125 160,125 Q180,140 190,160" />
    <path stroke="#d4ab28" stroke-width="1.2" d="M115,165 Q140,180 170,175 Q185,160 175,145" />
    <path stroke="#d4ab28" stroke-width="0.8" d="M130,135 Q150,105 170,140" />
    <path stroke="#d4ab28" stroke-width="1" d="M120,155 Q130,175 160,165" />
    <path stroke="#d4ab28" stroke-width="1.5" d="M90,165 Q150,195 210,165" opacity="0.6"/>
    <circle cx="150" cy="115" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="156" cy="118" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="145" cy="117" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="152" cy="111" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="146" cy="112" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="158" cy="112" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="162" cy="119" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="140" cy="122" r="2.5" stroke="#222" stroke-width="2" />
    <path stroke="#888" stroke-width="1" d="M110,145 Q115,140 120,148 Q115,152 110,145" />
    <path stroke="#888" stroke-width="1" d="M175,165 Q182,160 188,168 Q182,175 175,165" />
    <path stroke="#888" stroke-width="1" d="M140,170 Q145,165 150,175 Q145,180 140,170" />
    <path stroke="#555" stroke-width="0.8" d="M140,90 Q145,100 148,108" fill="none" />
    <path stroke="#555" stroke-width="0.8" d="M165,85 Q160,95 157,105" fill="none" />
    <text x="110" y="85" font-family="'Caveat', cursive" font-size="20" fill="#444" transform="rotate(-5, 110, 85)">CAVIAR !!!</text>
    <path stroke="#555" stroke-width="0.8" d="M190,105 Q180,120 170,125" fill="none" />
    <text x="195" y="100" font-family="'Caveat', cursive" font-size="16" fill="#444" transform="rotate(2, 195, 100)">BOUILLON CALAMARS</text>
    <path stroke="#555" stroke-width="0.8" d="M225,120 Q195,125 185,135" fill="none" />
    <text x="230" y="115" font-family="'Caveat', cursive" font-size="14" fill="#444">LINGUINES AU</text>
    <text x="230" y="130" font-family="'Caveat', cursive" font-size="14" fill="#444">BOUILLON</text>
    <path stroke="#555" stroke-width="0.8" d="M225,155 Q205,150 185,160" fill="none" />
    <text x="230" y="160" font-family="'Caveat', cursive" font-size="14" fill="#444" transform="rotate(-1, 230, 160)">HUITRES BASSE TEMP.</text>
  </svg>
`;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, costRes, stockRes] = await Promise.all([
          fetch("/api/dashboard/stats"),
          fetch(
            `/api/dashboard/cost-data?start=${dateRange.start}&end=${dateRange.end}`,
          ),
          fetch("/api/dashboard/stock-data"),
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (costRes.ok) setCostData(await costRes.json());
        if (stockRes.ok) {
          const rawStock = await stockRes.json();
          const hasValues = rawStock.some((d: {value: number}) => d.value > 0);
          if (!hasValues) {
            setStockData([
              {
                name: t.noData || "Aucune donnée",
                value: 1,
                isEmpty: true,
                color: "#334155",
              },
            ]);
          } else {
            setStockData(rawStock.filter((d: {value: number}) => d.value > 0));
          }
        }
      } catch (e) {
        console.error("Erreur de chargement des données dashboard", e);
      }
    };
    fetchData();
  }, [dateRange]);

  const translateCat = (cat: string) => {
    const map: Record<string, string> = {
      Sec: t.catDry || "Sec",
      Crémerie: t.catDairy || "Crémerie",
      Viande: t.catMeat || "Viande",
      Viandes: t.catMeat || "Viandes",
      Poisson: t.catFish || "Poisson",
      Légumes: t.catVeg || "Légumes",
      Fruits: t.catFruit || "Fruits",
      Pâtisserie: t.catPastry || "Pâtisserie",
    };
    return map[cat] || cat;
  };

  const translateDayName = (day: string) => {
    const map: Record<string, string> = {
      Lun: t.monday ? t.monday.substring(0, 3) : "Mon",
      Mar: t.tuesday ? t.tuesday.substring(0, 3) : "Tue",
      Mer: t.wednesday ? t.wednesday.substring(0, 3) : "Wed",
      Jeu: t.thursday ? t.thursday.substring(0, 3) : "Thu",
      Ven: t.friday ? t.friday.substring(0, 3) : "Fri",
      Sam: t.saturday ? t.saturday.substring(0, 3) : "Sat",
      Dim: t.sunday ? t.sunday.substring(0, 3) : "Sun",
    };
    return map[day] || day;
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-150">
      <div className="flex flex-wrap gap-4 items-center p-1">
        <div className="glass-panel px-4 py-3 flex items-center gap-3 border border-white/5 rounded-2xl bg-black/40 backdrop-blur-md shadow-lg shadow-black/20 hover:border-emerald-500/30 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] transition-all duration-150 group">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest group-hover:text-emerald-400/70 transition-colors">
            {t.start}:
          </label>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, start: e.target.value }))
            }
            className="bg-transparent text-slate-200 outline-none text-sm font-mono cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert-[0.8]"
          />
        </div>
        <div className="glass-panel px-4 py-3 flex items-center gap-3 border border-white/5 rounded-2xl bg-black/40 backdrop-blur-md shadow-lg shadow-black/20 hover:border-indigo-500/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all duration-150 group">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest group-hover:text-indigo-400/70 transition-colors">
            {t.end}:
          </label>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, end: e.target.value }))
            }
            className="bg-transparent text-slate-200 outline-none text-sm font-mono cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert-[0.8]"
          />
        </div>
      </div>
      {/* Bento Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <motionSlim.div
          onClick={() => setActiveCard("stock")}
          className={`glass-panel p-4 md:p-6 relative overflow-hidden group cursor-pointer transition-all duration-150 ${
            activeCard === "stock"
              ? "side-light-active border-brand-500/50"
              : "led-glow-emerald border-brand-500/30"
          }`}
        >
          {activeCard === "stock" && (
            <div className="side-light-filament"></div>
          )}
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity led-icon-glow">
            <ShoppingCart className="w-16 h-16 text-brand-500" />
          </div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            {t.stockValue || "Valeur Stock"}
          </h3>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white tracking-tighter font-mono led-text-glow">
              {(stats.totalStockValue || 0).toLocaleString()}
            </span>
            <span className="text-brand-500 font-bold"></span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              {t.liveActive || "Actif en direct"}
            </span>
          </div>
        </motionSlim.div>

        <motionSlim.div
          onClick={() => setActiveCard("alerts")}
          className={`glass-panel p-4 md:p-6 relative overflow-hidden group cursor-pointer transition-all duration-150 ${
            activeCard === "alerts"
              ? "side-light-active-amber border-amber-500/50"
              : "led-glow-amber border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.05)] hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]"
          }`}
        >
          {activeCard === "alerts" && (
            <div
              className="side-light-filament"
              style={{
                backgroundColor: "#f59e0b",
                boxShadow:
                  "0 0 10px #f59e0b, 0 0 20px #f59e0b, 0 0 40px rgba(245,158,11,0.8), 10px 0 60px rgba(245,158,11,0.4)",
              }}
            ></div>
          )}
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
            <AlertTriangle className="w-16 h-16 text-amber-500" />
          </div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            {t.criticalAlerts || "Alertes Critiques"}
          </h3>
          <div className="flex items-baseline gap-2">
            <span
              className="text-4xl font-black text-amber-500 tracking-tighter font-mono"
              style={{ textShadow: "0 0 10px rgba(245,158,11,0.4)" }}
            >
              {stats.activeAlerts}
            </span>
            <span className="text-slate-500 text-sm font-bold">
              {t.items || "Items"}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              {stats.criticalItems} {t.shortages || "Ruptures"}
            </span>
          </div>
        </motionSlim.div>

        <motionSlim.div
          onClick={() => setActiveCard("robots")}
          className={`glass-panel p-4 md:p-6 relative overflow-hidden group cursor-pointer transition-all duration-150 ${
            activeCard === "robots"
              ? "side-light-active-blue border-blue-500/50"
              : "led-glow-blue border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.05)] hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]"
          }`}
        >
          {activeCard === "robots" && (
            <div
              className="side-light-filament"
              style={{
                backgroundColor: "#3b82f6",
                boxShadow:
                  "0 0 10px #3b82f6, 0 0 20px #3b82f6, 0 0 40px rgba(59,130,246,0.8), 10px 0 60px rgba(59,130,246,0.4)",
              }}
            ></div>
          )}
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
            <Bot className="w-16 h-16 text-blue-500" />
          </div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            {t.robotFleet}
          </h3>
          <div className="flex items-baseline gap-2">
            <span
              className="text-4xl font-black text-blue-500 tracking-tighter font-mono"
              style={{ textShadow: "0 0 10px rgba(59,130,246,0.4)" }}
            >
              03
            </span>
            <span className="text-slate-500 text-sm font-bold">
              {t.units || "Unités"}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              {t.connected || "Connectés"}
            </span>
          </div>
        </motionSlim.div>

        <motionSlim.div
          onClick={() => setActiveCard("labor")}
          className={`glass-panel p-4 md:p-6 relative overflow-hidden group cursor-pointer transition-all duration-150 ${
            activeCard === "labor"
              ? "side-light-active-purple border-purple-500/50"
              : "led-glow-purple border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.05)] hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]"
          }`}
        >
          {activeCard === "labor" && (
            <div
              className="side-light-filament"
              style={{
                backgroundColor: "#a855f7",
                boxShadow:
                  "0 0 10px #a855f7, 0 0 20px #a855f7, 0 0 40px rgba(168,85,247,0.8), 10px 0 60px rgba(168,85,247,0.4)",
              }}
            ></div>
          )}
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
            <Clock className="w-16 h-16 text-purple-500" />
          </div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            {t.dailyLaborCost || "Coût Main d'Œuvre"}
          </h3>
          <div className="flex items-baseline gap-2">
            <span
              className="text-4xl font-black text-purple-500 tracking-tighter font-mono"
              style={{ textShadow: "0 0 10px rgba(168,85,247,0.4)" }}
            >
              {Math.round(stats.dailyLaborCost || 0)}
            </span>
            <span className="text-brand-500 font-bold"></span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              {t.today || "Aujourd'hui"}
            </span>
          </div>
        </motionSlim.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div
          onClick={() => setActiveCard("costs")}
          className={`lg:col-span-2 glass-panel p-4 md:p-6 relative overflow-hidden cursor-pointer transition-all duration-150 ${
            activeCard === "costs"
              ? "side-light-active border-brand-500/50"
              : ""
          }`}
        >
          {activeCard === "costs" && (
            <div className="side-light-filament"></div>
          )}
          <div className="flex items-center justify-between mb-10">
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                {t.costAnalysis || "Analyse des Coûts"}
              </h3>
              <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
                {t.financialFlow || "Flux financier sur 7 jours"}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {t.foodCost || "Matière"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {t.laborCost || "Main d'Œuvre"}
                </span>
              </div>
            </div>
          </div>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={costData.map((d) => ({
                  ...d,
                  name: translateDayName(d.name),
                }))}
              >
                <defs>
                  <linearGradient id="colorCout" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLabor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 10, fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#475569",
                    fontSize: 10,
                    fontFamily: "JetBrains Mono",
                  }}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backgroundColor: "#050505",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                    padding: "12px",
                  }}
                  itemStyle={{
                    fontFamily: "JetBrains Mono",
                    fontWeight: 800,
                    color: "#fff",
                  }}
                  labelStyle={{
                    color: "#64748b",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    marginBottom: "4px",
                  }}
                  cursor={{
                    stroke: "rgba(255, 255, 255, 0.1)",
                    strokeWidth: 2,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cout"
                  name={t.foodCost || "Matière"}
                  stroke="#10b981"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorCout)"
                  animationDuration={2000}
                />
                <Area
                  type="monotone"
                  dataKey="labor"
                  name={t.laborCost || "Main d'Œuvre"}
                  stroke="#a855f7"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorLabor)"
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          onClick={() => setActiveCard("distribution")}
          className={`glass-panel p-4 md:p-6 relative overflow-hidden cursor-pointer transition-all duration-150 ${
            activeCard === "distribution"
              ? "side-light-active border-brand-500/50"
              : ""
          }`}
        >
          {activeCard === "distribution" && (
            <div className="side-light-filament"></div>
          )}
          <h3 className="text-xl font-bold text-white tracking-tight mb-2">
            {t.stockDistribution || "Répartition Stock"}
          </h3>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-10">
            {t.valueByCategory || "Valeur par catégorie"}
          </p>
          <div className="h-[300px] flex items-center justify-center relative">
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                {t.total || "Total"}
              </span>
              <span className="text-2xl font-black text-white tracking-tighter">
                {(stats.totalStockValue || 0).toLocaleString()}
              </span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stockData.map((item) => ({
                    ...item,
                    name: translateCat(item.name),
                  }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={85}
                  outerRadius={110}
                  paddingAngle={8}
                  dataKey="value"
                  animationDuration={1500}
                >
                  {stockData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke="none"
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backgroundColor: "#050505",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                  }}
                  itemStyle={{ fontFamily: "JetBrains Mono", fontWeight: 800 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {stockData
              .filter((i) => !i.isEmpty)
              .map((item, index) => {
                const translatedName = translateCat(item.name);
                return (
                  <div
                    key={index}
                    className="flex flex-col p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      ></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">
                        {translatedName}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-white">
                      {Number(Number(item.value).toFixed(2)).toLocaleString()}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
