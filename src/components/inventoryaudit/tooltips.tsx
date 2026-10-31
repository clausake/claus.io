// T3.2 : extrait de src/components/InventoryAudit.tsx (extraction pure, byte-exact).
// Deux infobulles recharts : mesurées comme ne lisant AUCUNE variable du composant
// (que leurs props active/payload). JSX Copié tel quel, 0 prop parente à passer.
export const ChartTooltip = ({ active, payload }: {active?: boolean; payload?: Array<{isEmpty?: boolean; name?: string; value?: number; color?: string}>}) => {
    if (active && payload && payload.length && !payload[0].isEmpty) {
      return (
        <div className="glass-panel p-3 border border-white/10 shadow-2xl bg-black/95 backdrop-blur-md">
          <p className="text-slate-300 font-medium text-xs uppercase tracking-widest mb-1">
            {payload[0].name}
          </p>
          <p className="text-emerald-400 font-mono font-bold text-lg">
            {(payload[0].value || 0).toFixed(2)}
          </p>
        </div>
      );
    }
    return null;
  };

export const StatusTooltip = ({ active, payload }: {active?: boolean; payload?: Array<{isEmpty?: boolean; name?: string; value?: number; color?: string}>}) => {
    if (active && payload && payload.length && !payload[0].isEmpty) {
      return (
        <div className="glass-panel p-2 border border-white/10 shadow-2xl bg-black/95 backdrop-blur-md flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: payload[0].color }}
          ></div>
          <p className="text-slate-300 font-medium text-xs">
            {payload[0].name}:
          </p>
          <p className="font-mono font-bold text-white text-sm">
            {payload[0].value}
          </p>
        </div>
      );
    }
    return null;
  };
