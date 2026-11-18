import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  Database,
  Download,
  ExternalLink,
  Layers,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  calcularEstadoArriendo,
  formatCLP,
  type ArriendoRegistro,
  type Equipo,
  type EventoHistorial,
  type OrdenTrabajo,
} from "../../data/catalogs";

interface JefaturaAnaliticaArriendosTabProps {
  equipos: Equipo[];
  arriendos: ArriendoRegistro[];
  ordenesTrabajo: OrdenTrabajo[];
  historial: EventoHistorial[];
  onOpenFicha: (codigo: string) => void;
}

export default function JefaturaAnaliticaArriendosTab({
  equipos,
  arriendos,
  ordenesTrabajo,
  historial,
  onOpenFicha,
}: JefaturaAnaliticaArriendosTabProps) {
  const [filtroArriendo, setFiltroArriendo] = useState<
    "ACTIVO" | "VENCIDOS" | "DEVUELTO" | "TODOS"
  >("ACTIVO");

  const rankingGastoPorEquipo = useMemo(() => {
    const eqMap = new Map(equipos.map((e) => [e.codigo, e]));
    const map = new Map<
      string,
      {
        codigo: string;
        nombre: string;
        categoria: string;
        gasto: number;
        eventos: number;
      }
    >();

    for (const h of historial) {
      const c = Number(h.costo_repuestos) || 0;
      if (c <= 0) continue;
      const eq = eqMap.get(h.codigo_equipo);
      const cur = map.get(h.codigo_equipo) || {
        codigo: h.codigo_equipo,
        nombre: eq?.nombre || h.codigo_equipo,
        categoria: eq?.categoria || "General",
        gasto: 0,
        eventos: 0,
      };
      cur.gasto += c;
      cur.eventos += 1;
      map.set(h.codigo_equipo, cur);
    }

    return Array.from(map.values())
      .sort((a, b) => b.gasto - a.gasto)
      .slice(0, 10);
  }, [historial, equipos]);

  const fallasPorCategoria = useMemo(() => {
    const eqMap = new Map(equipos.map((e) => [e.codigo, e]));
    const map = new Map<
      string,
      { categoria: string; ots: number; costo: number }
    >();

    for (const ot of ordenesTrabajo) {
      const eq = eqMap.get(ot.codigo_equipo);
      const cat = eq?.categoria || "Sin Categoría";
      const cur = map.get(cat) || { categoria: cat, ots: 0, costo: 0 };
      cur.ots += 1;
      cur.costo +=
        (Number(ot.costo_repuestos) || 0) + (Number(ot.costo_otros) || 0);
      map.set(cat, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.ots - a.ots);
  }, [ordenesTrabajo, equipos]);

  const equiposProximosMantencion = useMemo(() => {
    return [...equipos]
      .map((e) => {
        const lim = Math.max(1, Number(e.limite_mantencion) || 1);
        const uso = Number(e.uso_acumulado) || 0;
        const pct = Math.min(100, Math.round((uso / lim) * 100));
        const rest = lim - uso;
        return {
          ...e,
          pct,
          rest,
        };
      })
      .filter((e) => e.pct >= 75)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 12);
  }, [equipos]);

  const arriendosEnriquecidos = useMemo(() => {
    const eqMap = new Map(equipos.map((e) => [e.codigo, e]));
    return arriendos.map((arr) => {
      const eq = eqMap.get(arr.codigo_equipo);
      const estadoVivo =
        arr.estado === "ACTIVO"
          ? calcularEstadoArriendo({
              en_arriendo: 1,
              fecha_salida: arr.fecha_salida,
              fecha_retorno_estimada: arr.fecha_retorno_estimada,
            })
          : {
              diasEnObra: arr.dias_cobrables || 1,
              diasAtraso: 0,
              estaVencido: false,
            };

      return {
        ...arr,
        nombre_equipo: arr.nombre_equipo || eq?.nombre || arr.codigo_equipo,
        diasVivo:
          arr.estado === "ACTIVO"
            ? estadoVivo.diasEnObra
            : Math.max(1, Number(arr.dias_cobrables) || 1),
        diasAtraso: estadoVivo.diasAtraso,
        estaVencido: estadoVivo.estaVencido,
      };
    });
  }, [arriendos, equipos]);

  const metricasArriendo = useMemo(() => {
    let activos = 0;
    let vencidos = 0;
    let devueltos = 0;
    let totalDiasCobrables = 0;

    for (const a of arriendosEnriquecidos) {
      if (a.estado === "ACTIVO") {
        activos += 1;
        if (a.estaVencido) vencidos += 1;
      } else {
        devueltos += 1;
      }
      totalDiasCobrables += a.diasVivo;
    }
    return { activos, vencidos, devueltos, totalDiasCobrables };
  }, [arriendosEnriquecidos]);

  const arriendosFiltrados = useMemo(() => {
    if (filtroArriendo === "ACTIVO") {
      return arriendosEnriquecidos.filter((a) => a.estado === "ACTIVO");
    }
    if (filtroArriendo === "VENCIDOS") {
      return arriendosEnriquecidos.filter(
        (a) => a.estado === "ACTIVO" && a.estaVencido
      );
    }
    if (filtroArriendo === "DEVUELTO") {
      return arriendosEnriquecidos.filter((a) => a.estado === "DEVUELTO");
    }
    return arriendosEnriquecidos;
  }, [arriendosEnriquecidos, filtroArriendo]);

  return (
    <div className="space-y-6">
      {/* ARRIENDOS ACTIVOS, ATRASOS & TRAZABILIDAD POR CLIENTE */}
      <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-[#0F172A] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-4 h-4 text-sky-400" />
            <div>
              <h3 className="font-bold text-sm uppercase tracking-wider">
                Arriendos Activos, Atrasos y Trazabilidad por Cliente
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">
                Activos: {metricasArriendo.activos} · Vencidos:{" "}
                {metricasArriendo.vencidos} · Devueltos:{" "}
                {metricasArriendo.devueltos} · Días Cobrables Totales:{" "}
                {metricasArriendo.totalDiasCobrables} d
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["ACTIVO", `Activos (${metricasArriendo.activos})`],
                ["VENCIDOS", `Vencidos (${metricasArriendo.vencidos})`],
                ["DEVUELTO", `Devueltos (${metricasArriendo.devueltos})`],
                ["TODOS", `Todos (${arriendosEnriquecidos.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFiltroArriendo(key)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase cursor-pointer transition-colors whitespace-nowrap ${
                  filtroArriendo === key
                    ? key === "VENCIDOS" && metricasArriendo.vencidos > 0
                      ? "bg-red-600 text-white"
                      : "bg-sky-500 text-slate-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {arriendosFiltrados.length === 0 ? (
            <div className="p-5 text-xs text-slate-500 font-medium">
              No existen contratos o movimientos de arriendo en el filtro{" "}
              <strong>{filtroArriendo}</strong>.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-200/80 text-slate-700 border-b border-slate-300 font-mono uppercase text-[11px]">
                  <th className="py-2.5 px-3">Equipo</th>
                  <th className="py-2.5 px-3">Cliente / RUT</th>
                  <th className="py-2.5 px-3">Obra & Guía</th>
                  <th className="py-2.5 px-3">Salida / Retorno Est.</th>
                  <th className="py-2.5 px-3 text-right">Días Cobrables</th>
                  <th className="py-2.5 px-3 text-right">Estado / Alerta</th>
                  <th className="py-2.5 px-3 text-right">Ficha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {arriendosFiltrados.slice(0, 60).map((arr) => (
                  <tr
                    key={arr.id}
                    className={
                      arr.estaVencido
                        ? "bg-red-50/60 hover:bg-red-50"
                        : "hover:bg-slate-50"
                    }
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-mono font-bold text-slate-900 block">
                        {arr.codigo_equipo}
                      </span>
                      <span className="text-[11px] text-slate-600">
                        {arr.nombre_equipo}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">
                        {arr.cliente_obra}
                      </div>
                      <div className="font-mono text-[11px] text-slate-600">
                        {arr.cliente_rut || "Sin RUT"}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      <div className="truncate max-w-[180px]">
                        {arr.ubicacion_faena || "En faena"}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        Guía: {arr.guia_despacho || "S/G"}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      <div>Sal: {arr.fecha_salida.slice(0, 10)}</div>
                      <div className="text-[11px] text-slate-500">
                        Est: {arr.fecha_retorno_estimada || "—"}
                        {arr.fecha_retorno_real
                          ? ` · Real: ${arr.fecha_retorno_real.slice(0, 10)}`
                          : ""}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                      {arr.diasVivo} días
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {arr.estado === "ACTIVO" ? (
                        arr.estaVencido ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-400 font-mono text-[10px] font-bold">
                            <AlertTriangle className="w-3 h-3" />
                            ATRASADO +{arr.diasAtraso}d
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300 font-mono text-[10px] font-bold">
                            EN OBRA AL DÍA
                          </span>
                        )
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono text-[10px] font-bold">
                          DEVUELTO
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenFicha(arr.codigo_equipo)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-[11px] font-bold cursor-pointer whitespace-nowrap"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Abrir</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* RANKING DE GASTOS & VOLUMEN DE OTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-[#0C4A6E] text-white px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <TrendingUp className="w-4 h-4 text-sky-300" />
              <h3 className="font-bold text-sm uppercase tracking-wider">
                Ranking de Equipos con Mayor Gasto en Taller
              </h3>
            </div>
          </div>

          <div className="p-5 space-y-3">
            {rankingGastoPorEquipo.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aún no se registran eventos con costos imputados.
              </p>
            ) : (
              rankingGastoPorEquipo.map((item, idx) => {
                const maxGasto = rankingGastoPorEquipo[0]?.gasto || 1;
                const pct = Math.min(
                  100,
                  Math.round((item.gasto / maxGasto) * 100)
                );
                return (
                  <div
                    key={item.codigo}
                    className="bg-white border border-slate-200 rounded-md p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-slate-800 text-white font-mono text-[11px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {item.codigo}
                        </span>
                        <span className="text-slate-600 font-medium">
                          {item.nombre}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-[#0C4A6E] tabular-nums">
                        {formatCLP(item.gasto)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0284C7]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>{item.categoria}</span>
                      <span className="font-mono tabular-nums">
                        {item.eventos} intervenciones con costo
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-[#064E3B] text-white px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-emerald-300" />
              <h3 className="font-bold text-sm uppercase tracking-wider">
                Volumen de Órdenes de Trabajo por Categoría
              </h3>
            </div>
          </div>

          <div className="p-5 space-y-3">
            {fallasPorCategoria.length === 0 ? (
              <p className="text-xs text-slate-500">
                No se registran OTs en el sistema.
              </p>
            ) : (
              fallasPorCategoria.map((cat) => (
                <div
                  key={cat.categoria}
                  className="bg-white border border-slate-200 rounded-md p-3.5 flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-sm text-slate-900 block">
                      {cat.categoria}
                    </span>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      Costo Asociado: {formatCLP(cat.costo)} CLP
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded bg-sky-100 text-sky-900 border border-sky-300 font-mono text-xs font-bold tabular-nums">
                      {cat.ots} OTs
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* PLANIFICACIÓN PREVENTIVA >=75% */}
      <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-[#1E293B] text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm uppercase tracking-wider">
              Planificación Preventiva: Equipos Próximos o Vencidos por
              Horómetro / Uso
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-300 tabular-nums">
            {equiposProximosMantencion.length} UNIDADES EN ALERTA (&ge;75%)
          </span>
        </div>

        <div className="p-5">
          {equiposProximosMantencion.length === 0 ? (
            <p className="text-xs text-slate-500">
              Toda la flota se encuentra bajo el 75% de su ciclo de
              mantenimiento preventivo.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {equiposProximosMantencion.map((item) => {
                const unidad = item.tipo_medicion === "HORAS" ? "hrs" : "días";
                const vencido = item.rest <= 0;
                return (
                  <div
                    key={item.codigo}
                    className="bg-white border border-slate-200 rounded-md p-3.5 space-y-2 flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-900">
                            {item.codigo}
                          </span>
                          <span className="text-xs text-slate-500">
                            · {item.categoria}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-slate-800 mt-0.5">
                          {item.nombre}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenFicha(item.codigo)}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Abrir Ficha
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono tabular-nums">
                        <span className="text-slate-600">
                          Ciclo: {item.uso_acumulado} / {item.limite_mantencion}{" "}
                          {unidad}
                        </span>
                        <span
                          className={
                            vencido
                              ? "text-red-700 font-bold"
                              : "text-amber-700 font-bold"
                          }
                        >
                          {vencido
                            ? `VENCIDO (+${Math.abs(item.rest)} ${unidad})`
                            : `Restan ${item.rest} ${unidad}`}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            vencido ? "bg-red-600" : "bg-amber-500"
                          }`}
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RESPALDOS PROTEGIDOS DE JEFATURA */}
      <div className="bg-[#0F172A] border border-slate-700 rounded-lg p-5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Respaldos Oficiales y Auditoría (Protegido por Sesión Jefatura)
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Descarga inmediata de SQLite transaccional, respaldo JSON
              estructurado o paquete completo del sistema.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="/api/backup/sqlite"
            download="rental_valdivia.sqlite"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-sky-300 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>SQLite (.sqlite)</span>
          </a>
          <a
            href="/api/backup/db"
            download="rental_valdivia_db.json"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-emerald-300 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Respaldo JSON</span>
          </a>
          <a
            href="/api/backup/zip"
            download="rental-valdivia-v12-completo.zip"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#065F46] hover:bg-[#047857] border border-emerald-500/40 text-xs font-bold text-white whitespace-nowrap"
          >
            <Archive className="w-3.5 h-3.5 shrink-0" />
            <span>Paquete Completo (.zip)</span>
          </a>
          <details className="relative">
            <summary className="list-none inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 cursor-pointer whitespace-nowrap">
              <span>Avanzado</span>
            </summary>
            <div className="mt-2 md:absolute md:right-0 md:z-20 bg-slate-900 border border-slate-700 rounded-md p-2 shadow-xl">
              <a
                href="/api/backup/codigo-completo"
                download="RENTAL_VALDIVIA_CODIGO_COMPLETO.md"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-xs font-bold text-amber-300 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>Código Completo (.md)</span>
              </a>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
