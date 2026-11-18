import React, { useState, useEffect } from "react";
import {
  PANAS_POR_CATEGORIA,
  DANOS_FISICOS,
  ESTADO_DISPONIBLE,
  hoySantiagoISO,
  validarRutChileno,
  type Equipo,
} from "../../data/catalogs";
import { compressImageBase64, submitFieldMutation } from "../../lib/apiClient";
import {
  loadOperadorPerfil,
  saveOperadorPerfil,
} from "../../lib/operadorPerfil";
import {
  ClipboardCheck,
  Truck,
  OctagonAlert,
  Building2,
  MapPin,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Save,
  CalendarClock,
  FileText,
  AlertTriangle,
} from "lucide-react";

interface RecepcionDespachoTabProps {
  maq: Equipo;
  estadoLimpio: string;
  defaultMode?: "recepcion" | "despacho" | null;
  onGoToTaller?: () => void;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
}

function sumarDiasISO(dias: number): string {
  const base = hoySantiagoISO();
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

export default function RecepcionDespachoTab({
  maq,
  estadoLimpio,
  defaultMode,
  onGoToTaller,
  onRefresh,
}: RecepcionDespachoTabProps) {
  const [modoTab1, setModoTab1] = useState<"recepcion" | "despacho">(
    defaultMode || (maq.en_arriendo === 1 ? "recepcion" : "despacho")
  );
  const [submitting, setSubmitting] = useState(false);

  // Despacho a Obra
  const [clienteDespacho, setClienteDespacho] = useState("");
  const [clienteRutDespacho, setClienteRutDespacho] = useState("");
  const [ubicacionDespacho, setUbicacionDespacho] = useState("");
  const [guiaDespacho, setGuiaDespacho] = useState("");
  const [fechaRetornoEst, setFechaRetornoEst] = useState("");
  const [responsableDespacho, setResponsableDespacho] = useState(
    () => loadOperadorPerfil().nombre
  );
  const [horometroDespacho, setHorometroDespacho] = useState<string>(
    String(Number(maq.horometro_actual) || 0)
  );
  const [obsDespacho, setObsDespacho] = useState("");

  // Recepción en Patio
  const [responsableRec, setResponsableRec] = useState(
    () => loadOperadorPerfil().nombre
  );
  const [usoNuevoDias, setUsoNuevoDias] = useState<string>(
    maq.en_arriendo === 1 && Number(maq.dias_en_arriendo) > 0
      ? String(Number(maq.dias_en_arriendo))
      : ""
  );
  const [nuevoHorometro, setNuevoHorometro] = useState<string>("");
  const [fotoNombre, setFotoNombre] = useState("");
  const [fotoBase64, setFotoBase64] = useState("");
  const [estadoLlegada, setEstadoLlegada] = useState<
    "OPERATIVA" | "EN_PANA" | "PRESUPUESTO"
  >("OPERATIVA");
  const [panasRec, setPanasRec] = useState<string[]>([]);
  const [danosRec, setDanosRec] = useState<string[]>([]);
  const [mostrarPanasEnDano, setMostrarPanasEnDano] = useState(false);
  const [otraPanaRec, setOtraPanaRec] = useState("");
  const [responsableDano, setResponsableDano] = useState("Por definir");
  const [prioridadDano, setPrioridadDano] = useState(
    "Alta (se necesita pronto)"
  );
  const [confirmaSinPana, setConfirmaSinPana] = useState(false);
  const [obsAdicionalRec, setObsAdicionalRec] = useState("");

  useEffect(() => {
    if (defaultMode) {
      setModoTab1(defaultMode);
    }
  }, [defaultMode]);

  useEffect(() => {
    const perfilNombre = loadOperadorPerfil().nombre;
    setModoTab1(
      defaultMode || (maq.en_arriendo === 1 ? "recepcion" : "despacho")
    );
    setClienteDespacho("");
    setClienteRutDespacho("");
    setUbicacionDespacho("");
    setGuiaDespacho("");
    setFechaRetornoEst("");
    setResponsableDespacho(perfilNombre);
    setHorometroDespacho(String(Number(maq.horometro_actual) || 0));
    setObsDespacho("");

    setResponsableRec(perfilNombre);
    setUsoNuevoDias(
      maq.en_arriendo === 1 && Number(maq.dias_en_arriendo) > 0
        ? String(Number(maq.dias_en_arriendo))
        : ""
    );
    setNuevoHorometro("");
    setFotoNombre("");
    setFotoBase64("");
    setEstadoLlegada("OPERATIVA");
    setPanasRec([]);
    setDanosRec([]);
    setMostrarPanasEnDano(false);
    setOtraPanaRec("");
    setResponsableDano("Por definir");
    setPrioridadDano("Alta (se necesita pronto)");
    setConfirmaSinPana(false);
    setObsAdicionalRec(
      maq.en_arriendo === 1 && maq.cliente_actual
        ? `Retorno desde obra: ${maq.cliente_actual}${
            maq.ubicacion_actual ? ` (${maq.ubicacion_actual})` : ""
          }`
        : ""
    );
  }, [
    maq.codigo,
    maq.fecha_actualizacion,
    maq.estado_operativo,
    maq.en_arriendo,
    maq.cliente_actual,
    maq.ubicacion_actual,
    maq.horometro_actual,
    maq.dias_en_arriendo,
  ]);

  const catMaq = maq.categoria;
  const listaPanasCat =
    PANAS_POR_CATEGORIA[catMaq] ||
    PANAS_POR_CATEGORIA["Maquinaria con Horómetro"];

  const tieneFallaAbierta =
    Number(maq.falla_activa) === 1 ||
    maq.estado_operativo !== ESTADO_DISPONIBLE;
  const bloqueaGuardarOperativa =
    estadoLlegada === "OPERATIVA" && tieneFallaAbierta && !confirmaSinPana;

  const bloqueoDespachoPorEstado =
    maq.en_arriendo === 1 ||
    maq.estado_operativo !== ESTADO_DISPONIBLE ||
    Number(maq.falla_activa) === 1;

  const rutDespachoCheck = clienteRutDespacho.trim()
    ? validarRutChileno(clienteRutDespacho)
    : null;

  const horometroActualNum = Number(maq.horometro_actual) || 0;
  const nuevoHorometroNum =
    nuevoHorometro.trim() === "" ? NaN : Number(nuevoHorometro);
  const horometroRecInvalido =
    maq.tipo_medicion === "HORAS" &&
    (Number.isNaN(nuevoHorometroNum) || nuevoHorometroNum < horometroActualNum);

  const usoNuevoDiasNum =
    usoNuevoDias.trim() === "" ? NaN : Number(usoNuevoDias);
  const diasRecInvalido =
    maq.tipo_medicion === "DIAS" &&
    (Number.isNaN(usoNuevoDiasNum) || usoNuevoDiasNum < 0 || usoNuevoDiasNum > 365);

  const horometroDespachoNum =
    horometroDespacho.trim() === "" ? NaN : Number(horometroDespacho);
  const horometroDespachoInvalido =
    maq.tipo_medicion === "HORAS" &&
    (Number.isNaN(horometroDespachoNum) ||
      horometroDespachoNum < horometroActualNum);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFotoNombre("");
      setFotoBase64("");
      return;
    }
    setFotoNombre(file.name);
    try {
      const compressed = await compressImageBase64(file);
      setFotoBase64(compressed);
    } catch {
      setFotoNombre("");
      setFotoBase64("");
      await onRefresh({
        type: "error",
        text: "No se pudo procesar la fotografía seleccionada.",
      });
    }
  };

  const persistPatioNombre = (nom: string) => {
    const clean = nom.trim();
    if (!clean) return;
    const current = loadOperadorPerfil();
    saveOperadorPerfil({
      ...current,
      nombre: clean,
    });
  };

  const handleGuardarRecepcion = async () => {
    if (maq.tipo_medicion === "HORAS" && horometroRecInvalido) {
      await onRefresh({
        type: "error",
        text: `Ingresa el horómetro de llegada (debe ser mayor o igual a ${horometroActualNum} hrs).`,
      });
      return;
    }
    if (maq.tipo_medicion === "DIAS" && diasRecInvalido) {
      await onRefresh({
        type: "error",
        text: "Ingresa los días de uso a sumar (entre 0 y 365).",
      });
      return;
    }

    const respClean = responsableRec.trim() || "Patio";
    persistPatioNombre(responsableRec);

    setSubmitting(true);
    try {
      const usoSumar =
        maq.tipo_medicion === "DIAS"
          ? Math.floor(usoNuevoDiasNum)
          : Math.max(0, Math.floor(nuevoHorometroNum) - horometroActualNum);

      const res = await submitFieldMutation(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/recepcion`,
        {
          responsable_rec: respClean,
          uso_nuevo: usoSumar,
          nuevo_horometro:
            maq.tipo_medicion === "HORAS"
              ? Math.floor(nuevoHorometroNum)
              : maq.horometro_actual,
          estado_llegada: estadoLlegada,
          panas_seleccionadas: estadoLlegada === "OPERATIVA" ? [] : panasRec,
          danos_seleccionados: estadoLlegada === "PRESUPUESTO" ? danosRec : [],
          otra_pana: estadoLlegada === "OPERATIVA" ? "" : otraPanaRec,
          responsable_dano: responsableDano,
          prioridad_dano: prioridadDano,
          obs_adicional: obsAdicionalRec,
          foto_base64: fotoBase64 || undefined,
          foto_nombre: fotoNombre || undefined,
        },
        `Recepción ${maq.codigo}`
      );

      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data.error || "No se pudo registrar la recepción.",
        });
      } else {
        await onRefresh({
          type: res.queuedOffline ? "warning" : "success",
          text: res.data.message || "Recepción registrada.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDespacharObra = async () => {
    if (!clienteDespacho.trim()) {
      await onRefresh({
        type: "error",
        text: "Debes ingresar el Cliente / Empresa u Obra de destino para registrar la salida.",
      });
      return;
    }
    if (rutDespachoCheck && !rutDespachoCheck.valido) {
      await onRefresh({
        type: "error",
        text: `RUT del cliente inválido: ${rutDespachoCheck.error}`,
      });
      return;
    }
    if (horometroDespachoInvalido) {
      await onRefresh({
        type: "error",
        text: `El horómetro de salida no puede ser menor al actual (${horometroActualNum} hrs).`,
      });
      return;
    }

    const respClean = responsableDespacho.trim() || "Patio";
    persistPatioNombre(responsableDespacho);

    setSubmitting(true);
    try {
      const res = await submitFieldMutation(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/despacho`,
        {
          cliente_obra: clienteDespacho.trim(),
          cliente_rut: rutDespachoCheck?.formateado || "",
          ubicacion_faena: ubicacionDespacho.trim(),
          guia_despacho: guiaDespacho.trim(),
          fecha_retorno_estimada: fechaRetornoEst.trim(),
          responsable_despacho: respClean,
          horometro_salida:
            maq.tipo_medicion === "HORAS"
              ? Math.floor(horometroDespachoNum)
              : undefined,
          observacion: obsDespacho.trim(),
        },
        `Despacho ${maq.codigo} -> ${clienteDespacho.trim()}`
      );

      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data.error || "No se pudo registrar el despacho a obra.",
        });
      } else {
        setModoTab1("recepcion");
        await onRefresh({
          type: res.queuedOffline ? "warning" : "success",
          text: res.data.message || "Despacho registrado.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* SELECTOR DE FLUJO: RECEPCIÓN VS DESPACHO A ARRIENDO */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-300 rounded-xl p-2 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setModoTab1("recepcion")}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs md:text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap min-h-[44px] ${
              modoTab1 === "recepcion"
                ? "bg-[#064E3B] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span>Llega de Obra (Recibir en Patio)</span>
          </button>
          <button
            type="button"
            onClick={() => setModoTab1("despacho")}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs md:text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap min-h-[44px] ${
              modoTab1 === "despacho"
                ? "bg-[#0C4A6E] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <Truck className="w-4 h-4 shrink-0" />
            <span>Sale a Obra (Despachar)</span>
          </button>
        </div>
        <span className="text-xs font-mono text-slate-600 px-2">
          {maq.en_arriendo === 1 && maq.cliente_actual
            ? `En obra: ${maq.cliente_actual}${
                maq.arriendo_vencido
                  ? ` (ATRASO ${maq.dias_atraso}d)`
                  : maq.fecha_retorno_estimada
                  ? ` (Retorno est. ${maq.fecha_retorno_estimada})`
                  : ""
              }`
            : "En Patio (Disponible)"}
        </span>
      </div>

      {modoTab1 === "despacho" ? (
        <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
          <div className="bg-[#0C4A6E] text-white px-6 py-3.5 border-b border-sky-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-sky-300" />
              <h4 className="text-sm font-bold uppercase tracking-wider">
                Despachar a Obra — {maq.codigo}
              </h4>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {bloqueoDespachoPorEstado && (
              <div className="rounded-xl bg-red-50 border-2 border-red-400 p-4 text-xs md:text-sm font-bold text-red-950 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <OctagonAlert className="w-5 h-5 text-red-600 shrink-0" />
                  <span>
                    {maq.en_arriendo === 1
                      ? `${maq.codigo} ya está en obra con ${
                          maq.cliente_actual || "un cliente"
                        }. Primero recíbela en patio.`
                      : `No se puede despachar: la máquina está en ${estadoLimpio}.`}
                  </span>
                </div>
                {maq.en_arriendo === 1 ? (
                  <button
                    type="button"
                    onClick={() => setModoTab1("recepcion")}
                    className="px-3.5 py-2 rounded-lg bg-[#064E3B] hover:bg-[#047857] text-white text-xs font-extrabold uppercase cursor-pointer shrink-0"
                  >
                    Ir a Recibir en Patio
                  </button>
                ) : (
                  onGoToTaller && (
                    <button
                      type="button"
                      onClick={onGoToTaller}
                      className="px-3.5 py-2 rounded-lg bg-red-800 hover:bg-red-900 text-white text-xs font-extrabold uppercase cursor-pointer shrink-0"
                    >
                      Ir a Reparación
                    </button>
                  )
                )}
              </div>
            )}

            {/* CAMPOS ESENCIALES VISIBLES */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#0284C7]" />
                  <span>Cliente / Empresa u Obra *</span>
                </label>
                <input
                  type="text"
                  value={clienteDespacho}
                  onChange={(e) => setClienteDespacho(e.target.value)}
                  placeholder="Ej: Constructora Austral — Costanera"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Fecha Estimada de Retorno</span>
                </label>
                <input
                  type="date"
                  min={hoySantiagoISO()}
                  value={fechaRetornoEst}
                  onChange={(e) => setFechaRetornoEst(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-mono min-h-[44px]"
                />
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {[
                    { label: "+7 días", dias: 7 },
                    { label: "+15 días", dias: 15 },
                    { label: "+30 días", dias: 30 },
                  ].map((b) => {
                    const iso = sumarDiasISO(b.dias);
                    const active = fechaRetornoEst === iso;
                    return (
                      <button
                        key={b.dias}
                        type="button"
                        onClick={() => setFechaRetornoEst(iso)}
                        className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border cursor-pointer transition-colors ${
                          active
                            ? "bg-[#0C4A6E] text-white border-[#0C4A6E]"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                        }`}
                      >
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {maq.tipo_medicion === "HORAS" && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Horómetro de Salida (Actual: {maq.horometro_actual} hrs):
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={maq.horometro_actual}
                    value={horometroDespacho}
                    onChange={(e) => setHorometroDespacho(e.target.value)}
                    placeholder={`Mín. ${maq.horometro_actual}`}
                    className={`w-full rounded-lg border px-3 py-2.5 text-sm font-mono tabular-nums min-h-[44px] ${
                      horometroDespachoInvalido
                        ? "border-red-500 bg-red-50/40"
                        : "border-slate-300"
                    }`}
                  />
                  {horometroDespachoInvalido && (
                    <p className="text-[11px] text-red-700 font-semibold mt-1">
                      Debe ser igual o mayor a {maq.horometro_actual} hrs.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* OPCIONALES PLEGADOS */}
            <details className="group rounded-xl border border-slate-300 bg-slate-50/80 overflow-hidden">
              <summary className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 cursor-pointer select-none flex items-center justify-between list-none hover:bg-slate-100 min-h-[44px]">
                <span>
                  Más datos de despacho (guía, RUT, ubicación, responsable, notas)
                </span>
                <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-600" />
                      <span>N° Guía de Despacho</span>
                    </label>
                    <input
                      type="text"
                      value={guiaDespacho}
                      onChange={(e) => setGuiaDespacho(e.target.value)}
                      placeholder="Ej: GD-00482"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      RUT Cliente / Empresa
                    </label>
                    <input
                      type="text"
                      value={clienteRutDespacho}
                      onChange={(e) => setClienteRutDespacho(e.target.value)}
                      placeholder="Ej: 76.543.210-K"
                      className={`w-full rounded-lg border px-3 py-2 text-sm font-mono ${
                        rutDespachoCheck && !rutDespachoCheck.valido
                          ? "border-red-500 bg-red-50/40"
                          : rutDespachoCheck?.valido
                          ? "border-emerald-500 bg-emerald-50/30"
                          : "border-slate-300"
                      }`}
                    />
                    {rutDespachoCheck && !rutDespachoCheck.valido && (
                      <p className="text-[11px] text-red-700 font-semibold mt-1">
                        {rutDespachoCheck.error}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-red-600" />
                      <span>Ubicación / Sector de Faena</span>
                    </label>
                    <input
                      type="text"
                      value={ubicacionDespacho}
                      onChange={(e) => setUbicacionDespacho(e.target.value)}
                      placeholder="Ej: Sector Las Ánimas Km 4, Valdivia"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Despachado por:
                    </label>
                    <input
                      type="text"
                      value={responsableDespacho}
                      onChange={(e) => setResponsableDespacho(e.target.value)}
                      placeholder="Tu nombre"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Accesorios / Notas de Entrega en Guía:
                  </label>
                  <textarea
                    rows={2}
                    value={obsDespacho}
                    onChange={(e) => setObsDespacho(e.target.value)}
                    placeholder="Ej: Se entrega con 2 discos de corte, estanque lleno y manual de operador..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </details>

            <div className="sticky bottom-3 z-20 pt-2">
              <button
                type="button"
                disabled={submitting || bloqueoDespachoPorEstado}
                onClick={handleDespacharObra}
                className="w-full min-h-[56px] flex items-center justify-center gap-2 rounded-xl bg-[#0C4A6E] hover:bg-[#0284C7] disabled:bg-slate-300 disabled:text-slate-500 text-white font-extrabold py-3.5 px-4 text-base shadow-lg transition-colors cursor-pointer"
              >
                <Truck className="w-5 h-5" />
                <span>
                  {clienteDespacho.trim()
                    ? `Despachar ${maq.codigo} a ${clienteDespacho.trim()}`
                    : `Despachar ${maq.codigo} a Obra`}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
          <div className="bg-[#064E3B] text-white px-6 py-3.5 border-b border-emerald-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-emerald-300" />
              <h4 className="text-sm font-bold uppercase tracking-wider">
                Recibir en Patio — {maq.codigo}
              </h4>
            </div>
            {maq.en_arriendo === 1 && maq.cliente_actual && (
              <span className="text-xs font-mono text-emerald-200">
                Vuelve de: {maq.cliente_actual}
                {maq.dias_en_arriendo ? ` · ${maq.dias_en_arriendo}d en obra` : ""}
              </span>
            )}
          </div>

          <div className="p-6 space-y-5">
            {maq.en_arriendo === 1 && maq.arriendo_vencido && (
              <div className="rounded-lg bg-red-50 border border-red-300 px-4 py-3 text-xs text-red-950 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>
                  Retorno atrasado por <strong>{maq.dias_atraso} días</strong> respecto a la fecha comprometida ({maq.fecha_retorno_estimada}).
                </span>
              </div>
            )}

            {/* 1. LECTURA DE LLEGADA + QUIÉN RECIBE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {maq.tipo_medicion === "DIAS" ? (
                  <>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      1. Días de uso a sumar *:
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={365}
                      value={usoNuevoDias}
                      onChange={(e) => setUsoNuevoDias(e.target.value)}
                      placeholder="Ej: 5"
                      className={`w-full rounded-lg border px-3 py-2.5 text-sm font-mono tabular-nums min-h-[44px] ${
                        usoNuevoDias.trim() !== "" && diasRecInvalido
                          ? "border-red-500 bg-red-50/40"
                          : "border-slate-300"
                      }`}
                    />
                  </>
                ) : (
                  <>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      1. Horómetro llegada * (Último: {maq.horometro_actual} hrs):
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={maq.horometro_actual}
                      value={nuevoHorometro}
                      onChange={(e) => setNuevoHorometro(e.target.value)}
                      placeholder={`Mín. ${maq.horometro_actual} hrs`}
                      className={`w-full rounded-lg border px-3 py-2.5 text-sm font-mono tabular-nums min-h-[44px] ${
                        nuevoHorometro.trim() !== "" && horometroRecInvalido
                          ? "border-red-500 bg-red-50/40"
                          : "border-slate-300"
                      }`}
                    />
                    {nuevoHorometro.trim() !== "" && horometroRecInvalido && (
                      <p className="text-[11px] text-red-700 font-semibold mt-1">
                        No puede ser menor a {maq.horometro_actual} hrs.
                      </p>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Recibido por:
                </label>
                <input
                  type="text"
                  value={responsableRec}
                  onChange={(e) => setResponsableRec(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm min-h-[44px]"
                />
              </div>
            </div>

            {/* 2. ESTADO DE LLEGADA */}
            <div>
              <label className="block text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-2">
                2. ¿Cómo llegó la máquina?
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    id: "OPERATIVA",
                    label: "Funciona bien (Queda disponible)",
                    led: "bg-emerald-500",
                    activeStyle:
                      "border-emerald-600 bg-emerald-50 text-emerald-950",
                  },
                  {
                    id: "EN_PANA",
                    label: "No funciona (Enviar a Taller)",
                    led: "bg-red-600",
                    activeStyle: "border-red-600 bg-red-50 text-red-950",
                  },
                  {
                    id: "PRESUPUESTO",
                    label: "Dañada o le faltan piezas (Presupuesto)",
                    led: "bg-purple-600",
                    activeStyle:
                      "border-purple-600 bg-purple-50 text-purple-950",
                  },
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer text-xs md:text-sm font-bold transition-all min-h-[52px] ${
                      estadoLlegada === opt.id
                        ? opt.activeStyle
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="estadoLlegada"
                      checked={estadoLlegada === opt.id}
                      onChange={() => setEstadoLlegada(opt.id as any)}
                      className="sr-only"
                    />
                    <span
                      className={`w-3 h-3 rounded-full shrink-0 ${opt.led}`}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {estadoLlegada !== "OPERATIVA" && (
              <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-[#0284C7]" />
                  <span>Foto de la falla o daño (Recomendado):</span>
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#0C4A6E] file:text-white hover:file:bg-[#0284C7]"
                />
                {fotoNombre && (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-1 truncate">
                    Foto adjunta: {fotoNombre}
                  </p>
                )}
              </div>
            )}

            {estadoLlegada === "EN_PANA" && (
              <div className="rounded-xl border-2 border-red-300 bg-red-50/40 p-4 space-y-3">
                <div>
                  <h5 className="text-sm font-bold text-red-950 uppercase tracking-wide">
                    ¿Qué falla presenta? — {catMaq}
                  </h5>
                  <p className="text-xs text-red-800">
                    Marca las fallas detectadas. Se enviará a Taller con Orden de Trabajo.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {listaPanasCat.map((pana) => {
                    const checked = panasRec.includes(pana);
                    return (
                      <label
                        key={pana}
                        className="flex items-start gap-2.5 p-3 rounded-lg bg-white border border-red-200 cursor-pointer text-xs text-slate-800 hover:border-red-400 min-h-[44px]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked)
                              setPanasRec([...panasRec, pana]);
                            else
                              setPanasRec(
                                panasRec.filter((item) => item !== pana)
                              );
                          }}
                          className="mt-0.5 accent-red-700"
                        />
                        <span>{pana}</span>
                      </label>
                    );
                  })}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Otra falla no listada:
                  </label>
                  <input
                    type="text"
                    value={otraPanaRec}
                    onChange={(e) => setOtraPanaRec(e.target.value)}
                    placeholder="Ej: ruido en rodamiento, corte irregular..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {estadoLlegada === "PRESUPUESTO" && (
              <div className="rounded-xl border-2 border-purple-300 bg-purple-50/40 p-4 space-y-4">
                <div>
                  <h5 className="text-sm font-bold text-purple-950 uppercase tracking-wide">
                    Daños o Piezas Faltantes Detectadas
                  </h5>
                  <p className="text-xs text-purple-800">
                    La máquina quedará retenida para evaluación de presupuesto.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {DANOS_FISICOS.map((dano) => {
                    const checked = danosRec.includes(dano);
                    return (
                      <label
                        key={dano}
                        className="flex items-start gap-2.5 p-3 rounded-lg bg-white border border-purple-200 cursor-pointer text-xs text-slate-800 hover:border-purple-400 min-h-[44px]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked)
                              setDanosRec([...danosRec, dano]);
                            else
                              setDanosRec(
                                danosRec.filter((item) => item !== dano)
                              );
                          }}
                          className="mt-0.5 accent-purple-700"
                        />
                        <span>{dano}</span>
                      </label>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Otro daño o pieza faltante:
                  </label>
                  <input
                    type="text"
                    value={otraPanaRec}
                    onChange={(e) => setOtraPanaRec(e.target.value)}
                    placeholder="Ej: carcasa trizada, llave portadisco faltante..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <details className="group rounded-lg border border-purple-200 bg-white overflow-hidden">
                  <summary className="px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer flex items-center justify-between list-none min-h-[44px]">
                    <span>
                      Opciones avanzadas (fallas mecánicas asociadas, responsabilidad, prioridad)
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="p-4 border-t border-slate-100 space-y-4">
                    <div>
                      <span className="block text-xs font-bold text-slate-700 mb-2">
                        Asociar también fallas mecánicas de {catMaq}:
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {listaPanasCat.map((pana) => {
                          const checked = panasRec.includes(pana);
                          return (
                            <label
                              key={pana}
                              className="flex items-start gap-2 p-2 rounded border border-slate-200 text-xs cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked)
                                    setPanasRec([...panasRec, pana]);
                                  else
                                    setPanasRec(
                                      panasRec.filter((item) => item !== pana)
                                    );
                                }}
                                className="mt-0.5 accent-purple-700"
                              />
                              <span>{pana}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Responsabilidad del daño:
                        </label>
                        <select
                          value={responsableDano}
                          onChange={(e) => setResponsableDano(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                          <option>Por definir</option>
                          <option>Cliente (daño en faena)</option>
                          <option>Desgaste normal (Rental)</option>
                          <option>Garantía de proveedor</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Prioridad de resolución:
                        </label>
                        <select
                          value={prioridadDano}
                          onChange={(e) => setPrioridadDano(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                          <option>Alta (se necesita pronto)</option>
                          <option>Media</option>
                          <option>Baja</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            )}

            {estadoLlegada === "OPERATIVA" && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-300 px-4 py-3 text-xs md:text-sm text-emerald-950 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Recepción estándar: el equipo vuelve a quedar disponible en patio sumando el uso del ciclo.
                </span>
              </div>
            )}

            {estadoLlegada === "OPERATIVA" && tieneFallaAbierta && (
              <div className="rounded-xl bg-amber-50 border-2 border-amber-400 p-4 space-y-2">
                <p className="text-xs md:text-sm text-amber-950 font-medium">
                  Atención: Esta unidad registra una falla activa (
                  <em>{maq.panas_reportadas || maq.ultima_observacion}</em>
                  ). Recibirla como operativa cerrará la falla sin pasar por
                  Taller.
                </p>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-amber-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmaSinPana}
                    onChange={(e) => setConfirmaSinPana(e.target.checked)}
                    className="accent-amber-700"
                  />
                  <span>Confirmo técnicamente que la falla ya no existe</span>
                </label>
              </div>
            )}

            <details className="group rounded-xl border border-slate-300 bg-slate-50/80 overflow-hidden">
              <summary className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 cursor-pointer select-none flex items-center justify-between list-none hover:bg-slate-100 min-h-[44px]">
                <span>
                  Observaciones o foto de llegada (opcional)
                </span>
                <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Observaciones generales de recepción:
                  </label>
                  <textarea
                    rows={2}
                    value={obsAdicionalRec}
                    onChange={(e) => setObsAdicionalRec(e.target.value)}
                    placeholder="Estado de limpieza, accesorios entregados, comentarios de faena..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                {estadoLlegada === "OPERATIVA" && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-slate-600" />
                      <span>Foto de respaldo (Opcional):</span>
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300"
                    />
                    {fotoNombre && (
                      <p className="text-[11px] text-emerald-700 font-semibold mt-1 truncate">
                        Foto adjunta: {fotoNombre}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </details>

            <div className="sticky bottom-3 z-20 pt-2">
              <button
                type="button"
                disabled={submitting || bloqueaGuardarOperativa}
                onClick={handleGuardarRecepcion}
                className="w-full min-h-[56px] flex items-center justify-center gap-2 rounded-xl bg-[#065F46] hover:bg-[#047857] disabled:bg-slate-300 text-white font-extrabold py-3.5 px-4 text-base shadow-lg transition-colors cursor-pointer"
              >
                <Save className="w-5 h-5" />
                <span>Recibir {maq.codigo} en Patio</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
