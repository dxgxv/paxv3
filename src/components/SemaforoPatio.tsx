import React, { useState, useMemo, useEffect } from "react";
import {
  getSemaforoKey,
  cleanSemaforoLabel,
  type Equipo,
  type SemaforoKey,
} from "../data/catalogs";
import { apiRequest } from "../lib/apiClient";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  SlidersHorizontal,
  ArrowUpRight,
  Search,
  ExternalLink,
  ChevronDown,
  Pin,
  Layers,
} from "lucide-react";

interface SemaforoPatioProps {
  equipos: Equipo[];
  isJefe: boolean;
  onOpenFicha: (codigo: string) => void;
  onReportFalla?: (codigo: string) => void;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
}

const SEMAFORO_META: Record<
  SemaforoKey,
  {
    shortTitle: string;
    label: string;
    led: string;
    ledGlow: string;
    headerBg: string;
    cardBg: string;
    borderCol: string;
    activeRing: string;
    textCol: string;
    barBg: string;
    badgeBg: string;
  }
> = {
  OPERATIVA: {
    shortTitle: "Operativas",
    label: "OPERATIVA (LISTA)",
    led: "bg-emerald-400",
    ledGlow: "shadow-[0_0_8px_#34d399]",
    headerBg: "bg-[#064E3B] text-white",
    cardBg: "bg-emerald-50/90",
    borderCol: "border-emerald-400 hover:border-emerald-600",
    activeRing: "ring-2 ring-emerald-600 border-emerald-600",
    textCol: "text-emerald-950",
    barBg: "bg-emerald-500",
    badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  MANTENCION: {
    shortTitle: "Mantención",
    label: "PIDE MANTENCIÓN",
    led: "bg-amber-400",
    ledGlow: "shadow-[0_0_8px_#fbbf24]",
    headerBg: "bg-[#78350F] text-white",
    cardBg: "bg-amber-50/90",
    borderCol: "border-amber-400 hover:border-amber-600",
    activeRing: "ring-2 ring-amber-600 border-amber-600",
    textCol: "text-amber-950",
    barBg: "bg-amber-500",
    badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
  },
  PANA: {
    shortTitle: "En Pana",
    label: "EN PANA (TALLER)",
    led: "bg-red-500",
    ledGlow: "shadow-[0_0_8px_#ef4444]",
    headerBg: "bg-[#7F1D1D] text-white",
    cardBg: "bg-red-50/90",
    borderCol: "border-red-400 hover:border-red-600",
    activeRing: "ring-2 ring-red-600 border-red-600",
    textCol: "text-red-950",
    barBg: "bg-red-600",
    badgeBg: "bg-red-100 text-red-900 border-red-300",
  },
  PRESUPUESTO: {
    shortTitle: "Presupuesto",
    label: "ESPERANDO PRESUPUESTO",
    led: "bg-purple-400",
    ledGlow: "shadow-[0_0_8px_#c084fc]",
    headerBg: "bg-[#4C1D95] text-white",
    cardBg: "bg-purple-50/90",
    borderCol: "border-purple-400 hover:border-purple-600",
    activeRing: "ring-2 ring-purple-600 border-purple-600",
    textCol: "text-purple-950",
    barBg: "bg-purple-600",
    badgeBg: "bg-purple-100 text-purple-900 border-purple-300",
  },
};

const ORDEN_ESTADOS: SemaforoKey[] = [
  "OPERATIVA",
  "MANTENCION",
  "PANA",
  "PRESUPUESTO",
];

export default function SemaforoPatio({
  equipos,
  isJefe,
  onOpenFicha,
  onReportFalla,
  onRefresh,
}: SemaforoPatioProps) {
  const [hoveredKey, setHoveredKey] = useState<SemaforoKey | null>(null);
  const [pinnedKey, setPinnedKey] = useState<SemaforoKey | null>(null);
  const [filtroArriendoPatio, setFiltroArriendoPatio] = useState<
    "TODOS" | "EN_OBRA" | "VENCIDOS"
  >("TODOS");

  const equiposPorEstado = useMemo(() => {
    const groups: Record<SemaforoKey, Equipo[]> = {
      OPERATIVA: [],
      MANTENCION: [],
      PANA: [],
      PRESUPUESTO: [],
    };
    for (const eq of equipos) {
      const k = getSemaforoKey(eq.semaforo);
      groups[k].push(eq);
    }
    return groups;
  }, [equipos]);

  const enObraCount = useMemo(
    () => equipos.filter((e) => e.en_arriendo === 1).length,
    [equipos]
  );
  const vencidosCount = useMemo(
    () =>
      equipos.filter((e) => e.en_arriendo === 1 && e.arriendo_vencido).length,
    [equipos]
  );

  const totalMaq = equipos.length;
  const verdes = equiposPorEstado.OPERATIVA.length;
  const amarillas = equiposPorEstado.MANTENCION.length;
  const rojas = equiposPorEstado.PANA.length;
  const moradas = equiposPorEstado.PRESUPUESTO.length;

  const dispPct =
    totalMaq > 0
      ? Number((((verdes + amarillas) / totalMaq) * 100).toFixed(1))
      : 100;

  let moodStyle = "bg-[#064E3B] border-emerald-700 text-white";
  let moodLed = "bg-emerald-400 shadow-[0_0_10px_#34d399]";
  let moodText = "Flota en Óptimas Condiciones Operativas";
  let MoodIcon = CheckCircle2;

  if (dispPct < 65) {
    moodStyle = "bg-[#7F1D1D] border-red-700 text-white";
    moodLed = "bg-red-400 shadow-[0_0_10px_#f87171]";
    moodText = "Alerta Crítica: Alta Concentración de Equipos Inoperativos";
    MoodIcon = OctagonAlert;
  } else if (dispPct < 85) {
    moodStyle = "bg-[#78350F] border-amber-700 text-white";
    moodLed = "bg-amber-400 shadow-[0_0_10px_#fbbf24]";
    moodText = "Precaución Operativa: Aumento de Unidades en Taller";
    MoodIcon = AlertTriangle;
  }

  const todasCategorias = useMemo(() => {
    return Array.from(new Set(equipos.map((e) => e.categoria))).sort();
  }, [equipos]);

  const [filtroKeys, setFiltroKeys] = useState<SemaforoKey[]>([
    "OPERATIVA",
    "MANTENCION",
    "PANA",
    "PRESUPUESTO",
  ]);
  const [filtroCat, setFiltroCat] = useState<string[]>(() =>
    Array.from(new Set(equipos.map((e) => e.categoria))).sort()
  );
  const [busqueda, setBusqueda] = useState("");
  const [maqPatio, setMaqPatio] = useState("");
  const [accionRapida, setAccionRapida] = useState(
    "ABRIR FICHA COMPLETA DEL EQUIPO"
  );
  const [notaRapida, setNotaRapida] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setFiltroCat(todasCategorias);
  }, [todasCategorias.join("|")]);

  const handleCardClick = (key: SemaforoKey) => {
    setHoveredKey(null);
    if (pinnedKey === key) {
      setPinnedKey(null);
      setFiltroKeys(["OPERATIVA", "MANTENCION", "PANA", "PRESUPUESTO"]);
    } else {
      setPinnedKey(key);
      setFiltroKeys([key]);
      setFiltroCat(todasCategorias);
      setBusqueda("");
    }
  };

  const dfFiltrado = useMemo(() => {
    return equipos.filter((e) => {
      const k = getSemaforoKey(e.semaforo);
      if (!filtroKeys.includes(k)) return false;
      if (filtroCat.length > 0 && !filtroCat.includes(e.categoria)) return false;
      if (filtroArriendoPatio === "EN_OBRA" && e.en_arriendo !== 1) {
        return false;
      }
      if (
        filtroArriendoPatio === "VENCIDOS" &&
        !(e.en_arriendo === 1 && e.arriendo_vencido)
      ) {
        return false;
      }
      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        const matchCod = e.codigo.toLowerCase().includes(q);
        const matchNom = e.nombre.toLowerCase().includes(q);
        const matchPana = e.panas_reportadas.toLowerCase().includes(q);
        const matchCliente = (e.cliente_actual || "").toLowerCase().includes(q);
        if (!matchCod && !matchNom && !matchPana && !matchCliente) return false;
      }
      return true;
    });
  }, [equipos, filtroKeys, filtroCat, filtroArriendoPatio, busqueda]);

  useEffect(() => {
    if (
      dfFiltrado.length > 0 &&
      !dfFiltrado.some((e) => e.codigo === maqPatio)
    ) {
      setMaqPatio(dfFiltrado[0].codigo);
    }
  }, [dfFiltrado, maqPatio]);

  const accionesPatio = useMemo(() => {
    const base = [
      "ABRIR FICHA COMPLETA DEL EQUIPO",
      "BLOQUEAR POR FALLA (ENVIAR A TALLER)",
      "ENVIAR A PRESUPUESTO (DAÑO SEVERO)",
    ];
    if (isJefe) {
      base.splice(1, 0, "LIBERAR RÁPIDO (VOLVER A PATIO)");
    }
    return base;
  }, [isJefe]);

  const handleEjecutarAccion = async () => {
    if (!maqPatio) return;
    if (accionRapida.startsWith("ABRIR")) {
      onOpenFicha(maqPatio);
      return;
    }

    if (accionRapida.startsWith("BLOQUEAR")) {
      if (!notaRapida.trim() && onReportFalla) {
        onReportFalla(maqPatio);
        return;
      }
      if (
        !window.confirm(
          `¿Enviar ${maqPatio} a Taller por falla${
            notaRapida.trim() ? ` ("${notaRapida.trim()}")` : ""
          }?`
        )
      ) {
        return;
      }
    } else if (accionRapida.startsWith("LIBERAR")) {
      if (
        !window.confirm(
          `¿Liberar ${maqPatio} como OPERATIVA en patio? Esto cerrará su OT abierta sin pasar por la pauta de taller.`
        )
      ) {
        return;
      }
    } else if (accionRapida.includes("PRESUPUESTO")) {
      if (
        !window.confirm(
          `¿Enviar ${maqPatio} a estado ESPERANDO PRESUPUESTO?`
        )
      ) {
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await apiRequest("/api/patio/accion-rapida", {
        method: "POST",
        body: JSON.stringify({
          codigo: maqPatio,
          accion: accionRapida,
          nota: notaRapida,
        }),
      });
      if (res.ok) {
        setNotaRapida("");
        await onRefresh({
          type: "success",
          text: res.data?.message || "Acción ejecutada.",
        });
      } else {
        await onRefresh({
          type: "error",
          text: res.data?.error || "No se pudo ejecutar la acción rápida.",
        });
      }
    } catch {
      await onRefresh({
        type: "error",
        text: "Error de conexión al ejecutar acción en patio.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* PANORAMA GENERAL */}
      <div
        className={`rounded-xl border p-5 shadow-xs space-y-4 ${moodStyle}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${moodLed}`} />
            <MoodIcon className="w-5 h-5 shrink-0" />
            <div>
              <div className="text-xs uppercase tracking-wider font-bold opacity-85">
                Monitor de Disponibilidad de Patio y Taller &bull; Panorama
                General
              </div>
              <h3 className="text-base md:text-lg font-extrabold">{moodText}</h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="bg-slate-950/45 px-3.5 py-2 rounded-lg border border-white/20 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-sky-300" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-white/80">
                Total Flota:
              </span>
              <span className="font-mono text-sm font-black text-white tabular-nums">
                {totalMaq.toLocaleString("es-CL")} eq.
              </span>
            </div>

            <div className="bg-black/30 px-4 py-2 rounded-lg border border-white/20 font-mono text-base md:text-lg font-black tabular-nums">
              {dispPct}% Operatividad
            </div>
          </div>
        </div>

        {totalMaq > 0 && (
          <div className="space-y-1.5">
            <div className="h-2.5 w-full rounded-full bg-black/30 overflow-hidden flex">
              {verdes > 0 && (
                <div
                  style={{ width: `${(verdes / totalMaq) * 100}%` }}
                  className="bg-emerald-400 h-full transition-all duration-300"
                  title={`Operativas: ${verdes}`}
                />
              )}
              {amarillas > 0 && (
                <div
                  style={{ width: `${(amarillas / totalMaq) * 100}%` }}
                  className="bg-amber-400 h-full transition-all duration-300"
                  title={`Mantención: ${amarillas}`}
                />
              )}
              {rojas > 0 && (
                <div
                  style={{ width: `${(rojas / totalMaq) * 100}%` }}
                  className="bg-red-500 h-full transition-all duration-300"
                  title={`En Pana: ${rojas}`}
                />
              )}
              {moradas > 0 && (
                <div
                  style={{ width: `${(moradas / totalMaq) * 100}%` }}
                  className="bg-purple-400 h-full transition-all duration-300"
                  title={`Presupuesto: ${moradas}`}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-white/85 gap-2">
              <span>
                En obra actualmente: {enObraCount} eq.
                {vencidosCount > 0
                  ? ` · ATRASOS DE RETORNO: ${vencidosCount} eq.`
                  : " · Sin atrasos de retorno"}
              </span>
              {pinnedKey && (
                <button
                  type="button"
                  onClick={() => {
                    setPinnedKey(null);
                    setFiltroKeys([
                      "OPERATIVA",
                      "MANTENCION",
                      "PANA",
                      "PRESUPUESTO",
                    ]);
                  }}
                  className="underline font-bold text-white hover:text-sky-200 cursor-pointer"
                >
                  Mostrar todos los estados ({totalMaq})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4 TARJETAS DE ESTADO PROTAGONISTAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ORDEN_ESTADOS.map((key) => {
          const meta = SEMAFORO_META[key];
          const listaEquipos = equiposPorEstado[key];
          const count = listaEquipos.length;
          const pct =
            totalMaq > 0 ? Math.round((count / totalMaq) * 100) : 0;
          const isOpen =
            count > 0 && (hoveredKey === key || pinnedKey === key);
          const isPinned = pinnedKey === key;

          return (
            <div
              key={key}
              className="relative"
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              <div
                onClick={() => handleCardClick(key)}
                className={`rounded-xl border transition-all duration-150 overflow-hidden shadow-xs cursor-pointer select-none ${
                  meta.cardBg
                } ${isPinned ? meta.activeRing : meta.borderCol}`}
              >
                <div
                  className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-between ${meta.headerBg}`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${meta.led} ${meta.ledGlow}`}
                    />
                    {meta.shortTitle}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isPinned && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-black/30 px-1.5 py-0.5 rounded text-white">
                        <Pin className="w-3 h-3" />
                        FIJADO
                      </span>
                    )}
                    <span className="font-mono text-[11px] opacity-85 tabular-nums">
                      {pct}%
                    </span>
                  </div>
                </div>

                <div className="p-4 flex items-end justify-between gap-2">
                  <div>
                    <div
                      className={`text-3xl font-black font-mono tabular-nums leading-none ${meta.textCol}`}
                    >
                      {count.toLocaleString("es-CL")}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-600 mt-1.5 flex items-center gap-1">
                      {count > 0 ? (
                        <>
                          <span>
                            {count === 1
                              ? "1 máquina — Ver detalle"
                              : `${count} máquinas — Ver detalle`}
                          </span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </>
                      ) : (
                        <span className="text-slate-400">
                          Sin equipos en este estado
                        </span>
                      )}
                    </div>
                  </div>

                  {count > 0 && (
                    <div className="flex flex-wrap justify-end gap-1 max-w-[130px]">
                      {listaEquipos.slice(0, 2).map((eq) => (
                        <span
                          key={eq.codigo}
                          className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/90 border border-slate-300 text-slate-800"
                        >
                          {eq.codigo}
                        </span>
                      ))}
                      {count > 2 && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-white tabular-nums">
                          +{count - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="absolute left-0 right-0 top-full pt-1.5 z-30">
                  <div className="bg-white border-2 border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                    <div
                      className={`px-3.5 py-2 text-[11px] font-mono font-bold uppercase tracking-wider flex items-center justify-between ${meta.headerBg}`}
                    >
                      <span>
                        Equipos en {meta.shortTitle} ({count})
                      </span>
                      <span className="text-[10px] opacity-85">
                        {isPinned ? "Toca para quitar filtro" : "Toca para filtrar"}
                      </span>
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-200">
                      {listaEquipos.map((eq) => (
                        <div
                          key={eq.codigo}
                          className="p-3 hover:bg-slate-100/90 transition-colors flex items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-extrabold text-xs text-slate-900 bg-slate-200 px-1.5 py-0.5 rounded">
                                {eq.codigo}
                              </span>
                              <span className="font-bold text-xs text-slate-900 truncate">
                                {eq.nombre}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1 truncate">
                              <Layers className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{eq.categoria}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenFicha(eq.codigo);
                            }}
                            className="shrink-0 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold px-2.5 py-1.5 rounded-md text-[11px] flex items-center gap-1 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Ficha</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* PANEL DE ACCIÓN RÁPIDA EN PATIO */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
        <div className="bg-[#0C4A6E] text-white px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-sky-300" />
            <h4 className="text-sm font-bold uppercase tracking-wider">
              Buscador y Acciones Rápidas de Flota
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["TODOS", `Todos (${totalMaq})`],
                ["EN_OBRA", `En Obra (${enObraCount})`],
                ["VENCIDOS", `Atrasos (${vencidosCount})`],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFiltroArriendoPatio(k)}
                className={`px-2.5 py-1.5 rounded text-[11px] font-mono font-bold uppercase cursor-pointer transition-colors whitespace-nowrap min-h-[36px] ${
                  filtroArriendoPatio === k
                    ? k === "VENCIDOS" && vencidosCount > 0
                      ? "bg-red-600 text-white"
                      : "bg-white text-[#0C4A6E]"
                    : "bg-sky-950/70 text-sky-200 hover:bg-sky-900"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* FILTROS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Filtrar por Estado:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ORDEN_ESTADOS.map((k) => {
                  const active = filtroKeys.includes(k);
                  const meta = SEMAFORO_META[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setPinnedKey(null);
                        setFiltroKeys(
                          active
                            ? filtroKeys.filter((item) => item !== k)
                            : [...filtroKeys, k]
                        );
                      }}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer min-h-[40px] ${
                        active
                          ? "bg-[#0F172A] text-white border-[#0F172A]"
                          : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${meta.led}`} />
                      <span>{meta.shortTitle}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Filtrar por Categoría:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {todasCategorias.map((cat) => {
                  const active = filtroCat.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() =>
                        setFiltroCat(
                          active
                            ? filtroCat.filter((c) => c !== cat)
                            : [...filtroCat, cat]
                        )
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer min-h-[40px] ${
                        active
                          ? "bg-[#0369A1] text-white border-[#0369A1]"
                          : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <span>Buscar Código, Falla o Cliente:</span>
              </label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Ej: RV-0007, Honda, Constructora..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[44px]"
              />
            </div>
          </div>

          <hr className="border-slate-200" />

          {dfFiltrado.length > 0 ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Seleccionar Equipo (
                    {dfFiltrado.length.toLocaleString("es-CL")}):
                  </label>
                  <select
                    value={maqPatio}
                    onChange={(e) => setMaqPatio(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold min-h-[44px]"
                  >
                    {dfFiltrado.slice(0, 500).map((eq) => (
                      <option key={eq.codigo} value={eq.codigo}>
                        {eq.codigo} — {eq.nombre} ·{" "}
                        {cleanSemaforoLabel(eq.semaforo)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Acción Rápida:
                  </label>
                  <select
                    value={accionRapida}
                    onChange={(e) => setAccionRapida(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold min-h-[44px]"
                  >
                    {accionesPatio.map((acc) => (
                      <option key={acc} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Motivo / Observación:
                  </label>
                  <input
                    type="text"
                    value={notaRapida}
                    onChange={(e) => setNotaRapida(e.target.value)}
                    placeholder={
                      accionRapida.startsWith("BLOQUEAR")
                        ? "Deja vacío para abrir reporte guiado..."
                        : "Ej: Retorno de faena sector sur..."
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handleEjecutarAccion}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-[#065F46] hover:bg-[#047857] text-white font-bold py-3 px-4 text-sm cursor-pointer transition-all whitespace-nowrap"
              >
                <ArrowUpRight className="w-4 h-4 shrink-0" />
                <span>
                  {accionRapida.startsWith("ABRIR")
                    ? `Abrir Ficha de ${maqPatio}`
                    : accionRapida.startsWith("BLOQUEAR") && !notaRapida.trim()
                    ? `Ir a Reportar Falla de ${maqPatio}`
                    : `Ejecutar en ${maqPatio}`}
                </span>
              </button>

              {/* TARJETAS MÓVILES (SIN SCROLL HORIZONTAL) */}
              <div className="md:hidden space-y-2.5">
                {dfFiltrado.slice(0, 60).map((eq) => {
                  const k = getSemaforoKey(eq.semaforo);
                  const meta = SEMAFORO_META[k];
                  return (
                    <div
                      key={eq.codigo}
                      onClick={() => onOpenFicha(eq.codigo)}
                      className={`rounded-xl border p-3.5 shadow-2xs cursor-pointer transition-colors ${
                        eq.en_arriendo === 1 && eq.arriendo_vencido
                          ? "bg-red-50/60 border-red-300"
                          : "bg-white border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-extrabold text-sm text-slate-900 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded">
                            {eq.codigo}
                          </span>
                          <span className="font-bold text-sm text-slate-900 truncate">
                            {eq.nombre}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] font-bold shrink-0 ${meta.badgeBg}`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${meta.barBg}`}
                          />
                          {meta.shortTitle}
                        </span>
                      </div>

                      <div className="mt-1.5 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {eq.categoria}
                          {" · "}
                          {eq.en_arriendo === 1 && eq.cliente_actual ? (
                            eq.arriendo_vencido ? (
                              <strong className="text-red-700 font-mono">
                                En Obra: {eq.cliente_actual} (+{eq.dias_atraso}d)
                              </strong>
                            ) : (
                              <strong className="text-[#0369A1]">
                                En Obra: {eq.cliente_actual}
                              </strong>
                            )
                          ) : (
                            <span>En Patio</span>
                          )}
                        </span>
                        <span className="font-mono text-[11px] text-slate-700 tabular-nums">
                          {eq.uso_acumulado}/{eq.limite_mantencion}{" "}
                          {eq.tipo_medicion === "DIAS" ? "días" : "hrs"}
                        </span>
                      </div>

                      {(eq.panas_reportadas || eq.ultima_observacion) && (
                        <div className="mt-1.5 text-[11px] text-slate-500 truncate">
                          {eq.panas_reportadas || eq.ultima_observacion}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* LISTADO RÁPIDO FILTRADO (ESCRITORIO / TABLET) */}
              <div
                id="tabla-semaforo-patio"
                className="hidden md:block border border-slate-200 rounded-lg overflow-x-auto"
              >
                <table className="w-full text-left border-collapse text-xs min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-mono uppercase text-[11px]">
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Equipo / Ubicación</th>
                      <th className="py-2.5 px-3">Uso / Ciclo</th>
                      <th className="py-2.5 px-3">Observación / Falla</th>
                      <th className="py-2.5 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dfFiltrado.slice(0, 100).map((eq) => {
                      const k = getSemaforoKey(eq.semaforo);
                      const meta = SEMAFORO_META[k];
                      return (
                        <tr
                          key={eq.codigo}
                          onClick={() => onOpenFicha(eq.codigo)}
                          className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                            eq.en_arriendo === 1 && eq.arriendo_vencido
                              ? "bg-red-50/40"
                              : ""
                          }`}
                        >
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] font-bold ${meta.badgeBg}`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${meta.barBg}`}
                              />
                              {meta.shortTitle}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {eq.codigo}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">
                              {eq.nombre}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {eq.categoria}
                              {" · "}
                              {eq.en_arriendo === 1 && eq.cliente_actual ? (
                                eq.arriendo_vencido ? (
                                  <span className="font-mono font-bold text-red-700">
                                    En Obra: {eq.cliente_actual} (ATRASO +
                                    {eq.dias_atraso}d)
                                  </span>
                                ) : (
                                  <span className="font-semibold text-[#0369A1]">
                                    En Obra: {eq.cliente_actual}
                                    {eq.fecha_retorno_estimada
                                      ? ` (Ret. ${eq.fecha_retorno_estimada})`
                                      : ""}
                                  </span>
                                )
                              ) : (
                                <span>En Patio</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                            {eq.uso_acumulado} / {eq.limite_mantencion}{" "}
                            {eq.tipo_medicion === "DIAS" ? "días" : "hrs"}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                            {eq.panas_reportadas || eq.ultima_observacion}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenFicha(eq.codigo);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-[11px] cursor-pointer whitespace-nowrap"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Abrir</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-100 border border-slate-300 p-4 text-sm text-slate-700 font-medium">
              No existen equipos que coincidan con los filtros seleccionados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
