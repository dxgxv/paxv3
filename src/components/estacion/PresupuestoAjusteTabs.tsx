import React, { useState, useEffect, useMemo } from "react";
import {
  PANAS_POR_CATEGORIA,
  formatCLP,
  type Equipo,
  type Presupuesto,
  type EventoHistorial,
} from "../../data/catalogs";
import { apiRequest } from "../../lib/apiClient";
import { loadOperadorPerfil } from "../../lib/operadorPerfil";
import type { InformePdfTarget } from "../InformePdfModal";
import {
  FileSpreadsheet,
  Sliders,
  History,
  Send,
  Lock,
  Printer,
} from "lucide-react";

interface PresupuestoTabProps {
  maq: Equipo;
  presupuestos: Presupuesto[];
  onOpenPdf: (target: InformePdfTarget) => void;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
}

export function SolicitarPresupuestoTab({
  maq,
  presupuestos,
  onOpenPdf,
  onRefresh,
}: PresupuestoTabProps) {
  const [submitting, setSubmitting] = useState(false);
  const [solicitantePres, setSolicitantePres] = useState(
    () => loadOperadorPerfil().nombre || "Jefe de Taller"
  );
  const [prioridadPres, setPrioridadPres] = useState(
    "Alta (Equipo Bloqueado en Taller)"
  );
  const [destinatarioTipo, setDestinatarioTipo] = useState(
    "Por definir (En bandeja)"
  );
  const [destinatarioNombre, setDestinatarioNombre] = useState(
    "Pendiente por definir"
  );
  const [marcarEsperaPres, setMarcarEsperaPres] = useState(true);
  const [panasElegidasPres, setPanasElegidasPres] = useState<string[]>([]);
  const [otraPanaPres, setOtraPanaPres] = useState("");
  const [detalleRepuestosPres, setDetalleRepuestosPres] = useState("");
  const [cRepPres, setCRepPres] = useState(0);
  const [cMoPres, setCMoPres] = useState(0);
  const [cInsPres, setCInsPres] = useState(0);

  useEffect(() => {
    const panasGuardadas = maq.panas_reportadas
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    setSolicitantePres(loadOperadorPerfil().nombre || "Jefe de Taller");
    setPrioridadPres("Alta (Equipo Bloqueado en Taller)");
    setDestinatarioTipo("Por definir (En bandeja)");
    setDestinatarioNombre(
      maq.cliente_actual ? maq.cliente_actual : "Pendiente por definir"
    );
    setMarcarEsperaPres(true);
    setPanasElegidasPres(panasGuardadas);
    setOtraPanaPres("");
    setDetalleRepuestosPres("");
    setCRepPres(0);
    setCMoPres(0);
    setCInsPres(0);
  }, [maq.codigo, maq.cliente_actual, maq.panas_reportadas]);

  const listaPanasCat =
    PANAS_POR_CATEGORIA[maq.categoria] ||
    PANAS_POR_CATEGORIA["Maquinaria con Horómetro"];

  const opcionesPanasPresupuesto = useMemo(
    () =>
      Array.from(
        new Set([
          ...listaPanasCat,
          ...maq.panas_reportadas
            .split("|")
            .map((p) => p.trim())
            .filter(Boolean),
        ])
      ),
    [listaPanasCat, maq.panas_reportadas]
  );

  const presupuestosMaq = useMemo(
    () => presupuestos.filter((p) => p.codigo_equipo === maq.codigo),
    [presupuestos, maq.codigo]
  );

  const totalPresCalc =
    (Number(cRepPres) || 0) + (Number(cMoPres) || 0) + (Number(cInsPres) || 0);

  const handleCrearPresupuesto = async () => {
    setSubmitting(true);
    try {
      const res = await apiRequest(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/presupuesto`,
        {
          method: "POST",
          body: JSON.stringify({
            solicitante: solicitantePres,
            prioridad: prioridadPres,
            destinatario_tipo: destinatarioTipo,
            destinatario_nombre: destinatarioNombre,
            marcar_espera_pres: marcarEsperaPres,
            panas_elegidas: panasElegidasPres,
            otra_pana: otraPanaPres,
            detalle_trabajos: detalleRepuestosPres,
            costo_repuestos: cRepPres,
            costo_mano_obra: cMoPres,
            costo_insumos: cInsPres,
          }),
        }
      );
      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data.error || "No se pudo generar el presupuesto.",
        });
      } else {
        await onRefresh({
          type: "success",
          text: res.data.message || "Presupuesto generado correctamente.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
      <div className="bg-[#0C4A6E] text-white px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-sky-300" />
          <h4 className="text-sm font-bold uppercase tracking-wider">
            Solicitud Formal de Presupuesto — {maq.codigo}
          </h4>
        </div>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Solicitado por:
              </label>
              <input
                type="text"
                value={solicitantePres}
                onChange={(e) => setSolicitantePres(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Prioridad:
              </label>
              <select
                value={prioridadPres}
                onChange={(e) => setPrioridadPres(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option>Alta (Equipo Bloqueado en Taller)</option>
                <option>Media</option>
                <option>Baja</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Destinatario / Imputación:
              </label>
              <select
                value={destinatarioTipo}
                onChange={(e) => setDestinatarioTipo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option>Por definir (En bandeja)</option>
                <option>Aprobación Interna (Gerencia)</option>
                <option>Cobro a Cliente (Daño en faena)</option>
                <option>Cotización a Proveedor</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Referencia / Cliente / Obra:
              </label>
              <input
                type="text"
                value={destinatarioNombre}
                onChange={(e) => setDestinatarioNombre(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center">
            <label className="flex items-start gap-2.5 p-4 rounded-xl bg-purple-50 border-2 border-purple-300 cursor-pointer text-xs md:text-sm font-bold text-purple-950">
              <input
                type="checkbox"
                checked={marcarEsperaPres}
                onChange={(e) => setMarcarEsperaPres(e.target.checked)}
                className="mt-0.5 accent-purple-700"
              />
              <span>
                Retener máquina en estado &apos;ESPERANDO PRESUPUESTO&apos;
              </span>
            </label>
          </div>
        </div>

        <hr className="border-slate-200" />

        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Fallas o daños asociados ({maq.categoria}):
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {opcionesPanasPresupuesto.map((pana) => {
              const checked = panasElegidasPres.includes(pana);
              return (
                <label
                  key={pana}
                  className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs cursor-pointer ${
                    checked
                      ? "bg-purple-50 border-purple-400 font-semibold text-purple-950"
                      : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked)
                        setPanasElegidasPres([...panasElegidasPres, pana]);
                      else
                        setPanasElegidasPres(
                          panasElegidasPres.filter((p) => p !== pana)
                        );
                    }}
                    className="mt-0.5 accent-purple-700"
                  />
                  <span>{pana}</span>
                </label>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Ítem adicional de falla o daño:
            </label>
            <input
              type="text"
              value={otraPanaPres}
              onChange={(e) => setOtraPanaPres(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Desglose técnico de repuestos y mano de obra:
            </label>
            <textarea
              rows={3}
              value={detalleRepuestosPres}
              onChange={(e) => setDetalleRepuestosPres(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Costo Repuestos ($ CLP):
            </label>
            <input
              type="number"
              min={0}
              step={5000}
              value={cRepPres}
              onChange={(e) =>
                setCRepPres(Math.max(0, parseInt(e.target.value) || 0))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Mano de Obra ($ CLP):
            </label>
            <input
              type="number"
              min={0}
              step={5000}
              value={cMoPres}
              onChange={(e) =>
                setCMoPres(Math.max(0, parseInt(e.target.value) || 0))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Insumos / Externos ($ CLP):
            </label>
            <input
              type="number"
              min={0}
              step={2000}
              value={cInsPres}
              onChange={(e) =>
                setCInsPres(Math.max(0, parseInt(e.target.value) || 0))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
          <div className="rounded-lg bg-[#0F172A] text-white p-3.5 border border-slate-700">
            <div className="text-[11px] uppercase tracking-wider text-sky-300 font-bold">
              Total Presupuesto (Neto)
            </div>
            <div className="text-lg font-black font-mono tabular-nums mt-0.5">
              {formatCLP(totalPresCalc)} CLP
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={handleCrearPresupuesto}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#0369A1] hover:bg-[#0284C7] text-white font-bold py-3 px-4 text-sm cursor-pointer transition-all"
        >
          <Send className="w-4 h-4" />
          <span>Generar y Registrar Solicitud de Presupuesto</span>
        </button>

        {presupuestosMaq.length > 0 && (
          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Presupuestos Históricos del Equipo
            </h5>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Folio</th>
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3">Destinatario</th>
                    <th className="py-2.5 px-3 text-right">Monto Total</th>
                    <th className="py-2.5 px-3">Fallas Asociadas</th>
                    <th className="py-2.5 px-3 text-right">Informe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {presupuestosMaq.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold">
                        {p.folio}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {p.fecha_solicitud}
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        {p.estado_presupuesto}
                      </td>
                      <td className="py-2.5 px-3">{p.destinatario_tipo}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                        {formatCLP(p.monto_total)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {p.panas_asociadas}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenPdf({
                              tipo: "presupuesto",
                              presupuesto: p,
                              equipo: maq,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0C4A6E] hover:bg-[#0284C7] text-white text-[11px] font-bold cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface AjusteManualTabProps {
  maq: Equipo;
  isJefe: boolean;
  onNavigateJefatura: () => void;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
}

export function AjusteManualTab({
  maq,
  isJefe,
  onNavigateJefatura,
  onRefresh,
}: AjusteManualTabProps) {
  const [submitting, setSubmitting] = useState(false);
  const [estadoElegidoMan, setEstadoElegidoMan] = useState(
    "OPERATIVA (Disponible)"
  );
  const [usoManual, setUsoManual] = useState(0);
  const [horometroManual, setHorometroManual] = useState(0);
  const [notaManual, setNotaManual] = useState("");
  const [limpiarPanasMan, setLimpiarPanasMan] = useState(true);

  useEffect(() => {
    setEstadoElegidoMan("OPERATIVA (Disponible)");
    setUsoManual(Number(maq.uso_acumulado) || 0);
    setHorometroManual(Number(maq.horometro_actual) || 0);
    setNotaManual(maq.ultima_observacion || "");
    setLimpiarPanasMan(true);
  }, [
    maq.codigo,
    maq.uso_acumulado,
    maq.horometro_actual,
    maq.ultima_observacion,
  ]);

  const unidadUso = maq.tipo_medicion === "DIAS" ? "días" : "horas";

  const handleAplicarAjusteManual = async () => {
    if (
      !window.confirm(
        `¿Forzar el estado de ${maq.codigo} a "${estadoElegidoMan}"? Esta acción modifica directamente el estado operativo del equipo.`
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/ajuste-manual`,
        {
          method: "POST",
          body: JSON.stringify({
            estado_elegido: estadoElegidoMan,
            uso_manual: usoManual,
            horometro_manual: horometroManual,
            nota_manual: notaManual,
            limpiar_panas: limpiarPanasMan,
          }),
        }
      );
      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data.error || "No se pudo aplicar el ajuste manual.",
        });
      } else {
        await onRefresh({
          type: "success",
          text: res.data.message || "Ajuste manual aplicado.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
      <div className="bg-[#1E293B] text-white px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-300" />
          <h4 className="text-sm font-bold uppercase tracking-wider">
            Ajuste Manual de Parámetros y Estado Operativo
          </h4>
        </div>
      </div>

      <div className="p-6">
        {!isJefe ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl bg-slate-100 border border-slate-300 p-4 text-sm text-slate-900">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-[#0369A1] shrink-0" />
              <span>
                El ajuste forzado de estados requiere autorización de{" "}
                <strong>Jefatura</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={onNavigateJefatura}
              className="rounded-lg bg-[#0369A1] hover:bg-[#0284C7] text-white font-bold px-4 py-2 text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              Autenticar en Jefatura
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nuevo Estado Operativo:
                </label>
                <select
                  value={estadoElegidoMan}
                  onChange={(e) => {
                    setEstadoElegidoMan(e.target.value);
                    setLimpiarPanasMan(e.target.value.includes("OPERATIVA"));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                >
                  <option value="OPERATIVA (Disponible)">
                    OPERATIVA (Disponible)
                  </option>
                  <option value="PIDE MANTENCIÓN">PIDE MANTENCIÓN</option>
                  <option value="EN PANA / TALLER">EN PANA / TALLER</option>
                  <option value="ESPERANDO PRESUPUESTO">
                    ESPERANDO PRESUPUESTO
                  </option>
                </select>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ajustar Uso ({unidadUso}):
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={usoManual}
                    onChange={(e) =>
                      setUsoManual(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ajustar Horómetro:
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={horometroManual}
                    onChange={(e) =>
                      setHorometroManual(
                        Math.max(0, parseInt(e.target.value) || 0)
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nota / Motivo Técnico:
                  </label>
                  <input
                    type="text"
                    value={notaManual}
                    onChange={(e) => setNotaManual(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer pt-2">
                  <input
                    type="checkbox"
                    checked={limpiarPanasMan}
                    onChange={(e) => setLimpiarPanasMan(e.target.checked)}
                    className="accent-[#0369A1]"
                  />
                  <span>Limpiar registro de fallas activas</span>
                </label>
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleAplicarAjusteManual}
              className="w-full rounded-lg bg-[#065F46] hover:bg-[#047857] text-white font-bold py-3 px-4 text-sm cursor-pointer"
            >
              Aplicar Ajuste Manual de Estado
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function HistorialEquipoTab({
  maq,
  historial,
}: {
  maq: Equipo;
  historial: EventoHistorial[];
}) {
  const historialMaq = useMemo(
    () => historial.filter((h) => h.codigo_equipo === maq.codigo),
    [historial, maq.codigo]
  );

  return (
    <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
      <div className="bg-[#1E293B] text-white px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-sky-300" />
          <h4 className="text-sm font-bold uppercase tracking-wider">
            Bitácora de Movimientos del Equipo — {maq.codigo}
          </h4>
        </div>
        <span className="text-xs font-mono text-slate-300">
          {historialMaq.length} registros
        </span>
      </div>

      <div className="p-6">
        {historialMaq.length === 0 ? (
          <p className="text-sm text-slate-500">
            Sin eventos registrados en la bitácora del equipo.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">ID</th>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Evento</th>
                  <th className="py-2.5 px-3">Responsable</th>
                  <th className="py-2.5 px-3 text-right">Uso Sumado</th>
                  <th className="py-2.5 px-3 text-right">Costo Repuestos</th>
                  <th className="py-2.5 px-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historialMaq.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-slate-500">
                      #{h.id}
                    </td>
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      {h.fecha}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                      {h.tipo_evento}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {h.responsable}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      +{h.uso_sumado}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatCLP(h.costo_repuestos)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{h.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
