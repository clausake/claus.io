// T3.2 : extrait de src/components/InventoryAudit.tsx (extraction pure, byte-exact).
// Grille des deux cartes graphiques (valorisation par catégorie + santé du stock).
// JSX sans hook interne ; props = variables mesurées. Les useMemo categoryData/
// statusData/totalValue RESTENT dans le parent (contrat de re-render [inventory, t]).
// JSX Copié tel quel (mêmes classes, mêmes séries recharts).
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Activity, PieChartIcon } from 'lucide-react';
import { CATEGORY_COLORS } from './categoryColors';
import { ChartTooltip, StatusTooltip } from './tooltips';

export function InventoryCharts({ categoryData, totalValue, statusData, t }: {
  categoryData: any[]; totalValue: number; statusData: any[]; t: Record<string, string>;
}) {
  return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="glass-panel p-4">
          <h3 className="text-white font-bold mb-3 flex items-center text-sm">
            <PieChartIcon className="w-5 h-5 mr-2 text-indigo-400" />
            {t.valuationChart}
          </h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={65}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {categoryData.map((entry: {isEmpty?: boolean}, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.isEmpty
                          ? "#334155"
                          : CATEGORY_COLORS[index % CATEGORY_COLORS.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <text
                  x="50%"
                  y="45%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-lg font-bold fill-white text-glow-indigo"
                >
                  {totalValue.toFixed(0)}
                </text>
                <text
                  x="50%"
                  y="58%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[10px] font-mono fill-slate-400 uppercase tracking-widest"
                >
                  {t.total}
                </text>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-4">
          <h3 className="text-white font-bold mb-3 flex items-center text-sm">
            <Activity className="w-5 h-5 mr-2 text-emerald-400" />
            {t.stockHealth}
          </h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={0}
                  outerRadius={65}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={2}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<StatusTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
  );
}
