/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Wrench,
  Activity,
  Cpu,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Terminal,
  SlidersHorizontal,
  X,
  Smartphone,
  WifiOff,
  Share2,
  OctagonAlert,
  CloudUpload,
  Menu,
  User,
} from "lucide-react";
import {
  getSemaforoKey,
  type SemaforoKey,
  type Equipo,
  type Presupuesto,
  type OrdenTrabajo,
  type Repuesto,
  type OTRepuestoItem,
  type SolicitudEmergencia,
  type EventoHistorial,
  type ArriendoRegistro,
} from "./data/catalogs";
import { usePWAInstall } from "./hooks/usePWAInstall";
import { useOfflineSync } from "./hooks/useOnlineStatus";
import { apiRequest } from "./lib/apiClient";
import { loadCachedState, saveCachedState } from "./lib/offlineStore";
import {
  loadOperadorPerfil,
  saveOperadorPerfil,
  type OperadorPerfil,
} from "./lib/operadorPerfil";
import EstacionTrabajo from "./components/EstacionTrabajo";
import SemaforoPatio from "./components/SemaforoPatio";
import EnrolarMaquina from "./components/EnrolarMaquina";
import PanelJefatura from "./components/PanelJefatura";
import ModuloEmergencia from "./components/ModuloEmergencia";

type TabKey = "estacion" | "semaforo" | "enrolar" | "jefatura" | "emergencia";

interface ApiStateResponse {
  equipos: Equipo[];
  presupuestos: Presupuesto[];
  ordenes_trabajo: OrdenTrabajo[];
  repuestos: Repuesto[];
  ot_repuestos: OTRepuestoItem[];
  emergencias?: SolicitudEmergencia[];
  arriendos?: ArriendoRegistro[];
  historial: EventoHistorial[];
  gasto_total: number;
  config: {
    telefono_taller: string;
    gemini_configured: boolean;
    using_default_password: boolean;
    authenticated_jefe?: boolean;
  };
}

export default function App() {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [ordenesTrabajo, setOrdenesTrabajo] = useState<OrdenTrabajo[]>([]);
  const [repuestos, setRepuestos] = useState<Repuesto[]>([]);
  const [otRepuestos, setOtRepuestos] = useState<OTRepuestoItem[]>([]);
  const [emergencias, setEmergencias] = useState<SolicitudEmergencia[]>([]);
  const [arriendos, setArriendos] = useState<ArriendoRegistro[]>([]);
  const [historial, setHistorial] = useState<EventoHistorial[]>([]);
  const [gastoTotal, setGastoTotal] = useState<number>(0);
  const [telefonoTaller, setTelefonoTaller] = useState<string>("56912345678");
  const [usingCacheFallback, setUsingCacheFallback] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabKey>("estacion");
  const [equipoActivo, setEquipoActivo] = useState<string>("");
  const [nfcDetectedId, setNfcDetectedId] = useState<string | null>(null);
  const [isJefe, setIsJefe] = useState<boolean>(false);
  const [usingDefaultPassword, setUsingDefaultPassword] =
    useState<boolean>(false);
  const [showIOSGuide, setShowIOSGuide] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [selectedPatioStatus, setSelectedPatioStatus] = useState<
    SemaforoKey | "TODAS" | null
  >(null);
  const [operadorPerfil, setOperadorPerfil] = useState<OperadorPerfil>(() =>
    loadOperadorPerfil()
  );
  const [showPerfilModal, setShowPerfilModal] = useState<boolean>(false);

  useEffect(() => {
    const onPerfilChanged = () => setOperadorPerfil(loadOperadorPerfil());
    window.addEventListener("rv-perfil-changed", onPerfilChanged);
    return () =>
      window.removeEventListener("rv-perfil-changed", onPerfilChanged);
  }, []);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const [flashMessage, setFlashMessage] = useState<{
    text: string;
    type: "success" | "error" | "warning";
  } | null>(null);

  const showFlash = useCallback(
    (text: string, type: "success" | "error" | "warning" = "success") => {
      setFlashMessage({ text, type });
      const duration = type === "success" ? 5500 : 9000;
      setTimeout(() => {
        setFlashMessage((prev) => (prev?.text === text ? null : prev));
      }, duration);
    },
    []
  );

  const applyStatePayload = useCallback((json: ApiStateResponse) => {
    const loadedEquipos = json.equipos || [];
    setEquipos(loadedEquipos);
    setPresupuestos(json.presupuestos || []);
    setOrdenesTrabajo(json.ordenes_trabajo || []);
    setRepuestos(json.repuestos || []);
    setOtRepuestos(json.ot_repuestos || []);
    setEmergencias(json.emergencias || []);
    setArriendos(json.arriendos || []);
    setHistorial(json.historial || []);
    setGastoTotal(json.gasto_total || 0);
    if (json.config?.telefono_taller) {
      setTelefonoTaller(json.config.telefono_taller);
    }
    setIsJefe(Boolean(json.config?.authenticated_jefe));
    setUsingDefaultPassword(Boolean(json.config?.using_default_password));

    const params = new URLSearchParams(window.location.search);
    const urlId = (
      params.get("id") ||
      params.get("equipo") ||
      ""
    ).toUpperCase();

    if (urlId && loadedEquipos.some((e) => e.codigo === urlId)) {
      setEquipoActivo(urlId);
      setNfcDetectedId((prev) => {
        if (!prev) {
          setSelectedPatioStatus(null);
          setTimeout(() => {
            const el =
              document.getElementById("ficha-equipo-activa") ||
              document.getElementById("main-workstation");
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 120);
        }
        return urlId;
      });
    } else {
      setEquipoActivo((prev) => {
        if (prev && loadedEquipos.some((e) => e.codigo === prev)) {
          return prev;
        }
        return loadedEquipos[0]?.codigo || "";
      });
    }
  }, []);

  const fetchState = useCallback(
    async (flashMsg?: {
      type: "success" | "warning" | "error";
      text: string;
    }) => {
      try {
        const res = await apiRequest<ApiStateResponse>("/api/state", {
          method: "GET",
        });
        if (!res.ok) throw new Error("Error cargando estado del servidor");
        const json = res.data as ApiStateResponse;

        applyStatePayload(json);
        setUsingCacheFallback(false);
        await saveCachedState(json);

        if (flashMsg) {
          showFlash(flashMsg.text, flashMsg.type);
        }
      } catch (err) {
        console.error(err);
        const cached = await loadCachedState<ApiStateResponse>();
        if (cached?.data) {
          applyStatePayload(cached.data);
          setUsingCacheFallback(true);
          if (flashMsg) {
            showFlash(flashMsg.text, flashMsg.type);
          } else {
            showFlash(
              "Sin conexión al servidor: usando último estado guardado en el dispositivo.",
              "warning"
            );
          }
        } else {
          showFlash(
            "Sin conexión con el servidor. Revisa tu señal e inténtalo de nuevo.",
            "error"
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [applyStatePayload, showFlash]
  );

  const handleOfflineSynced = useCallback(
    (info: { synced: number; failed: number; errors: string[] }) => {
      if (info.synced > 0) {
        fetchState({
          type: info.failed > 0 ? "warning" : "success",
          text:
            info.failed > 0
              ? `Sincronizados ${info.synced} registro(s) pendientes; ${info.failed} con observación: ${info.errors[0] || ""}`
              : `Sincronización completada: ${info.synced} registro(s) de terreno enviados al servidor.`,
        });
      } else if (info.failed > 0) {
        showFlash(
          `Error sincronizando cola local: ${info.errors[0] || "Reintenta al tener señal."}`,
          "error"
        );
      }
    },
    [fetchState, showFlash]
  );

  const { isOnline, pendingCount, syncing, triggerSync } =
    useOfflineSync(handleOfflineSynced);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleOpenFicha = (codigo: string) => {
    const target = equipos.find((e) => e.codigo === codigo);
    setEquipoActivo(codigo);
    setActiveTab("estacion");
    setMobileMenuOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("id", codigo);
    window.history.replaceState({}, "", url.toString());
    showFlash(
      `Equipo ${codigo}${target ? ` (${target.nombre})` : ""} cargado en consola.`,
      "success"
    );
    setTimeout(() => {
      const el =
        document.getElementById("ficha-equipo-activa") ||
        document.getElementById("main-workstation");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  };

  const handleUnlockJefe = async (password: string): Promise<boolean> => {
    try {
      const res = await apiRequest("/api/auth/jefe", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setIsJefe(true);
        showFlash("Sesión de Jefatura desbloqueada correctamente.", "success");
        return true;
      } else {
        showFlash(res.data?.error || "Contraseña incorrecta.", "error");
        return false;
      }
    } catch {
      showFlash("Error al verificar credenciales de Jefatura.", "error");
      return false;
    }
  };

  const handleLockJefe = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // Cerrar estado visual incluso si cae red
    } finally {
      setIsJefe(false);
      showFlash("Sesión de Jefatura cerrada.", "warning");
    }
  };

  const fleetCounts = useMemo(() => {
    let operativas = 0;
    let mantencion = 0;
    let pana = 0;
    let presupuesto = 0;
    let enObra = 0;
    let atrasos = 0;
    const byStatus: Record<SemaforoKey | "TODAS", Equipo[]> = {
      OPERATIVA: [],
      MANTENCION: [],
      PANA: [],
      PRESUPUESTO: [],
      TODAS: [...equipos],
    };
    for (const m of equipos) {
      const k = getSemaforoKey(m.semaforo);
      byStatus[k].push(m);
      if (k === "OPERATIVA") operativas++;
      else if (k === "MANTENCION") mantencion++;
      else if (k === "PANA") pana++;
      else if (k === "PRESUPUESTO") presupuesto++;

      if (m.en_arriendo === 1) {
        enObra++;
        if (m.arriendo_vencido) atrasos++;
      }
    }
    return {
      operativas,
      mantencion,
      pana,
      presupuesto,
      enObra,
      atrasos,
      total: equipos.length,
      byStatus,
    };
  }, [equipos]);

  useEffect(() => {
    if (equipos.length === 0) return;
    if (
      selectedPatioStatus &&
      selectedPatioStatus !== "TODAS" &&
      fleetCounts.byStatus[selectedPatioStatus].length === 0
    ) {
      if (fleetCounts.pana > 0) setSelectedPatioStatus("PANA");
      else if (fleetCounts.mantencion > 0) setSelectedPatioStatus("MANTENCION");
      else if (fleetCounts.presupuesto > 0) setSelectedPatioStatus("PRESUPUESTO");
      else if (fleetCounts.operativas > 0) setSelectedPatioStatus("OPERATIVA");
    }
  }, [equipos.length]);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#E2E8F0] text-[#0F172A] pb-16 lg:pb-0">
      {/* BARRA LATERAL OSCURA (COLAPSABLE EN MÓVIL) */}
      <aside className="w-full lg:w-72 bg-[#0F172A] text-slate-100 border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0 flex flex-col justify-between">
        <div>
          <div className="px-4 py-3 lg:p-5 bg-gradient-to-br from-[#064E3B] via-[#065F46] to-[#0F172A] border-b border-emerald-800/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-lg bg-slate-950/60 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-inner shrink-0">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base lg:text-lg font-extrabold tracking-tight text-white leading-tight">
                  RENTAL VALDIVIA
                </h1>
                <p className="text-[11px] text-emerald-100/80 font-medium">
                  Taller, Patio y Terreno
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/80 border border-emerald-400/40 text-xs font-bold uppercase tracking-wider text-white cursor-pointer min-h-[44px]"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <>
                  <X className="w-4 h-4" />
                  <span>Cerrar</span>
                </>
              ) : (
                <>
                  <Menu className="w-4 h-4" />
                  <span>Menú</span>
                </>
              )}
            </button>
          </div>

          <div
            className={`${
              mobileMenuOpen ? "block" : "hidden"
            } lg:block p-3.5 space-y-1.5`}
          >
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-slate-400 font-semibold">
              Menú Principal
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("estacion")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "estacion"
                  ? "bg-[#0284C7] text-white shadow-sm border-l-4 border-emerald-400"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Wrench className="w-4 h-4" />
                Ficha de Máquina
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("semaforo")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "semaforo"
                  ? "bg-[#0284C7] text-white shadow-sm border-l-4 border-emerald-400"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Activity className="w-4 h-4" />
                Semáforo del Patio
              </span>
              {fleetCounts.atrasos > 0 && (
                <span
                  title="Equipos con retorno atrasado en obra"
                  className="px-1.5 py-0.5 rounded bg-red-600 text-white font-mono text-[10px] font-black tabular-nums"
                >
                  {fleetCounts.atrasos} ATR.
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("enrolar")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "enrolar"
                  ? "bg-[#0284C7] text-white shadow-sm border-l-4 border-emerald-400"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Cpu className="w-4 h-4" />
                Enrolar Máquina (NFC)
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("jefatura")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "jefatura"
                  ? "bg-[#0284C7] text-white shadow-sm border-l-4 border-emerald-400"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4" />
                Panel de Jefatura
              </span>
              <span className="flex items-center gap-1.5">
                {emergencias.some((e) => e.estado === "PENDIENTE") && (
                  <span
                    title="Emergencias en espera de confirmación"
                    className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-mono text-[10px] font-black tabular-nums"
                  >
                    {emergencias.filter((e) => e.estado === "PENDIENTE").length}
                  </span>
                )}
                <span
                  className={`w-2 h-2 rounded-full ${
                    isJefe
                      ? "bg-emerald-400 shadow-[0_0_8px_#10B981]"
                      : fleetCounts.presupuesto > 0
                      ? "bg-purple-400 shadow-[0_0_8px_#A855F7]"
                      : "bg-slate-600"
                  }`}
                />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("emergencia")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "emergencia"
                  ? "bg-red-700 text-white shadow-sm border-l-4 border-red-300"
                  : "text-red-300 hover:bg-red-950/60 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <OctagonAlert className="w-4 h-4" />
                Reportar Falla
              </span>
            </button>
          </div>

          {!isInstalled && (isInstallable || isIOS) && (
            <div className="mx-3.5 my-2.5">
              <button
                type="button"
                onClick={() => (isIOS ? setShowIOSGuide(true) : install())}
                className="w-full bg-[#1E293B] hover:bg-slate-700 border border-slate-600 text-sky-300 font-bold py-2 px-3 rounded-lg text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                {isIOS ? (
                  <Share2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>Instalar App en Teléfono</span>
              </button>
            </div>
          )}
        </div>

        {/* Resumen Telemetría de Flota en el pie del Sidebar */}
        <div
          className={`${
            mobileMenuOpen ? "block" : "hidden"
          } lg:block p-4 bg-slate-950/70 border-t border-slate-800 space-y-2.5`}
        >
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
            <span>ESTADO DEL PATIO</span>
            <button
              type="button"
              onClick={() =>
                setSelectedPatioStatus((prev) =>
                  prev === "TODAS" ? null : "TODAS"
                )
              }
              className="text-sky-400 hover:text-sky-300 underline font-bold cursor-pointer tabular-nums"
            >
              {fleetCounts.total} MÁQUINAS
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <button
              type="button"
              onClick={() =>
                setSelectedPatioStatus((prev) =>
                  prev === "OPERATIVA" ? null : "OPERATIVA"
                )
              }
              className={`rounded px-2.5 py-2 flex items-center justify-between transition-all cursor-pointer ${
                selectedPatioStatus === "OPERATIVA"
                  ? "bg-emerald-950/90 border-2 border-emerald-400 shadow-xs"
                  : "bg-slate-900 border border-slate-800 hover:border-emerald-500/50"
              }`}
            >
              <span className="flex items-center gap-1.5 text-slate-200 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10B981]" />
                Operativas
              </span>
              <span className="font-bold text-emerald-400 tabular-nums">
                {fleetCounts.operativas}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSelectedPatioStatus((prev) =>
                  prev === "MANTENCION" ? null : "MANTENCION"
                )
              }
              className={`rounded px-2.5 py-2 flex items-center justify-between transition-all cursor-pointer ${
                selectedPatioStatus === "MANTENCION"
                  ? "bg-amber-950/90 border-2 border-amber-400 shadow-xs"
                  : "bg-slate-900 border border-slate-800 hover:border-amber-500/50"
              }`}
            >
              <span className="flex items-center gap-1.5 text-slate-200 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_#F59E0B]" />
                Mantención
              </span>
              <span className="font-bold text-amber-400 tabular-nums">
                {fleetCounts.mantencion}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSelectedPatioStatus((prev) =>
                  prev === "PANA" ? null : "PANA"
                )
              }
              className={`rounded px-2.5 py-2 flex items-center justify-between transition-all cursor-pointer ${
                selectedPatioStatus === "PANA"
                  ? "bg-red-950/90 border-2 border-red-400 shadow-xs"
                  : "bg-slate-900 border border-slate-800 hover:border-red-500/50"
              }`}
            >
              <span className="flex items-center gap-1.5 text-slate-200 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#EF4444]" />
                En Pana
              </span>
              <span className="font-bold text-red-400 tabular-nums">
                {fleetCounts.pana}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSelectedPatioStatus((prev) =>
                  prev === "PRESUPUESTO" ? null : "PRESUPUESTO"
                )
              }
              className={`rounded px-2.5 py-2 flex items-center justify-between transition-all cursor-pointer ${
                selectedPatioStatus === "PRESUPUESTO"
                  ? "bg-purple-950/90 border-2 border-purple-400 shadow-xs"
                  : "bg-slate-900 border border-slate-800 hover:border-purple-500/50"
              }`}
            >
              <span className="flex items-center gap-1.5 text-slate-200 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_6px_#A855F7]" />
                Presupuesto
              </span>
              <span className="font-bold text-purple-400 tabular-nums">
                {fleetCounts.presupuesto}
              </span>
            </button>
          </div>

          {selectedPatioStatus && (
            <div className="bg-slate-900 border border-slate-700 rounded-md overflow-hidden shadow-md">
              <div className="px-2.5 py-1.5 bg-slate-800/95 border-b border-slate-700 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-200 font-bold">
                <span>
                  {selectedPatioStatus === "OPERATIVA" && "Operativas"}
                  {selectedPatioStatus === "MANTENCION" && "Mantención"}
                  {selectedPatioStatus === "PANA" && "En Pana"}
                  {selectedPatioStatus === "PRESUPUESTO" && "Presupuesto"}
                  {selectedPatioStatus === "TODAS" && "Toda la Flota"} (
                  {fleetCounts.byStatus[selectedPatioStatus].length})
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedPatioStatus(null)}
                  className="text-slate-400 hover:text-white cursor-pointer p-1"
                  title="Cerrar tabla"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto overflow-x-auto">
                {fleetCounts.byStatus[selectedPatioStatus].length === 0 ? (
                  <div className="px-2.5 py-3 text-[11px] text-slate-400 text-center">
                    Sin máquinas en este estado.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-950/90 text-slate-400 border-b border-slate-800 font-mono uppercase text-[9px]">
                        <th className="py-1.5 px-2">Código</th>
                        <th className="py-1.5 px-2">Máquina</th>
                        <th className="py-1.5 px-2 text-right">Ficha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {fleetCounts.byStatus[selectedPatioStatus]
                        .slice(0, 50)
                        .map((item) => {
                          const isCurrent =
                            equipoActivo === item.codigo &&
                            activeTab === "estacion";
                          const itemKey = getSemaforoKey(item.semaforo);
                          const dotColor =
                            itemKey === "OPERATIVA"
                              ? "bg-emerald-400"
                              : itemKey === "MANTENCION"
                              ? "bg-amber-400"
                              : itemKey === "PANA"
                              ? "bg-red-500"
                              : "bg-purple-400";
                          return (
                            <tr
                              key={item.codigo}
                              onClick={() => handleOpenFicha(item.codigo)}
                              className={`transition-colors cursor-pointer ${
                                isCurrent
                                  ? "bg-sky-950/70 hover:bg-sky-900/70"
                                  : "hover:bg-slate-800/90"
                              }`}
                            >
                              <td className="py-2 px-2 font-mono font-bold text-white whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`}
                                  />
                                  {item.codigo}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-slate-200 leading-tight">
                                <div className="line-clamp-2 font-medium">
                                  {item.nombre}
                                </div>
                                {item.en_arriendo === 1 && item.cliente_actual && (
                                  <div
                                    className={`text-[10px] font-mono truncate max-w-[140px] ${
                                      item.arriendo_vencido
                                        ? "text-red-400 font-bold"
                                        : "text-sky-300"
                                    }`}
                                  >
                                    {item.arriendo_vencido
                                      ? `ATRASO +${item.dias_atraso}d · ${item.cliente_actual}`
                                      : `Obra: ${item.cliente_actual}`}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenFicha(item.codigo);
                                  }}
                                  className={`px-2.5 py-1.5 rounded font-mono text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                                    isCurrent
                                      ? "bg-emerald-600 text-white"
                                      : "bg-[#0284C7] hover:bg-[#0369A1] text-white"
                                  }`}
                                >
                                  {isCurrent ? "Activa" : "Abrir"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <div id="main-workstation" className="flex-1 flex flex-col min-w-0">
        <header className="bg-[#0F172A] text-white border-b border-slate-800 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-4 h-4 text-sky-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                {activeTab === "estacion" &&
                  (equipoActivo ? `Máquina ${equipoActivo}` : "Ficha de Máquina")}
                {activeTab === "semaforo" && "Semáforo del Patio"}
                {activeTab === "enrolar" && "Enrolar Máquina (NFC / QR)"}
                {activeTab === "jefatura" && "Panel de Jefatura"}
                {activeTab === "emergencia" && "Reportar Falla en Terreno"}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {nfcDetectedId && (
              <div className="bg-[#064E3B] border border-emerald-500/50 text-emerald-200 px-3 py-1.5 rounded-md text-xs font-mono flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10B981]" />
                NFC:{" "}
                <strong className="text-white">{nfcDetectedId}</strong>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowPerfilModal(true)}
              className="bg-slate-800/90 hover:bg-slate-700 border border-slate-600 text-slate-200 px-3 py-1.5 rounded-md text-xs flex items-center gap-2 cursor-pointer transition-colors"
              title="Cambiar operador guardado en este teléfono"
            >
              <User className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>
                {operadorPerfil.nombre ? (
                  <>
                    Operando como:{" "}
                    <strong className="text-white">
                      {operadorPerfil.nombre}
                    </strong>{" "}
                    <span className="text-slate-400">
                      ({operadorPerfil.rol}) · Cambiar
                    </span>
                  </>
                ) : (
                  <strong className="text-sky-300">
                    Guardar mi nombre / rol
                  </strong>
                )}
              </span>
            </button>
          </div>
        </header>

        {/* MODAL DE IDENTIDAD DEL OPERADOR EN EL DISPOSITIVO */}
        {showPerfilModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
            <div className="w-full max-w-md rounded-xl bg-[#F8FAFC] border border-slate-400 overflow-hidden shadow-2xl">
              <div className="bg-[#0F172A] text-white px-5 py-3.5 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-sky-400" />
                  <span>Identidad en este Teléfono / Equipo</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowPerfilModal(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveOperadorPerfil(operadorPerfil);
                  setShowPerfilModal(false);
                  showFlash(
                    operadorPerfil.nombre
                      ? `Identidad guardada: ${operadorPerfil.nombre} (${operadorPerfil.rol}).`
                      : "Identidad limpiada en este dispositivo.",
                    "success"
                  );
                }}
                className="p-5 space-y-4 text-xs text-slate-800"
              >
                <p className="text-slate-600 leading-relaxed">
                  Tus datos se recordarán en este dispositivo para autocompletar
                  recepciones, despachos, reparaciones y reportes de falla.
                </p>

                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Tu Nombre y Apellido:
                  </label>
                  <input
                    type="text"
                    value={operadorPerfil.nombre}
                    onChange={(e) =>
                      setOperadorPerfil((prev) => ({
                        ...prev,
                        nombre: e.target.value,
                      }))
                    }
                    placeholder="Ej: Juan Pérez"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Tu RUT (para reportes de falla):
                  </label>
                  <input
                    type="text"
                    value={operadorPerfil.rut}
                    onChange={(e) =>
                      setOperadorPerfil((prev) => ({
                        ...prev,
                        rut: e.target.value,
                      }))
                    }
                    placeholder="Ej: 12.345.678-5"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Tu Rol Principal:
                  </label>
                  <select
                    value={operadorPerfil.rol}
                    onChange={(e) =>
                      setOperadorPerfil((prev) => ({
                        ...prev,
                        rol: e.target.value as OperadorPerfil["rol"],
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold min-h-[44px]"
                  >
                    <option value="Patio / Despacho">Patio / Despacho</option>
                    <option value="Mecánico Taller">Mecánico Taller</option>
                    <option value="Operador en Obra">Operador en Obra</option>
                    <option value="Jefatura">Jefatura</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPerfilModal(false)}
                    className="px-4 py-2.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-lg bg-[#065F46] hover:bg-[#047857] text-white font-bold cursor-pointer"
                  >
                    Guardar en este teléfono
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL DE INSTALACIÓN EN IPHONE / IPAD */}
        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
            <div className="w-full max-w-sm rounded-lg bg-[#F8FAFC] border border-slate-400 overflow-hidden shadow-2xl">
              <div className="bg-[#0F172A] text-white px-5 py-3.5 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Instalar en iPhone / iPad
                </span>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3 text-xs text-slate-700 leading-relaxed">
                <p>
                  1. Toca el botón <strong>Compartir</strong> en la barra
                  inferior de Safari.
                </p>
                <p>
                  2. Desliza hacia abajo y selecciona{" "}
                  <strong>Agregar a Inicio</strong>.
                </p>
                <p>
                  3. Confirma con <strong>Agregar</strong> para tener{" "}
                  <strong>Rental Valdivia</strong> como aplicación a pantalla
                  completa.
                </p>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="mt-2 w-full rounded bg-[#065F46] text-white py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Indicador Persistente de Modo Sin Señal o Cola Local Offline */}
        {(!isOnline || usingCacheFallback || pendingCount > 0) && (
          <div className="fixed bottom-4 left-4 z-50 flex flex-wrap items-center gap-3 rounded-lg bg-[#0F172A] px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-xl border border-amber-500">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {!isOnline
                ? "Sin señal — Guardando en el teléfono"
                : usingCacheFallback
                ? "Servidor sin respuesta — Usando datos del teléfono"
                : `${pendingCount} registro(s) por sincronizar`}
              {!isOnline && pendingCount > 0
                ? ` · ${pendingCount} pendiente(s)`
                : ""}
            </span>
            {pendingCount > 0 && isOnline && (
              <button
                type="button"
                disabled={syncing}
                onClick={triggerSync}
                className="inline-flex items-center gap-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 text-[11px] font-black cursor-pointer whitespace-nowrap"
              >
                <CloudUpload className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {syncing ? "Sincronizando..." : "Sincronizar ahora"}
                </span>
              </button>
            )}
          </div>
        )}

        {/* Notificación Toast Fija (visible al final del formulario) */}
        {flashMessage && (
          <div className="fixed bottom-16 lg:bottom-6 right-4 left-4 lg:left-auto lg:max-w-md z-50">
            <div
              role="status"
              className={`px-4 py-3.5 rounded-xl border-2 flex items-center justify-between gap-3 shadow-2xl text-xs md:text-sm font-bold tracking-wide ${
                flashMessage.type === "success"
                  ? "bg-emerald-950 text-emerald-100 border-emerald-400"
                  : flashMessage.type === "warning"
                  ? "bg-amber-950 text-amber-100 border-amber-400"
                  : "bg-red-950 text-red-100 border-red-400"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {flashMessage.type === "success" && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                )}
                {flashMessage.type === "warning" && (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                {flashMessage.type === "error" && (
                  <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                )}
                <span>{flashMessage.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFlashMessage(null)}
                className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs font-mono uppercase cursor-pointer shrink-0"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Cuerpo Principal */}
        <main className="flex-1 p-6 max-w-[1600px] w-full mx-auto">
          {loading ? (
            <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg p-12 text-center space-y-3">
              <RefreshCw className="w-6 h-6 text-[#0284C7] animate-spin mx-auto" />
              <p className="text-xs font-mono uppercase tracking-wider text-slate-600">
                Cargando máquinas...
              </p>
            </div>
          ) : (
            <>
              {activeTab === "estacion" && (
                <EstacionTrabajo
                  equipos={equipos}
                  equipoActivo={equipoActivo}
                  setEquipoActivo={setEquipoActivo}
                  presupuestos={presupuestos}
                  ordenesTrabajo={ordenesTrabajo}
                  repuestos={repuestos}
                  otRepuestos={otRepuestos}
                  emergencias={emergencias}
                  historial={historial}
                  telefonoTaller={telefonoTaller}
                  isJefe={isJefe}
                  onRefresh={fetchState}
                  onNavigateJefatura={() => setActiveTab("jefatura")}
                  onNavigateEmergencia={() => setActiveTab("emergencia")}
                />
              )}

              {activeTab === "semaforo" && (
                <SemaforoPatio
                  equipos={equipos}
                  isJefe={isJefe}
                  onOpenFicha={handleOpenFicha}
                  onReportFalla={(codigo) => {
                    setEquipoActivo(codigo);
                    setActiveTab("emergencia");
                    setMobileMenuOpen(false);
                  }}
                  onRefresh={fetchState}
                />
              )}

              {activeTab === "enrolar" && (
                <EnrolarMaquina
                  equipos={equipos}
                  onRefresh={fetchState}
                  onOpenFicha={handleOpenFicha}
                />
              )}

              {activeTab === "jefatura" && (
                <PanelJefatura
                  equipos={equipos}
                  presupuestos={presupuestos}
                  ordenesTrabajo={ordenesTrabajo}
                  repuestos={repuestos}
                  otRepuestos={otRepuestos}
                  emergencias={emergencias}
                  arriendos={arriendos}
                  historial={historial}
                  gastoTotal={gastoTotal}
                  isJefe={isJefe}
                  usingDefaultPassword={usingDefaultPassword}
                  onUnlockJefe={handleUnlockJefe}
                  onLockJefe={handleLockJefe}
                  onOpenFicha={handleOpenFicha}
                  onRefresh={fetchState}
                />
              )}

              {activeTab === "emergencia" && (
                <ModuloEmergencia
                  equipos={equipos}
                  equipoActivo={equipoActivo}
                  setEquipoActivo={setEquipoActivo}
                  emergencias={emergencias}
                  isJefe={isJefe}
                  telefonoTaller={telefonoTaller}
                  onRefresh={fetchState}
                  onNavigateJefatura={() => setActiveTab("jefatura")}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* BARRA DE NAVEGACIÓN INFERIOR FIJA EN TELÉFONO */}
      <nav
        aria-label="Navegación rápida móvil"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0F172A] border-t border-slate-800 grid grid-cols-4 text-slate-300 shadow-2xl"
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab("estacion");
            setMobileMenuOpen(false);
          }}
          className={`flex flex-col items-center justify-center py-2.5 px-1 text-[11px] font-bold cursor-pointer min-h-[56px] ${
            activeTab === "estacion"
              ? "text-white bg-[#0284C7]"
              : "hover:text-white"
          }`}
        >
          <Wrench className="w-4 h-4 mb-0.5 shrink-0" />
          <span>Máquina</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("semaforo");
            setMobileMenuOpen(false);
          }}
          className={`relative flex flex-col items-center justify-center py-2.5 px-1 text-[11px] font-bold cursor-pointer min-h-[56px] ${
            activeTab === "semaforo"
              ? "text-white bg-[#0284C7]"
              : "hover:text-white"
          }`}
        >
          <Activity className="w-4 h-4 mb-0.5 shrink-0" />
          <span>Flota</span>
          {fleetCounts.atrasos > 0 && (
            <span className="absolute top-1.5 right-3 px-1 rounded bg-red-600 text-white font-mono text-[9px] font-black">
              {fleetCounts.atrasos}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("emergencia");
            setMobileMenuOpen(false);
          }}
          className={`flex flex-col items-center justify-center py-2.5 px-1 text-[11px] font-bold cursor-pointer min-h-[56px] ${
            activeTab === "emergencia"
              ? "text-white bg-red-700"
              : "text-red-300 hover:text-white"
          }`}
        >
          <OctagonAlert className="w-4 h-4 mb-0.5 shrink-0" />
          <span>Reportar Falla</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("jefatura");
            setMobileMenuOpen(false);
          }}
          className={`relative flex flex-col items-center justify-center py-2.5 px-1 text-[11px] font-bold cursor-pointer min-h-[56px] ${
            activeTab === "jefatura"
              ? "text-white bg-[#0284C7]"
              : "hover:text-white"
          }`}
        >
          <ShieldCheck className="w-4 h-4 mb-0.5 shrink-0" />
          <span>Jefatura</span>
          {emergencias.some((e) => e.estado === "PENDIENTE") && (
            <span className="absolute top-1.5 right-3 px-1 rounded bg-amber-400 text-slate-950 font-mono text-[9px] font-black">
              {emergencias.filter((e) => e.estado === "PENDIENTE").length}
            </span>
          )}
        </button>
      </nav>
    </div>
  );
}
