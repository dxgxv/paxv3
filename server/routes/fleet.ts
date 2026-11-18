import { Router } from "express";
import {
  ESTADO_DISPONIBLE,
  ESTADO_EN_PANA,
  ESTADO_EN_PRESUPUESTO,
  ESTADO_PRE_ALERTA,
  calcularSemaforo,
  calcularEstadoArriendo,
  validarRutChileno,
  hoySantiagoISO,
  type Equipo,
  type EstadoOperativo,
  type ArriendoRegistro,
} from "../../src/data/catalogs.ts";
import {
  db,
  sqlite,
  EVIDENCIAS_DIR,
  ahoraStr,
  calcularDiasCobrables,
  abrirOt,
  cerrarOt,
  registrarEvento,
  runDbTransaction,
  upsertEquipoSql,
  upsertArriendoSql,
  upsertHistorialSql,
  getIdempotentResponse,
  saveIdempotentResponse,
} from "../db.ts";
import {
  isJefeAuthenticated,
  createRequireJefe,
  saveEvidenceImage,
} from "../security.ts";

export function createFleetRouter() {
  const router = Router();
  const requireJefe = createRequireJefe(sqlite);

  router.get("/state", (req, res) => {
    const equiposConSemaforo = db.equipos.map((eq) => {
      const limite = Math.max(1, Number(eq.limite_mantencion) || 1);
      const uso = Number(eq.uso_acumulado) || 0;
      const horometro = Number(eq.horometro_actual) || 0;
      const ultMantHoro =
        eq.ultimo_horometro_mantencion !== undefined
          ? Number(eq.ultimo_horometro_mantencion)
          : Math.max(0, horometro - uso);
      const cicloTranscurrido =
        eq.tipo_medicion === "HORAS"
          ? Math.max(uso, horometro - ultMantHoro)
          : uso;
      const horasRestantes = limite - cicloTranscurrido;
      const pctVidaUtil = Math.min(
        100,
        Math.round((cicloTranscurrido / limite) * 100)
      );
      const arriendoMetrics = calcularEstadoArriendo(eq);

      return {
        ...eq,
        limite_mantencion: limite,
        uso_acumulado: cicloTranscurrido,
        horometro_actual: horometro,
        ultimo_horometro_mantencion: ultMantHoro,
        horas_para_mantencion: horasRestantes,
        porcentaje_vida_util: pctVidaUtil,
        falla_activa: Number(eq.falla_activa) || 0,
        dias_en_arriendo: arriendoMetrics.diasEnObra,
        dias_atraso: arriendoMetrics.diasAtraso,
        arriendo_vencido: arriendoMetrics.estaVencido,
        semaforo: calcularSemaforo({
          ...eq,
          limite_mantencion: limite,
          uso_acumulado: cicloTranscurrido,
        }),
      };
    });

    const repuestosMap = new Map(db.repuestos.map((r) => [r.id, r]));
    const otRepuestosDetallados = db.ot_repuestos.map((o) => {
      const rep = repuestosMap.get(o.repuesto_id);
      return {
        id: o.id,
        ot_id: o.ot_id,
        repuesto_id: o.repuesto_id,
        codigo: rep?.codigo || "REP-???",
        nombre: rep?.nombre || "Repuesto",
        cantidad: o.cantidad,
        unidad: rep?.unidad || "unidad",
        costo_unitario: o.costo_unitario,
        subtotal: o.cantidad * o.costo_unitario,
        fecha: o.fecha,
      };
    });

    const arriendosEnriquecidos = db.arriendos
      .map((a) => ({
        ...a,
        dias_cobrables:
          a.estado === "ACTIVO"
            ? calcularDiasCobrables(a.fecha_salida, null)
            : a.dias_cobrables,
      }))
      .sort((a, b) => b.id - a.id);

    const gastoTotal = db.historial.reduce(
      (acc, h) => acc + (Number(h.costo_repuestos) || 0),
      0
    );

    const rawTel = process.env.TELEFONO_TALLER || "56912345678";
    const telefonoTaller = rawTel.replace(/\D/g, "");

    res.json({
      equipos: equiposConSemaforo,
      presupuestos: [...db.presupuestos].sort((a, b) => b.id - a.id),
      ordenes_trabajo: [...db.ordenes_trabajo].sort((a, b) => b.id - a.id),
      repuestos: [...db.repuestos].sort((a, b) =>
        a.nombre.localeCompare(b.nombre)
      ),
      ot_repuestos: otRepuestosDetallados,
      emergencias: [...db.emergencias].sort((a, b) => b.id - a.id),
      arriendos: arriendosEnriquecidos,
      historial: [...db.historial].sort((a, b) => b.id - a.id).slice(0, 5000),
      gasto_total: gastoTotal,
      config: {
        telefono_taller: telefonoTaller,
        gemini_configured: Boolean(
          process.env.GEMINI_API_KEY &&
            process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
        ),
        using_default_password: !process.env.PASSWORD_JEFE,
        authenticated_jefe: isJefeAuthenticated(req, sqlite),
      },
    });
  });

  // Enrolar Máquina
  router.post("/equipos/enrolar", (req, res) => {
    const {
      codigo,
      nombre,
      categoria,
      estado_inicial,
      tipo_medicion,
      limite_mantencion,
      horometro_actual,
      ubicacion_nfc,
    } = req.body || {};

    const cod = String(codigo || "").toUpperCase().trim();
    const nom = String(nombre || "").trim();
    if (!cod || !nom) {
      res
        .status(400)
        .json({ ok: false, error: "El Código y el Nombre son obligatorios." });
      return;
    }

    if (db.equipos.some((e) => e.codigo === cod)) {
      res.status(409).json({
        ok: false,
        error: `El código ${cod} ya existe en la base de datos.`,
      });
      return;
    }

    const ahora = ahoraStr();
    const est: EstadoOperativo =
      estado_inicial === ESTADO_EN_PANA ||
      estado_inicial === ESTADO_EN_PRESUPUESTO
        ? estado_inicial
        : ESTADO_DISPONIBLE;

    const nuevo: Equipo = {
      codigo: cod,
      nombre: nom,
      categoria: String(categoria || "Cortadora Orbital"),
      ubicacion_nfc: String(ubicacion_nfc || "").trim() || "Chasis",
      tipo_medicion: tipo_medicion === "HORAS" ? "HORAS" : "DIAS",
      uso_acumulado: 0,
      limite_mantencion: Math.max(1, Number(limite_mantencion) || 15),
      horometro_actual: Math.max(0, Number(horometro_actual) || 0),
      estado_operativo: est,
      falla_activa: est !== ESTADO_DISPONIBLE ? 1 : 0,
      panas_reportadas: "",
      ultima_observacion: "Ingreso nuevo a flota.",
      fecha_actualizacion: ahora,
    };

    runDbTransaction(() => {
      db.equipos.push(nuevo);
      upsertEquipoSql(nuevo);
      registrarEvento(
        cod,
        ahora,
        "ENROLAMIENTO",
        "Admin",
        0,
        0,
        `Alta ${nuevo.categoria}`,
        true
      );
      if (est === ESTADO_EN_PANA) {
        abrirOt(
          cod,
          "CORRECTIVA",
          "Ingreso inicial en pana",
          "Admin",
          ahora,
          true
        );
      }
    });

    res.json({
      ok: true,
      equipo: nuevo,
      message: `Máquina ${cod} registrada con éxito.`,
    });
  });

  // Recepción en Patio (Retorno de Obra o Ingreso de Falla)
  router.post("/equipos/:codigo/recepcion", (req, res) => {
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
      responsable_rec,
      uso_nuevo,
      nuevo_horometro,
      estado_llegada,
      panas_seleccionadas,
      danos_seleccionados,
      otra_pana,
      responsable_dano,
      prioridad_dano,
      obs_adicional,
      foto_base64,
    } = req.body || {};

    const ahora = ahoraStr();
    const unidadUso = eq.tipo_medicion === "DIAS" ? "días" : "horas";
    const danosArr: string[] = Array.isArray(danos_seleccionados)
      ? danos_seleccionados
      : [];
    const panasArr: string[] = Array.isArray(panas_seleccionadas)
      ? panas_seleccionadas
      : [];

    const todasLasPanas: string[] = [
      ...danosArr.map((d) => `Daño: ${d}`),
      ...panasArr,
    ];
    if (String(otra_pana || "").trim()) {
      todasLasPanas.push(`Otra: ${String(otra_pana).trim()}`);
    }
    const panasStr = todasLasPanas.join(" | ");

    const esPresupuesto = estado_llegada === "PRESUPUESTO";
    const esPana = estado_llegada === "EN_PANA";
    const tieneFalla = esPana || esPresupuesto;

    const nuevoEstadoOp: EstadoOperativo = esPresupuesto
      ? ESTADO_EN_PRESUPUESTO
      : tieneFalla
      ? ESTADO_EN_PANA
      : ESTADO_DISPONIBLE;
    const fallaFlag = tieneFalla ? 1 : 0;

    let rutaEvidencia = "";
    if (foto_base64 && typeof foto_base64 === "string") {
      try {
        rutaEvidencia = saveEvidenceImage(
          foto_base64,
          eq.codigo,
          "REC",
          EVIDENCIAS_DIR
        );
      } catch (e: any) {
        res.status(400).json({
          ok: false,
          error: e?.message || "Fotografía inválida.",
        });
        return;
      }
    }

    const obsClean = String(obs_adicional || "").trim();
    const usoSumado = Math.max(0, Number(uso_nuevo) || 0);
    let notaFinal = panasStr
      ? `Panas: ${panasStr}${obsClean ? ` — ${obsClean}` : ""}`
      : `Recepción normal (+${usoSumado} ${unidadUso}). ${obsClean}`.trim();

    if (esPresupuesto) {
      notaFinal += `. Asume: ${responsable_dano || "Por definir"}. Prioridad: ${
        prioridad_dano || "Alta"
      }.`;
    }
    if (rutaEvidencia) {
      notaFinal += ` [Evidencia: ${rutaEvidencia}]`;
    }

    const respNombre = String(responsable_rec || "Encargado de Patio").trim();
    const horoRetorno =
      eq.tipo_medicion === "HORAS"
        ? Math.max(eq.horometro_actual, Number(nuevo_horometro) || 0)
        : eq.horometro_actual;

    runDbTransaction(() => {
      // Cerrar arriendo activo si existía
      const arriendoActivo = [...db.arriendos]
        .reverse()
        .find((a) => a.codigo_equipo === eq.codigo && a.estado === "ACTIVO");
      if (arriendoActivo) {
        arriendoActivo.estado = "DEVUELTO";
        arriendoActivo.fecha_retorno_real = ahora;
        arriendoActivo.horometro_retorno = horoRetorno;
        arriendoActivo.dias_cobrables = calcularDiasCobrables(
          arriendoActivo.fecha_salida,
          hoySantiagoISO()
        );
        if (obsClean) {
          arriendoActivo.observacion = [
            arriendoActivo.observacion,
            `Retorno: ${obsClean}`,
          ]
            .filter(Boolean)
            .join(" · ");
        }
        upsertArriendoSql(arriendoActivo);
      }

      eq.uso_acumulado = (Number(eq.uso_acumulado) || 0) + usoSumado;
      eq.horometro_actual = horoRetorno;
      eq.estado_operativo = nuevoEstadoOp;
      eq.falla_activa = fallaFlag;
      eq.panas_reportadas = panasStr;
      eq.ultima_observacion = notaFinal;
      eq.fecha_actualizacion = ahora;
      eq.en_arriendo = 0;
      eq.fecha_retorno_estimada = "";
      eq.guia_despacho = "";
      if (rutaEvidencia) {
        eq.ultima_evidencia = rutaEvidencia;
      }
      upsertEquipoSql(eq);

      registrarEvento(
        eq.codigo,
        ahora,
        "RECEPCIÓN",
        respNombre,
        usoSumado,
        0,
        notaFinal,
        true
      );

      if (nuevoEstadoOp === ESTADO_EN_PANA) {
        abrirOt(
          eq.codigo,
          "CORRECTIVA",
          panasStr || "Ingreso en pana sin detalle",
          respNombre,
          ahora,
          true
        );
      } else if (nuevoEstadoOp === ESTADO_DISPONIBLE) {
        cerrarOt(
          eq.codigo,
          respNombre,
          "Cerrada en recepción: la falla ya no existe.",
          0,
          ahora,
          true
        );
      }
    });

    const payload = { ok: true, message: "Recepción registrada." };
    saveIdempotentResponse(clientTxId, 200, payload);
    res.json(payload);
  });

  // Salida a Arriendo (Despacho a Obra con Fecha de Retorno Estimada, Guía y RUT Cliente)
  router.post("/equipos/:codigo/despacho", (req, res) => {
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

    if (eq.en_arriendo === 1) {
      res.status(409).json({
        ok: false,
        error: `No se puede despachar ${eq.codigo}: la unidad ya figura EN OBRA con ${
          eq.cliente_actual || "un cliente"
        }. Registra primero su recepción en Patio.`,
      });
      return;
    }

    if (
      eq.estado_operativo === ESTADO_EN_PANA ||
      eq.estado_operativo === ESTADO_EN_PRESUPUESTO ||
      eq.estado_operativo === ESTADO_PRE_ALERTA ||
      Number(eq.falla_activa) === 1
    ) {
      res.status(409).json({
        ok: false,
        error: `No se puede despachar ${eq.codigo}: la unidad tiene bloqueo o alerta activa (${eq.estado_operativo}).`,
      });
      return;
    }

    const {
      cliente_obra,
      cliente_rut,
      ubicacion_faena,
      guia_despacho,
      fecha_retorno_estimada,
      responsable_despacho,
      horometro_salida,
      observacion,
    } = req.body || {};

    const clienteClean = String(cliente_obra || "").trim();
    if (!clienteClean) {
      res.status(400).json({
        ok: false,
        error: "Debes indicar el Cliente / Empresa o Obra de destino.",
      });
      return;
    }

    const clienteRutRaw = String(cliente_rut || "").trim();
    let clienteRutFmt = "";
    if (clienteRutRaw) {
      const rutCheck = validarRutChileno(clienteRutRaw);
      if (!rutCheck.valido) {
        res.status(400).json({
          ok: false,
          error: `RUT del cliente inválido: ${rutCheck.error}`,
        });
        return;
      }
      clienteRutFmt = rutCheck.formateado;
    }

    const retornoEstClean = String(fecha_retorno_estimada || "").trim().slice(0, 10);
    if (retornoEstClean && !/^\d{4}-\d{2}-\d{2}$/.test(retornoEstClean)) {
      res.status(400).json({
        ok: false,
        error: "Fecha de retorno estimada inválida (usa formato YYYY-MM-DD).",
      });
      return;
    }

    const ubicacionClean = String(ubicacion_faena || "").trim() || "Faena activa";
    const guiaClean = String(guia_despacho || "").trim();
    const respClean =
      String(responsable_despacho || "").trim() || "Despacho Patio";
    const obsClean = String(observacion || "").trim();
    const ahora = ahoraStr();

    runDbTransaction(() => {
      if (eq.tipo_medicion === "HORAS" && horometro_salida !== undefined) {
        const hSalida = Number(horometro_salida);
        if (!Number.isNaN(hSalida) && hSalida > eq.horometro_actual) {
          eq.horometro_actual = hSalida;
        }
      }

      eq.en_arriendo = 1;
      eq.cliente_actual = clienteClean;
      eq.cliente_rut = clienteRutFmt;
      eq.ubicacion_actual = ubicacionClean;
      eq.fecha_salida = ahora;
      eq.fecha_retorno_estimada = retornoEstClean;
      eq.guia_despacho = guiaClean;
      eq.fecha_actualizacion = ahora;
      eq.ultima_observacion = `EN OBRA: ${clienteClean} (${ubicacionClean})${
        guiaClean ? ` · Guía ${guiaClean}` : ""
      }${retornoEstClean ? ` · Retorno est.: ${retornoEstClean}` : ""}${
        obsClean ? ` · ${obsClean}` : ""
      }`;
      upsertEquipoSql(eq);

      db.counters.arriendos += 1;
      const nuevoArriendo: ArriendoRegistro = {
        id: db.counters.arriendos,
        codigo_equipo: eq.codigo,
        nombre_equipo: eq.nombre,
        cliente_obra: clienteClean,
        cliente_rut: clienteRutFmt,
        ubicacion_faena: ubicacionClean,
        guia_despacho: guiaClean,
        responsable_despacho: respClean,
        fecha_salida: ahora,
        fecha_retorno_estimada: retornoEstClean,
        fecha_retorno_real: null,
        horometro_salida: Number(eq.horometro_actual) || 0,
        horometro_retorno: null,
        dias_cobrables: 1,
        estado: "ACTIVO",
        observacion: obsClean,
      };
      db.arriendos.push(nuevoArriendo);
      upsertArriendoSql(nuevoArriendo);

      registrarEvento(
        eq.codigo,
        ahora,
        "DESPACHO A OBRA",
        respClean,
        0,
        0,
        `Salida a arriendo · Cliente/Obra: ${clienteClean}${
          clienteRutFmt ? ` (${clienteRutFmt})` : ""
        } · Ubicación: ${ubicacionClean}${
          guiaClean ? ` · Guía: ${guiaClean}` : ""
        }${retornoEstClean ? ` · Retorno est.: ${retornoEstClean}` : ""}${
          obsClean ? ` · ${obsClean}` : ""
        }`,
        true
      );
    });

    const payload = {
      ok: true,
      message: `Despacho registrado: ${eq.codigo} salió a obra con ${clienteClean}.`,
    };
    saveIdempotentResponse(clientTxId, 200, payload);
    res.json(payload);
  });

  // Acción Rápida en Semáforo de Patio (Liberación exige sesión Jefatura)
  router.post("/patio/accion-rapida", (req, res) => {
    const { codigo, accion, nota } = req.body || {};
    const eq = db.equipos.find((e) => e.codigo === codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }

    const ahora = ahoraStr();
    const obs = String(nota || "").trim() || "Acción desde Semáforo";
    const accStr = String(accion || "").toUpperCase();

    if (accStr.includes("LIBERAR") || accStr.includes("🟢")) {
      if (!isJefeAuthenticated(req, sqlite)) {
        res.status(401).json({
          ok: false,
          error:
            "Liberar una unidad bloqueada desde Semáforo requiere sesión activa de Jefatura.",
        });
        return;
      }
      runDbTransaction(() => {
        eq.uso_acumulado = 0;
        eq.estado_operativo = ESTADO_DISPONIBLE;
        eq.falla_activa = 0;
        eq.panas_reportadas = "";
        eq.ultima_observacion = obs;
        eq.fecha_actualizacion = ahora;
        upsertEquipoSql(eq);
        registrarEvento(
          eq.codigo,
          ahora,
          "LIBERACIÓN PATIO",
          "Jefatura",
          0,
          0,
          obs,
          true
        );
        cerrarOt(
          eq.codigo,
          "Jefatura",
          `Liberación rápida desde Semáforo: ${obs}`,
          0,
          ahora,
          true
        );
      });
    } else if (accStr.includes("PRESUPUESTO") || accStr.includes("🟣")) {
      runDbTransaction(() => {
        eq.estado_operativo = ESTADO_EN_PRESUPUESTO;
        eq.falla_activa = 1;
        eq.ultima_observacion = obs;
        eq.fecha_actualizacion = ahora;
        upsertEquipoSql(eq);
        registrarEvento(
          eq.codigo,
          ahora,
          "A PRESUPUESTO",
          "Patio",
          0,
          0,
          obs,
          true
        );
      });
    } else if (
      accStr.includes("BLOQUEAR") ||
      accStr.includes("PANA") ||
      accStr.includes("🔴")
    ) {
      runDbTransaction(() => {
        eq.estado_operativo = ESTADO_EN_PANA;
        eq.falla_activa = 1;
        eq.ultima_observacion = obs;
        eq.fecha_actualizacion = ahora;
        upsertEquipoSql(eq);
        registrarEvento(
          eq.codigo,
          ahora,
          "BLOQUEO PATIO",
          "Patio",
          0,
          0,
          obs,
          true
        );
        abrirOt(eq.codigo, "CORRECTIVA", obs, "Patio", ahora, true);
      });
    } else {
      res.status(400).json({
        ok: false,
        error: "Acción de patio no reconocida.",
      });
      return;
    }

    res.json({ ok: true, message: "Acción ejecutada correctamente." });
  });

  // Ajuste Manual (Solo Jefatura autenticada)
  router.post("/equipos/:codigo/ajuste-manual", requireJefe, (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }

    const {
      estado_elegido,
      uso_manual,
      horometro_manual,
      nota_manual,
      limpiar_panas,
    } = req.body || {};

    const ahora = ahoraStr();
    const usoIn = Math.max(0, Number(uso_manual) || 0);
    const horIn = Math.max(0, Number(horometro_manual) || 0);
    const estStr = String(estado_elegido || "").toUpperCase();

    let estOp: EstadoOperativo = ESTADO_EN_PANA;
    let fallaAct = 1;
    let usoFinal = usoIn;

    if (estStr.includes("OPERATIVA") || estStr.includes("🟢")) {
      estOp = ESTADO_DISPONIBLE;
      fallaAct = 0;
      usoFinal = usoIn >= eq.limite_mantencion ? 0 : usoIn;
    } else if (estStr.includes("MANTENCI") || estStr.includes("🟡")) {
      estOp = ESTADO_DISPONIBLE;
      fallaAct = 0;
      usoFinal = Math.max(usoIn, eq.limite_mantencion);
    } else if (estStr.includes("PRESUPUESTO") || estStr.includes("🟣")) {
      estOp = ESTADO_EN_PRESUPUESTO;
      fallaAct = 1;
      usoFinal = usoIn;
    } else {
      estOp = ESTADO_EN_PANA;
      fallaAct = 1;
      usoFinal = usoIn;
    }

    const nota = String(nota_manual || "").trim();

    runDbTransaction(() => {
      eq.uso_acumulado = usoFinal;
      eq.horometro_actual = horIn;
      eq.estado_operativo = estOp;
      eq.falla_activa = fallaAct;
      if (limpiar_panas) {
        eq.panas_reportadas = "";
      }
      eq.ultima_observacion = nota;
      eq.fecha_actualizacion = ahora;
      upsertEquipoSql(eq);

      registrarEvento(
        eq.codigo,
        ahora,
        "AJUSTE MANUAL",
        "Jefatura",
        0,
        0,
        `Cambio a ${estado_elegido}. Nota: ${nota}`,
        true
      );

      if (estOp === ESTADO_EN_PANA) {
        abrirOt(
          eq.codigo,
          "CORRECTIVA",
          nota || "Ajuste manual",
          "Jefatura",
          ahora,
          true
        );
      } else if (estOp === ESTADO_DISPONIBLE) {
        cerrarOt(
          eq.codigo,
          "Jefatura",
          `Cerrada por ajuste manual: ${nota}`,
          0,
          ahora,
          true
        );
      }
    });

    res.json({ ok: true, message: "Estado actualizado." });
  });

  return router;
}
