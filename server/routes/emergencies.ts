import { Router } from "express";
import {
  ESTADO_DISPONIBLE,
  ESTADO_EN_PANA,
  ESTADO_PRE_ALERTA,
  validarRutChileno,
  type SolicitudEmergencia,
} from "../../src/data/catalogs.ts";
import {
  db,
  sqlite,
  EVIDENCIAS_DIR,
  ahoraStr,
  otAbierta,
  abrirOt,
  registrarEvento,
  runDbTransaction,
  upsertEquipoSql,
  upsertOtSql,
  upsertEmergenciaSql,
  getIdempotentResponse,
  saveIdempotentResponse,
} from "../db.ts";
import {
  isJefeAuthenticated,
  verifyJefePassword,
  saveEvidenceImage,
} from "../security.ts";

export function createEmergenciesRouter() {
  const router = Router();

  // 1ra Autorización en Terreno (Pre-Alerta Amarilla)
  router.post("/equipos/:codigo/pana-fulminante", (req, res) => {
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

    const {
      reportante_nombre,
      reportante_rut,
      cliente_obra,
      ubicacion_faena,
      panas_seleccionadas,
      otra_pana,
      foto_base64,
      motivo_verificado,
    } = req.body || {};

    const repNombre = String(reportante_nombre || "").trim();
    const repRutRaw = String(reportante_rut || "").trim();
    if (!repNombre || !repRutRaw) {
      res.status(400).json({
        ok: false,
        error:
          "1ra Autorización rechazada: Debes ingresar el Nombre y RUT del reportante.",
      });
      return;
    }

    const rutCheck = validarRutChileno(repRutRaw);
    if (!rutCheck.valido) {
      res.status(400).json({
        ok: false,
        error: `RUT inválido: ${rutCheck.error}`,
      });
      return;
    }
    const repRut = rutCheck.formateado;

    db.emergencias = db.emergencias || [];

    // Anti-spam 1: máximo 1 pre-alerta activa por máquina
    const solicitudPendienteEq = db.emergencias.find(
      (item) => item.codigo_equipo === eq.codigo && item.estado === "PENDIENTE"
    );
    if (solicitudPendienteEq || eq.estado_operativo === ESTADO_PRE_ALERTA) {
      res.status(409).json({
        ok: false,
        error: `Anti-Spam: El equipo ${eq.codigo} ya posee una Pre-Alerta Amarilla pendiente (${
          solicitudPendienteEq?.folio || "activa"
        }) esperando 2da firma de Jefatura.`,
      });
      return;
    }
    if (eq.estado_operativo === ESTADO_EN_PANA || Number(eq.falla_activa) === 1) {
      res.status(409).json({
        ok: false,
        error: `El equipo ${eq.codigo} ya se encuentra bloqueado en Taller (EN PANA). No requiere nueva solicitud de emergencia.`,
      });
      return;
    }

    // Anti-spam 2: límite por RUT normalizado (2 reportes cada 15 min)
    const ahoraMs = Date.now();
    const VENTANA_15_MIN = 15 * 60 * 1000;
    const reportesRecientesRut = db.emergencias.filter((item) => {
      const checkItem = validarRutChileno(item.reportante_rut).normalizado;
      if (checkItem !== rutCheck.normalizado) return false;
      const itemMs = Number(item.created_at_ms) || 0;
      return itemMs > 0 && ahoraMs - itemMs <= VENTANA_15_MIN;
    });
    if (reportesRecientesRut.length >= 2) {
      res.status(429).json({
        ok: false,
        error: `Límite anti-spam alcanzado: El RUT ${repRut} ya emitió ${reportesRecientesRut.length} alertas de emergencia en los últimos 15 minutos. Contacta directamente a Jefatura de Taller.`,
      });
      return;
    }

    const panasArr: string[] = Array.isArray(panas_seleccionadas)
      ? panas_seleccionadas.map((p) => String(p).trim()).filter(Boolean)
      : [];
    const otraPanaClean = String(otra_pana || "").trim();
    const todasLasPanas = [...panasArr];
    if (otraPanaClean) {
      todasLasPanas.push(`Otra: ${otraPanaClean}`);
    }

    if (todasLasPanas.length === 0) {
      res.status(400).json({
        ok: false,
        error:
          "1ra Autorización rechazada: Debes seleccionar o describir al menos una falla real.",
      });
      return;
    }

    const tieneFoto = Boolean(foto_base64 && typeof foto_base64 === "string");
    const tieneMotivoVerificado = Boolean(motivo_verificado);
    if (!tieneFoto && !tieneMotivoVerificado) {
      res.status(400).json({
        ok: false,
        error:
          "1ra Autorización rechazada: Se exige adjuntar evidencia fotográfica o marcar la declaración de motivo técnico verificado.",
      });
      return;
    }

    let rutaEvidencia = "";
    if (tieneFoto) {
      try {
        rutaEvidencia = saveEvidenceImage(
          foto_base64,
          eq.codigo,
          "EMERGENCIA",
          EVIDENCIAS_DIR
        );
      } catch (e: any) {
        res.status(400).json({
          ok: false,
          error: e?.message || "Fotografía de evidencia inválida.",
        });
        return;
      }
    }

    const ahora = ahoraStr();
    const clienteClean =
      String(cliente_obra || "").trim() || String(eq.cliente_actual || "").trim();
    const ubicacionClean =
      String(ubicacion_faena || "").trim() ||
      String(eq.ubicacion_actual || "").trim();
    const panasStr = todasLasPanas.join(" | ");

    let folioEmg = "";
    runDbTransaction(() => {
      db.counters.emergencias += 1;
      const emgId = db.counters.emergencias;
      folioEmg = `EMG-${String(emgId).padStart(4, "0")}`;

      const nuevaSolicitud: SolicitudEmergencia = {
        id: emgId,
        folio: folioEmg,
        codigo_equipo: eq.codigo,
        nombre_equipo: eq.nombre,
        categoria: eq.categoria,
        fecha_solicitud: ahora,
        created_at_ms: ahoraMs,
        reportante_nombre: repNombre,
        reportante_rut: repRut,
        cliente_obra: clienteClean || "Por confirmar",
        ubicacion_faena: ubicacionClean || "En faena",
        panas_reportadas: panasStr,
        evidencia_url: rutaEvidencia,
        motivo_verificado: tieneMotivoVerificado ? 1 : 0,
        estado: "PENDIENTE",
        fecha_resolucion: null,
        observacion_resolucion:
          "En espera de 2da autorización en Panel de Jefatura.",
      };
      db.emergencias.push(nuevaSolicitud);
      upsertEmergenciaSql(nuevaSolicitud);

      const partesObs: string[] = [
        `PRE-ALERTA EMERGENCIA (${folioEmg} - ESPERANDO 2DA FIRMA JEFATURA)`,
        `Reportante: ${repNombre} (${repRut})`,
      ];
      if (clienteClean) partesObs.push(`Cliente/Obra: ${clienteClean}`);
      if (ubicacionClean) partesObs.push(`Ubicación: ${ubicacionClean}`);
      partesObs.push(`Falla: ${panasStr}`);
      if (rutaEvidencia) partesObs.push(`[Evidencia: ${rutaEvidencia}]`);

      const notaPreAlerta = partesObs.join(" · ");
      const responsableEvento = `${repNombre} (${repRut})`;

      eq.estado_operativo = ESTADO_PRE_ALERTA;
      eq.falla_activa = 0;
      eq.panas_reportadas = panasStr;
      eq.ultima_observacion = notaPreAlerta;
      eq.fecha_actualizacion = ahora;
      if (rutaEvidencia) {
        eq.ultima_evidencia = rutaEvidencia;
      }
      upsertEquipoSql(eq);

      registrarEvento(
        eq.codigo,
        ahora,
        "PRE-ALERTA EMERGENCIA (1RA FIRMA)",
        responsableEvento,
        0,
        0,
        notaPreAlerta,
        true
      );
    });

    const payload = {
      ok: true,
      folio: folioEmg,
      estado: "PENDIENTE",
      evidencia: rutaEvidencia || null,
      message: `1ra Autorización registrada (${folioEmg}): Equipo ${eq.codigo} en PRE-ALERTA AMARILLA. Requiere 2da Autorización en Panel de Jefatura.`,
    };
    saveIdempotentResponse(clientTxId, 200, payload);
    res.json(payload);
  });

  // 2da Autorización Exclusiva de Jefatura (Requiere Cookie Firmada o Contraseña Real de Jefatura)
  router.post("/emergencias/:id/resolver", (req, res) => {
    const { accion, password, observacion } = req.body || {};
    const cookieValida = isJefeAuthenticated(req, sqlite);
    const pwdValida = password ? verifyJefePassword(String(password)) : false;

    if (!cookieValida && !pwdValida) {
      res.status(401).json({
        ok: false,
        error:
          "Autorización rechazada: Debes contar con sesión activa de Jefatura para aprobar o rechazar emergencias.",
      });
      return;
    }

    const id = Number(req.params.id);
    const solicitud = db.emergencias.find((item) => item.id === id);
    if (!solicitud) {
      res
        .status(404)
        .json({ ok: false, error: "Solicitud de emergencia no encontrada." });
      return;
    }

    const eq = db.equipos.find((e) => e.codigo === solicitud.codigo_equipo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }

    const ahora = ahoraStr();
    const obsClean = String(observacion || "").trim();

    if (accion === "RECHAZAR") {
      runDbTransaction(() => {
        solicitud.estado = "RECHAZADA";
        solicitud.fecha_resolucion = ahora;
        solicitud.observacion_resolucion =
          obsClean || "Descartada por Jefatura (falsa alarma / sin bloqueo).";
        upsertEmergenciaSql(solicitud);

        eq.estado_operativo = ESTADO_DISPONIBLE;
        eq.falla_activa = 0;
        eq.panas_reportadas = "";
        eq.ultima_observacion = `Pre-alerta ${solicitud.folio} rechazada por Jefatura. Unidad vuelve a estar operativa.`;
        eq.fecha_actualizacion = ahora;
        upsertEquipoSql(eq);

        registrarEvento(
          eq.codigo,
          ahora,
          "EMERGENCIA RECHAZADA",
          "Jefatura",
          0,
          0,
          `Solicitud ${solicitud.folio} descartada. ${solicitud.observacion_resolucion}`,
          true
        );
      });

      res.json({
        ok: true,
        folio: solicitud.folio,
        estado: "RECHAZADA",
        message: `Solicitud ${solicitud.folio} rechazada: ${eq.codigo} restaurado a estado OPERATIVO.`,
      });
      return;
    }

    const descCompleta = [
      `BLOQUEO ROJO CONFIRMADO (${solicitud.folio})`,
      `Reportante: ${solicitud.reportante_nombre} (${solicitud.reportante_rut})`,
      `Cliente/Obra: ${solicitud.cliente_obra}`,
      `Ubicación: ${solicitud.ubicacion_faena}`,
      `Falla: ${solicitud.panas_reportadas}`,
      solicitud.evidencia_url ? `[Evidencia: ${solicitud.evidencia_url}]` : "",
      obsClean ? `Nota Jefatura: ${obsClean}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    let folioOt = "";
    runDbTransaction(() => {
      eq.estado_operativo = ESTADO_EN_PANA;
      eq.falla_activa = 1;
      eq.panas_reportadas = solicitud.panas_reportadas;
      eq.ultima_observacion = descCompleta;
      eq.fecha_actualizacion = ahora;
      if (solicitud.evidencia_url) {
        eq.ultima_evidencia = solicitud.evidencia_url;
      }
      upsertEquipoSql(eq);

      const otExistente = otAbierta(eq.codigo);
      if (otExistente) {
        otExistente.descripcion = descCompleta;
        otExistente.responsable = `Jefatura / ${solicitud.reportante_nombre}`;
        upsertOtSql(otExistente);
        folioOt = otExistente.folio;
      } else {
        folioOt = abrirOt(
          eq.codigo,
          "CORRECTIVA",
          descCompleta,
          `Jefatura / ${solicitud.reportante_nombre}`,
          ahora,
          true
        );
      }

      solicitud.estado = "APROBADA";
      solicitud.fecha_resolucion = ahora;
      solicitud.observacion_resolucion = `Aprobado por Jefatura · OT generada: ${folioOt}${
        obsClean ? ` · ${obsClean}` : ""
      }`;
      upsertEmergenciaSql(solicitud);

      registrarEvento(
        eq.codigo,
        ahora,
        "BLOQUEO EMERGENCIA AUTORIZADO (2DA FIRMA)",
        "Jefatura",
        0,
        0,
        `${descCompleta} · OT: ${folioOt}`,
        true
      );
    });

    res.json({
      ok: true,
      folio: solicitud.folio,
      folio_ot: folioOt,
      estado: "APROBADA",
      message: `2da Autorización completada (${solicitud.folio}): Equipo ${eq.codigo} BLOQUEADO EN ROJO y Orden de Trabajo ${folioOt} creada.`,
    });
  });

  return router;
}
