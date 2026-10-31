// T3.2 : extrait de src/components/Haccp.tsx (extraction pure, byte-exact).
// Bloc « Registre IoT HACCP » : la branche else du ternaire entryMode (le formulaire
// manuel 433-493 reste dans le parent). JSX sans hook interne ; props = les variables
// et handlers MESURÉS sur la plage (sensors/staleIds + les paires champ/setter du
// formulaire de capteur + registering/testerTemp + handleRegisterSensor/
// handleSendWebhookTest/setPendingDeleteSensor + t). JSX Copié tel quel.
import { Battery, Key, Plus, Radio, Terminal, Trash2, X } from 'lucide-react';

export function HaccpRegisterIot({ sensors, staleIds, showRegisterForm, setShowRegisterForm, newSensorId, setNewSensorId, newSensorName, setNewSensorName, newSensorType, setNewSensorType, newSensorEqType, setNewSensorEqType, registering, testerTemp, setTesterTemp, handleRegisterSensor, handleSendWebhookTest, setPendingDeleteSensor, t }: {
  sensors: any[]; staleIds: any;
  showRegisterForm: boolean; setShowRegisterForm: (v: boolean) => void;
  newSensorId: string; setNewSensorId: (v: string) => void;
  newSensorName: string; setNewSensorName: (v: string) => void;
  newSensorType: string; setNewSensorType: (v: string) => void;
  newSensorEqType: string; setNewSensorEqType: (v: string) => void;
  registering: boolean;
  testerTemp: any; setTesterTemp: (v: any) => void;
  handleRegisterSensor: (e?: any) => any; handleSendWebhookTest: (id: any, token: any) => any;
  setPendingDeleteSensor: (v: any) => void;
  t: Record<string, string>;
}) {
  return (
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
                        // Silence du capteur = alerte HACCP a part entiere. Un
                        // capteur muet ne doit surtout PAS passer pour une
                        // chambre froide conforme: la LED se fige et ne pulse
                        // plus (le pulsation mentirait sur une mesure fraiche).
                        const isStale = staleIds.has(sensor.id);
                        const isAlert =
                          !isStale &&
                          ((sensor.equipment_type === "Froid" &&
                              sensor.temperature > 4) ||
                            (sensor.equipment_type === "Chaud" &&
                              sensor.temperature < 63 &&
                              sensor.type === "probe"));

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
                                    className={`w-2 h-2 rounded-full ${
                                      isStale
                                        ? "bg-amber-500"
                                        : isAlert
                                          ? "bg-red-500 animate-pulse"
                                          : "bg-emerald-500 animate-pulse"
                                    }`}
                                    title={
                                      isStale
                                        ? "Capteur muet : plus aucune mesure recue (verifier pile/connexion)"
                                        : undefined
                                    }
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
  );
}
