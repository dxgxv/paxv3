import React, { useEffect } from "react";
import { Printer, X, FileText, Camera, ShieldCheck } from "lucide-react";
import {
  formatCLP,
  duracionLegible,
  extraerEvidenciasTexto,
  type Equipo,
  type Presupuesto,
  type OrdenTrabajo,
  type OTRepuestoItem,
  type SolicitudEmergencia,
  type EventoHistorial,
} from "../data/catalogs";

export type InformePdfTarget =
  | {
      tipo: "presupuesto";
      presupuesto: Presupuesto;
      equipo?: Equipo;
    }
  | {
      tipo: "ot";
      ot: OrdenTrabajo;
      equipo?: Equipo;
    };

interface InformePdfModalProps {
  target: InformePdfTarget | null;
  otRepuestos: OTRepuestoItem[];
  emergencias?: SolicitudEmergencia[];
  historial?: EventoHistorial[];
  onClose: () => void;
}

export default function InformePdfModal({
  target,
  otRepuestos,
  emergencias = [],
  historial = [],
  onClose,
}: InformePdfModalProps) {
  useEffect(() => {
    if (!target) {
      document.body.classList.remove("printing-informe");
      return;
    }
    document.body.classList.add("printing-informe");
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("printing-informe");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [target, onClose]);

  if (!target) return null;

  const equipo = target.equipo;
  const codigoEquipo =
    target.tipo === "presupuesto"
      ? target.presupuesto.codigo_equipo
      : target.ot.codigo_equipo;

  // Recopilar fotografías de evidencia asociadas al equipo / documento
  const evidenciasSet = new Set<string>();
  if (equipo?.ultima_evidencia) {
    evidenciasSet.add(equipo.ultima_evidencia);
  }
  for (const path of extraerEvidenciasTexto(equipo?.ultima_observacion)) {
    evidenciasSet.add(path);
  }
  if (target.tipo === "ot") {
    for (const path of extraerEvidenciasTexto(target.ot.descripcion)) {
      evidenciasSet.add(path);
    }
    for (const path of extraerEvidenciasTexto(target.ot.detalle_cierre)) {
      evidenciasSet.add(path);
    }
  } else {
    for (const path of extraerEvidenciasTexto(target.presupuesto.detalle_trabajos)) {
      evidenciasSet.add(path);
    }
    for (const path of extraerEvidenciasTexto(target.presupuesto.observaciones_resolucion)) {
      evidenciasSet.add(path);
    }
  }

  for (const em of emergencias) {
    if (em.codigo_equipo === codigoEquipo && em.evidencia_url) {
      evidenciasSet.add(em.evidencia_url);
    }
  }

  for (const h of historial) {
    if (h.codigo_equipo === codigoEquipo) {
      for (const path of extraerEvidenciasTexto(h.detalle)) {
        evidenciasSet.add(path);
      }
      if (evidenciasSet.size >= 4) break;
    }
  }

  const evidencias = Array.from(evidenciasSet).slice(0, 4);

  const repuestosDeOt =
    target.tipo === "ot"
      ? otRepuestos.filter((item) => item.ot_id === target.ot.id)
      : [];

  const totalOt =
    target.tipo === "ot"
      ? (Number(target.ot.costo_repuestos) || 0) +
        (Number(target.ot.costo_otros) || 0)
      : 0;

  const folioDoc =
    target.tipo === "presupuesto" ? target.presupuesto.folio : target.ot.folio;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 flex justify-center items-start"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden my-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* BARRA SUPERIOR NO IMPRIMIBLE */}
        <div className="no-print bg-[#0F172A] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-[#38BDF8] shrink-0" />
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-slate-300 block">
                Vista Previa de Documento Técnico Imprimible (A4)
              </span>
              <h3 className="text-sm font-bold text-white">
                {target.tipo === "presupuesto"
                  ? `Informe de Presupuesto ${folioDoc}`
                  : `Informe Técnico de Orden de Trabajo ${folioDoc}`}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#065F46] hover:bg-[#047857] text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Imprimir / Guardar PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 shrink-0" />
              <span>Cerrar</span>
            </button>
          </div>
        </div>

        {/* HOJA A4 IMPRIMIBLE */}
        <div
          id="informe-pdf-sheet"
          className="bg-white text-slate-900 p-6 sm:p-10 space-y-6 text-sm"
        >
          {/* MEMBRETE CORPORATIVO RENTAL VALDIVIA */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-5">
            <div className="space-y-1">
              <div className="text-xs font-mono uppercase tracking-widest text-[#065F46] font-bold">
                Rental Valdivia · División Maquinaria y Taller Central
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                {target.tipo === "presupuesto"
                  ? "INFORME TÉCNICO DE PRESUPUESTO Y DAÑOS"
                  : "INFORME TÉCNICO DE ORDEN DE TRABAJO (OT)"}
              </h1>
              <p className="text-xs text-slate-600">
                Documento oficial para respaldo de taller, facturación de daños
                o aprobación de gerencia.
              </p>
            </div>

            <div className="text-left sm:text-right border border-slate-300 rounded-lg px-4 py-2.5 bg-slate-50">
              <div className="text-[11px] font-mono uppercase text-slate-500">
                Folio Documento
              </div>
              <div className="text-xl font-black font-mono text-slate-900 tabular-nums">
                {folioDoc}
              </div>
              <div className="text-xs font-mono text-slate-700 mt-0.5">
                {target.tipo === "presupuesto"
                  ? `Estado: ${target.presupuesto.estado_presupuesto}`
                  : `Estado: ${target.ot.estado}`}
              </div>
            </div>
          </div>

          {/* IDENTIFICACIÓN DEL EQUIPO Y CONTEXTO DE ARRIENDO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-slate-300 rounded-lg p-4 bg-slate-50/70">
            <div className="space-y-1.5 text-xs">
              <div className="font-mono uppercase text-[10px] font-bold text-slate-500">
                Datos de la Unidad
              </div>
              <div>
                <span className="text-slate-600">Código / Unidad: </span>
                <strong className="font-mono text-slate-900">
                  {codigoEquipo}
                </strong>{" "}
                —{" "}
                <strong className="text-slate-900">
                  {target.tipo === "presupuesto"
                    ? target.presupuesto.nombre_equipo
                    : equipo?.nombre || "Equipo registrado"}
                </strong>
              </div>
              <div>
                <span className="text-slate-600">Categoría: </span>
                <strong className="text-slate-900">
                  {target.tipo === "presupuesto"
                    ? target.presupuesto.categoria
                    : equipo?.categoria || "Maquinaria"}
                </strong>
              </div>
              {equipo && (
                <div>
                  <span className="text-slate-600">Medición / Ciclo: </span>
                  <strong className="font-mono tabular-nums text-slate-900">
                    {equipo.uso_acumulado} / {equipo.limite_mantencion}{" "}
                    {equipo.tipo_medicion === "DIAS" ? "días" : "hrs"}
                    {equipo.tipo_medicion === "HORAS"
                      ? ` (Horómetro: ${equipo.horometro_actual} hrs)`
                      : ""}
                  </strong>
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="font-mono uppercase text-[10px] font-bold text-slate-500">
                Ubicación y Cliente Asociado
              </div>
              {target.tipo === "presupuesto" ? (
                <>
                  <div>
                    <span className="text-slate-600">Fecha Solicitud: </span>
                    <strong className="font-mono tabular-nums">
                      {target.presupuesto.fecha_solicitud}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-600">Solicitante: </span>
                    <strong>{target.presupuesto.solicitante}</strong>
                  </div>
                  <div>
                    <span className="text-slate-600">Imputación / Cliente: </span>
                    <strong>
                      {target.presupuesto.destinatario_tipo} ·{" "}
                      {target.presupuesto.destinatario_nombre}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-600">Prioridad: </span>
                    <strong>{target.presupuesto.prioridad}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-slate-600">Tipo OT / Apertura: </span>
                    <strong className="font-mono tabular-nums">
                      {target.ot.tipo} · {target.ot.fecha_apertura}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-600">Cierre / Duración: </span>
                    <strong className="font-mono tabular-nums">
                      {target.ot.fecha_cierre || "En curso"} (
                      {duracionLegible(
                        target.ot.fecha_apertura,
                        target.ot.fecha_cierre
                      )}
                      )
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-600">Responsable / Mecánico: </span>
                    <strong>
                      {target.ot.mecanico || target.ot.responsable}
                    </strong>
                  </div>
                  {equipo?.cliente_actual && (
                    <div>
                      <span className="text-slate-600">Cliente / Obra: </span>
                      <strong>
                        {equipo.cliente_actual}
                        {equipo.ubicacion_actual
                          ? ` (${equipo.ubicacion_actual})`
                          : ""}
                      </strong>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* DETALLE TÉCNICO Y FALLAS */}
          <div className="border border-slate-300 rounded-lg p-4 space-y-2.5 text-xs">
            <div className="font-mono uppercase text-[10px] font-bold text-slate-500">
              {target.tipo === "presupuesto"
                ? "Diagnóstico de Fallas / Daños y Trabajos Cotizados"
                : "Detalle de Fallas y Trabajos Ejecutados en Taller"}
            </div>
            {target.tipo === "presupuesto" ? (
              <>
                <p className="text-slate-900">
                  <strong className="text-slate-700">Fallas / Daños: </strong>
                  {target.presupuesto.panas_asociadas}
                </p>
                <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                  <strong className="text-slate-700">
                    Detalle Técnico de Trabajos:{" "}
                  </strong>
                  {target.presupuesto.detalle_trabajos ||
                    "Sin detalle adicional."}
                </p>
                {target.presupuesto.observaciones_resolucion && (
                  <p className="text-slate-800 pt-2 border-t border-slate-200">
                    <strong className="text-slate-700">
                      Resolución / Observación Jefatura:{" "}
                    </strong>
                    {target.presupuesto.observaciones_resolucion}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">
                  <strong className="text-slate-700">
                    Motivo / Descripción de Ingreso:{" "}
                  </strong>
                  {target.ot.descripcion}
                </p>
                {target.ot.detalle_cierre && (
                  <p className="text-slate-800 pt-2 border-t border-slate-200 whitespace-pre-wrap leading-relaxed">
                    <strong className="text-slate-700">
                      Informe de Cierre Mecánico:{" "}
                    </strong>
                    {target.ot.detalle_cierre}
                  </p>
                )}
              </>
            )}
          </div>

          {/* TABLA FINANCIERA Y REPUESTOS */}
          <div className="space-y-2">
            <div className="font-mono uppercase text-[10px] font-bold text-slate-500">
              {target.tipo === "presupuesto"
                ? "Desglose Económico del Presupuesto (Neto CLP)"
                : "Repuestos Imputados y Costos de la Orden de Trabajo"}
            </div>

            {target.tipo === "presupuesto" ? (
              <table className="w-full border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                    <th className="py-2 px-3 text-left font-bold">Concepto</th>
                    <th className="py-2 px-3 text-right font-bold">
                      Monto Neto ($ CLP)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-2 px-3">Repuestos y Componentes</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {formatCLP(target.presupuesto.costo_repuestos)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">Mano de Obra Técnica</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {formatCLP(target.presupuesto.costo_mano_obra)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">
                      Insumos / Servicios Externos
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {formatCLP(target.presupuesto.costo_insumos)}
                    </td>
                  </tr>
                  <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-400">
                    <td className="py-2.5 px-3 uppercase">
                      Total Presupuesto Neto
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-sm tabular-nums">
                      {formatCLP(target.presupuesto.monto_total)} CLP
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="space-y-2">
                {repuestosDeOt.length > 0 && (
                  <table className="w-full border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                        <th className="py-2 px-3 text-left">Código</th>
                        <th className="py-2 px-3 text-left">Repuesto</th>
                        <th className="py-2 px-3 text-right">Cantidad</th>
                        <th className="py-2 px-3 text-right">Unitario</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {repuestosDeOt.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 px-3 font-mono">{item.codigo}</td>
                          <td className="py-2 px-3">{item.nombre}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {item.cantidad} {item.unidad}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {formatCLP(item.costo_unitario)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold tabular-nums">
                            {formatCLP(item.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-2 px-3">
                        Costo Repuestos de Bodega Imputados
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatCLP(target.ot.costo_repuestos)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3">
                        Otros Costos / Servicios Externos
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatCLP(target.ot.costo_otros)}
                      </td>
                    </tr>
                    <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-400">
                      <td className="py-2.5 px-3 uppercase">
                        Costo Total Orden de Trabajo
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sm tabular-nums">
                        {formatCLP(totalOt)} CLP
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* EVIDENCIAS FOTOGRÁFICAS */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 font-mono uppercase text-[10px] font-bold text-slate-500">
              <Camera className="w-3.5 h-3.5 text-slate-600" />
              <span>Registro Fotográfico de Evidencia ({evidencias.length})</span>
            </div>

            {evidencias.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg p-4 text-xs text-slate-500">
                Sin fotografías adjuntas en recepción o emergencia para esta
                unidad.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {evidencias.map((url, idx) => (
                  <div
                    key={url}
                    className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50 break-inside-avoid"
                  >
                    <img
                      src={url}
                      alt={`Evidencia técnica ${codigoEquipo} #${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-48 object-cover bg-slate-100"
                    />
                    <div className="px-3 py-1.5 text-[11px] font-mono text-slate-600 border-t border-slate-200 truncate">
                      Evidencia #{idx + 1} · {url}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BLOQUE DE FIRMAS */}
          <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-300 break-inside-avoid">
            <div className="text-center space-y-2">
              <div className="h-12 border-b border-slate-400" />
              <div className="text-xs font-bold text-slate-900">
                Jefe de Taller / Rental Valdivia
              </div>
              <div className="text-[11px] text-slate-500">
                Validación Técnica y Control Operativo
              </div>
            </div>
            <div className="text-center space-y-2">
              <div className="h-12 border-b border-slate-400" />
              <div className="text-xs font-bold text-slate-900">
                Recepción Conforme / Cliente / Gerencia
              </div>
              <div className="text-[11px] text-slate-500">
                Nombre, RUT y Firma de Aprobación
              </div>
            </div>
          </div>

          <div className="pt-2 text-[10px] font-mono text-slate-500 flex items-center justify-between border-t border-slate-200">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-[#065F46]" />
              Rental Valdivia · Sistema de Trazabilidad Técnica
            </span>
            <span>Documento generado desde plataforma operativa</span>
          </div>
        </div>
      </div>
    </div>
  );
}
