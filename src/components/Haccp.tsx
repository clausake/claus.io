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

export function Haccp({
  t,
  translateIngredient,
}: {
  t: any;
  translateIngredient?: (name: string, lang: string) => string;
}) {
  const toast = useToast();
  const [pendingDeleteSensor, setPendingDeleteSensor] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<
    "admission" | "controles" | "tracabilite" | "evidence" | "labeling"
  >("controles");
  const [logs, setLogs] = useState<any[]>([]);
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
  const [sensors, setSensors] = useState<any[]>([]);
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

  useEffect(() => {
    if (entryMode === "iot") {
      fetchSensors();
      const interval = setInterval(fetchSensors, 4000);
      return () => clearInterval(interval);
    }
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
                <div className="bg-[#1A1A1A] p-4 md:p-5 rounded-2xl border border-white/10 shadow-xl space-y-4 w-full">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono text-slate-400 flex items-center">
                      <Radio className="w-4 h-4 mr-2 text-emerald-500 animate-pulse" />
                      Registre IoT HACCP
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowRegisterForm(!showRegisterForm)}
                      className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded flex items-center gap-1 transition-all"
                    >
                      {showRegisterForm ? (
                        <>
                          <X className="w-3 h-3" /> Fermer
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" /> Nouveau
                        </>
                      )}
                    </button>
                  </div>

                  {showRegisterForm && (
                    <form
                      onSubmit={handleRegisterSensor}
                      className="bg-black/40 border border-white/5 p-3 rounded-xl space-y-2.5"
                    >
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                        Nouveau Capteur Physique
                      </h4>
                      <div>
                        <label className="block text-caption font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                          ID UNIQUE (SANS ESPACE)
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="sonde_chambre_2"
                          value={newSensorId}
                          onChange={(e) => setNewSensorId(e.target.value)}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-caption font-mono text-text-faint uppercase tracking-widest mb-1 font-bold">
                          NOM DE L'ÉQUIPEMENT
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="ex: Chambre Froide Positive B"
                          value={newSensorName}
                          onChange={(e) => setNewSensorName(e.target.value)}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-650 outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-caption font-mono text-text-faint uppercase tracking-widest mb-1 font-bold">
                            TYPE DE SONDE
                          </label>
                          <select
                            value={newSensorType}
                            onChange={(e) => setNewSensorType(e.target.value)}
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none"
                          >
                            <option value="ambient">Ambiant</option>
                            <option value="probe">À Aiguille / Cœur</option>
                            <option value="blast_chiller">
                              Cellule de Refroi.
                            </option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-caption font-mono text-text-faint uppercase tracking-widest mb-1 font-bold">
                            MESURE HACCP
                          </label>
                          <select
                            value={newSensorEqType}
                            onChange={(e) => setNewSensorEqType(e.target.value)}
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none"
                          >
                            <option value="Froid">Froid</option>
                            <option value="Chaud">Chaud</option>
                            <option value="Refroidissement">Refroidissement</option>
                          </select>
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={registering}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-2 rounded-lg transition-all disabled:opacity-50"
                      >
                        {registering
                          ? "Enregistrement..."
                          : "Enregistrer dans la base SQLite"}
                      </button>
                    </form>
                  )}

                  {!showRegisterForm && (
                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                      Alimenté par de véritables requêtes de sondes physiques ou
                      déclenchées via le simulateur d'appels CURL ci-dessous.
                    </p>
                  )}

                  <div className="space-y-3 font-sans">
                    {sensors.length === 0 ? (
                      <p className="text-[11px] text-text-faint text-center py-4 font-mono">
                        Aucun capteur enregistré.
                      </p>
                    ) : (
                      sensors.map((sensor) => {
                        const isAlert =
                          (sensor.equipment_type === "Froid" &&
                            sensor.temperature > 4) ||
                          (sensor.equipment_type === "Chaud" &&
                            sensor.temperature < 63 &&
                            sensor.type === "probe");

                        const webUrl =
                          window.location.origin +
                          "/api/haccp/webhook/iot-report";
                        const curlCmd =
                          "curl -X POST -H \"Content-Type: application/json\" -d '{\"id\":\"" +
                          sensor.id +
                          "\", \"token\":\"" +
                          sensor.webhook_token +
                          "\", \"temperature\":4.2}' " +
                          webUrl;

                        return (
                          <div
                            key={sensor.id}
                            className="bg-black/30 border border-white/5 p-3 rounded-xl relative overflow-hidden flex flex-col gap-2 transition-all hover:bg-black/45"
                          >
                            {/* Status line */}
                            <div className="flex justify-between items-start">
                              <div>
                                <span
                                  className="text-xs font-bold text-slate-100 block truncate max-w-[170px]"
                                  title={sensor.name}
                                >
                                  {sensor.name}
                                </span>
                                <span className="text-caption font-mono text-slate-400 block mt-0.5">
                                  ID:{" "}
                                  <strong className="text-emerald-400 font-mono">
                                    {sensor.id}
                                  </strong>{" "}
                                  •{" "}
                                  {sensor.type === "ambient"
                                    ? "Ambiant"
                                    : sensor.type === "probe"
                                      ? "À Cœur (Aiguille)"
                                      : "Refroidissement"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-mono">
                                <Battery
                                  className="w-3.5 h-3.5 text-slate-400"
                                  strokeWidth={1.5}
                                />
                                <span>{sensor.battery}%</span>
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteSensor(sensor.id)}
                                  className="text-red-400 hover:text-red-300 p-0.5 ml-1 transition-colors"
                                  title="Supprimer le capteur"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Temp Gauge Section */}
                            <div className="grid grid-cols-2 gap-2 bg-black/40 p-2 text-xs rounded-lg border border-white/5 font-sans">
                              <div>
                                <label className="block text-caption font-mono text-slate-500 uppercase tracking-wider leading-none mb-1">
                                  Température
                                </label>
                                <div className="flex items-center gap-1.5 font-sans">
                                  <span
                                    className={`w-2 h-2 rounded-full ${isAlert ? "bg-red-500 animate-pulse" : "bg-emerald-500 animate-pulse"}`}
                                  />
                                  <span
                                    className={`text-sm font-black tracking-tight ${isAlert ? "text-red-500" : "text-emerald-400"}`}
                                  >
                                    {sensor.temperature !== undefined
                                      ? `${sensor.temperature.toFixed(1)}°C`
                                      : "N/A"}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right flex flex-col justify-end">
                                <label className="block text-caption font-mono text-slate-500 uppercase tracking-wider leading-none mb-1">
                                  Reçu le
                                </label>
                                <span className="text-caption font-mono text-text-muted truncate">
                                  {sensor.last_reading_at
                                    ? new Date(
                                        sensor.last_reading_at,
                                      ).toLocaleTimeString()
                                    : "En attente..."}
                                </span>
                              </div>
                            </div>

                            {/* Webhook Token details */}
                            <div className="flex items-center gap-1.5 text-caption font-mono text-slate-400 bg-black/20 px-2 py-1 rounded">
                              <Key className="w-2.5 h-2.5 text-text-faint" />
                              <span>
                                Token:{" "}
                                <strong className="text-text-muted select-all font-mono">
                                  {sensor.webhook_token}
                                </strong>
                              </span>
                            </div>

                            {/* Tester & Real integration trigger */}
                            <div className="space-y-1.5 border-t border-white/5 pt-2">
                              <span className="block text-caption font-mono font-bold text-slate-400 uppercase tracking-widest text-caption">
                                Tester la Sonde (Appel HTTP Direct)
                              </span>

                              <div className="flex gap-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  placeholder="Temp (°C)"
                                  value={testerTemp[sensor.id] || ""}
                                  onChange={(e) =>
                                    setTesterTemp((prev) => ({
                                      ...prev,
                                      [sensor.id]: e.target.value,
                                    }))
                                  }
                                  className="flex-1 bg-black/60 border border-white/10 rounded px-2 py-1 text-[10px] text-white outline-none focus:border-emerald-500 placeholder-slate-650"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSendWebhookTest(
                                      sensor.id,
                                      sensor.webhook_token,
                                    )
                                  }
                                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded text-caption font-bold font-mono transition-all"
                                >
                                  Déclencher POST
                                </button>
                              </div>

                              <div className="bg-[#121212] p-2 rounded text-caption font-mono text-slate-500 border border-white/5 space-y-1 overflow-x-auto max-w-full text-left font-mono">
                                <div className="flex items-center gap-1 text-caption text-emerald-500 font-bold uppercase tracking-widest mb-0.5">
                                  <Terminal className="w-2.5 h-2.5 text-emerald-400 animate-bounce" />{" "}
                                  Requête HTTP physique
                                </div>
                                <div className="select-all break-all whitespace-normal text-slate-400 bg-black/45 p-1.5 rounded border border-white/5 leading-normal font-mono">
                                  {curlCmd}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
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
                {filteredLogs.map((log: any) => {
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
                              {new Date(log.recorded_at).toLocaleTimeString(
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
