import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  PackageSearch,
  ShoppingCart,
} from "lucide-react";
import { translateAlertMessage, translateIngredientHelper } from "../lib/helpers";
import { useToast } from "./ui/Toast";

export function QualityControl({ t }: { t: any }) {
  const toast = useToast();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAlerts = async () => {
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      setAlerts(data);
    } catch (e: any) {
      if (e && e.message === "Failed to fetch") return;
      console.error(t.loadingAlerts, e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleResolveAlert = async (alertItem: any) => {
    try {
      const res = await fetch(`/api/alerts/${alertItem.id}/resolve`, {
        method: "POST",
      });
      if (res.ok) {
        toast(`✅ ${t.resolve} : ${alertItem.message}`, "success");
        fetchAlerts();
      } else {
        throw new Error("Erreur serveur");
      }
    } catch (e) {
      console.error("Erreur traitement alerte:", e);
      toast(t.updateError, "error");
    }
  };

  const handleIgnoreAlert = async (alertItem: any) => {
    try {
      const res = await fetch(`/api/alerts/${alertItem.id}/ignore`, {
        method: "POST",
      });
      if (res.ok) {
        toast(`👁️ ${t.ignore}`, "success");
        fetchAlerts();
      } else {
        throw new Error("Erreur serveur");
      }
    } catch (e) {
      console.error("Erreur ignorance alerte:", e);
      toast(t.updateError, "error");
    }
  };

  return (
    <div className="bg-black p-8 rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10 animate-in fade-in duration-150">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {t.qcTitle}
          </h2>
          <p className="text-slate-500 mt-1">{t.qcSubtitle}</p>
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">
            {t.loadingAlerts}
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-50" />
            <p className="text-slate-400 font-medium">{t.noAlertsActive}</p>
          </div>
        ) : (
          alerts.map((alertItem) => (
            <div
              key={alertItem.id}
              className="p-5 rounded-2xl border border-white/10 flex items-start hover:bg-black/5 transition-colors shadow-lg shadow-black/20 hover:shadow-md duration-300"
            >
              <div
                className={`p-3 rounded-xl mr-5 shadow-lg shadow-black/20 ${
                  alertItem.type === "price"
                    ? "bg-purple-100 text-purple-600 ring-1 ring-purple-600/20"
                    : alertItem.type === "stock"
                      ? "bg-red-100 text-red-600 ring-1 ring-red-600/20"
                      : "bg-amber-100 text-amber-600 ring-1 ring-amber-600/20"
                }`}
              >
                {alertItem.type === "price" ? (
                  <ShoppingCart className="w-6 h-6" />
                ) : alertItem.type === "stock" ? (
                  <PackageSearch className="w-6 h-6" />
                ) : (
                  <AlertTriangle className="w-6 h-6" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white tracking-tight text-lg">
                    {alertItem.type === "price"
                      ? t.priceAlert
                      : alertItem.type === "stock"
                        ? t.stockAlert
                        : t.yieldAlert}
                  </h4>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                      alertItem.severity === "high"
                        ? "bg-red-100/80 text-red-700 ring-1 ring-red-600/20"
                        : "bg-amber-100/80 text-amber-700 ring-1 ring-amber-600/20"
                    }`}
                  >
                    {alertItem.severity === "high"
                      ? t.criticalSeverity
                      : t.majorSeverity}
                  </span>
                </div>
                <p className="text-slate-500 mt-2">
                  {translateAlertMessage(
                    alertItem.message,
                    t,
                    translateIngredientHelper,
                  )}
                </p>
                <div className="mt-4 flex space-x-4">
                  <button
                    onClick={() => handleResolveAlert(alertItem)}
                    className="text-sm text-emerald-600 font-semibold hover:text-emerald-700 uppercase tracking-wider hover:underline underline-offset-2 transition-all"
                  >
                    {t.resolve}
                  </button>
                  <button
                    onClick={() => handleIgnoreAlert(alertItem)}
                    className="text-sm text-slate-500 font-semibold hover:text-slate-500 uppercase tracking-wider hover:underline underline-offset-2 transition-all"
                  >
                    {t.ignore}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
