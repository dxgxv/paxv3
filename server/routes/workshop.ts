import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import {
  ESTADO_DISPONIBLE,
  ESTADO_EN_PANA,
  ESTADO_EN_PRESUPUESTO,
  PAUTAS_MECANICAS,
  type EstadoOperativo,
} from "../../src/data/catalogs.ts";
import {
  db,
  ahoraStr,
  otAbierta,
  abrirOt,
  cerrarOt,
  registrarEvento,
  runDbTransaction,
  upsertEquipoSql,
  upsertOtSql,
  upsertRepuestoSql,
  upsertOtRepuestoSql,
  deleteOtRepuestoSql,
  getIdempotentResponse,
  saveIdempotentResponse,
} from "../db.ts";

export function createWorkshopRouter() {
  const router = Router();

  // Abrir OT manualmente
  router.post("/equipos/:codigo/ot/abrir", (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }
    const { tipo } = req.body || {};
    const tipoOt: "CORRECTIVA" | "PREVENTIVA" =
      tipo === "PREVENTIVA" ? "PREVENTIVA" : "CORRECTIVA";
    const ahora = ahoraStr();
    const desc =
      eq.panas_reportadas ||
      (tipoOt === "PREVENTIVA"
        ? "Mantención preventiva"
        : "Revisión en taller");

    let folio = "";
    runDbTransaction(() => {
      folio = abrirOt(eq.codigo, tipoOt, desc, "Taller", ahora, true);
    });

    res.json({ ok: true, folio, message: `${folio} abierta.` });
  });

  // Actualizar estado de OT
  router.post("/ot/:id/estado", (req, res) => {
    const otId = Number(req.params.id);
    const ot = db.ordenes_trabajo.find((o) => o.id === otId);
    if (!ot) {
      res.status(404).json({ ok: false, error: "OT no encontrada." });
      return;
    }
    const { nuevo_estado } = req.body || {};
    const ahora = ahoraStr();
    const estadoAnterior = ot.estado;

    runDbTransaction(() => {
      ot.estado = nuevo_estado;
      upsertOtSql(ot);
      registrarEvento(
        ot.codigo_equipo,
        ahora,
        "ESTADO OT",
        "Taller",
        0,
        0,
        `${ot.folio}: ${estadoAnterior} → ${nuevo_estado}`,
        true
      );
    });

    res.json({
      ok: true,
      message: `${ot.folio} pasó a ${nuevo_estado}.`,
    });
  });

  // Agregar repuesto a OT
  router.post("/ot/:id/repuesto", (req, res) => {
    const otId = Number(req.params.id);
    const ot = db.ordenes_trabajo.find((o) => o.id === otId);
    if (!ot) {
      res.status(404).json({ ok: false, error: "OT no encontrada." });
      return;
    }
    if (ot.estado === "CERRADA") {
      res.status(409).json({
        ok: false,
        error: `La ${ot.folio} ya está cerrada. No se pueden imputar nuevos repuestos.`,
      });
      return;
    }

    const { repuesto_id, cantidad } = req.body || {};
    const rep = db.repuestos.find((r) => r.id === Number(repuesto_id));
    if (!rep) {
      res.status(404).json({ ok: false, error: "Repuesto no encontrado." });
      return;
    }
    const cant = Math.max(1, Number(cantidad) || 1);
    if (cant > rep.stock) {
      res.status(400).json({
        ok: false,
        error: `No alcanza: quedan ${rep.stock} ${rep.unidad} de ${rep.nombre}.`,
      });
      return;
    }

    const ahora = ahoraStr();
    runDbTransaction(() => {
      db.counters.ot_repuestos += 1;
      const nuevoItem = {
        id: db.counters.ot_repuestos,
        ot_id: ot.id,
        repuesto_id: rep.id,
        cantidad: cant,
        costo_unitario: rep.costo_unitario,
        fecha: ahora,
      };
      db.ot_repuestos.push(nuevoItem);
      upsertOtRepuestoSql(nuevoItem);

      rep.stock -= cant;
      upsertRepuestoSql(rep);

      ot.costo_repuestos = db.ot_repuestos
        .filter((item) => item.ot_id === ot.id)
        .reduce((acc, item) => acc + item.cantidad * item.costo_unitario, 0);
      upsertOtSql(ot);
    });

    const bajoMinimo = rep.stock <= rep.stock_minimo;
    const message = bajoMinimo
      ? `Cargado a ${ot.folio}. Atención: quedan ${rep.stock} ${rep.unidad} de ${rep.nombre} (mínimo ${rep.stock_minimo}).`
      : `${cant} × ${rep.nombre} cargado a ${ot.folio}.`;

    res.json({ ok: true, bajoMinimo, message });
  });

  // Revertir repuesto cargado por error en OT abierta (devuelve stock a bodega)
  router.post("/ot/:id/repuesto/:itemId/revertir", (req, res) => {
    const otId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const ot = db.ordenes_trabajo.find((o) => o.id === otId);
    if (!ot) {
      res.status(404).json({ ok: false, error: "OT no encontrada." });
      return;
    }
    if (ot.estado === "CERRADA") {
      res.status(409).json({
        ok: false,
        error: `No se pueden revertir repuestos de ${ot.folio} porque ya está CERRADA.`,
      });
      return;
    }

    const idx = db.ot_repuestos.findIndex(
      (item) => item.id === itemId && item.ot_id === otId
    );
    if (idx === -1) {
      res.status(404).json({
        ok: false,
        error: "Registro de repuesto en OT no encontrado.",
      });
      return;
    }

    const item = db.ot_repuestos[idx];
    const rep = db.repuestos.find((r) => r.id === item.repuesto_id);
    const ahora = ahoraStr();

    runDbTransaction(() => {
      db.ot_repuestos.splice(idx, 1);
      deleteOtRepuestoSql(item.id);

      if (rep) {
        rep.stock += Number(item.cantidad) || 0;
        upsertRepuestoSql(rep);
      }

      ot.costo_repuestos = db.ot_repuestos
        .filter((r) => r.ot_id === ot.id)
        .reduce((acc, r) => acc + r.cantidad * r.costo_unitario, 0);
      upsertOtSql(ot);

      registrarEvento(
        ot.codigo_equipo,
        ahora,
        "DEVOLUCIÓN REPUESTO OT",
        "Taller",
        0,
        0,
        `${ot.folio}: Se revirtieron ${item.cantidad} × ${
          rep?.nombre || `Repuesto #${item.repuesto_id}`
        } a bodega.`,
        true
      );
    });

    res.json({
      ok: true,
      message: `Reversión completada en ${ot.folio}: stock devuelto a bodega.`,
    });
  });

  // Diagnóstico de panas en taller
  router.post("/equipos/:codigo/diagnostico", (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }
    const { panas_taller, otra_pana_taller } = req.body || {};
    const ahora = ahoraStr();

    const panasActuales = eq.panas_reportadas
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    const danosPrevios = panasActuales.filter((p) => p.startsWith("Daño:"));
    const marcadas: string[] = Array.isArray(panas_taller) ? panas_taller : [];
    const nuevasP = [...danosPrevios, ...marcadas];
    if (String(otra_pana_taller || "").trim()) {
      nuevasP.push(`Otra pana: ${String(otra_pana_taller).trim()}`);
    }

    const strPanasTal = nuevasP.join(" | ");
    const obsTal = strPanasTal
      ? `Diagnóstico Taller: ${strPanasTal}`
      : "En revisión de taller.";
    const estTal: EstadoOperativo =
      eq.estado_operativo === ESTADO_EN_PRESUPUESTO
        ? ESTADO_EN_PRESUPUESTO
        : ESTADO_EN_PANA;

    runDbTransaction(() => {
      eq.estado_operativo = estTal;
      eq.falla_activa = 1;
      eq.panas_reportadas = strPanasTal;
      eq.ultima_observacion = obsTal;
      eq.fecha_actualizacion = ahora;
      upsertEquipoSql(eq);

      registrarEvento(
        eq.codigo,
        ahora,
        "DIAGNÓSTICO TALLER",
        "Taller",
        0,
        0,
        obsTal,
        true
      );
      if (estTal === ESTADO_EN_PANA) {
        abrirOt(
          eq.codigo,
          "CORRECTIVA",
          strPanasTal || "Diagnóstico en taller",
          "Taller",
          ahora,
          true
        );
      }
    });

    res.json({ ok: true, message: "Diagnóstico de panas actualizado." });
  });

  // Reparado (cerrar pana)
  router.post("/equipos/:codigo/reparar", (req, res) => {
    const clientTxId = req.body?.client_tx_id;
    const prev = getIdempotentResponse(clientTxId);
    if (prev) {
      res.status(prev.statusCode).json(prev.payload);
      return;
    }

    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }
    const { mecanico, costo_rep, detalle_ot } = req.body || {};
    const ahora = ahoraStr();
    const mec = String(mecanico || "Taller Central").trim();
    const costoExtra = Math.max(0, Number(costo_rep) || 0);
    const textoExtra =
      String(detalle_ot || "").trim() || "Reparación sin detalle.";

    let resumen = `Pana cerrada ({${
      eq.panas_reportadas || "sin detalle"
    }}). ${textoExtra}`;

    runDbTransaction(() => {
      const { folio: folioCerrada, costoInv } = cerrarOt(
        eq.codigo,
        mec,
        textoExtra,
        costoExtra,
        ahora,
        true
      );
      if (folioCerrada) {
        resumen = `${folioCerrada} cerrada. ${resumen}`;
      }

      eq.estado_operativo = ESTADO_DISPONIBLE;
      eq.falla_activa = 0;
      eq.panas_reportadas = "";
      eq.ultima_observacion = `Reparada por ${mec}: ${textoExtra}`;
      eq.fecha_actualizacion = ahora;
      upsertEquipoSql(eq);

      registrarEvento(
        eq.codigo,
        ahora,
        "REPARACIÓN TALLER",
        mec,
        0,
        costoExtra + costoInv,
        resumen,
        true
      );
    });

    const aviso =
      eq.uso_acumulado >= eq.limite_mantencion
        ? " Atención: ya pide mantención preventiva."
        : "";
    const payload = {
      ok: true,
      message: `Pana cerrada, máquina de vuelta en patio.${aviso}`,
    };
    saveIdempotentResponse(clientTxId, 200, payload);
    res.json(payload);
  });

  // Pauta completa (reiniciar uso)
  router.post("/equipos/:codigo/pauta", (req, res) => {
    const clientTxId = req.body?.client_tx_id;
    const prev = getIdempotentResponse(clientTxId);
    if (prev) {
      res.status(prev.statusCode).json(prev.payload);
      return;
    }

    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }
    const { mecanico, costo_rep, detalle_ot, items_completados, total_items } =
      req.body || {};
    const ahora = ahoraStr();
    const mec = String(mecanico || "Taller Central").trim();
    const costoExtra = Math.max(0, Number(costo_rep) || 0);
    const textoExtra =
      String(detalle_ot || "").trim() ||
      "Pauta preventiva estándar realizada.";

    const tienePana =
      Number(eq.falla_activa) === 1 || eq.estado_operativo === ESTADO_EN_PANA;
    const esperaPresupuesto = eq.estado_operativo === ESTADO_EN_PRESUPUESTO;

    let resumenTareas = `Pauta completada (${items_completados || 5}/${
      total_items || 5
    } ítems). ${textoExtra}`;

    runDbTransaction(() => {
      let costoInv = 0;
      const otActual = otAbierta(eq.codigo);
      if (otActual && otActual.tipo === "PREVENTIVA") {
        const cerrada = cerrarOt(
          eq.codigo,
          mec,
          resumenTareas,
          costoExtra,
          ahora,
          true
        );
        costoInv = cerrada.costoInv;
        if (cerrada.folio) {
          resumenTareas = `${cerrada.folio} cerrada. ${resumenTareas}`;
        }
      }

      eq.uso_acumulado = 0;
      eq.ultimo_horometro_mantencion = Number(eq.horometro_actual) || 0;
      eq.ultima_observacion = `Pauta por ${mec}: ${resumenTareas}`;
      eq.fecha_actualizacion = ahora;
      if (!tienePana && !esperaPresupuesto) {
        eq.estado_operativo = ESTADO_DISPONIBLE;
      }
      upsertEquipoSql(eq);

      registrarEvento(
        eq.codigo,
        ahora,
        "MANTENCIÓN TALLER",
        mec,
        0,
        costoExtra + costoInv,
        resumenTareas,
        true
      );
    });

    const warning = tienePana || esperaPresupuesto;
    const payload = {
      ok: true,
      warning,
      message: warning
        ? "Pauta registrada y uso reiniciado. La pana sigue abierta: ciérrala con 'Reparado'."
        : "Pauta registrada, máquina lista.",
    };
    saveIdempotentResponse(clientTxId, 200, payload);
    res.json(payload);
  });

  // Asistente Técnico IA (Gemini) — Diagnóstico rápido y Chat Multi-Turno
  router.post("/gemini/diagnose", async (req, res) => {
    const { codigo, modo, consulta, model: requestedModel } = req.body || {};
    const eq = db.equipos.find((e) => e.codigo === codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }

    const pautaActual =
      PAUTAS_MECANICAS[eq.categoria] ||
      PAUTAS_MECANICAS["Maquinaria con Horómetro"];
    const contextoFalla = eq.panas_reportadas || eq.ultima_observacion;

    let promptBase = String(consulta || "").trim();
    if (!promptBase) {
      if (modo === "pauta") {
        promptBase = `Dame el procedimiento técnico resumido para ejecutar esta pauta en ${eq.categoria}: ${pautaActual.join(", ")}`;
      } else {
        promptBase = `Analiza las siguientes panas reportadas: ${contextoFalla}`;
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      res.status(400).json({
        ok: false,
        error:
          "Clave GEMINI_API_KEY no configurada. Verifícala en el panel Settings > Secrets.",
      });
      return;
    }

    const selectedModel =
      requestedModel === "gemini-3.1-flash-lite"
        ? "gemini-3.1-flash-lite"
        : "gemini-4-hydrogen";

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const systemInstruction =
        `Eres el Jefe de Taller Mecánico Senior experto en maquinaria industrial de arriendo de Rental Valdivia. ` +
        `Equipo en banco: ${eq.codigo} - ${eq.nombre} (Categoría: ${eq.categoria}). ` +
        `Estado operativo: ${eq.estado_operativo}. Uso acumulado: ${eq.uso_acumulado}/${eq.limite_mantencion} ${eq.tipo_medicion}. ` +
        `Panas activas: '${eq.panas_reportadas || "Ninguna"}'. Última observación: '${eq.ultima_observacion}'. ` +
        `Pauta preventiva oficial de la categoría: ${pautaActual.join(" | ")}. ` +
        `Responde siempre en español técnico claro, estructurado con puntos accionables: 1) Causa probable, 2) Pruebas en banco de taller, 3) Repuestos e insumos críticos a verificar.`;

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: promptBase,
        config: {
          systemInstruction,
        },
      });

      res.json({
        ok: true,
        text: response.text || "Sin respuesta del asistente.",
        model: selectedModel,
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: `Error al consultar Gemini (${selectedModel}): ${error?.message || String(error)}`,
      });
    }
  });

  // Chat Multi-Turno con Asistente Técnico IA (Gemini)
  router.post("/gemini/chat", async (req, res) => {
    const {
      codigo,
      message,
      history,
      rol = "jefe_taller",
      modoVelocidad = "general",
    } = req.body || {};

    const eq = db.equipos.find((e) => e.codigo === codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }

    const userMsg = String(message || "").trim();
    if (!userMsg) {
      res
        .status(400)
        .json({ ok: false, error: "Escribe un mensaje para consultar al asistente." });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      res.status(400).json({
        ok: false,
        error:
          "Clave GEMINI_API_KEY no configurada. Verifícala en el panel Settings > Secrets.",
      });
      return;
    }

    const pautaActual =
      PAUTAS_MECANICAS[eq.categoria] ||
      PAUTAS_MECANICAS["Maquinaria con Horómetro"];
    const otActual = otAbierta(eq.codigo);
    const repuestosAplica = db.repuestos
      .filter((r) => r.aplica_a === eq.categoria || r.aplica_a === "General")
      .map(
        (r) =>
          `${r.codigo} ${r.nombre} (Stock: ${r.stock} ${r.unidad}, $${r.costo_unitario})`
      )
      .join("; ");

    const rolesSystem: Record<string, string> = {
      jefe_taller:
        "Actúas como Jefe de Taller Mecánico Senior de Rental Valdivia. Tu prioridad es diagnosticar fallas mecánicas, hidráulicas y eléctricas con precisión, guiando al mecánico paso a paso en el banco de pruebas.",
      especialista_pauta:
        "Actúas como Inspector de Mantención Preventiva y Control de Calidad de Rental Valdivia. Tu objetivo es guiar el cumplimiento estricto de la pauta preventiva, tolerancias, lubricación y seguridad antes de liberar la máquina a patio.",
      asesor_repuestos:
        "Actúas como Encargado Técnico de Bodega y Presupuestos de Rental Valdivia. Tu objetivo es recomendar qué repuestos e insumos del inventario imputar a la OT, estimar costos de reparación y distinguir desgaste normal versus daño imputable a cliente en obra.",
    };

    const roleHeader = rolesSystem[rol] || rolesSystem.jefe_taller;
    const systemInstruction =
      `${roleHeader}\n` +
      `Contexto en tiempo real de la máquina seleccionada:\n` +
      `- Código y Nombre: ${eq.codigo} — ${eq.nombre} (${eq.categoria})\n` +
      `- Estado actual: ${eq.estado_operativo} | Uso: ${eq.uso_acumulado}/${eq.limite_mantencion} ${eq.tipo_medicion} (Horómetro: ${eq.horometro_actual} hrs)\n` +
      `- Fallas / Panas reportadas: ${eq.panas_reportadas || "Sin panas activas registradas"}\n` +
      `- Última observación en bitácora: ${eq.ultima_observacion || "Sin observaciones"}\n` +
      `- Orden de Trabajo (OT) activa: ${otActual ? `${otActual.folio} (${otActual.tipo} - ${otActual.estado}): ${otActual.descripcion}` : "Ninguna OT abierta"}\n` +
      `- Pauta preventiva oficial (${eq.categoria}): ${pautaActual.join(" | ")}\n` +
      `- Repuestos disponibles en bodega para esta categoría: ${repuestosAplica || "Consultar bodega general"}\n` +
      `Responde siempre en español técnico claro, directo y conciso (máximo 180 palabras por turno salvo que pidan un listado detallado).`;

    const selectedModel =
      modoVelocidad === "rapido"
        ? "gemini-3.1-flash-lite"
        : "gemini-4-hydrogen";

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const formattedHistory = Array.isArray(history)
        ? history
            .filter(
              (m: any) =>
                m &&
                (m.role === "user" || m.role === "model") &&
                typeof m.text === "string" &&
                m.text.trim().length > 0
            )
            .map((m: any) => ({
              role: m.role as "user" | "model",
              parts: [{ text: m.text }],
            }))
        : [];

      const chat = ai.chats.create({
        model: selectedModel,
        history: formattedHistory,
        config: {
          systemInstruction,
        },
      });

      const response = await chat.sendMessage({
        message: userMsg,
      });

      res.json({
        ok: true,
        text: response.text || "Sin respuesta del asistente.",
        model: selectedModel,
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: `Error en chat Gemini (${selectedModel}): ${error?.message || String(error)}`,
      });
    }
  });

  return router;
}
