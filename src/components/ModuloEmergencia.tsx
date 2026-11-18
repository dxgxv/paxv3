import React, { useState, useEffect, useMemo } from "react";
import {
  ShieldAlert,
  MessageSquare,
  Search,
  Building2,
  MapPin,
  Camera,
  CheckSquare,
  Wrench,
  CheckCircle2,
  UserCheck,
  ShieldCheck,
  AlertTriangle,
  Clock,
} from "lucide-react";
import {
  PANAS_POR_CATEGORIA,
  ESTADO_PRE_ALERTA,
  ESTADO_EN_PANA,
  cleanSemaforoLabel,
  normalizarRut,
  validarRutChileno,
  type Equipo,
  type SolicitudEmergencia,
} from "../data/catalogs";
import {
  compressImageBase64,
  submitFieldMutation,
} from "../lib/apiClient";
import {
  loadOperadorPerfil,
  saveOperadorPerfil,
} from "../lib/operadorPerfil";

interface ModuloEmergenciaProps {
  equipos: Equipo[];
  equipoActivo: string;
  setEquipoActivo: (codigo: string) => void;
  emergencias: SolicitudEmergencia[];
  isJefe: boolean;
  telefonoTaller: string;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
  onNavigateJefatura?: () => void;
}

export default function ModuloEmergencia({
  equipos,
  equipoActivo,
  setEquipoActivo,
  emergencias,
  isJefe,
  telefonoTaller,
  onRefresh,
  onNavigateJefatura,
}: ModuloEmergenciaProps) {
  const [submitting, setSubmitting] = useState(false);
  const [busquedaMaq, setBusquedaMaq] = useState("");
  const [reportanteNombre, setReportanteNombre] = useState(
    () => loadOperadorPerfil().nombre
  );
  const [reportanteRut, setReportanteRut] = useState(
    () => loadOperadorPerfil().rut
  );
  const [clienteObra, setClienteObra] = useState("");
  const [ubicacionFaena, setUbicacionFaena] = useState("");
  const [panasSeleccionadas, setPanasSeleccionadas] = useState<string[]>([]);
  const [otraPana, setOtraPana] = useState("");
  const [fotoNombre, setFotoNombre] = useState("");
  const [fotoBase64, setFotoBase64] = useState("");
  const [motivoVerificado, setMotivoVerificado] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState("");

  const [ultimoReporte, setUltimoReporte] = useState<{
    codigo: string;
    nombre: string;
    folio: string;
    reportante: string;
    rut: string;
    cliente: string;
    ubicacion: string;
    fallas: string;
    estado: "PENDIENTE" | "APROBADA";
  } | null>(null);

  const equiposFiltrados = useMemo(() => {
    if (!busquedaMaq.trim()) return equipos;
    const q = busquedaMaq.trim().toLowerCase();
    return equipos.filter(
      (e) =>
        e.codigo.toLowerCase().includes(q) ||
        e.nombre.toLowerCase().includes(q) ||
        e.categoria.toLowerCase().includes(q)
    );
  }, [equipos, busquedaMaq]);

  const maq = useMemo(() => {
    return (
      equipos.find((e) => e.codigo === equipoActivo) ||
      equiposFiltrados[0] ||
      equipos[0]
    );
  }, [equipos, equipoActivo, equiposFiltrados]);

  useEffect(() => {
    if (maq) {
      setPanasSeleccionadas([]);
      setOtraPana("");
      setErrorValidacion("");
      if (maq.en_arriendo === 1 && maq.cliente_actual) {
        setClienteObra(maq.cliente_actual);
        setUbicacionFaena(maq.ubicacion_actual || "");
      } else {
        setClienteObra("");
        setUbicacionFaena("");
      }
    }
  }, [maq?.codigo, maq?.en_arriendo, maq?.cliente_actual, maq?.ubicacion_actual]);

  const emergenciasPendientes = useMemo(
    () => emergencias.filter((e) => e.estado === "PENDIENTE"),
    [emergencias]
  );

  const solicitudActivaMaq = useMemo(() => {
    if (!maq) return undefined;
    return emergencias.find(
      (e) => e.codigo_equipo === maq.codigo && e.estado === "PENDIENTE"
    );
  }, [emergencias, maq]);

  const maquinaBloqueadaAntiSpam = useMemo(() => {
    if (!maq) return false;
    return (
      Boolean(solicitudActivaMaq) ||
      maq.estado_operativo === ESTADO_PRE_ALERTA ||
      maq.estado_operativo === ESTADO_EN_PANA ||
      Number(maq.falla_activa) === 1
    );
  }, [maq, solicitudActivaMaq]);

  const rutCheck = useMemo(() => {
    if (!reportanteRut.trim()) return null;
    return validarRutChileno(reportanteRut);
  }, [reportanteRut]);

  const reportesRecientesRut = useMemo(() => {
    const rutNorm = normalizarRut(reportanteRut);
    if (!rutNorm) return 0;
    const ahoraMs = Date.now();
    const VENTANA_15_MIN = 15 * 60 * 1000;
    return emergencias.filter((em) => {
      if (normalizarRut(em.reportante_rut) !== rutNorm) return false;
      const ms = Number(em.created_at_ms) || 0;
      return ms > 0 && ahoraMs - ms <= VENTANA_15_MIN;
    }).length;
  }, [emergencias, reportanteRut]);

  const resumenFallasActual = useMemo(() => {
    const todas = [...panasSeleccionadas];
    if (otraPana.trim()) {
      todas.push(`Otra: ${otraPana.trim()}`);
    }
    return todas.length > 0
      ? todas.join(" | ")
      : maq?.panas_reportadas || "Pendiente especificar falla";
  }, [panasSeleccionadas, otraPana, maq?.panas_reportadas]);

  const rutEnLimiteSpam = reportesRecientesRut >= 2;

  if (!maq) {
    return null;
  }

  const listaPanasCategoria =
    PANAS_POR_CATEGORIA[maq.categoria] ||
    PANAS_POR_CATEGORIA["Maquinaria con Horómetro"] ||
    [];

  const togglePana = (pana: string) => {
    setPanasSeleccionadas((prev) =>
      prev.includes(pana) ? prev.filter((p) => p !== pana) : [...prev, pana]
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFotoNombre("");
      setFotoBase64("");
      return;
    }
    setFotoNombre(file.name);
    try {
      const compressed = await compressImageBase64(file, 1280, 0.78);
      setFotoBase64(compressed);
    } catch {
      setErrorValidacion("No se pudo procesar la fotografía adjunta.");
      setFotoNombre("");
      setFotoBase64("");
    }
  };

  const tieneFallaMarcada =
    panasSeleccionadas.length > 0 || Boolean(otraPana.trim());
  const tieneRespaldoVerificado = Boolean(fotoBase64) || motivoVerificado;
  const cumplePrimeraFirma =
    Boolean(reportanteNombre.trim()) &&
    Boolean(rutCheck?.valido) &&
    tieneFallaMarcada &&
    tieneRespaldoVerificado;

  const handleSolicitarEmergencia = async () => {
    setErrorValidacion("");
    if (!reportanteNombre.trim() || !reportanteRut.trim()) {
      setErrorValidacion(
        "Debes ingresar tu Nombre y RUT para enviar el reporte."
      );
      return;
    }
    if (!rutCheck?.valido) {
      setErrorValidacion(
        rutCheck?.error || "El RUT ingresado no es válido."
      );
      return;
    }
    if (!tieneFallaMarcada) {
      setErrorValidacion(
        "Debes marcar al menos una falla de la lista o describirla."
      );
      return;
    }
    if (!tieneRespaldoVerificado) {
      setErrorValidacion(
        "Adjunta una fotografía de la falla o marca la casilla de confirmación."
      );
      return;
    }

    const currentPerfil = loadOperadorPerfil();
    saveOperadorPerfil({
      ...currentPerfil,
      nombre: reportanteNombre.trim(),
      rut: rutCheck.formateado,
    });

    setSubmitting(true);
    try {
      const res = await submitFieldMutation<{ folio?: string }>(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/pana-fulminante`,
        {
          reportante_nombre: reportanteNombre.trim(),
          reportante_rut: rutCheck.formateado,
          cliente_obra: clienteObra.trim(),
          ubicacion_faena: ubicacionFaena.trim(),
          panas_seleccionadas: panasSeleccionadas,
          otra_pana: otraPana.trim(),
          foto_base64: fotoBase64 || undefined,
          foto_nombre: fotoNombre || undefined,
          motivo_verificado: motivoVerificado,
        },
        `Pre-Alerta Emergencia ${maq.codigo}`
      );

      if (!res.ok) {
        setErrorValidacion(res.data?.error || "Error al registrar solicitud.");
        await onRefresh({
          type: "error",
          text: res.data?.error || "Error al registrar solicitud de emergencia.",
        });
      } else {
        setUltimoReporte({
          codigo: maq.codigo,
          nombre: maq.nombre,
          folio: res.data?.folio || (res.queuedOffline ? "EN-COLA" : "EMG-ACTIVA"),
          reportante: reportanteNombre.trim(),
          rut: rutCheck.formateado,
          cliente: clienteObra.trim() || "Por confirmar",
          ubicacion: ubicacionFaena.trim() || "En faena",
          fallas: resumenFallasActual,
          estado: "PENDIENTE",
        });
        setFotoBase64("");
        setFotoNombre("");
        setMotivoVerificado(false);
        await onRefresh({
          type: "warning",
          text:
            res.data?.message ||
            "Pre-Alerta Amarilla registrada correctamente.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const repParaWsp =
    reportanteNombre.trim() || ultimoReporte?.reportante || "Operador Terreno";
  const rutParaWsp =
    rutCheck?.formateado || reportanteRut.trim() || ultimoReporte?.rut || "S/I";
  const clienteParaWsp =
    clienteObra.trim() || ultimoReporte?.cliente || "Por confirmar en terreno";
  const ubicacionParaWsp =
    ubicacionFaena.trim() || ultimoReporte?.ubicacion || "En faena";
  const fallasParaWsp = ultimoReporte?.fallas || resumenFallasActual;

  const mensajeWsp = [
    `SOLICITUD DE EMERGENCIA EN TERRENO (DOBLE AUTORIZACIÓN)`,
    `• Máquina: ${maq.codigo} (${maq.nombre} - ${maq.categoria})`,
    `• Reportante (1ra Firma): ${repParaWsp} (RUT: ${rutParaWsp})`,
    `• Cliente / Obra: ${clienteParaWsp}`,
    `• Ubicación: ${ubicacionParaWsp}`,
    `• Falla reportada: ${fallasParaWsp}`,
    ultimoReporte?.folio
      ? `• Folio Emergencia: ${ultimoReporte.folio} (En Pre-Alerta Amarilla esperando 2da firma de Jefatura)`
      : `• Estado: Solicitud de Pre-Alerta Amarilla para validación de Jefatura`,
  ]
    .filter(Boolean)
    .join("\n");

  const urlWhatsapp = telefonoTaller
    ? `https://wa.me/${telefonoTaller}?text=${encodeURIComponent(mensajeWsp)}`
    : "";

  return (
    <div className="space-y-5">
      {/* BANNER CORTO Y CLARO */}
      <div className="bg-[#0F172A] border border-amber-500/50 rounded-xl p-4 text-white flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-300 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm md:text-base font-extrabold text-white">
              Reportar Falla de Máquina en Terreno
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Tu reporte deja la máquina <strong className="text-amber-300">en espera de revisión</strong>. Jefatura confirma el ingreso a Taller.
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 px-3.5 py-2 rounded-lg text-xs font-mono shrink-0 flex items-center gap-3">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase">
              En espera de Jefatura
            </span>
            <span className="text-amber-400 font-bold text-sm tabular-nums">
              {emergenciasPendientes.length} pendiente(s)
            </span>
          </div>
          {isJefe && onNavigateJefatura && (
            <button
              type="button"
              onClick={onNavigateJefatura}
              className="px-2.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] uppercase tracking-wider cursor-pointer whitespace-nowrap"
            >
              Ir a Jefatura
            </button>
          )}
        </div>
      </div>

      {/* AVISO SI LA MÁQUINA YA FUE REPORTADA */}
      {solicitudActivaMaq && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm text-amber-950">
                Esta máquina ya fue reportada ({solicitudActivaMaq.folio})
              </div>
              <p className="text-amber-900 mt-0.5">
                Reportada por <strong>{solicitudActivaMaq.reportante_nombre}</strong> el{" "}
                {solicitudActivaMaq.fecha_solicitud}. Está esperando confirmación en el{" "}
                <strong>Panel de Jefatura</strong>.
              </p>
            </div>
          </div>
          {isJefe && onNavigateJefatura && (
            <button
              type="button"
              onClick={onNavigateJefatura}
              className="px-3 py-2 rounded-lg bg-[#78350F] hover:bg-amber-900 text-white font-bold text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap shrink-0"
            >
              Revisar en Jefatura
            </button>
          )}
        </div>
      )}

      {/* 1. MÁQUINA AFECTADA */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
        <div className="bg-[#0F172A] text-white px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-[#38BDF8]" />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              1. ¿Qué máquina falló?
            </h3>
          </div>
          <span className="text-xs text-slate-300 font-mono">
            {maq.codigo} · {maq.categoria} · {cleanSemaforoLabel(maq.semaforo)}
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50/60">
          <div className="md:col-span-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Buscar código o nombre
            </label>
            <input
              type="text"
              value={busquedaMaq}
              onChange={(e) => setBusquedaMaq(e.target.value)}
              placeholder="Ej: RV-0001, Honda, Placa..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
            />
          </div>

          <div className="md:col-span-8">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Máquina con falla
            </label>
            <select
              value={maq.codigo}
              onChange={(e) => {
                setEquipoActivo(e.target.value);
                setUltimoReporte(null);
              }}
              className="w-full rounded-lg border-2 border-[#0284C7] bg-white px-3 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
            >
              {equiposFiltrados.length === 0 ? (
                <option value={maq.codigo}>
                  Sin resultados para "{busquedaMaq}" — manteniendo {maq.codigo}
                </option>
              ) : (
                equiposFiltrados.slice(0, 500).map((item) => (
                  <option key={item.codigo} value={item.codigo}>
                    {item.codigo} — {item.nombre} [{item.categoria}] ·{" "}
                    {cleanSemaforoLabel(item.semaforo)}
                    {item.en_arriendo === 1 && item.cliente_actual
                      ? ` · En Obra: ${item.cliente_actual}`
                      : ""}
                  </option>
                ))
              )}
            </select>
            {equiposFiltrados.length === 0 && (
              <p className="text-xs text-amber-800 font-semibold mt-1">
                Ninguna máquina coincide con "{busquedaMaq}".{" "}
                <button
                  type="button"
                  onClick={() => setBusquedaMaq("")}
                  className="underline font-bold cursor-pointer"
                >
                  Limpiar búsqueda
                </button>
              </p>
            )}
          </div>
        </div>

        {(maq.en_arriendo === 1 || maquinaBloqueadaAntiSpam) && (
          <div className="px-5 pb-4 pt-1 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 border-t border-slate-200 text-xs">
            {maq.en_arriendo === 1 && maq.cliente_actual ? (
              <span className="text-sky-900 font-semibold">
                En obra con <strong>{maq.cliente_actual}</strong>
                {maq.ubicacion_actual ? ` · ${maq.ubicacion_actual}` : ""}
              </span>
            ) : (
              <span className="text-slate-600">Ubicación actual: En Patio</span>
            )}

            {maquinaBloqueadaAntiSpam && (
              <span className="text-red-800 font-bold">
                {solicitudActivaMaq || maq.estado_operativo === ESTADO_PRE_ALERTA
                  ? `Ya reportada (${
                      solicitudActivaMaq?.folio || "en espera"
                    }) por ${
                      solicitudActivaMaq?.reportante_nombre || "terreno"
                    } · esperando confirmación de Jefatura.`
                  : "Esta máquina ya está en Taller (En Pana). No necesita un reporte nuevo."}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. QUÉ LE PASA + FOTO */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
        <div className="bg-[#0F172A] text-white px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              2. ¿Qué problema tiene? ({maq.categoria}) *
            </h3>
          </div>
          <span className="text-xs font-mono text-amber-300 tabular-nums">
            {panasSeleccionadas.length} marcada(s)
          </span>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {listaPanasCategoria.map((pana) => {
              const checked = panasSeleccionadas.includes(pana);
              return (
                <label
                  key={pana}
                  className={`flex items-start gap-2.5 p-3.5 rounded-lg border text-xs md:text-sm font-semibold cursor-pointer transition-colors ${
                    checked
                      ? "bg-amber-50 border-amber-500 text-amber-950"
                      : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePana(pana)}
                    className="mt-0.5 rounded border-slate-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span>{pana}</span>
                </label>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5 text-amber-700" />
              <span>Otro problema o síntoma (opcional si marcaste arriba):</span>
            </label>
            <input
              type="text"
              value={otraPana}
              onChange={(e) => setOtraPana(e.target.value)}
              placeholder="Ej: Se detuvo con humo negro, golpe en acople..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-slate-600" />
                <span>Foto de la falla *:</span>
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={handlePhotoUpload}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-2.5 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300 cursor-pointer"
              />
              {fotoNombre && (
                <p className="text-[11px] text-emerald-700 font-mono mt-1 truncate">
                  Foto adjunta: {fotoNombre}
                </p>
              )}
            </div>

            <div className="flex items-center">
              <label
                className={`w-full flex items-start gap-2.5 p-3 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                  motivoVerificado
                    ? "bg-amber-50 border-amber-500 text-amber-950"
                    : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={motivoVerificado}
                  onChange={(e) => setMotivoVerificado(e.target.checked)}
                  className="mt-0.5 rounded border-slate-400 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  No puedo adjuntar foto ahora: confirmo que revisé la falla en
                  terreno.
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* 3. QUIÉN REPORTA */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
        <div className="bg-[#0F172A] text-white px-5 py-3 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              3. ¿Quién reporta y dónde está la máquina?
            </h3>
          </div>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Tu Nombre y Apellido *
              </label>
              <input
                type="text"
                value={reportanteNombre}
                onChange={(e) => setReportanteNombre(e.target.value)}
                placeholder="Ej: Juan Pérez"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Tu RUT *
              </label>
              <input
                type="text"
                autoCapitalize="characters"
                value={reportanteRut}
                onChange={(e) => setReportanteRut(e.target.value)}
                placeholder="Ej: 15.432.198-K"
                className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm font-mono text-slate-900 focus:outline-none ${
                  rutCheck
                    ? rutCheck.valido
                      ? "border-emerald-500 focus:border-emerald-600"
                      : "border-red-500 focus:border-red-600"
                    : "border-slate-300 focus:border-[#0284C7]"
                }`}
              />
              {rutCheck && (
                <span
                  className={`block text-[11px] font-mono mt-1 ${
                    rutCheck.valido ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {rutCheck.valido
                    ? `RUT válido: ${rutCheck.formateado}`
                    : rutCheck.error}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#0284C7]" />
                <span>Cliente / Obra:</span>
              </label>
              <input
                type="text"
                value={clienteObra}
                onChange={(e) => setClienteObra(e.target.value)}
                placeholder="Ej: Constructora Austral"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-red-600" />
                <span>Ubicación en terreno:</span>
              </label>
              <input
                type="text"
                value={ubicacionFaena}
                onChange={(e) => setUbicacionFaena(e.target.value)}
                placeholder="Ej: Sector Las Ánimas Km 4"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. ENVIAR REPORTE */}
      <div className="bg-[#0F172A] border-2 border-amber-500 rounded-xl p-5 text-white shadow-xs space-y-4">
        {rutEnLimiteSpam && (
          <div className="bg-red-950/90 border border-red-500 rounded-lg p-3 text-xs text-red-200 flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              Ya enviaste {reportesRecientesRut} reportes en los últimos 15
              minutos. Espera unos minutos o llama al taller.
            </span>
          </div>
        )}

        {errorValidacion && (
          <div className="bg-red-950/90 border border-red-500 rounded-lg p-3 text-xs text-red-200 flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorValidacion}</span>
          </div>
        )}

        <div className="sticky bottom-3 z-20 bg-[#0F172A]/95 pt-2 space-y-3">
          <button
            type="button"
            disabled={
              submitting || maquinaBloqueadaAntiSpam || rutEnLimiteSpam
            }
            onClick={handleSolicitarEmergencia}
            className={`w-full min-h-[56px] py-4 px-4 rounded-xl font-extrabold text-sm md:text-base flex items-center justify-center gap-2.5 transition-all ${
              maquinaBloqueadaAntiSpam || rutEnLimiteSpam
                ? "bg-slate-700 text-slate-300 cursor-not-allowed"
                : cumplePrimeraFirma
                ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg cursor-pointer"
                : "bg-slate-800 hover:bg-slate-700 border border-amber-400/50 text-amber-200 cursor-pointer"
            }`}
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>
              {submitting
                ? "Enviando reporte..."
                : maquinaBloqueadaAntiSpam
                ? solicitudActivaMaq
                  ? `Ya reportada por ${solicitudActivaMaq.reportante_nombre} · esperando a Jefatura`
                  : "Máquina ya en Taller (En Pana)"
                : rutEnLimiteSpam
                ? "Espera unos minutos antes de otro reporte"
                : `Enviar Reporte de Falla (${maq.codigo})`}
            </span>
          </button>

          {(ultimoReporte || solicitudActivaMaq) && urlWhatsapp && (
            <a
              href={urlWhatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full min-h-[52px] rounded-xl bg-[#047857] hover:bg-[#065F46] border border-emerald-400/40 text-white font-bold py-3.5 px-4 text-sm shadow-xs transition-colors"
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span>Avisar también por WhatsApp a Jefatura</span>
            </a>
          )}
        </div>

        {ultimoReporte && (
          <div className="bg-amber-950/90 border border-amber-400/60 rounded-lg p-3.5 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Reporte enviado ({ultimoReporte.folio}):</strong> La
                máquina{" "}
                <strong className="font-mono">{ultimoReporte.codigo}</strong>{" "}
                quedó en espera de confirmación de Jefatura.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
