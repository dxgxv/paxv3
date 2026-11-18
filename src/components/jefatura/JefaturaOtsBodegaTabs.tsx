import React, { useState } from "react";
import {
  FileSpreadsheet,
  Package,
  Plus,
  Printer,
  RefreshCw,
} from "lucide-react";
import {
  duracionLegible,
  formatCLP,
  PAUTAS_MECANICAS,
  type Equipo,
  type OrdenTrabajo,
  type Repuesto,
} from "../../data/catalogs";
import { apiRequest } from "../../lib/apiClient";
import { type InformePdfTarget } from "../InformePdfModal";

const CATEGORIAS_REP = ["General", ...Object.keys(PAUTAS_MECANICAS)];

interface JefaturaOtsTabProps {
  equipos: Equipo[];
  ordenesTrabajo: OrdenTrabajo[];
  onOpenFicha: (codigo: string) => void;
  onOpenPdf: (target: InformePdfTarget) => void;
}

export function JefaturaOtsTab({
  equipos,
  ordenesTrabajo,
  onOpenFicha,
  onOpenPdf,
}: JefaturaOtsTabProps) {
  return (
    <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
      <div className="bg-[#1E293B] text-white px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-sm uppercase tracking-wider">
            Libro Mayor de Órdenes de Trabajo (OTs)
          </h3>
        </div>
        <span className="text-xs font-mono text-slate-300 tabular-nums">
          {ordenesTrabajo.length} REGISTROS
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-200/80 text-slate-700 border-b border-slate-300 font-mono uppercase text-[11px]">
              <th className="py-2.5 px-3">Folio</th>
              <th className="py-2.5 px-3">Equipo</th>
              <th className="py-2.5 px-3">Tipo / Estado</th>
              <th className="py-2.5 px-3">Apertura / Duración</th>
              <th className="py-2.5 px-3">Mecánico / Responsable</th>
              <th className="py-2.5 px-3">Descripción / Cierre</th>
              <th className="py-2.5 px-3 text-right">Costo Total</th>
              <th className="py-2.5 px-3 text-right">Informe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {ordenesTrabajo.map((ot) => {
              const totalOt =
                (Number(ot.costo_repuestos) || 0) +
                (Number(ot.costo_otros) || 0);
              const abierta = ot.estado !== "CERRADA";
              return (
                <tr key={ot.id} className="hover:bg-slate-100/80">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                    {ot.folio}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenFicha(ot.codigo_equipo)}
                      className="font-mono font-bold text-[#0284C7] hover:underline cursor-pointer"
                    >
                      {ot.codigo_equipo}
                    </button>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-slate-800 block">
                      {ot.tipo}
                    </span>
                    <span
                      className={`inline-block mt-0.5 px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                        abierta
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                      }`}
                    >
                      {ot.estado}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                    <div>{ot.fecha_apertura}</div>
                    <div className="text-[11px] text-slate-500">
                      Duración:{" "}
                      {duracionLegible(ot.fecha_apertura, ot.fecha_cierre)}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-800">
                    <div className="font-medium">
                      {ot.mecanico || ot.responsable}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                    <div className="truncate" title={ot.descripcion}>
                      {ot.descripcion}
                    </div>
                    {ot.detalle_cierre && (
                      <div
                        className="text-emerald-800 font-medium truncate"
                        title={ot.detalle_cierre}
                      >
                        Cierre: {ot.detalle_cierre}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap tabular-nums">
                    {formatCLP(totalOt)}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenPdf({
                          tipo: "ot",
                          ot,
                          equipo: equipos.find(
                            (eq) => eq.codigo === ot.codigo_equipo
                          ),
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0F172A] hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                    >
                      <Printer className="w-3 h-3" />
                      <span>PDF</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface JefaturaBodegaTabProps {
  repuestos: Repuesto[];
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
}

export function JefaturaBodegaTab({
  repuestos,
  onRefresh,
}: JefaturaBodegaTabProps) {
  const [modoBodega, setModoBodega] = useState<"ingreso" | "crear">("ingreso");
  const [repuestoIdSel, setRepuestoIdSel] = useState<number>(
    repuestos[0]?.id || 1
  );
  const [cantIngreso, setCantIngreso] = useState<number>(5);
  const [nuevoCostoIngreso, setNuevoCostoIngreso] = useState<number>(0);

  const [nuevoCodRep, setNuevoCodRep] = useState("");
  const [nuevoNomRep, setNuevoNomRep] = useState("");
  const [nuevoAplicaA, setNuevoAplicaA] = useState("General");
  const [nuevaUnidadRep, setNuevaUnidadRep] = useState("unidad");
  const [nuevoStockRep, setNuevoStockRep] = useState<number>(5);
  const [nuevoMinRep, setNuevoMinRep] = useState<number>(2);
  const [nuevoCostoRep, setNuevoCostoRep] = useState<number>(10000);
  const [savingBodega, setSavingBodega] = useState(false);

  const handleBodegaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBodega(true);
    try {
      if (modoBodega === "ingreso") {
        const res = await apiRequest("/api/repuestos/ingreso", {
          method: "POST",
          body: JSON.stringify({
            repuesto_id: repuestoIdSel,
            cantidad: cantIngreso,
            nuevo_costo: nuevoCostoIngreso,
          }),
        });
        if (!res.ok) {
          await onRefresh({
            type: "error",
            text: res.data?.error || "Error al ingresar stock.",
          });
        } else {
          await onRefresh({
            type: "success",
            text: res.data?.message || "Stock actualizado correctamente.",
          });
        }
      } else {
        const res = await apiRequest("/api/repuestos/crear", {
          method: "POST",
          body: JSON.stringify({
            codigo: nuevoCodRep,
            nombre: nuevoNomRep,
            aplica_a: nuevoAplicaA,
            unidad: nuevaUnidadRep,
            stock: nuevoStockRep,
            stock_minimo: nuevoMinRep,
            costo_unitario: nuevoCostoRep,
          }),
        });
        if (!res.ok) {
          await onRefresh({
            type: "error",
            text: res.data?.error || "Error al crear repuesto.",
          });
        } else {
          setNuevoCodRep("");
          setNuevoNomRep("");
          await onRefresh({
            type: "success",
            text: res.data?.message || "Nuevo ítem creado en bodega.",
          });
        }
      }
    } catch {
      await onRefresh({
        type: "error",
        text: "Error de conexión al actualizar bodega.",
      });
    } finally {
      setSavingBodega(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-[#1E293B] text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Package className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm uppercase tracking-wider">
              Catálogo y Existencias de Bodega de Repuestos
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-300 tabular-nums">
            {repuestos.length} ÍTEMS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-200/80 text-slate-700 border-b border-slate-300 font-mono uppercase text-[11px]">
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3">Código / Repuesto</th>
                <th className="py-2.5 px-3">Familia</th>
                <th className="py-2.5 px-3 text-right">Stock</th>
                <th className="py-2.5 px-3 text-right">Costo Unit.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {repuestos.map((item) => {
                const critico = item.stock <= item.stock_minimo;
                return (
                  <tr
                    key={item.id}
                    className={
                      critico ? "bg-red-50/70" : "hover:bg-slate-100/70"
                    }
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            critico
                              ? "bg-red-500 shadow-[0_0_6px_#EF4444]"
                              : "bg-emerald-500 shadow-[0_0_6px_#10B981]"
                          }`}
                        />
                        {critico ? "BAJO MÍN." : "OK"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-bold text-slate-900">
                        {item.codigo}
                      </span>
                      <span className="block text-slate-700 font-medium">
                        {item.nombre}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {item.aplica_a}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                      {item.stock} {item.unidad}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-800 tabular-nums whitespace-nowrap">
                      {formatCLP(item.costo_unitario)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lg:col-span-5 bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-[#064E3B] text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-emerald-300" />
            <h3 className="font-bold text-sm uppercase tracking-wider">
              Abastecimiento y Creación de Repuestos
            </h3>
          </div>
        </div>

        <form onSubmit={handleBodegaSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 bg-slate-200 p-1 rounded-md">
            <button
              type="button"
              onClick={() => setModoBodega("ingreso")}
              className={`py-2 px-3 rounded text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                modoBodega === "ingreso"
                  ? "bg-[#0F172A] text-white"
                  : "text-slate-700 hover:bg-slate-300/60"
              }`}
            >
              Sumar Stock
            </button>
            <button
              type="button"
              onClick={() => setModoBodega("crear")}
              className={`py-2 px-3 rounded text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                modoBodega === "crear"
                  ? "bg-[#0F172A] text-white"
                  : "text-slate-700 hover:bg-slate-300/60"
              }`}
            >
              Nuevo Repuesto
            </button>
          </div>

          {modoBodega === "ingreso" ? (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Seleccionar Repuesto
                </label>
                <select
                  value={repuestoIdSel}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setRepuestoIdSel(id);
                    const found = repuestos.find((r) => r.id === id);
                    if (found) setNuevoCostoIngreso(found.costo_unitario);
                  }}
                  className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
                >
                  {repuestos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.codigo} - {r.nombre} (Stock: {r.stock})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Cantidad a Ingresar
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={cantIngreso}
                    onChange={(e) =>
                      setCantIngreso(Math.max(1, Number(e.target.value)))
                    }
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Nuevo Costo Unit. ($ CLP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={nuevoCostoIngreso}
                    onChange={(e) =>
                      setNuevoCostoIngreso(Math.max(0, Number(e.target.value)))
                    }
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm font-mono text-slate-900"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Código SKU
                  </label>
                  <input
                    type="text"
                    value={nuevoCodRep}
                    onChange={(e) => setNuevoCodRep(e.target.value)}
                    placeholder="Ej. REP-025"
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm font-mono uppercase text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Familia / Aplica a
                  </label>
                  <select
                    value={nuevoAplicaA}
                    onChange={(e) => setNuevoAplicaA(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
                  >
                    {CATEGORIAS_REP.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Nombre Técnico del Repuesto
                  </label>
                  <input
                    type="text"
                    value={nuevoNomRep}
                    onChange={(e) => setNuevoNomRep(e.target.value)}
                    placeholder="Ej. Kit de sellos hidráulicos"
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Unidad
                  </label>
                  <input
                    type="text"
                    value={nuevaUnidadRep}
                    onChange={(e) => setNuevaUnidadRep(e.target.value)}
                    placeholder="unidad / L"
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                    Stock Inicial
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={nuevoStockRep}
                    onChange={(e) => setNuevoStockRep(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                    Stock Mín.
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={nuevoMinRep}
                    onChange={(e) => setNuevoMinRep(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                    Costo ($ CLP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={nuevoCostoRep}
                    onChange={(e) => setNuevoCostoRep(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={savingBodega}
            className="w-full bg-[#065F46] hover:bg-[#047857] text-white font-bold py-2.5 px-4 rounded-md text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>
              {savingBodega
                ? "Actualizando Bodega..."
                : "Guardar Movimiento en Bodega"}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
