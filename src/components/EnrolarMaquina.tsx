import React, { useState } from "react";
import {
  Cpu,
  QrCode,
  PlusCircle,
  CheckCircle2,
  ExternalLink,
  Layers,
  Tag,
  Gauge,
  Hash,
  Copy,
  Check,
  MapPin,
  Clock,
  Printer,
  Wifi,
} from "lucide-react";
import {
  PAUTAS_MECANICAS,
  ESTADO_DISPONIBLE,
  ESTADO_EN_PANA,
  ESTADO_EN_PRESUPUESTO,
  getSemaforoKey,
  type Equipo,
} from "../data/catalogs";

import { apiRequest } from "../lib/apiClient";

interface EnrolarMaquinaProps {
  equipos: Equipo[];
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
  onOpenFicha: (codigo: string) => void;
}

const CATEGORIAS_LISTA = Object.keys(PAUTAS_MECANICAS);

export default function EnrolarMaquina({
  equipos,
  onRefresh,
  onOpenFicha,
}: EnrolarMaquinaProps) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_LISTA[0]);
  const [estadoInicial, setEstadoInicial] = useState<string>(ESTADO_DISPONIBLE);
  const [tipoMedicion, setTipoMedicion] = useState<"DIAS" | "HORAS">("DIAS");
  const [limiteMantencion, setLimiteMantencion] = useState<number>(15);
  const [horometroActual, setHorometroActual] = useState<number>(0);
  const [ubicacionNfc, setUbicacionNfc] = useState<string>("Chasis lateral");
  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [writingNfcCode, setWritingNfcCode] = useState<string | null>(null);

  const soportaWebNfc =
    typeof window !== "undefined" && "NDEFReader" in window;

  const getNfcUrl = (cod: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/?id=${encodeURIComponent(cod)}`;
  };

  const copyUrl = (cod: string) => {
    navigator.clipboard.writeText(getNfcUrl(cod));
    setCopiedCode(cod);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const writeNfcTag = async (cod: string) => {
    if (!soportaWebNfc) return;
    setWritingNfcCode(cod);
    try {
      const NDEFReaderCtor = (window as any).NDEFReader;
      const ndef = new NDEFReaderCtor();
      await onRefresh({
        type: "warning",
        text: `Acerca el chip NFC al teléfono para grabar ${cod}...`,
      });
      await ndef.write({
        records: [{ recordType: "url", data: getNfcUrl(cod) }],
      });
      await onRefresh({
        type: "success",
        text: `Chip NFC de ${cod} grabado correctamente.`,
      });
    } catch (err: any) {
      await onRefresh({
        type: "error",
        text:
          err?.message ||
          "No se pudo grabar el chip NFC. Usa el botón Copiar con NFC Tools.",
      });
    } finally {
      setWritingNfcCode(null);
    }
  };

  const printQrLabel = (cod: string, nomEquipo?: string) => {
    const url = getNfcUrl(cod);
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
      url
    )}`;
    const win = window.open("", "_blank", "width=460,height=560");
    if (!win) return;
    win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Etiqueta QR/NFC — ${cod}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; text-align: center; color: #0F172A; }
    .card { border: 3px solid #0F172A; border-radius: 14px; padding: 20px; max-width: 320px; margin: 0 auto; }
    .brand { font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #065F46; }
    .code { font-family: monospace; font-size: 32px; font-weight: 900; margin: 6px 0 4px; }
    .name { font-size: 14px; font-weight: 700; color: #334155; margin-bottom: 14px; }
    img { width: 200px; height: 200px; border: 1px solid #CBD5E1; padding: 8px; border-radius: 8px; }
    .url { font-family: monospace; font-size: 11px; color: #475569; margin-top: 10px; word-break: break-all; }
    @media print { .no-print { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Rental Valdivia · Control de Flota</div>
    <div class="code">${cod}</div>
    <div class="name">${nomEquipo || "Ficha Operativa NFC / QR"}</div>
    <img src="${qrSrc}" alt="QR ${cod}" onload="setTimeout(() => window.print(), 250)" />
    <div class="url">${url}</div>
  </div>
</body>
</html>`);
    win.document.close();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const codClean = codigo.trim().toUpperCase();
    const nomClean = nombre.trim();
    if (!codClean || !nomClean) {
      await onRefresh({
        type: "error",
        text: "El Código y el Nombre de la máquina son obligatorios.",
      });
      return;
    }

    setSubmitting(true);
    setCreatedCode(null);
    try {
      const res = await apiRequest("/api/equipos/enrolar", {
        method: "POST",
        body: JSON.stringify({
          codigo: codClean,
          nombre: nomClean,
          categoria,
          estado_inicial: estadoInicial,
          tipo_medicion: tipoMedicion,
          limite_mantencion: limiteMantencion,
          horometro_actual: horometroActual,
          ubicacion_nfc: ubicacionNfc,
        }),
      });
      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data?.error || "Error al enrolar máquina.",
        });
      } else {
        setCreatedCode(codClean);
        setCodigo("");
        setNombre("");
        setHorometroActual(0);
        await onRefresh({
          type: "success",
          text: res.data?.message || `Máquina ${codClean} enrolada con éxito.`,
        });
      }
    } catch {
      await onRefresh({
        type: "error",
        text: "Error de conexión al registrar máquina.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner superior oscuro */}
      <div className="bg-[#0F172A] border border-slate-700 rounded-lg p-5 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-[#065F46] border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-semibold block">
              INGENIERÍA DE FLOTA & VINCULACIÓN NFC
            </span>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Enrolamiento Técnico de Maquinaria y Generación de Tags NFC / QR
            </h2>
          </div>
        </div>
        <div className="bg-slate-800/90 border border-slate-700 px-4 py-2.5 rounded-md flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38BDF8]" />
          <div className="text-xs">
            <span className="text-slate-400 block">Flota Registrada</span>
            <span className="font-mono font-bold text-white text-sm">
              {equipos.length} UNIDADES
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Formulario de Alta */}
        <div className="lg:col-span-7 bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-[#064E3B] text-white px-5 py-3.5 flex items-center justify-between border-b border-emerald-800">
            <div className="flex items-center gap-2.5">
              <PlusCircle className="w-4 h-4 text-emerald-300" />
              <h3 className="font-bold text-sm uppercase tracking-wider">
                Ficha de Alta de Equipo Nuevo
              </h3>
            </div>
            <span className="text-[11px] font-mono bg-emerald-950/80 text-emerald-300 px-2.5 py-0.5 rounded border border-emerald-700">
              REGISTRO OFICIAL
            </span>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Bloque 1: Identificación */}
            <div className="bg-slate-100 border border-slate-200 rounded-md p-4 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0C4A6E]">
                <Layers className="w-4 h-4 text-[#0284C7]" />
                1. Identificación y Clasificación del Equipo
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Código Único (ID para Chip NFC)
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value)}
                      placeholder="Ej. COR-04, GEN-08, PLA-12"
                      className="w-full bg-white border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Nombre / Marca y Modelo
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Placa Wacker Neuson WP1550"
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Familia / Categoría Mecánica
                  </label>
                  <select
                    value={categoria}
                    onChange={(e) => {
                      const cat = e.target.value;
                      setCategoria(cat);
                      if (
                        cat === "Maquinaria con Horómetro" ||
                        cat === "Generador Eléctrico"
                      ) {
                        setTipoMedicion("HORAS");
                        setLimiteMantencion(250);
                      } else {
                        setTipoMedicion("DIAS");
                        setLimiteMantencion(15);
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                  >
                    {CATEGORIAS_LISTA.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Estado Operativo de Ingreso
                  </label>
                  <select
                    value={estadoInicial}
                    onChange={(e) => setEstadoInicial(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                  >
                    <option value={ESTADO_DISPONIBLE}>
                      OPERATIVA (Lista en Patio)
                    </option>
                    <option value={ESTADO_EN_PANA}>
                      EN PANA (Ingresa directo a Taller)
                    </option>
                    <option value={ESTADO_EN_PRESUPUESTO}>
                      ESPERANDO PRESUPUESTO
                    </option>
                  </select>
                </div>
              </div>
            </div>

            {/* Bloque 2: Parámetros de Control y NFC */}
            <div className="bg-slate-100 border border-slate-200 rounded-md p-4 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#064E3B]">
                <Tag className="w-4 h-4 text-[#059669]" />
                2. Parámetros de Mantención y Ubicación del Tag NFC
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Unidad de Control Preventivo
                  </label>
                  <select
                    value={tipoMedicion}
                    onChange={(e) =>
                      setTipoMedicion(e.target.value as "DIAS" | "HORAS")
                    }
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#059669]"
                  >
                    <option value="DIAS">DÍAS DE ARRIENDO ACUMULADOS</option>
                    <option value="HORAS">HORAS DE MOTOR (HORÓMETRO)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Umbral para Pauta ({tipoMedicion === "DIAS" ? "Días" : "Horas"})
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="number"
                      min={1}
                      value={limiteMantencion}
                      onChange={(e) =>
                        setLimiteMantencion(Math.max(1, Number(e.target.value)))
                      }
                      className="w-full bg-white border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#059669]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Lectura Inicial de Horómetro
                  </label>
                  <div className="relative">
                    <Gauge className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="number"
                      min={0}
                      value={horometroActual}
                      onChange={(e) =>
                        setHorometroActual(Math.max(0, Number(e.target.value)))
                      }
                      className="w-full bg-white border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#059669]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Ubicación Física del Chip NFC
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={ubicacionNfc}
                      onChange={(e) => setUbicacionNfc(e.target.value)}
                      placeholder="Ej. Chasis lateral derecho / Panel"
                      className="w-full bg-white border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#059669]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#065F46] hover:bg-[#047857] disabled:opacity-50 text-white font-bold py-3 px-5 rounded-md shadow-sm transition-colors flex items-center justify-center gap-2 uppercase tracking-wider text-xs cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              {submitting
                ? "Registrando Activo en Base de Datos..."
                : "Enrolar Máquina y Generar Enlace NFC"}
            </button>
          </form>

          {/* Tarjeta de éxito con QR y link NFC */}
          {createdCode && (
            <div className="mx-6 mb-6 p-5 bg-emerald-950 text-white rounded-lg border border-emerald-600 shadow-md">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="space-y-3 flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    Equipo {createdCode} Enrolado Exitosamente
                  </div>
                  <p className="text-xs text-emerald-100/90 leading-relaxed">
                    Graba este enlace en el chip NFC o imprime la etiqueta QR para adherirla al chasis:
                  </p>
                  <div className="bg-slate-900/90 border border-emerald-700 rounded px-3 py-2 font-mono text-xs text-emerald-300 break-all flex items-center justify-between gap-2">
                    <span>{getNfcUrl(createdCode)}</span>
                    <button
                      type="button"
                      onClick={() => copyUrl(createdCode)}
                      className="shrink-0 bg-emerald-800 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-[11px] font-sans font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedCode === createdCode ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedCode === createdCode ? "Copiado" : "Copiar"}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {soportaWebNfc && (
                      <button
                        type="button"
                        disabled={writingNfcCode === createdCode}
                        onClick={() => writeNfcTag(createdCode)}
                        className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Wifi className="w-3.5 h-3.5" />
                        <span>
                          {writingNfcCode === createdCode
                            ? "Acerca el chip NFC..."
                            : "Grabar chip NFC con el teléfono"}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => printQrLabel(createdCode)}
                      className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 border border-emerald-500/40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir etiqueta QR</span>
                    </button>
                  </div>
                </div>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
                    getNfcUrl(createdCode)
                  )}`}
                  alt={`QR ${createdCode}`}
                  className="w-24 h-24 rounded bg-white p-1.5 shrink-0 border border-emerald-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Columna Derecha: Directorio de Tags NFC de la Flota */}
        <div className="lg:col-span-5 bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden flex flex-col">
          <div className="bg-[#0C4A6E] text-white px-5 py-3.5 flex items-center justify-between border-b border-sky-800">
            <div className="flex items-center gap-2.5">
              <QrCode className="w-4 h-4 text-sky-300" />
              <h3 className="font-bold text-sm uppercase tracking-wider">
                Directorio de Tags NFC / QR Activos
              </h3>
            </div>
            <span className="text-[11px] font-mono bg-sky-950/90 text-sky-300 px-2 py-0.5 rounded border border-sky-700">
              {equipos.length} TAGS
            </span>
          </div>

          <div className="p-4 flex-1 overflow-y-auto max-h-[580px] space-y-2.5">
            {equipos.slice(0, 100).map((m) => {
              const key = getSemaforoKey(m.semaforo);
              const ledColor =
                key === "OPERATIVA"
                  ? "bg-emerald-500 shadow-[0_0_6px_#10B981]"
                  : key === "MANTENCION"
                  ? "bg-amber-500 shadow-[0_0_6px_#F59E0B]"
                  : key === "PANA"
                  ? "bg-red-500 shadow-[0_0_6px_#EF4444]"
                  : "bg-purple-500 shadow-[0_0_6px_#A855F7]";

              return (
                <div
                  key={m.codigo}
                  className="bg-white border border-slate-200 hover:border-slate-400 rounded-md p-3 transition-all flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${ledColor}`}
                      />
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {m.codigo}
                      </span>
                      <span className="text-xs text-slate-600 truncate font-medium">
                        {m.nombre}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {m.categoria} &bull; Tag: {m.ubicacion_nfc}
                    </div>
                    <div className="text-[11px] font-mono text-sky-700 mt-1 truncate">
                      /?id={m.codigo}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {soportaWebNfc && (
                      <button
                        type="button"
                        disabled={writingNfcCode === m.codigo}
                        onClick={() => writeNfcTag(m.codigo)}
                        title="Grabar chip NFC directamente con el teléfono"
                        className="px-2 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-1 border border-emerald-300 cursor-pointer"
                      >
                        <Wifi className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => printQrLabel(m.codigo, m.nombre)}
                      title="Imprimir etiqueta QR"
                      className="px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 border border-slate-300 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => copyUrl(m.codigo)}
                      title="Copiar URL para grabar chip NFC"
                      className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 border border-slate-300 cursor-pointer"
                    >
                      {copiedCode === m.codigo ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      NFC
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenFicha(m.codigo)}
                      title="Abrir en Ficha de Máquina"
                      className="px-2.5 py-1.5 rounded bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Ficha
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
