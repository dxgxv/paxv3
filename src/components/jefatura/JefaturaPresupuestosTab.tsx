import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  ExternalLink,
  Printer,
} from "lucide-react";
import {
  formatCLP,
  type Equipo,
  type Presupuesto,
} from "../../data/catalogs";
import { apiRequest } from "../../lib/apiClient";
import { type InformePdfTarget } from "../InformePdfModal";

interface JefaturaPresupuestosTabProps {
  equipos: Equipo[];
  presupuestos: Presupuesto[];
  onOpenFicha: (codigo: string) => void;
  onOpenPdf: (target: InformePdfTarget) => void;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
}

export default function JefaturaPresupuestosTab({
  equipos,
  presupuestos,
  onOpenFicha,
  onOpenPdf,
  onRefresh,
}: JefaturaPresupuestosTabProps) {
  const [filtroEstPres, setFiltroEstPres] = useState<string>("PENDIENTE");
  const [resolviendoFolio, setResolviendoFolio] = useState<string | null>(null);
  const [estadoResMap, setEstadoResMap] = useState<Record<string, string>>({});
  const [destResMap, setDestResMap] = useState<Record<string, string>>({});
  const [obsResMap, setObsResMap] = useState<Record<string, string>>({});

  const presupuestosFiltrados = useMemo(() => {
    if (filtroEstPres === "TODOS") return presupuestos;
    return presupuestos.filter((p) => p.estado_presupuesto === filtroEstPres);
  }, [presupuestos, filtroEstPres]);

  const handleResolverPresupuesto = async (pres: Presupuesto) => {
    setResolviendoFolio(pres.folio);
    try {
      const nuevoEst =
        estadoResMap[pres.folio] || pres.estado_presupuesto || "APROBADO";
      const nuevoDest =
        destResMap[pres.folio] !== undefined
          ? destResMap[pres.folio]
          : pres.destinatario_nombre;
      const nuevaObs =
        obsResMap[pres.folio] !== undefined
          ? obsResMap[pres.folio]
          : pres.observaciones_resolucion;

      const res = await apiRequest(
        `/api/presupuestos/${encodeURIComponent(pres.folio)}/resolver`,
        {
          method: "POST",
          body: JSON.stringify({
            estado_presupuesto: nuevoEst,
            destinatario_nombre: nuevoDest,
            observaciones_resolucion: nuevaObs,
          }),
        }
      );

      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data?.error || "Error al resolver presupuesto.",
        });
      } else {
        await onRefresh({
          type: "success",
          text:
            res.data?.message || `Presupuesto ${pres.folio} actualizado.`,
        });
      }
    } catch {
      await onRefresh({
        type: "error",
        text: "Error de red al guardar resolución.",
      });
    } finally {
      setResolviendoFolio(null);
    }
  };

  return (
    <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
      <div className="bg-[#0C4A6E] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-sky-800">
        <div className="flex items-center gap-2.5">
          <DollarSign className="w-4 h-4 text-sky-300" />
          <h3 className="font-bold text-sm uppercase tracking-wider">
            Resolución de Presupuestos de Reparación y Daños
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          {["PENDIENTE", "APROBADO", "RECHAZADO", "TODOS"].map((est) => (
            <button
              key={est}
              type="button"
              onClick={() => setFiltroEstPres(est)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase cursor-pointer transition-colors whitespace-nowrap ${
                filtroEstPres === est
                  ? "bg-white text-[#0C4A6E]"
                  : "bg-sky-950/70 text-sky-200 hover:bg-sky-900"
              }`}
            >
              {est}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {presupuestosFiltrados.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-6 flex items-center gap-4 text-emerald-950">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider">
                Sin Presupuestos en Estado {filtroEstPres}
              </h4>
              <p className="text-xs text-emerald-800 mt-0.5">
                No existen solicitudes de presupuesto que coincidan con el
                filtro seleccionado.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {presupuestosFiltrados.map((p) => {
              const estActual = estadoResMap[p.folio] ?? p.estado_presupuesto;
              const destActual = destResMap[p.folio] ?? p.destinatario_nombre;
              const obsActual =
                obsResMap[p.folio] ?? p.observaciones_resolucion;

              const badgeStyle =
                p.estado_presupuesto === "APROBADO"
                  ? "bg-emerald-100 text-emerald-900 border-emerald-400"
                  : p.estado_presupuesto === "RECHAZADO"
                  ? "bg-red-100 text-red-900 border-red-400"
                  : "bg-purple-100 text-purple-900 border-purple-400";

              return (
                <div
                  key={p.folio}
                  className="bg-white border border-slate-300 rounded-lg p-5 space-y-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono font-bold text-sm bg-slate-900 text-white px-2.5 py-1 rounded">
                        {p.folio}
                      </span>
                      <span className="font-mono font-bold text-base text-[#0C4A6E]">
                        {p.codigo_equipo}
                      </span>
                      <span className="font-bold text-sm text-slate-800">
                        {p.nombre_equipo}
                      </span>
                      <span
                        className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded border ${badgeStyle}`}
                      >
                        {p.estado_presupuesto}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-lg font-extrabold text-slate-900 tabular-nums">
                        {formatCLP(p.monto_total)} CLP
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPdf({
                            tipo: "presupuesto",
                            presupuesto: p,
                            equipo: equipos.find(
                              (eq) => eq.codigo === p.codigo_equipo
                            ),
                          })
                        }
                        className="px-2.5 py-1.5 rounded bg-[#0C4A6E] hover:bg-[#0284C7] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>PDF / Imprimir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenFicha(p.codigo_equipo)}
                        className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir Equipo</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-700 bg-slate-50 p-3.5 rounded border border-slate-200">
                    <div>
                      <span className="text-slate-500 block">
                        Solicitante y Fecha:
                      </span>
                      <strong className="text-slate-900">
                        {p.solicitante} ({p.fecha_solicitud})
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">
                        Imputación / Cargo:
                      </span>
                      <strong className="text-slate-900">
                        {p.destinatario_tipo} &mdash; {p.destinatario_nombre}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">
                        Desglose Costos:
                      </span>
                      <span className="font-mono text-slate-900 tabular-nums">
                        Rep: {formatCLP(p.costo_repuestos)} | MO:{" "}
                        {formatCLP(p.costo_mano_obra)} | Ins:{" "}
                        {formatCLP(p.costo_insumos)}
                      </span>
                    </div>
                    <div className="md:col-span-3 pt-1 border-t border-slate-200">
                      <span className="text-slate-500">
                        Panas y Trabajos:{" "}
                      </span>
                      <strong className="text-slate-900">
                        {p.panas_asociadas}
                      </strong>{" "}
                      &mdash; {p.detalle_trabajos}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-1">
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Dictamen Jefatura
                      </label>
                      <select
                        value={estActual}
                        onChange={(e) =>
                          setEstadoResMap((prev) => ({
                            ...prev,
                            [p.folio]: e.target.value,
                          }))
                        }
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-2 text-xs font-bold text-slate-900"
                      >
                        <option value="PENDIENTE">PENDIENTE</option>
                        <option value="APROBADO">
                          APROBADO (Pasa a Reparación)
                        </option>
                        <option value="RECHAZADO">RECHAZADO</option>
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Cliente / Obra Responsable
                      </label>
                      <input
                        type="text"
                        value={destActual}
                        onChange={(e) =>
                          setDestResMap((prev) => ({
                            ...prev,
                            [p.folio]: e.target.value,
                          }))
                        }
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-2 text-xs text-slate-900"
                      />
                    </div>

                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Observación de Resolución
                      </label>
                      <input
                        type="text"
                        value={obsActual}
                        onChange={(e) =>
                          setObsResMap((prev) => ({
                            ...prev,
                            [p.folio]: e.target.value,
                          }))
                        }
                        placeholder="Ej. Autorizado por gerencia / Orden de compra #..."
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-2 text-xs text-slate-900"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <button
                        type="button"
                        disabled={resolviendoFolio === p.folio}
                        onClick={() => handleResolverPresupuesto(p)}
                        className="w-full bg-[#065F46] hover:bg-[#047857] text-white font-bold py-2 px-3 rounded text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <ClipboardCheck className="w-4 h-4 shrink-0" />
                        <span>
                          {resolviendoFolio === p.folio
                            ? "Guardando..."
                            : "Guardar"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
