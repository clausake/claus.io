import React, { useEffect, useState } from "react";
import {
  Activity,
  Battery,
  Bot,
  Zap,

  Menu as MenuIcon} from "lucide-react";

export function RobotManagement({ t }: { t: any }) {
  const [robots, setRobots] = useState<any[]>([]);

  useEffect(() => {
    const fetchRobots = async () => {
      try {
        const res = await fetch("/api/robots");
        if (res.ok) setRobots(await res.json());
      } catch (e: any) {
        if (e && e.message === "Failed to fetch") return;
        console.error("Error loading robots", e);
      }
    };
    fetchRobots();
    const interval = setInterval(fetchRobots, 5000);
    return () => clearInterval(interval);
  }, []);

  const translateValue = (val: string) => {
    if (!val) return val;
    const lower = val.toLowerCase();
    if (lower.includes("épluchage") || lower.includes("peeling"))
      return t.peelingCarrots;
    if (lower.includes("plonge") || lower.includes("dishwashing"))
      return t.washingPots;
    if (
      lower.includes("en attente") ||
      lower.includes("waiting") ||
      lower.includes("idle")
    )
      return t.robotWaiting;
    if (lower.includes("légumerie") || lower.includes("veg prep"))
      return t.vegPrep;
    if (
      lower.includes("station de charge") ||
      lower.includes("charging station")
    )
      return t.chargingStationA;
    if (lower === "plonge") return t.dishWashArea;
    return val;
  };

  const handleAssign = async (robotId: string) => {
    const task = prompt(t.whatTaskAssign);
    if (!task) return;

    try {
      const res = await fetch("/api/robots/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ robotId, task }),
      });
      if (res.ok) {
        const updatedRes = await fetch("/api/robots");
        if (updatedRes.ok) setRobots(await updatedRes.json());
      }
    } catch (e) {
      console.error("Assignment error", e);
    }
  };

  return (
    <div className="led-glow-container flex flex-col animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center">
            <Bot className="w-8 h-8 mr-3 text-blue-500" />
            {t.robotFleet}
          </h2>
          <p className="text-slate-500 mt-1">{t.robotFleetSubtitle}</p>
          <div className="mt-4 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-lg text-xs font-medium inline-block">
            {t.simulationWarning}
          </div>
        </div>
        <button className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black uppercase tracking-widest hover:bg-blue-500 transition-all flex items-center shadow-[0_0_20px_rgba(59,130,246,0.4)] border border-blue-400/30">
          <Zap className="w-4 h-4 mr-2 led-icon-glow" />
          {t.autoAssignAI}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {robots.map((robot) => (
          <div
            key={robot.id}
            className="led-glow-container p-6 relative overflow-hidden group hover:border-blue-500/30 transition-colors"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
              <div
                className={`h-full ${robot.status === "active" ? "bg-blue-500" : "bg-emerald-500"}`}
                style={{ width: `${robot.battery}%` }}
              />
            </div>

            <div className="flex justify-between items-start mb-4 mt-2">
              <div>
                <h3 className="text-lg font-bold text-white">{robot.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  {robot.id}
                </p>
              </div>
              <div
                className={`flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
                  robot.status === "active"
                    ? "bg-blue-500/10 text-blue-500"
                    : "bg-emerald-500/10 text-emerald-500"
                }`}
              >
                {robot.status === "active" ? t.robotOnMission : t.robotCharging}
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-center text-sm text-slate-400">
                <Battery className="w-4 h-4 mr-2 text-slate-500" />
                {t.batteryLabel}{" "}
                <span className="text-white ml-2 font-mono">
                  {robot.battery}%
                </span>
              </div>
              <div className="flex items-center text-sm text-slate-400">
                <Activity className="w-4 h-4 mr-2 text-slate-500" />
                {t.taskLabel}{" "}
                <span className="text-white ml-2">
                  {translateValue(robot.task)}
                </span>
              </div>
              <div className="flex items-center text-sm text-slate-400">
                <MenuIcon className="w-4 h-4 mr-2 text-slate-500" />
                {t.zoneLabel}{" "}
                <span className="text-white ml-2">
                  {translateValue(robot.location)}
                </span>
              </div>
            </div>

            {robot.status === "active" && (
              <div className="mb-6">
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span>{t.progressLabel}</span>
                  <span>{robot.progress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${robot.progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button className="py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl transition-colors">
                {t.details}
              </button>
              <button
                onClick={() => handleAssign(robot.id)}
                className={`py-2 text-sm font-medium rounded-xl transition-colors ${
                  robot.status === "active"
                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                    : "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                }`}
              >
                {robot.status === "active" ? t.interrupt : t.assign}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
