import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  OctagonAlert,
  XCircle,
} from "lucide-react";
import { type SolicitudEmergencia } from "../../data/catalogs";
import { apiRequest } from "../../lib/apiClient";

interface JefaturaEmergenciasTabProps {
  emergenciasPendientes: SolicitudEmergencia[];
  emergenciasRecientes: SolicitudEmergencia[];
  onOpenFicha: (codigo: string) => void;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
}

export default function JefaturaEmergenciasTab({
  emergenciasPendientes,
  emergenciasRecientes,
  onOpenFicha,
  onRefresh,
}: JefaturaEmergenciasTabProps) {
  const [obsEmgMap, setObsEmgMap] = useState<Record<number, string>>({});
  const [resolviendoEmgId, setResolviendoEmgId] = useState<number | null>(null);

  const handleResolverEmergencia = async (
    solicitud: SolicitudEmergencia,
    accion: "APROBAR" | "RECHAZAR"
  ) => {
    const confirmMsg =
      accion === "APROBAR"
        ? `¿Confirmar falla de ${solicitud.codigo_equipo} (${solicitud.nombre_equipo}) y enviarla a taller con OT correctiva?`
        : `¿Descartar el reporte ${solicitud.folio} de ${solicitud.codigo_equipo} y mantener la máquina operativa?`;
    if (!window.confirm(confirmMsg)) return;

    setResolviendoEmgId(solicitud.id);
    try {
      const res = await apiRequest(`/api/emergencias/${solicitud.id}/resolver`, {
        method: "POST",
        body: JSON.stringify({
          accion,
          observacion: obsEmgMap[solicitud.id] || "",
        }),
      });
      if (!res.ok) {
        await onRefresh({
          type: "error",
          text:
            res.data?.error ||
            "No se pudo validar la 2da autorización. Verifica tu sesión de Jefatura.",
        });
      } else {
        await onRefresh({
          type: accion === "APROBAR" ? "error" : "success",
          text:
            res.data?.message ||
            `Emergencia ${solicitud.folio} procesada correctamente.`,
        });
      }
    } catch {
      await onRefresh({
        type: "error",
        text: "Error de conexión al resolver emergencia.",
      });
    } finally {
      setResolviendoEmgId(null);
    }
  };

  return (
    <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
      <div className="bg-[#78350F] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-amber-800">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          <h3 className="font-bold text-sm uppercase tracking-wider">
            2da Autorización de Emergencias · Pre-Alertas Amarillas (
            {emergenciasPendientes.length})
          </h3>
        </div>
        <span className="text-xs font-mono text-amber-200">
          SESIÓN HTTPONLY VERIFICADA · RESOLUCIÓN DIRECTA
        </span>
      </div>

      <div className="p-5 space-y-5">
        {emergenciasPendientes.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-5 flex items-center gap-3.5 text-emerald-950">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider">
                Sin Emergencias en Pre-Alerta Amarilla
              </h4>
              <p className="text-xs text-emerald-800 mt-0.5">
                No hay solicitudes enviadas desde terreno esperando 2da
                autorización en este momento.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {emergenciasPendientes.map((sol) => (
              <div
                key={sol.id}
                className="bg-white border border-amber-400 rounded-lg p-5 shadow-xs space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="flex flex-wrap items-center gap-2.5 text-sm">
                    <span className="font-mono font-bold bg-amber-900 text-amber-100 px-2.5 py-0.5 rounded text-xs">
                      {sol.folio}
                    </span>
                    <span className="font-mono font-extrabold text-slate-900">
                      {sol.codigo_equipo}
                    </span>
                    <span className="font-bold text-slate-800">
                      — {sol.nombre_equipo}
                    </span>
                    <span className="text-xs text-slate-500">
                      · {sol.categoria}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono font-bold text-amber-800">
                      EN PRE-ALERTA AMARILLA · PENDIENTE 2DA FIRMA
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenFicha(sol.codigo_equipo)}
                      className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir Equipo</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded border border-slate-200">
                    <span className="font-mono uppercase text-[10px] text-slate-500 block">
                      1ra Firma (Reportante)
                    </span>
                    <strong className="text-slate-900">
                      {sol.reportante_nombre}
                    </strong>
                    <span className="block font-mono text-slate-700">
                      RUT: {sol.reportante_rut}
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                      Fecha: {sol.fecha_solicitud}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded border border-slate-200">
                    <span className="font-mono uppercase text-[10px] text-slate-500 block">
                      Cliente / Obra y Ubicación
                    </span>
                    <strong className="text-slate-900">
                      {sol.cliente_obra}
                    </strong>
                    <span className="block text-slate-700 mt-0.5">
                      Ubicación: {sol.ubicacion_faena}
                    </span>
                  </div>

                  <div className="bg-red-50/70 p-3 rounded border border-red-200 space-y-1.5">
                    <span className="font-mono uppercase text-[10px] text-red-700 font-bold block">
                      Falla Declarada y Respaldo
                    </span>
                    <span className="font-semibold text-red-950 block">
                      {sol.panas_reportadas}
                    </span>
                    {sol.evidencia_url ? (
                      <div className="pt-1 space-y-1">
                        <a
                          href={sol.evidencia_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-[11px] font-mono text-[#0284C7] underline font-bold"
                        >
                          Abrir fotografía de evidencia adjunta
                        </a>
                        <img
                          src={sol.evidencia_url}
                          alt={`Evidencia ${sol.folio}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-24 object-cover rounded border border-red-200 bg-white"
                        />
                      </div>
                    ) : (
                      <span className="block text-[11px] font-mono text-amber-800">
                        Declaración con motivo técnico verificado
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center pt-1">
                  <div className="md:col-span-5">
                    <input
                      type="text"
                      value={obsEmgMap[sol.id] || ""}
                      onChange={(e) =>
                        setObsEmgMap((prev) => ({
                          ...prev,
                          [sol.id]: e.target.value,
                        }))
                      }
                      placeholder="Observación ejecutiva de Jefatura (opcional)..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <button
                      type="button"
                      disabled={resolviendoEmgId === sol.id}
                      onClick={() => handleResolverEmergencia(sol, "APROBAR")}
                      className="w-full min-h-[44px] rounded-lg bg-red-700 hover:bg-red-800 text-white font-bold py-2.5 px-3 text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <OctagonAlert className="w-4 h-4 shrink-0" />
                      <span>Confirmar y enviar a taller</span>
                    </button>
                  </div>
                  <div className="md:col-span-3">
                    <button
                      type="button"
                      disabled={resolviendoEmgId === sol.id}
                      onClick={() => handleResolverEmergencia(sol, "RECHAZAR")}
                      className="w-full min-h-[44px] rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold py-2.5 px-3 text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>Descartar reporte</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {emergenciasRecientes.length > 0 && (
          <div className="pt-3 border-t border-slate-200 space-y-2.5">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-600 font-bold">
              Auditoría · Últimas Resoluciones de Doble Autorización (
              {emergenciasRecientes.length})
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-mono uppercase text-[10px]">
                    <th className="py-2 px-3">Folio</th>
                    <th className="py-2 px-3">Equipo</th>
                    <th className="py-2 px-3">Reportante (1ra Firma)</th>
                    <th className="py-2 px-3">Resolución Jefatura</th>
                    <th className="py-2 px-3 text-right">Dictamen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {emergenciasRecientes.map((em) => (
                    <tr key={em.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {em.folio}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenFicha(em.codigo_equipo)}
                          className="font-mono font-bold text-[#0284C7] hover:underline cursor-pointer"
                        >
                          {em.codigo_equipo}
                        </button>
                        <span className="text-slate-600 ml-1.5">
                          {em.nombre_equipo}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {em.reportante_nombre} ({em.reportante_rut}) ·{" "}
                        <span className="font-mono text-slate-500">
                          {em.fecha_solicitud}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-600 max-w-xs truncate">
                        {em.observacion_resolucion}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-[11px] font-bold">
                        {em.estado === "APROBADA" ? (
                          <span className="text-red-700">
                            BLOQUEO ROJO APROBADO
                          </span>
                        ) : (
                          <span className="text-emerald-700">
                            RECHAZADA / OPERATIVA
                          </span>
                        )}
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
