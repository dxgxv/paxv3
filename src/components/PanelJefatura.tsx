import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  ClipboardCheck,
  DollarSign,
  FileSpreadsheet,
  Lock,
  Package,
  ShieldCheck,
  Unlock,
  Wrench,
} from "lucide-react";
import {
  formatCLP,
  type ArriendoRegistro,
  type Equipo,
  type EventoHistorial,
  type OrdenTrabajo,
  type OTRepuestoItem,
  type Presupuesto,
  type Repuesto,
  type SolicitudEmergencia,
} from "../data/catalogs";
import InformePdfModal, { type InformePdfTarget } from "./InformePdfModal";
import JefaturaEmergenciasTab from "./jefatura/JefaturaEmergenciasTab";
import JefaturaPresupuestosTab from "./jefatura/JefaturaPresupuestosTab";
import {
  JefaturaBodegaTab,
  JefaturaOtsTab,
} from "./jefatura/JefaturaOtsBodegaTabs";
import JefaturaAnaliticaArriendosTab from "./jefatura/JefaturaAnaliticaArriendosTab";

interface PanelJefaturaProps {
  equipos: Equipo[];
  presupuestos: Presupuesto[];
  ordenesTrabajo: OrdenTrabajo[];
  repuestos: Repuesto[];
  otRepuestos: OTRepuestoItem[];
  emergencias?: SolicitudEmergencia[];
  arriendos?: ArriendoRegistro[];
  historial: EventoHistorial[];
  gastoTotal: number;
  isJefe: boolean;
  usingDefaultPassword?: boolean;
  onUnlockJefe: (password: string) => Promise<boolean>;
  onLockJefe: () => Promise<void> | void;
  onOpenFicha: (codigo: string) => void;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
}

export default function PanelJefatura({
  equipos,
  presupuestos,
  ordenesTrabajo,
  repuestos,
  otRepuestos,
  emergencias = [],
  arriendos = [],
  historial,
  gastoTotal,
  isJefe,
  usingDefaultPassword = false,
  onUnlockJefe,
  onLockJefe,
  onOpenFicha,
  onRefresh,
}: PanelJefaturaProps) {
  const [passwordInput, setPasswordInput] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<
    "emergencias" | "presupuestos" | "ots" | "bodega" | "analitica"
  >(() => {
    if (emergencias.some((e) => e.estado === "PENDIENTE")) return "emergencias";
    if (presupuestos.some((p) => p.estado_presupuesto === "PENDIENTE"))
      return "presupuestos";
    if (equipos.some((e) => e.en_arriendo === 1 && e.arriendo_vencido))
      return "analitica";
    return "presupuestos";
  });
  const [pdfTarget, setPdfTarget] = useState<InformePdfTarget | null>(null);

  const presPendientes = useMemo(
    () =>
      presupuestos.filter((p) => p.estado_presupuesto === "PENDIENTE").length,
    [presupuestos]
  );

  const presAprobadosMonto = useMemo(
    () =>
      presupuestos
        .filter((p) => p.estado_presupuesto === "APROBADO")
        .reduce((acc, p) => acc + (Number(p.monto_total) || 0), 0),
    [presupuestos]
  );

  const otsAbiertasCount = useMemo(
    () => ordenesTrabajo.filter((o) => o.estado !== "CERRADA").length,
    [ordenesTrabajo]
  );

  const emergenciasPendientes = useMemo(
    () => emergencias.filter((e) => e.estado === "PENDIENTE"),
    [emergencias]
  );

  const emergenciasRecientes = useMemo(
    () => emergencias.filter((e) => e.estado !== "PENDIENTE").slice(0, 15),
    [emergencias]
  );

  const stockCriticoCount = useMemo(
    () => repuestos.filter((r) => r.stock <= r.stock_minimo).length,
    [repuestos]
  );

  const valorTotalBodega = useMemo(
    () =>
      repuestos.reduce(
        (acc, r) => acc + Number(r.stock) * Number(r.costo_unitario),
        0
      ),
    [repuestos]
  );

  const arriendosVencidosCount = useMemo(
    () => equipos.filter((e) => e.en_arriendo === 1 && e.arriendo_vencido).length,
    [equipos]
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      await onUnlockJefe(passwordInput);
      setPasswordInput("");
    } finally {
      setAuthLoading(false);
    }
  };

  if (!isJefe) {
    return (
      <div className="max-w-md mx-auto my-12 bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-lg overflow-hidden">
        <div className="bg-[#0F172A] text-white px-6 py-5 border-b border-slate-700 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#0C4A6E] border border-sky-500/40 flex items-center justify-center text-sky-300 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-sky-400 block">
              CONTROL DE ACCESO EJECUTIVO
            </span>
            <h2 className="text-base font-bold text-white">
              Autenticación de Jefatura y Finanzas
            </h2>
          </div>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Este módulo gestiona la 2da autorización de emergencias, resolución
            de presupuestos, auditoría de órdenes de trabajo (OTs),
            valorización de bodega, trazabilidad de arriendos y respaldos.
          </p>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Contraseña de Jefatura
            </label>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Ingrese credencial de acceso..."
              className="w-full bg-white border border-slate-300 rounded-md px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={authLoading}
            className="w-full bg-[#065F46] hover:bg-[#047857] text-white font-bold py-2.5 px-4 rounded-md text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Unlock className="w-4 h-4 shrink-0" />
            <span>
              {authLoading
                ? "Verificando Credencial..."
                : "Desbloquear Panel de Jefatura"}
            </span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado Ejecutivo Oscuro */}
      <div className="bg-[#0F172A] border border-slate-700 rounded-lg p-5 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-[#065F46] border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-semibold block">
              GERENCIA DE OPERACIONES & CONTROL DE COSTOS
            </span>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Panel de Jefatura: Emergencias, Presupuestos, OTs y Arriendos
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800 border border-slate-700 px-3.5 py-2 rounded-md flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10B981]" />
            <span className="text-xs font-mono uppercase tracking-wider text-slate-200 whitespace-nowrap">
              SESIÓN JEFATURA ACTIVA
            </span>
          </div>
          <button
            type="button"
            onClick={onLockJefe}
            className="bg-slate-800 hover:bg-red-950/80 text-slate-300 hover:text-red-200 border border-slate-700 hover:border-red-700 px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </div>

      {usingDefaultPassword && (
        <div className="rounded-lg bg-amber-50 border-2 border-amber-400 px-4 py-3 text-xs md:text-sm text-amber-950 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>
            <strong>Contraseña por defecto activa:</strong> Estás usando la
            clave de ejemplo. Define <code className="font-mono">PASSWORD_JEFE</code>{" "}
            en el archivo <code className="font-mono">.env</code> del servidor
            para proteger el panel.
          </span>
        </div>
      )}

      {/* KPIs Ejecutivos Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0F172A] text-white border border-slate-700 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-400">
            <span>GASTO HISTÓRICO TALLER</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400 mt-1.5 tabular-nums">
            {formatCLP(gastoTotal)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Repuestos e intervenciones cerradas
          </div>
        </div>

        <div className="bg-[#0C4A6E] text-white border border-sky-700 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-sky-200">
            <span>PRESUPUESTOS PENDIENTES</span>
            <ClipboardCheck className="w-4 h-4 text-sky-300" />
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-1.5 tabular-nums">
            {presPendientes}
          </div>
          <div className="text-[11px] text-sky-200 mt-1 tabular-nums">
            Aprobados acumulados: {formatCLP(presAprobadosMonto)}
          </div>
        </div>

        <div className="bg-[#064E3B] text-white border border-emerald-700 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-emerald-200">
            <span>VALORIZACIÓN BODEGA</span>
            <Package className="w-4 h-4 text-emerald-300" />
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-1.5 tabular-nums">
            {formatCLP(valorTotalBodega)}
          </div>
          <div className="text-[11px] text-emerald-200 mt-1 tabular-nums">
            {repuestos.length} ítems ({stockCriticoCount} bajo mínimo)
          </div>
        </div>

        <div className="bg-[#1E293B] text-white border border-slate-700 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-300">
            <span>ÓRDENES DE TRABAJO (OT)</span>
            <Wrench className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400 mt-1.5 tabular-nums">
            {otsAbiertasCount} ABIERTAS
          </div>
          <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
            Emergencias pend.: {emergenciasPendientes.length} · Atrasos obra:{" "}
            {arriendosVencidosCount}
          </div>
        </div>
      </div>

      {/* Sub-navegación de Jefatura */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setActiveSubTab("emergencias")}
          className={`p-3.5 rounded-lg border text-left transition-all flex items-center justify-between cursor-pointer ${
            activeSubTab === "emergencias"
              ? "bg-[#78350F] text-white border-amber-500 shadow-sm"
              : "bg-[#F8FAFC] text-slate-800 border-slate-300 hover:bg-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle
              className={`w-5 h-5 shrink-0 ${
                activeSubTab === "emergencias"
                  ? "text-amber-300"
                  : "text-amber-600"
              }`}
            />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block">
                Emergencias
              </span>
              <span
                className={`text-[11px] ${
                  activeSubTab === "emergencias"
                    ? "text-amber-200"
                    : "text-slate-500"
                }`}
              >
                2da Autorización
              </span>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded font-mono text-xs font-bold tabular-nums ${
              emergenciasPendientes.length > 0
                ? "bg-red-600 text-white"
                : activeSubTab === "emergencias"
                ? "bg-amber-900 text-amber-200"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {emergenciasPendientes.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("presupuestos")}
          className={`p-3.5 rounded-lg border text-left transition-all flex items-center justify-between cursor-pointer ${
            activeSubTab === "presupuestos"
              ? "bg-[#0C4A6E] text-white border-sky-500 shadow-sm"
              : "bg-[#F8FAFC] text-slate-800 border-slate-300 hover:bg-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <DollarSign
              className={`w-5 h-5 shrink-0 ${
                activeSubTab === "presupuestos"
                  ? "text-sky-300"
                  : "text-[#0284C7]"
              }`}
            />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block">
                Presupuestos
              </span>
              <span
                className={`text-[11px] ${
                  activeSubTab === "presupuestos"
                    ? "text-sky-200"
                    : "text-slate-500"
                }`}
              >
                Aprobación y Cobros
              </span>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded font-mono text-xs font-bold tabular-nums ${
              presPendientes > 0
                ? "bg-purple-600 text-white"
                : activeSubTab === "presupuestos"
                ? "bg-sky-900 text-sky-200"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {presPendientes}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("ots")}
          className={`p-3.5 rounded-lg border text-left transition-all flex items-center justify-between cursor-pointer ${
            activeSubTab === "ots"
              ? "bg-[#064E3B] text-white border-emerald-500 shadow-sm"
              : "bg-[#F8FAFC] text-slate-800 border-slate-300 hover:bg-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet
              className={`w-5 h-5 shrink-0 ${
                activeSubTab === "ots" ? "text-emerald-300" : "text-[#059669]"
              }`}
            />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block">
                Auditoría de OTs
              </span>
              <span
                className={`text-[11px] ${
                  activeSubTab === "ots" ? "text-emerald-200" : "text-slate-500"
                }`}
              >
                Tiempos y Repuestos
              </span>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded font-mono text-xs font-bold tabular-nums ${
              activeSubTab === "ots"
                ? "bg-emerald-900 text-emerald-200"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {ordenesTrabajo.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("bodega")}
          className={`p-3.5 rounded-lg border text-left transition-all flex items-center justify-between cursor-pointer ${
            activeSubTab === "bodega"
              ? "bg-[#1E293B] text-white border-slate-500 shadow-sm"
              : "bg-[#F8FAFC] text-slate-800 border-slate-300 hover:bg-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Package
              className={`w-5 h-5 shrink-0 ${
                activeSubTab === "bodega" ? "text-amber-300" : "text-amber-600"
              }`}
            />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block">
                Bodega & Stock
              </span>
              <span
                className={`text-[11px] ${
                  activeSubTab === "bodega" ? "text-slate-300" : "text-slate-500"
                }`}
              >
                Insumos y Precios
              </span>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded font-mono text-xs font-bold tabular-nums ${
              stockCriticoCount > 0
                ? "bg-red-600 text-white"
                : activeSubTab === "bodega"
                ? "bg-slate-700 text-slate-200"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {repuestos.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("analitica")}
          className={`p-3.5 rounded-lg border text-left transition-all flex items-center justify-between cursor-pointer ${
            activeSubTab === "analitica"
              ? "bg-[#0C4A6E] text-white border-sky-500 shadow-sm"
              : "bg-[#F8FAFC] text-slate-800 border-slate-300 hover:bg-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <ArrowUpRight
              className={`w-5 h-5 shrink-0 ${
                activeSubTab === "analitica"
                  ? "text-sky-300"
                  : "text-[#0284C7]"
              }`}
            />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block">
                Arriendos & Analítica
              </span>
              <span
                className={`text-[11px] ${
                  activeSubTab === "analitica"
                    ? "text-sky-200"
                    : "text-slate-500"
                }`}
              >
                Atrasos, Costos & Zip
              </span>
            </div>
          </div>
          {arriendosVencidosCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-red-600 text-white font-mono text-xs font-bold tabular-nums">
              {arriendosVencidosCount}
            </span>
          )}
        </button>
      </div>

      {activeSubTab === "emergencias" && (
        <JefaturaEmergenciasTab
          emergenciasPendientes={emergenciasPendientes}
          emergenciasRecientes={emergenciasRecientes}
          onOpenFicha={onOpenFicha}
          onRefresh={onRefresh}
        />
      )}

      {activeSubTab === "presupuestos" && (
        <JefaturaPresupuestosTab
          equipos={equipos}
          presupuestos={presupuestos}
          onOpenFicha={onOpenFicha}
          onOpenPdf={setPdfTarget}
          onRefresh={onRefresh}
        />
      )}

      {activeSubTab === "ots" && (
        <JefaturaOtsTab
          equipos={equipos}
          ordenesTrabajo={ordenesTrabajo}
          onOpenFicha={onOpenFicha}
          onOpenPdf={setPdfTarget}
        />
      )}

      {activeSubTab === "bodega" && (
        <JefaturaBodegaTab repuestos={repuestos} onRefresh={onRefresh} />
      )}

      {activeSubTab === "analitica" && (
        <JefaturaAnaliticaArriendosTab
          equipos={equipos}
          arriendos={arriendos}
          ordenesTrabajo={ordenesTrabajo}
          historial={historial}
          onOpenFicha={onOpenFicha}
        />
      )}

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
