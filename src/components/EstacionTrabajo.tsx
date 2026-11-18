import React, { useState, useEffect, useMemo } from "react";
import {
  getSemaforoKey,
  cleanSemaforoLabel,
  type Equipo,
  type EventoHistorial,
  type Presupuesto,
  type OrdenTrabajo,
  type Repuesto,
  type OTRepuestoItem,
  type SolicitudEmergencia,
} from "../data/catalogs";
import InformePdfModal, { type InformePdfTarget } from "./InformePdfModal";
import RecepcionDespachoTab from "./estacion/RecepcionDespachoTab";
import TallerMecTab from "./estacion/TallerMecTab";
import {
  SolicitarPresupuestoTab,
  AjusteManualTab,
  HistorialEquipoTab,
} from "./estacion/PresupuestoAjusteTabs";
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Sliders,
  History,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  Radio,
  ClipboardCheck,
  Clock,
  Gauge,
  CalendarClock,
  OctagonAlert,
  Truck,
} from "lucide-react";

interface EstacionTrabajoProps {
  equipos: Equipo[];
  equipoActivo: string;
  setEquipoActivo: (codigo: string) => void;
  presupuestos: Presupuesto[];
  ordenesTrabajo: OrdenTrabajo[];
  repuestos: Repuesto[];
  otRepuestos: OTRepuestoItem[];
  emergencias?: SolicitudEmergencia[];
  historial: EventoHistorial[];
  telefonoTaller?: string;
  isJefe: boolean;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
  onNavigateJefatura: () => void;
  onNavigateEmergencia?: () => void;
}

export default function EstacionTrabajo({
  equipos,
  equipoActivo,
  setEquipoActivo,
  presupuestos,
  ordenesTrabajo,
  repuestos,
  otRepuestos,
  emergencias = [],
  historial,
  isJefe,
  onRefresh,
  onNavigateJefatura,
  onNavigateEmergencia,
}: EstacionTrabajoProps) {
  const [catFiltroTop, setCatFiltroTop] = useState<string>(
    "Todas las categorías"
  );
  const [textoBuscarTop, setTextoBuscarTop] = useState<string>("");
  const [activeSubTab, setActiveSubTab] = useState<
    "recepcion" | "taller" | "presupuesto" | "manual" | "historial"
  >("recepcion");
  const [recepcionDefaultMode, setRecepcionDefaultMode] = useState<
    "recepcion" | "despacho" | null
  >(null);
  const [copiedNfc, setCopiedNfc] = useState(false);
  const [paso1Minimizado, setPaso1Minimizado] = useState<boolean>(true);
  const [pdfTarget, setPdfTarget] = useState<InformePdfTarget | null>(null);

  const categoriasDisp = useMemo(() => {
    const setCats = new Set(equipos.map((e) => e.categoria));
    return ["Todas las categorías", ...Array.from(setCats).sort()];
  }, [equipos]);

  const dfSelector = useMemo(() => {
    let list = equipos;
    if (catFiltroTop !== "Todas las categorías") {
      list = list.filter((e) => e.categoria === catFiltroTop);
    }
    if (textoBuscarTop.trim()) {
      const q = textoBuscarTop.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.codigo.toLowerCase().includes(q) ||
          e.nombre.toLowerCase().includes(q)
      );
    }
    return list;
  }, [equipos, catFiltroTop, textoBuscarTop]);

  const sinCoincidenciasFiltro = useMemo(() => {
    if (catFiltroTop === "Todas las categorías" && !textoBuscarTop.trim())
      return false;
    return dfSelector.length === 0;
  }, [dfSelector, catFiltroTop, textoBuscarTop]);

  const maq = useMemo(() => {
    return (
      equipos.find((e) => e.codigo === equipoActivo) ||
      dfSelector[0] ||
      equipos[0]
    );
  }, [equipos, equipoActivo, dfSelector]);

  useEffect(() => {
    if (!equipoActivo) return;
    setPaso1Minimizado(true);
    const existsInSelector = dfSelector.some((e) => e.codigo === equipoActivo);
    if (!existsInSelector && equipos.some((e) => e.codigo === equipoActivo)) {
      setCatFiltroTop("Todas las categorías");
      setTextoBuscarTop("");
    }
  }, [equipoActivo, dfSelector, equipos]);

  useEffect(() => {
    if (maq && maq.codigo !== equipoActivo) {
      setEquipoActivo(maq.codigo);
    }
  }, [maq, equipoActivo, setEquipoActivo]);

  if (!maq) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-amber-950 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        <span>
          No hay máquinas registradas en la base de datos. Dirígete al módulo{" "}
          <strong>03. Enrolar Máquina</strong>.
        </span>
      </div>
    );
  }

  const catMaq = maq.categoria;
  const unidadUso = maq.tipo_medicion === "DIAS" ? "días" : "horas";
  const porcentajeDesgaste =
    maq.limite_mantencion > 0
      ? Math.min(
          Math.floor((maq.uso_acumulado / maq.limite_mantencion) * 100),
          100
        )
      : 0;
  const statusKey = getSemaforoKey(maq.semaforo);
  const estadoLimpio = cleanSemaforoLabel(maq.semaforo);

  const statusTheme = {
    OPERATIVA: {
      cardBg: "bg-emerald-50/90 border-emerald-400 text-emerald-950",
      led: "bg-emerald-400 shadow-[0_0_8px_#34d399]",
      badgeBg: "bg-emerald-900/60 text-emerald-100 border-emerald-500/40",
      icon: CheckCircle2,
    },
    MANTENCION: {
      cardBg: "bg-amber-50/90 border-amber-400 text-amber-950",
      led: "bg-amber-400 shadow-[0_0_8px_#fbbf24]",
      badgeBg: "bg-amber-900/60 text-amber-100 border-amber-500/40",
      icon: AlertTriangle,
    },
    PANA: {
      cardBg: "bg-red-50/90 border-red-400 text-red-950",
      led: "bg-red-500 shadow-[0_0_8px_#ef4444]",
      badgeBg: "bg-red-950/70 text-red-100 border-red-500/40",
      icon: OctagonAlert,
    },
    PRESUPUESTO: {
      cardBg: "bg-purple-50/90 border-purple-400 text-purple-950",
      led: "bg-purple-400 shadow-[0_0_8px_#c084fc]",
      badgeBg: "bg-purple-950/70 text-purple-100 border-purple-500/40",
      icon: FileSpreadsheet,
    },
  }[statusKey];

  const StatusIcon = statusTheme.icon;

  const handleCopyNfcLink = () => {
    const url = `${window.location.origin}/?id=${encodeURIComponent(
      maq.codigo
    )}`;
    navigator.clipboard.writeText(url);
    setCopiedNfc(true);
    setTimeout(() => setCopiedNfc(false), 2000);
  };

  const preAlertaActiva = emergencias.find(
    (e) => e.codigo_equipo === maq.codigo && e.estado === "PENDIENTE"
  );

  const jumpToForm = (
    subTab: "recepcion" | "taller" | "presupuesto" | "manual" | "historial",
    mode?: "recepcion" | "despacho"
  ) => {
    setActiveSubTab(subTab);
    if (mode) setRecepcionDefaultMode(mode);
    setTimeout(() => {
      document
        .getElementById("formulario-operacion-activa")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const subTabs = [
    {
      id: "recepcion",
      label: "Recibir / Despachar",
      icon: ClipboardCheck,
    },
    {
      id: "taller",
      label: "Reparar (Taller)",
      icon: Wrench,
    },
    {
      id: "presupuesto",
      label: "Presupuesto",
      icon: FileSpreadsheet,
    },
    ...(isJefe
      ? [
          {
            id: "manual",
            label: "Ajuste manual",
            icon: Sliders,
          },
        ]
      : []),
    {
      id: "historial",
      label: "Historial",
      icon: History,
    },
  ];

  return (
    <div className="space-y-4">
      {/* BUSCADOR DE MÁQUINA (MINIMIZABLE) */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setPaso1Minimizado((prev) => !prev)}
          className={`w-full bg-[#1E293B] hover:bg-slate-800 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-left transition-colors cursor-pointer min-h-[48px] ${
            !paso1Minimizado ? "border-b border-slate-700" : ""
          }`}
        >
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <Search className="w-4 h-4 text-[#38BDF8] shrink-0" />
            <span className="text-xs md:text-sm font-bold uppercase tracking-wider">
              Máquina seleccionada:
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-sky-300 bg-slate-900/90 border border-sky-500/40 px-2.5 py-0.5 rounded">
              <span>{maq.codigo}</span>
              <span aria-hidden="true" className="text-slate-500">
                —
              </span>
              <span className="text-slate-200 font-sans font-semibold truncate max-w-[180px] sm:max-w-[260px]">
                {maq.nombre}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3 ml-auto shrink-0">
            <span className="inline-flex items-center gap-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap">
              {paso1Minimizado ? (
                <>
                  <span>Buscar otra máquina</span>
                  <ChevronDown className="w-4 h-4 shrink-0" />
                </>
              ) : (
                <>
                  <span>Cerrar buscador</span>
                  <ChevronUp className="w-4 h-4 shrink-0" />
                </>
              )}
            </span>
          </div>
        </button>

        {!paso1Minimizado && (
          <>
            <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50/60">
              <div className="md:col-span-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Categoría
                </label>
                <select
                  value={catFiltroTop}
                  onChange={(e) => setCatFiltroTop(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-[#0284C7] focus:outline-none"
                >
                  {categoriasDisp.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Buscar código o nombre
                </label>
                <input
                  type="text"
                  value={textoBuscarTop}
                  onChange={(e) => setTextoBuscarTop(e.target.value)}
                  placeholder="Ej: RV-0001, Honda, Placa..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                />
              </div>

              <div className="md:col-span-6">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Elegir máquina ({dfSelector.length.toLocaleString("es-CL")})
                </label>
                <select
                  value={maq.codigo}
                  onChange={(e) => {
                    setEquipoActivo(e.target.value);
                    setPaso1Minimizado(true);
                  }}
                  className="w-full rounded-lg border-2 border-[#0284C7] bg-white px-3 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
                >
                  {dfSelector.slice(0, 500).map((item) => (
                    <option key={item.codigo} value={item.codigo}>
                      {item.codigo} — {item.nombre} [{item.categoria}] ·{" "}
                      {cleanSemaforoLabel(item.semaforo)}
                    </option>
                  ))}
                </select>
                {dfSelector.length > 500 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Mostrando primeras 500 de{" "}
                    {dfSelector.length.toLocaleString("es-CL")} máquinas. Usa el
                    buscador para filtrar.
                  </p>
                )}
              </div>
            </div>

            {sinCoincidenciasFiltro && (
              <div className="mx-5 mb-4 rounded-lg bg-amber-50 border border-amber-300 px-3.5 py-2.5 text-xs font-semibold text-amber-950 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Sin resultados para ese filtro. La máquina activa sigue siendo{" "}
                  <strong className="font-mono">{maq.codigo}</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCatFiltroTop("Todas las categorías");
                    setTextoBuscarTop("");
                  }}
                  className="px-2.5 py-1 rounded bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold cursor-pointer"
                >
                  Limpiar filtro
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* FICHA COMPACTA + TARJETA "¿QUÉ HACEMOS CON ESTA MÁQUINA?" */}
      <div
        id="ficha-equipo-activa"
        className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs scroll-mt-4"
      >
        <div className="px-5 py-4 border-b border-slate-800 bg-[#0F172A] text-white flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="px-2.5 py-1 rounded bg-black/25 font-mono text-sm md:text-base font-bold tracking-tight border border-white/15">
                {maq.codigo}
              </span>
              <h2 className="text-lg md:text-xl font-extrabold tracking-tight">
                {maq.nombre}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/85">
              <span>{catMaq}</span>
              <span aria-hidden="true">·</span>
              <strong
                className={
                  maq.en_arriendo === 1 && maq.cliente_actual
                    ? "text-sky-300"
                    : "text-emerald-300"
                }
              >
                {maq.en_arriendo === 1 && maq.cliente_actual
                  ? `En Obra: ${maq.cliente_actual}${
                      maq.ubicacion_actual ? ` (${maq.ubicacion_actual})` : ""
                    }`
                  : "En Patio"}
              </strong>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border ${statusTheme.badgeBg}`}
          >
            <span className={`w-3 h-3 rounded-full ${statusTheme.led}`} />
            <StatusIcon className="w-4 h-4 shrink-0" />
            <span className="text-xs md:text-sm font-extrabold tracking-wider uppercase">
              {estadoLimpio}
            </span>
          </div>
        </div>

        {/* TARJETA GUIADA: ¿QUÉ HACEMOS CON ESTA MÁQUINA? (Regla de 5 segundos) */}
        <div className="p-4 md:p-5 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
              ¿Qué necesitas hacer con {maq.codigo}?
            </span>
            {maq.panas_reportadas.trim() && (
              <span className="rounded bg-red-900 text-white px-2.5 py-1 text-xs font-mono">
                Falla: {maq.panas_reportadas}
              </span>
            )}
          </div>

          {preAlertaActiva ? (
            <div className="rounded-xl bg-amber-50 border-2 border-amber-400 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs md:text-sm text-amber-950">
                <strong>Falla ya reportada ({preAlertaActiva.folio})</strong>{" "}
                por {preAlertaActiva.reportante_nombre}. Esperando confirmación
                de Jefatura.
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {isJefe ? (
                  <button
                    type="button"
                    onClick={onNavigateJefatura}
                    className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#78350F] hover:bg-amber-900 text-white font-extrabold text-sm cursor-pointer"
                  >
                    Revisar en Jefatura
                  </button>
                ) : (
                  onNavigateEmergencia && (
                    <button
                      type="button"
                      onClick={onNavigateEmergencia}
                      className="min-h-[48px] px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-sm cursor-pointer"
                    >
                      Ver reporte / Avisar por WhatsApp
                    </button>
                  )
                )}
              </div>
            </div>
          ) : maq.en_arriendo === 1 ? (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
              <button
                type="button"
                onClick={() => jumpToForm("recepcion", "recepcion")}
                className="sm:col-span-8 min-h-[56px] rounded-xl bg-[#065F46] hover:bg-[#047857] text-white font-extrabold px-5 py-3.5 text-base flex items-center justify-center gap-2.5 shadow-md cursor-pointer"
              >
                <ClipboardCheck className="w-5 h-5 shrink-0" />
                <span>
                  Recibir en Patio (vuelve de {maq.cliente_actual || "obra"})
                </span>
              </button>
              {onNavigateEmergencia && (
                <button
                  type="button"
                  onClick={onNavigateEmergencia}
                  className="sm:col-span-4 min-h-[56px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold px-4 py-3 text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <OctagonAlert className="w-4 h-4 shrink-0" />
                  <span>Reportar falla en obra</span>
                </button>
              )}
            </div>
          ) : statusKey === "PANA" ? (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
              <button
                type="button"
                onClick={() => jumpToForm("taller")}
                className="sm:col-span-8 min-h-[56px] rounded-xl bg-[#0369A1] hover:bg-[#0284C7] text-white font-extrabold px-5 py-3.5 text-base flex items-center justify-center gap-2.5 shadow-md cursor-pointer"
              >
                <Wrench className="w-5 h-5 shrink-0" />
                <span>Ir a Reparación (Taller / OT)</span>
              </button>
              <button
                type="button"
                onClick={() => jumpToForm("presupuesto")}
                className="sm:col-span-4 min-h-[56px] rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-3 text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>Pedir Presupuesto</span>
              </button>
            </div>
          ) : statusKey === "PRESUPUESTO" ? (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
              <button
                type="button"
                onClick={() =>
                  isJefe ? onNavigateJefatura() : jumpToForm("presupuesto")
                }
                className="sm:col-span-8 min-h-[56px] rounded-xl bg-purple-800 hover:bg-purple-900 text-white font-extrabold px-5 py-3.5 text-base flex items-center justify-center gap-2.5 shadow-md cursor-pointer"
              >
                <FileSpreadsheet className="w-5 h-5 shrink-0" />
                <span>
                  {isJefe
                    ? "Resolver Presupuesto en Jefatura"
                    : "Ver / Completar Presupuesto"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => jumpToForm("taller")}
                className="sm:col-span-4 min-h-[56px] rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-3 text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Wrench className="w-4 h-4 shrink-0" />
                <span>Ver Taller</span>
              </button>
            </div>
          ) : porcentajeDesgaste >= 100 ? (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
              <button
                type="button"
                onClick={() => jumpToForm("taller")}
                className="sm:col-span-7 min-h-[56px] rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold px-5 py-3.5 text-base flex items-center justify-center gap-2.5 shadow-md cursor-pointer"
              >
                <Wrench className="w-5 h-5 shrink-0" />
                <span>Hacer Mantención Preventiva (ciclo cumplido)</span>
              </button>
              <button
                type="button"
                onClick={() => jumpToForm("recepcion", "despacho")}
                className="sm:col-span-5 min-h-[56px] rounded-xl bg-[#0C4A6E] hover:bg-[#0284C7] text-white font-bold px-4 py-3 text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Truck className="w-4 h-4 shrink-0" />
                <span>Despachar a Obra igual</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
              <button
                type="button"
                onClick={() => jumpToForm("recepcion", "despacho")}
                className="sm:col-span-8 min-h-[56px] rounded-xl bg-[#0C4A6E] hover:bg-[#0284C7] text-white font-extrabold px-5 py-3.5 text-base flex items-center justify-center gap-2.5 shadow-md cursor-pointer"
              >
                <Truck className="w-5 h-5 shrink-0" />
                <span>Despachar a Obra</span>
              </button>
              {onNavigateEmergencia && (
                <button
                  type="button"
                  onClick={onNavigateEmergencia}
                  className="sm:col-span-4 min-h-[56px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold px-4 py-3 text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <OctagonAlert className="w-4 h-4 shrink-0" />
                  <span>Reportar Falla</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* DETALLES TÉCNICOS, MÉTRICAS Y TAG NFC (PLEGADO EN TERRENO) */}
        <details className="group">
          <summary className="list-none px-5 py-3 bg-white hover:bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between cursor-pointer">
            <span className="flex flex-wrap items-center gap-2">
              <Gauge className="w-4 h-4 text-[#0284C7]" />
              <span>
                Detalles técnicos y ciclo ({maq.uso_acumulado}/
                {maq.limite_mantencion} {unidadUso} · {porcentajeDesgaste}%)
              </span>
              {maq.tipo_medicion === "HORAS" && (
                <span className="font-mono text-slate-500">
                  · Horómetro: {maq.horometro_actual} hrs
                </span>
              )}
            </span>
            <span className="text-[#0284C7] group-open:rotate-180 transition-transform">
              <ChevronDown className="w-4 h-4" />
            </span>
          </summary>

          <div className="p-5 pt-2 space-y-4 border-t border-slate-200">
            <div
              className={`rounded-xl border-2 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${statusTheme.cardBg}`}
            >
              <div className="space-y-1">
                <div className="text-xs font-extrabold uppercase tracking-wider opacity-75">
                  Última Observación
                </div>
                <div className="text-sm font-bold">
                  {maq.ultima_observacion || "Sin observaciones adicionales."}
                </div>
                {maq.en_arriendo === 1 && maq.cliente_actual && (
                  <div className="text-xs font-semibold text-sky-900 pt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>
                      Arriendo activo con <strong>{maq.cliente_actual}</strong>
                      {maq.cliente_rut ? ` (${maq.cliente_rut})` : ""}
                      {maq.ubicacion_actual ? ` · ${maq.ubicacion_actual}` : ""}
                      {maq.guia_despacho ? ` · Guía ${maq.guia_despacho}` : ""}
                      {maq.fecha_salida ? ` · Salida: ${maq.fecha_salida}` : ""}
                      {maq.dias_en_arriendo
                        ? ` · ${maq.dias_en_arriendo} días en obra`
                        : ""}
                    </span>
                    {maq.fecha_retorno_estimada && (
                      <span
                        className={`font-mono px-2 py-0.5 rounded border ${
                          maq.arriendo_vencido
                            ? "bg-red-700 text-white border-red-900 font-bold"
                            : "bg-sky-100 text-sky-900 border-sky-300"
                        }`}
                      >
                        {maq.arriendo_vencido
                          ? `RETORNO VENCIDO (+${maq.dias_atraso} días vs ${maq.fecha_retorno_estimada})`
                          : `Retorno est.: ${maq.fecha_retorno_estimada}`}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-700">
                  Chip NFC: <strong>{maq.ubicacion_nfc}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleCopyNfcLink}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-colors cursor-pointer"
                >
                  {copiedNfc ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar enlace NFC</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
                <div className="bg-[#0C4A6E] text-white px-4 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Uso del Ciclo
                  </span>
                  <Clock className="w-3.5 h-3.5 text-sky-300" />
                </div>
                <div className="p-4">
                  <div className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                    {maq.uso_acumulado} {unidadUso}
                  </div>
                  <div className="text-xs font-semibold text-[#0369A1] mt-1">
                    Límite Mantención: {maq.limite_mantencion} {unidadUso}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
                <div className="bg-[#064E3B] text-white px-4 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Desgaste Preventivo
                  </span>
                  <Gauge className="w-3.5 h-3.5 text-emerald-300" />
                </div>
                <div className="p-4">
                  <div className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                    {porcentajeDesgaste}%
                  </div>
                  <div className="text-xs font-semibold text-[#047857] mt-1">
                    Sobre ciclo preventivo
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
                <div className="bg-[#1E293B] text-white px-4 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Horómetro Motor
                  </span>
                  <Radio className="w-3.5 h-3.5 text-slate-300" />
                </div>
                <div className="p-4">
                  <div className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                    {maq.tipo_medicion === "HORAS"
                      ? `${maq.horometro_actual} hrs`
                      : "Control por Días"}
                  </div>
                  <div className="text-xs font-semibold text-slate-600 mt-1">
                    Medición: {maq.tipo_medicion}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
                <div className="bg-[#334155] text-white px-4 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Último Movimiento
                  </span>
                  <CalendarClock className="w-3.5 h-3.5 text-slate-300" />
                </div>
                <div className="p-4">
                  <div className="text-xl font-black text-slate-900 font-mono tabular-nums">
                    {maq.fecha_actualizacion}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>

      {/* PESTAÑAS DE OPERACIÓN (SIN NUMERACIÓN, SCROLL HORIZONTAL EN MÓVIL) */}
      <div
        id="formulario-operacion-activa"
        className="bg-[#0F172A] p-2 rounded-xl border border-slate-800 flex overflow-x-auto gap-2 shadow-xs scroll-mt-4"
      >
        {subTabs.map((t) => {
          const active = activeSubTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveSubTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg text-xs md:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? "bg-linear-to-r from-[#065F46] to-[#0284C7] text-white shadow-xs border border-sky-400/30"
                  : "text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* CONTENIDO DE LA PESTAÑA ACTIVA */}
      <div className="space-y-4">
        {activeSubTab === "recepcion" && (
          <RecepcionDespachoTab
            maq={maq}
            estadoLimpio={estadoLimpio}
            defaultMode={recepcionDefaultMode}
            onGoToTaller={() => setActiveSubTab("taller")}
            onRefresh={onRefresh}
          />
        )}

        {activeSubTab === "taller" && (
          <TallerMecTab
            maq={maq}
            ordenesTrabajo={ordenesTrabajo}
            repuestos={repuestos}
            otRepuestos={otRepuestos}
            onOpenPdf={setPdfTarget}
            onRefresh={onRefresh}
          />
        )}

        {activeSubTab === "presupuesto" && (
          <SolicitarPresupuestoTab
            maq={maq}
            presupuestos={presupuestos}
            onOpenPdf={setPdfTarget}
            onRefresh={onRefresh}
          />
        )}

        {activeSubTab === "manual" && (
          <AjusteManualTab
            maq={maq}
            isJefe={isJefe}
            onNavigateJefatura={onNavigateJefatura}
            onRefresh={onRefresh}
          />
        )}

        {activeSubTab === "historial" && (
          <HistorialEquipoTab maq={maq} historial={historial} />
        )}
      </div>

      <InformePdfModal
        target={pdfTarget}
        otRepuestos={otRepuestos}
        emergencias={emergencias}
        historial={historial}
        onClose={() => setPdfTarget(null)}
      />
    </div>
  );
}
