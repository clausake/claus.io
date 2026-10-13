import React, { useState, useEffect } from 'react';
import { Users, UserPlus, FileDown, X, Calculator, Clock, ChevronDown, Calendar as CalendarIcon, Copy } from 'lucide-react';
import { startOfWeek, endOfWeek, addDays, format, parseISO } from 'date-fns';

interface Shift {
  start: string;
  end: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  rate: string;
  schedule: Record<string, Shift>;
}

const UI_TO_DB_DAY: Record<string, string> = { lun: 'monday', mar: 'tuesday', mer: 'wednesday', jeu: 'thursday', ven: 'friday', sam: 'saturday', dim: 'sunday' };
const DB_TO_UI_DAY: Record<string, string> = { monday: 'lun', tuesday: 'mar', wednesday: 'mer', thursday: 'jeu', friday: 'ven', saturday: 'sam', sunday: 'dim' };

const mapUIToDBSlots = (shift: {start: string, end: string}) => {
  if (shift && shift.start && shift.end) {
    return [{ start: shift.start, end: shift.end }];
  }
  return [];
};

const mapDBSlotsToUI = (slots: {start?: string; end?: string}[]) => {
  if (!slots || slots.length === 0) return { start: '', end: '' };
  const first = slots[0];
  return { start: first.start || '', end: first.end || '' };
};

const emptySchedule = (): Record<string, Shift> => ({
  lun: { start: '', end: '' },
  mar: { start: '', end: '' },
  mer: { start: '', end: '' },
  jeu: { start: '', end: '' },
  ven: { start: '', end: '' },
  sam: { start: '', end: '' },
  dim: { start: '', end: '' }
});

interface StaffPlanningProps {
  t: Record<string, string>;
}

export function StaffPlanning({ t }: StaffPlanningProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('Chef de Cuisine');
  const [rate, setRate] = useState('15');
  const [weekStart, setWeekStart] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [isDuplicating, setIsDuplicating] = useState(false);

  const getWeekDates = () => {
    const start = parseISO(weekStart);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
        dates.push(format(addDays(start, i), 'yyyy-MM-dd'));
    }
    return dates; // [lun, mar, mer, jeu, ven, sam, dim]
  };

  const UI_TO_EXACT_DATE = () => {
      const dates = getWeekDates();
      return {
          lun: dates[0],
          mar: dates[1],
          mer: dates[2],
          jeu: dates[3],
          ven: dates[4],
          sam: dates[5],
          dim: dates[6]
      };
  };

  const EXACT_DATE_TO_UI = () => {
      const mapping = UI_TO_EXACT_DATE();
      return Object.entries(mapping).reduce((acc, [k, v]) => ({ ...acc, [v]: k }), {} as Record<string, string>);
  };

  const loadData = () => {
    const start = weekStart;
    const end = format(endOfWeek(parseISO(weekStart), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    fetch(`/api/staff?start=${start}&end=${end}`)
      .then(res => res.json())
      .then(data => {
         const mapping = EXACT_DATE_TO_UI();
         const mapped = data.map((dbStaff: {id: string; name: string; role: string; hourlyRate: string; schedule?: Record<string, {start?: string; end?: string}[]>}) => {
            const newSched: Record<string, Shift> = emptySchedule();
            if (dbStaff.schedule) {
              Object.entries(dbStaff.schedule).forEach(([dbDayOrDate, slots]) => {
                  const uiDay = mapping[dbDayOrDate] || DB_TO_UI_DAY[dbDayOrDate];
                  if (uiDay) {
                     newSched[uiDay] = mapDBSlotsToUI(slots as any[]);
                  }
              });
            }
            return {
              id: dbStaff.id,
              name: dbStaff.name,
              role: dbStaff.role,
              rate: dbStaff.hourlyRate,
              schedule: newSched as Record<string, Shift>
            };
         });
         setStaff(mapped);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadData();
  }, [weekStart]);

  const handleDuplicateWeek = async () => {
    setIsDuplicating(true);
    try {
      const currentStart = weekStart;
      const prevStart = format(addDays(parseISO(weekStart), -7), 'yyyy-MM-dd');
      
      const res = await fetch('/api/staff/duplicate-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentWeekStart: currentStart, prevWeekStart: prevStart })
      });
      if (res.ok) {
        loadData();
      }
    } catch (e) {
      console.error("Failed to duplicate week", e);
    } finally {
      setIsDuplicating(false);
    }
  };

  const saveToBackend = async (member: StaffMember) => {
    const dbSchedule: Record<string, {start: string; end: string}[]> = {};
    const uiToDate = UI_TO_EXACT_DATE();
    Object.entries(member.schedule).forEach(([uiDay, shift]: [string, any]) => {
      const exactDate = uiToDate[uiDay as keyof typeof uiToDate];
      if (exactDate) dbSchedule[exactDate] = mapUIToDBSlots(shift);
    });

    try {
      await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: member.id,
          name: member.name,
          role: member.role,
          hourlyRate: member.rate,
          schedule: dbSchedule,
          datesObj: uiToDate
        })
      });
    } catch (e) {
      console.error("Failed to save staff", e);
    }
  };

  const addStaff = async () => {
    if (name.trim() === '') return;
    const newMember: StaffMember = {
      id: Date.now().toString(),
      name,
      role,
      rate,
      schedule: emptySchedule()
    };
    setStaff([...staff, newMember]);
    await saveToBackend(newMember);
    setName('');
  };

  const removeStaff = async (id: string) => {
    setStaff(staff.filter(s => s.id !== id));
    try {
      await fetch(`/api/staff/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
    }
  };

  const updateSchedule = async (id: string, day: string, field: 'start' | 'end', value: string) => {
    const updatedStaff: StaffMember[] = staff.map((s): StaffMember => {
      if (s.id === id) {
        return {
          ...s,
          schedule: {
            ...s.schedule,
            [day]: {
              ...s.schedule[day],
              [field]: value
            }
          }
        };
      }
      return s;
    });
    setStaff(updatedStaff);
    const member = updatedStaff.find(s => s.id === id);
    if (member) await saveToBackend(member);
  };

  const calculateHours = () => {
    let total = 0;
    staff.forEach(s => {
      for (const day of Object.keys(s.schedule)) {
        const shift = s.schedule[day];
        if (shift.start && shift.end) {
          const [h1, m1] = shift.start.split(':').map(Number);
          const [h2, m2] = shift.end.split(':').map(Number);
          if (!isNaN(h1) && !isNaN(h2)) {
            let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (diff < 0) diff += 24 * 60;
            total += diff / 60;
          }
        }
      }
    });
    return Math.round(total);
  };

  const calculateCost = () => {
    let total = 0;
    staff.forEach(s => {
      for (const day of Object.keys(s.schedule)) {
        const shift = s.schedule[day];
        if (shift.start && shift.end) {
          const [h1, m1] = shift.start.split(':').map(Number);
          const [h2, m2] = shift.end.split(':').map(Number);
          if (!isNaN(h1) && !isNaN(h2)) {
            let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (diff < 0) diff += 24 * 60;
            total += (diff / 60) * Number(s.rate);
          }
        }
      }
    });
    // Divide by 7 for average daily cost if desired, or just return total per week
    return Math.round(total / 7);
  };

  const exportToCSV = () => {
    if (staff.length === 0) return;
    
    // Pour Excel en France/Europe, le séparateur ";" est préférable au ","
    const separator = ";";
    
    const headers = [
      t.collaborator || "Collaborateur",
      t.role || "Rôle",
      t.monday?.substring(0, 3).toUpperCase() || "LUN",
      t.tuesday?.substring(0, 3).toUpperCase() || "MAR",
      t.wednesday?.substring(0, 3).toUpperCase() || "MER",
      t.thursday?.substring(0, 3).toUpperCase() || "JEU",
      t.friday?.substring(0, 3).toUpperCase() || "VEN",
      t.saturday?.substring(0, 3).toUpperCase() || "SAM",
      t.sunday?.substring(0, 3).toUpperCase() || "DIM"
    ].join(separator);

    const formatShift = (s: {start: string, end: string}) => s && s.start && s.end ? `${s.start}-${s.end}` : '';

    const rows = staff.map(s => {
      const row = [
        `"${s.name}"`,
        `"${s.role}"`,
        `"${formatShift(s.schedule.lun)}"`,
        `"${formatShift(s.schedule.mar)}"`,
        `"${formatShift(s.schedule.mer)}"`,
        `"${formatShift(s.schedule.jeu)}"`,
        `"${formatShift(s.schedule.ven)}"`,
        `"${formatShift(s.schedule.sam)}"`,
        `"${formatShift(s.schedule.dim)}"`
      ];
      return row.join(separator);
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "planning_staff.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="led-glow-container p-6 animate-in fade-in duration-500 min-h-[600px]">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <Users className="w-8 h-8 text-emerald-500" />
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{t.staffPlanning || "Gestion du Personnel"}</h2>
            <p className="text-slate-500 mt-1">{t.staffPlanningSubtitle || "Gérez les plannings, les rôles et estimez les coûts de main-d'œuvre"}</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-3 bg-[#1A1A1A] border border-white/10 px-4 py-2 rounded-lg">
            <CalendarIcon className="w-4 h-4 text-emerald-500" />
            <input 
              type="date" 
              value={weekStart} 
              onChange={e => {
                 const selectedDate = new Date(e.target.value);
                 if(!isNaN(selectedDate.getTime())) {
                    setWeekStart(format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
                 }
              }} 
              className="bg-transparent text-white focus:outline-none text-sm font-medium"
            />
          </div>
          <button
            onClick={handleDuplicateWeek}
            disabled={isDuplicating}
            className="flex items-center gap-2 bg-[#1A1A1A] border border-white/10 hover:bg-white/5 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            title={t.duplicatePreviousWeek || "Dupliquer la semaine précédente"}
          >
            <Copy className="w-4 h-4 text-emerald-500" />
            <span className="hidden md:inline text-sm">{t.duplicatePreviousWeek || "Dupliquer la semaine précédente"}</span>
          </button>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-transparent border border-white/10 hover:bg-white/5 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <FileDown className="w-4 h-4" />
            {t.exportSchedule || "EXPORTER LE PLANNING"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#1A1A1A] border border-white/5 p-6 rounded-2xl flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <Calculator className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-3xl font-bold text-white">{calculateCost()}</h3>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-1">{t.costEstimate || "COÛT EST. / JOUR"}</p>
              </div>
            </div>
            
            <div className="bg-[#1A1A1A] border border-white/5 p-6 rounded-2xl flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <h3 className="text-3xl font-bold text-white">{calculateHours()}</h3>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-1">{t.totalHours || "HEURES TOTALES"}</p>
              </div>
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-white/5 rounded-2xl p-6">
            <div className="grid grid-cols-4 gap-4 items-end mb-8">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t.staffName}</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t.staffRole}</label>
                <div className="relative">
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 appearance-none"
                  >
                    <option>{t.roleChef || "Chef de Cuisine"}</option>
                    <option>{t.roleSousChef || "Sous-Chef"}</option>
                    <option>{t.rolePlongeur || "Plongeur"}</option>
                    <option>{t.roleServeur || "Serveur"}</option>
                    <option>{t.roleManager || "Manager"}</option>
                    <option>{t.roleCommis || "Commis"}</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t.hourlyRate}</label>
                <div className="relative">
                  <input
                    type="text"
                    value={rate}
                    onChange={e => setRate(e.target.value)}
                    className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium tracking-widest mb-2"></span>
                </div>
              </div>
              <button
                onClick={addStaff}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl transition-colors h-[50px] shadow-lg led-glow-emerald uppercase tracking-widest text-sm"
              >
                {t.addStaff || "AJOUTER STAFF"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="pb-4 text-xs font-bold text-slate-500 uppercase tracking-widest">{t.collaborator || "COLLABORATEUR"}</th>
                    <th className="pb-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">{t.monday?.substring(0, 3).toUpperCase() || "LUN"}</th>
                    <th className="pb-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">{t.tuesday?.substring(0, 3).toUpperCase() || "MAR"}</th>
                    <th className="pb-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">{t.wednesday?.substring(0, 3).toUpperCase() || "MER"}</th>
                    <th className="pb-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">{t.thursday?.substring(0, 3).toUpperCase() || "JEU"}</th>
                    <th className="pb-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">{t.friday?.substring(0, 3).toUpperCase() || "VEN"}</th>
                    <th className="pb-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">{t.saturday?.substring(0, 3).toUpperCase() || "SAM"}</th>
                    <th className="pb-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">{t.sunday?.substring(0, 3).toUpperCase() || "DIM"}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-24 text-center">
                        <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <h4 className="text-lg font-bold text-slate-400">{t.noStaffRegistered || "Aucun membre du personnel enregistré"}</h4>
                        <p className="text-slate-500 mt-1">{t.startByAddingTeam || "Commencez par ajouter l'équipe de cuisine ou de salle."}</p>
                      </td>
                    </tr>
                  ) : (
                    staff.map(member => (
                      <tr key={member.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-2">
                          <div className="font-bold text-white">{member.name}</div>
                          <div className="text-xs text-emerald-500 mt-1">{member.role}</div>
                        </td>
                        {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map(day => (
                          <td key={day} className="py-1 px-1 text-center align-middle">
                            <div className="flex flex-col gap-1 items-center justify-center">
                              <input
                                type="time"
                                value={member.schedule[day]?.start || ''}
                                onChange={e => updateSchedule(member.id, day, 'start', e.target.value)}
                                className="w-full max-w-[65px] bg-black border border-white/10 rounded p-1 text-[10px] text-emerald-400 focus:outline-none focus:border-emerald-500/50 appearance-none text-center hover:bg-[#121212]"
                                title={t.startTime || "Heure de début"}
                              />
                              <input
                                type="time"
                                value={member.schedule[day]?.end || ''}
                                onChange={e => updateSchedule(member.id, day, 'end', e.target.value)}
                                className="w-full max-w-[65px] bg-black border border-white/10 rounded p-1 text-[10px] text-rose-400 focus:outline-none focus:border-rose-500/50 appearance-none text-center hover:bg-[#121212]"
                                title={t.endTime || "Heure de fin"}
                              />
                            </div>
                          </td>
                        ))}
                        <td className="py-2 text-right">
                          <button onClick={() => removeStaff(member.id)} className="p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#1A1A1A] border border-white/5 p-6 rounded-2xl">
            <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-500" />
              {t.weeklyCost || "COÛT HEBDOMADAIRE"}
            </h3>
            
            <div className="relative h-48 border-b border-l border-white/10 mb-2">
               {/* Decorative chart */}
               <div className="absolute inset-0 flex items-end justify-between p-2">
                  {[40, 60, 45, 80, 90, 70, 50].map((h, i) => (
                    <div key={i} className="w-[10%] bg-emerald-500/20 rounded-t-sm" style={{ height: `${h}%` }}>
                      <div className="w-full bg-emerald-500 rounded-t-sm" style={{ height: '4px' }}></div>
                    </div>
                  ))}
               </div>
            </div>
            
            <div className="flex justify-between text-[10px] text-slate-500 uppercase mb-6 px-2">
              <span>{t.monday ? t.monday.substring(0, 3) : "Lun"}</span>
              <span>{t.tuesday ? t.tuesday.substring(0, 3) : "Mar"}</span>
              <span>{t.wednesday ? t.wednesday.substring(0, 3) : "Mer"}</span>
              <span>{t.thursday ? t.thursday.substring(0, 3) : "Jeu"}</span>
              <span>{t.friday ? t.friday.substring(0, 3) : "Ven"}</span>
              <span>{t.saturday ? t.saturday.substring(0, 3) : "Sam"}</span>
              <span>{t.sunday ? t.sunday.substring(0, 3) : "Dim"}</span>
            </div>
            <p className="text-xs text-slate-400 text-center">{t.weeklyCostFull || "Coût est. hebdomadaire"}</p>
          </div>

          <div className="bg-[#1A1A1A] border border-white/5 p-6 rounded-2xl">
            <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              {t.roleDistribution || "RÉPARTITION DES RÔLES"}
            </h3>
            <div className="space-y-4">
              {Object.entries(staff.reduce((acc, s) => {
                acc[s.role] = (acc[s.role] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)).map(([r, count]: [string, number]) => (
                <div key={r}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{r}</span>
                    <span className="text-white font-bold">{count}</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${(count / staff.length) * 100}%` }}></div>
                  </div>
                </div>
              ))}
              {staff.length === 0 && (
                <div className="text-center text-slate-500 text-sm py-4">
                  {t.noData || "Aucune donnée"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
