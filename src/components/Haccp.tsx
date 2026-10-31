import React, { useState, useEffect, useRef } from "react";
import {
  Thermometer,
  Calendar,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  User,
  X,
  CheckCircle2,
  PackageSearch,
  ScanLine,
  FileCheck,
  Printer,
  Radio,
  Battery,
  Wifi,
  Flame,
  Cpu,
  Laptop,
  Keyboard,
  Trash2,
  Key,
  Terminal,
} from "lucide-react";
import {
  AdmissionModule,
  TransformationModule,
  EvidenceModule,
  LabelingModule,
} from "./HaccpModules";
import { DocumentUpload } from "./DocumentUpload";
import { useToast, ConfirmDialog } from "./ui/Toast";
// T3.2 : bloc Registre IoT extrait (extraction pure, byte-exact) dans ./haccp/.
import { HaccpRegisterIot } from "./haccp/HaccpRegisterIot";

interface Sensor {
  id: string;
  name: string;
  temperature?: number;
  [k: string]: unknown;
}

interface HaccpLog {
  id: string;
  equipment_name: string;
  temperature: number;
  recorded_at?: string;
  [k: string]: unknown;
}

export function Haccp({
  t,
  translateIngredient,
}: {
  t: Record<string, string>;
  translateIngredient?: (name: string, lang: string) => string;
}) {
  const toast = useToast();
  const [pendingDeleteSensor, setPendingDeleteSensor] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<
    "admission" | "controles" | "tracabilite" | "evidence" | "labeling"
  >("controles");
  const [logs, setLogs] = useState<HaccpLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMonth, setViewMonth] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [equipment, setEquipment] = useState("");
  const [temp, setTemp] = useState("");
  const [controlType, setControlType] = useState("Froid");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [alertLog, setAlertLog] = useState<any>(null);
  const [actionText, setActionText] = useState("");

  // --- IoT CONNECTED THERMOMETERS STATES & API (100% FUNCTIONAL) ---
  const [entryMode, setEntryMode] = useState<"manual" | "iot">("manual");
  const [sensors, setSensors] = useState<Sensor[]>([]);
  // Capteurs sans émission recente: le silence est l'alerte HACCP, il faut le
  // rendre visible (un capteur a pile morte doit etre distinct d'une chambre ok).
  const [staleIds, setStaleIds] = useState<Set<string>>(new Set());
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newSensorId, setNewSensorId] = useState("");
  const [newSensorName, setNewSensorName] = useState("");
  const [newSensorType, setNewSensorType] = useState("ambient");
  const [newSensorEqType, setNewSensorEqType] = useState("Froid");
  const [registering, setRegistering] = useState(false);
  const [testerTemp, setTesterTemp] = useState<{ [key: string]: string }>({});

  const fetchSensors = async () => {
    try {
      const res = await fetch("/api/haccp/iot-sensors");
      const data = await res.json();
      setSensors(data || []);
    } catch (err) {
      console.error("Error fetching IoT sensors:", err);
    }
  };

  const handleRegisterSensor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSensorId || !newSensorName) return;
    try {
      setRegistering(true);
      const res = await fetch("/api/haccp/iot-sensors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newSensorId,
          name: newSensorName,
          type: newSensorType,
          equipment_type: newSensorEqType,
        }),
      });
      if (res.ok) {
        setNewSensorId("");
        setNewSensorName("");
        setShowRegisterForm(false);
        fetchSensors();
      } else {
        const err = await res.json();
        toast(err.error || "Erreur d'enregistrement", "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRegistering(false);
    }
  };

  const handleDeleteSensor = async (id: string) => {
    if (!confirm(`Supprimer le capteur #${id} ?`)) return;
    try {
      await fetch(`/api/haccp/iot-sensors/${id}`, { method: "DELETE" });
      fetchSensors();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendWebhookTest = async (id: string, token: string) => {
    const value = testerTemp[id] || "4.0";
    try {
      const res = await fetch("/api/haccp/webhook/iot-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          token,
          temperature: parseFloat(value),
          battery: 95,
        }),
      });
      if (res.ok) {
        fetchSensors();
        fetchLogs();
        setTesterTemp((p) => ({ ...p, [id]: "" }));
      } else {
        const err = await res.json();
        toast(err.error || "Erreur webhook", "error");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Le serveur connait l'instant ou un capteur poste (le webhook): il pousse,
  // on ne vient plus voler la base toutes les 4 s. Un seul GET initial + un
  // flux SSE. Le EventSource se reconnecte seul (retry: 2500 cote serveur),
  // mais il ne signale pas ses blancs: d'ou le filet de garde ci-dessous.
  useEffect(() => {
    if (entryMode !== "iot") return;
    fetchSensors();
    let lastPush = Date.now();

    const patchSensor = (payload: Partial<Sensor> | null) => {
      lastPush = Date.now();
      setSensors((prev) => {
        const idx = prev.findIndex((s) => s.id === payload?.id);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = { ...next[idx], ...payload };
        return next;
      });
    };
    const onData = (ev: Event) => {
      try { return JSON.parse((ev as MessageEvent).data); } catch { return null; }
    };

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/sensors/stream");
      es.addEventListener("sensor", (ev) => patchSensor(onData(ev)));
      es.addEventListener("sensors", (ev) => {
        lastPush = Date.now();
        const list = onData(ev);
        if (Array.isArray(list)) setSensors(list);
      });
      es.addEventListener("stale", (ev) => {
        lastPush = Date.now();
        const list = onData(ev);
        setStaleIds(new Set((Array.isArray(list) ? list : []).map((s: {id: string}) => s.id)));
      });
    } catch {
      es = null; // EventSource indisponible (vieux navigateur): le filet prend.
    }

    // Filet: aucun evenement depuis 20 s => on resynchronise en HTTP. Un proxy
    // qui tamponne le flux ou un onglet en arriere-plan gelle ne peuvent plus
    // laisser le tableau figer sur des mesures de la veille.
    const guard = setInterval(() => {
      if (Date.now() - lastPush > 20_000) {
        lastPush = Date.now();
        fetchSensors();
      }
    }, 20_000);

    return () => {
      if (es) es.close();
      clearInterval(guard);
    };
  }, [entryMode]);

  const saveCorrectiveAction = async (logId: string, action: string) => {
    try {
      await fetch("/api/haccp/corrective-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_id: logId, action_taken: action }),
      });
      setAlertLog(null);
      setActionText("");
      fetchLogs();
    } catch (err) {
      console.error(err);
    }
  };
  // (Keep the rest of the existing state here)

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setShowCalendar(false);
      }
    }
    if (showCalendar) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCalendar]);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/haccp/temperatures");
      const data = await res.json();
      setLogs(data);
    } catch (error) {
      console.error("Error loading logs:", error);
    }
  };

  const logTemp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!equipment || !temp) return;

    setIsSubmitting(true);
    const eqName = `[${controlType}] ${equipment}`;
    try {
      await fetch("/api/haccp/temperature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipment_name: eqName,
          temperature: parseFloat(temp),
          user: "SYSTÈME",
          recorded_at: selectedDate.toISOString(),
        }),
      });
      setEquipment("");
      setTemp("");
      fetchLogs();
    } catch (error) {
      console.error("Error recording temperature:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(
      t.language === "fr"
        ? "fr-FR"
        : t.language === "es"
          ? "es-ES"
          : t.language === "de"
            ? "de-DE"
            : t.language === "it"
              ? "it-IT"
              : "en-US",
      { day: "numeric", month: "long", year: "numeric" },
    ).format(date);
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
    setViewMonth(newDate);
  };

  const filteredLogs = logs.filter((log) => {
    const logDate = new Date(log.recorded_at);
    return (
      logDate.getDate() === selectedDate.getDate() &&
      logDate.getMonth() === selectedDate.getMonth() &&
      logDate.getFullYear() === selectedDate.getFullYear()
    );
  });

  const getDaysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) =>
    (new Date(year, month, 1).getDay() + 6) % 7;

  const renderCalendar = () => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days: React.ReactNode[] = [];

    for (let i = 0; i < firstDay; i++)
      days.push(<div key={`empty-${i}`} className="h-12 w-12"></div>);

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const hasLogs = logs.some((log) => {
        const ld = new Date(log.recorded_at);
        return (
          ld.getDate() === d &&
          ld.getMonth() === month &&
          ld.getFullYear() === year
        );
      });
      const isSelected =
        d === selectedDate.getDate() &&
        month === selectedDate.getMonth() &&
        year === selectedDate.getFullYear();
      const isToday =
        d === new Date().getDate() &&
        month === new Date().getMonth() &&
        year === new Date().getFullYear();

      days.push(
        <button
          key={d}
          onClick={() => {
            setSelectedDate(date);
            setShowCalendar(false);
          }}
          className={`h-12 w-12 rounded-xl flex flex-col items-center justify-center relative transition-all ${
            isSelected
              ? "bg-emerald-600 text-white"
              : isToday
                ? "bg-white/10 text-emerald-400 ring-1 ring-emerald-500/50"
                : "hover:bg-white/5 text-slate-300"
          }`}
        >
          <span className="text-sm font-bold">{d}</span>
          {hasLogs && (
            <div
              className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-emerald-500"}`}
            ></div>
          )}
        </button>,
      );
    }
    return days;
  };

  const changeViewMonth = (offset: number) => {
    const newMonth = new Date(viewMonth);
    newMonth.setMonth(newMonth.getMonth() + offset);
    setViewMonth(newMonth);
  };

  const renderActiveModule = () => {
    switch (activeSubTab) {
      case "admission":
        return (
          <AdmissionModule t={t} translateIngredient={translateIngredient} />
        );
      case "tracabilite":
        return <TransformationModule t={t} />;
      case "labeling":
        return <LabelingModule t={t} />;
      case "evidence":
        return <EvidenceModule t={t} />;
      case "controles":
      default:
        return (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 flex-1 overflow-hidden">
            <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto pr-2">
              {/* Mode Switcher */}
              <div className="flex bg-[#141414] p-1 rounded-xl border border-white/5 shadow-inner">
                <button
                  onClick={() => setEntryMode("manual")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${entryMode === "manual" ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  {t.manualEntry || "Manuel"}
                </button>
                <button
                  onClick={() => setEntryMode("iot")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${entryMode === "iot" ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                >
                  <Radio
                    className={`w-3.5 h-3.5 ${entryMode === "iot" ? "text-white" : "text-emerald-400 animate-pulse"}`}
                  />
                  Capteurs IoT
                </button>
              </div>

              {entryMode === "manual" ? (
                <div className="bg-[#1A1A1A] p-4 md:p-6 rounded-2xl border border-white/10 shadow-xl w-full">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center uppercase tracking-wider font-mono text-slate-400">
                    <Plus className="w-4 h-4 mr-2 text-emerald-500" />
                    {t.manualEntry}
                  </h3>
                  <form onSubmit={logTemp} className="space-y-3">
                    <div>
                      <label className="block text-[10px] md:text-xs font-mono text-slate-500 uppercase tracking-widest mb-1 md:mb-2">
                        {t.controlType || "Type"}
                      </label>
                      <select
                        value={controlType}
                        onChange={(e) => setControlType(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      >
                        <option value="Froid">
                          {t.typeFroid || "Froid (Frigo/Chambre froide)"}
                        </option>
                        <option value="Chaud">
                          {t.typeChaud || "Chaud (Cuisson)"}
                        </option>
                        <option value="Refroidissement">
                          {t.typeRefroid || "Refroidissement Rapide"}
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] md:text-xs font-mono text-slate-500 uppercase tracking-widest mb-1 md:mb-2">
                        {t.equipment || "Equipment"}
                      </label>
                      <input
                        type="text"
                        placeholder={t.equipmentPlaceholder || "ex: Fridge 1"}
                        value={equipment}
                        onChange={(e) => setEquipment(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] md:text-xs font-mono text-slate-500 uppercase tracking-widest mb-1 md:mb-2">
                        {t.temperatureLabel || "Temperature (°C)"}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        value={temp}
                        onChange={(e) => setTemp(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 mt-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50"
                    >
                      {isSubmitting ? t.saving : t.saveShort || "Enregistrer"}
                    </button>
                  </form>
                </div>
              ) : (
                <HaccpRegisterIot sensors={sensors} staleIds={staleIds} showRegisterForm={showRegisterForm} setShowRegisterForm={setShowRegisterForm} newSensorId={newSensorId} setNewSensorId={setNewSensorId} newSensorName={newSensorName} setNewSensorName={setNewSensorName} newSensorType={newSensorType} setNewSensorType={setNewSensorType} newSensorEqType={newSensorEqType} setNewSensorEqType={setNewSensorEqType} registering={registering} testerTemp={testerTemp} setTesterTemp={setTesterTemp} handleRegisterSensor={handleRegisterSensor} handleSendWebhookTest={handleSendWebhookTest} setPendingDeleteSensor={setPendingDeleteSensor} t={t} />
              )}
            </div>
            <div className="lg:col-span-3 flex flex-col bg-[#1A1A1A] rounded-2xl border border-white/10 shadow-xl overflow-hidden">
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
                <h3 className="text-sm md:text-lg font-bold text-white flex items-center">
                  <Thermometer className="w-4 h-4 md:w-5 md:h-5 mr-2 text-emerald-500" />
                  {t.logsFrom} {formatDate(selectedDate)}
                </h3>
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] md:text-xs font-bold rounded-full border border-emerald-500/20">
                  {filteredLogs.length} {t.logEntries}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {filteredLogs.map((log: HaccpLog) => {
                  const isAlert =
                    log.temperature > 4 &&
                    !log.equipment_name.includes("Congélateur") &&
                    !log.equipment_name.includes("Freezer");
                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 md:p-4 bg-black/40 border border-white/5 rounded-2xl"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${isAlert ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"}`}
                        >
                          <Thermometer className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-100">
                            {log.equipment_name}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500 uppercase tracking-widest font-bold flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              {new Date(log.recorded_at || 0).toLocaleTimeString(
                                t.language === "fr"
                                  ? "fr-FR"
                                  : t.language === "es"
                                    ? "es-ES"
                                    : t.language === "de"
                                      ? "de-DE"
                                      : t.language === "it"
                                        ? "it-IT"
                                        : "en-US",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-500" />
                              {log.user}
                            </span>
                            {log.entry_type === "iot" ? (
                              <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-caption font-mono border border-emerald-500/10">
                                <Radio className="w-2.5 h-2.5 animate-pulse" />{" "}
                                IoT
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-slate-400 bg-white/5 px-1.5 py-0.5 rounded text-caption font-mono border border-white/5">
                                <Keyboard className="w-2.5 h-2.5" /> MANUEL
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-2xl font-black tracking-tighter ${isAlert ? "text-red-500" : "text-emerald-400"}`}
                        >
                          {log.temperature.toFixed(1)}°C
                        </p>
                        {isAlert && (
                          <button
                            onClick={() => setAlertLog(log)}
                            className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded hover:bg-red-500/20 uppercase tracking-tighter mt-1"
                          >
                            {t.correctiveAction}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="led-glow-container flex flex-col animate-in fade-in duration-150 overflow-hidden relative">
      {/* Calendar Modal */}
      {showCalendar && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            ref={calendarRef}
            className="bg-[#1A1A1A] border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-6"
          >
            <button
              onClick={() => setShowCalendar(false)}
              className="absolute top-4 right-4 p-2 text-slate-400"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="grid grid-cols-7 gap-1">{renderCalendar()}</div>
          </div>
        </div>
      )}
      <div className="flex-none justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            {t.haccpTitle}
          </h2>
          <p className="text-slate-500 mt-1">{t.haccpSubtitle}</p>
        </div>
      </div>

      <div className="mb-6">
        <DocumentUpload
          t={t}
          onUploadComplete={() => {
            // If you want to do anything on completion in HACCP tab
            if (activeSubTab === "evidence") {
              // maybe we could tell EvidenceModule to refresh, but it's okay, DocumentUpload does its own upload.
            }
          }}
        />
      </div>

      <div className="flex-none gap-2 mb-6 flex flex-wrap">
        {[
          {
            id: "admission",
            label: t.admission,
            icon: <PackageSearch className="w-4 h-4" />,
          },
          {
            id: "controles",
            label: t.controls,
            icon: <Thermometer className="w-4 h-4" />,
          },
          {
            id: "tracabilite",
            label: t.traceability,
            icon: <ScanLine className="w-4 h-4" />,
          },
          {
            id: "labeling",
            label: t.labels,
            icon: <Printer className="w-4 h-4" />,
          },
          {
            id: "evidence",
            label: t.evidence,
            icon: <FileCheck className="w-4 h-4" />,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-base transition-all ${activeSubTab === tab.id ? "bg-emerald-600 text-white" : "bg-black/40 text-slate-400 hover:bg-white/5"}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {renderActiveModule()}
      </div>

      {alertLog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#1A1A1A] p-6 rounded-2xl w-full max-w-sm border border-red-500/50">
            <h3 className="text-lg font-bold text-red-500 mb-2">
              {t.nonComplianceDetected}
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              {t.equipmentLabel || "Equipment"}: {alertLog.equipment_name} (
              {alertLog.temperature.toFixed(1)}°C)
            </p>
            <textarea
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
              placeholder={t.actionTakenPlaceholder || "Action taken..."}
              className="w-full bg-black rounded-lg p-3 text-white mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => saveCorrectiveAction(alertLog.id, actionText)}
                className="flex-1 py-2 bg-red-600 rounded-lg text-white font-bold"
              >
                {t.validateAction}
              </button>
              <button
                onClick={() => setAlertLog(null)}
                className="flex-1 py-2 bg-slate-700 rounded-lg text-white font-bold"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    
      <ConfirmDialog
        open={!!pendingDeleteSensor}
        title="Supprimer ce capteur ?"
        description="Le capteur et son historique seront supprimés."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        onConfirm={async () => {
          if (pendingDeleteSensor) {
            await handleDeleteSensor(pendingDeleteSensor);
          }
          setPendingDeleteSensor(null);
        }}
        onCancel={() => setPendingDeleteSensor(null)}
      />
</div>
  );
}
