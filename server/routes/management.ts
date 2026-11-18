import { Router } from "express";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import {
  ESTADO_EN_PANA,
  ESTADO_EN_PRESUPUESTO,
  type Presupuesto,
} from "../../src/data/catalogs.ts";
import {
  db,
  sqlite,
  ROOT_DIR,
  DB_FILE,
  SQLITE_FILE,
  ahoraStr,
  abrirOt,
  registrarEvento,
  inicializarDb,
  poblarFlotaMasiva,
  flushJsonBackupSync,
  runDbTransaction,
  upsertEquipoSql,
  upsertPresupuestoSql,
  upsertRepuestoSql,
} from "../db.ts";
import {
  verifyJefePassword,
  isJefeAuthenticated,
  setJefeSessionCookie,
  clearJefeSessionCookie,
  createRequireJefe,
} from "../security.ts";

export function createManagementRouter() {
  const router = Router();
  const requireJefe = createRequireJefe(sqlite);

  // Auth Jefatura: verifica clave real y emite cookie HttpOnly firmada HMAC-SHA256
  router.post("/auth/jefe", (req, res) => {
    const { password } = req.body || {};
    if (verifyJefePassword(String(password || ""))) {
      setJefeSessionCookie(req, res, sqlite);
      res.json({ ok: true });
    } else {
      clearJefeSessionCookie(res);
      res.status(401).json({
        ok: false,
        error: "Contraseña incorrecta.",
      });
    }
  });

  router.post("/auth/logout", (_req, res) => {
    clearJefeSessionCookie(res);
    res.json({ ok: true });
  });

  router.get("/auth/session", (req, res) => {
    res.json({
      ok: true,
      authenticated_jefe: isJefeAuthenticated(req, sqlite),
    });
  });

  // Solicitar Presupuesto (desde Estación de Trabajo)
  router.post("/equipos/:codigo/presupuesto", (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }

    const {
      solicitante,
      prioridad,
      destinatario_tipo,
      destinatario_nombre,
      marcar_espera_pres,
      panas_elegidas,
      otra_pana,
      detalle_trabajos,
      costo_repuestos,
      costo_mano_obra,
      costo_insumos,
    } = req.body || {};

    const ahora = ahoraStr();
    const listaPanas: string[] = Array.isArray(panas_elegidas)
      ? [...panas_elegidas]
      : [];
    if (String(otra_pana || "").trim()) {
      listaPanas.push(`Otra: ${String(otra_pana).trim()}`);
    }
    const panasReales = listaPanas.join(" | ");
    const panasPresStr = panasReales || "Evaluación general en taller";
    const detFinalPres =
      String(detalle_trabajos || "").trim() || "Pendiente desglose fino.";

    const cRep = Math.max(0, Number(costo_repuestos) || 0);
    const cMo = Math.max(0, Number(costo_mano_obra) || 0);
    const cIns = Math.max(0, Number(costo_insumos) || 0);
    const totalCalc = cRep + cMo + cIns;

    const montoFmt =
      "$" + totalCalc.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    let folioNuevo = "";
    runDbTransaction(() => {
      db.counters.presupuestos += 1;
      const id = db.counters.presupuestos;
      folioNuevo = `PRES-${String(id).padStart(4, "0")}`;

      const nuevoPres: Presupuesto = {
        id,
        folio: folioNuevo,
        codigo_equipo: eq.codigo,
        nombre_equipo: eq.nombre,
        categoria: eq.categoria,
        fecha_solicitud: ahora,
        solicitante: String(solicitante || "Jefe de Taller").trim(),
        destinatario_tipo: String(
          destinatario_tipo || "Por definir (En bandeja)"
        ),
        destinatario_nombre:
          String(destinatario_nombre || "").trim() || "Pendiente por definir",
        prioridad: String(prioridad || "Alta (Equipo Bloqueado en Taller)"),
        panas_asociadas: panasPresStr,
        detalle_trabajos: detFinalPres,
        costo_repuestos: cRep,
        costo_mano_obra: cMo,
        costo_insumos: cIns,
        monto_total: totalCalc,
        estado_presupuesto: "PENDIENTE",
        observaciones_resolucion: "En bandeja por definir/aprobar.",
      };

      db.presupuestos.push(nuevoPres);
      upsertPresupuestoSql(nuevoPres);

      if (marcar_espera_pres) {
        eq.estado_operativo = ESTADO_EN_PRESUPUESTO;
        eq.falla_activa = 1;
        eq.panas_reportadas = panasReales || eq.panas_reportadas;
        eq.ultima_observacion = `Presupuesto ${folioNuevo} (${montoFmt} CLP)`;
        eq.fecha_actualizacion = ahora;
        upsertEquipoSql(eq);
      }

      registrarEvento(
        eq.codigo,
        ahora,
        "SOLICITUD PRESUPUESTO",
        nuevoPres.solicitante,
        0,
        0,
        `Folio ${folioNuevo} por ${montoFmt} CLP`,
        true
      );
    });

    res.json({
      ok: true,
      folio: folioNuevo,
      message: `Presupuesto ${folioNuevo} generado.`,
    });
  });

  // Resolver Presupuesto (Solo Jefatura autenticada)
  router.post("/presupuestos/:folio/resolver", requireJefe, (req, res) => {
    const pres = db.presupuestos.find((p) => p.folio === req.params.folio);
    if (!pres) {
      res.status(404).json({ ok: false, error: "Presupuesto no encontrado." });
      return;
    }

    const { estado_presupuesto, destinatario_nombre, observaciones_resolucion } =
      req.body || {};
    const ahora = ahoraStr();

    runDbTransaction(() => {
      pres.estado_presupuesto = String(estado_presupuesto || "PENDIENTE");
      pres.destinatario_nombre = String(
        destinatario_nombre || pres.destinatario_nombre
      ).trim();
      pres.observaciones_resolucion = String(
        observaciones_resolucion || ""
      ).trim();
      upsertPresupuestoSql(pres);

      const eq = db.equipos.find((e) => e.codigo === pres.codigo_equipo);
      if (
        pres.estado_presupuesto === "APROBADO" &&
        eq &&
        eq.estado_operativo === ESTADO_EN_PRESUPUESTO
      ) {
        eq.estado_operativo = ESTADO_EN_PANA;
        eq.falla_activa = 1;
        eq.ultima_observacion = `Presupuesto ${pres.folio} aprobado. Pasa a reparación en taller.`;
        eq.fecha_actualizacion = ahora;
        upsertEquipoSql(eq);
        abrirOt(
          eq.codigo,
          "CORRECTIVA",
          `Reparación según presupuesto ${pres.folio}: ${pres.detalle_trabajos}`,
          "Jefatura",
          ahora,
          true
        );
      }

      registrarEvento(
        pres.codigo_equipo,
        ahora,
        "RESOLUCIÓN PRESUPUESTO",
        "Jefatura",
        0,
        0,
        `Folio ${pres.folio}: ${pres.estado_presupuesto}. ${pres.observaciones_resolucion}`,
        true
      );
    });

    res.json({
      ok: true,
      message: `Resolución del presupuesto ${pres.folio} guardada.`,
    });
  });

  // Ingresar stock repuesto (Solo Jefatura autenticada)
  router.post("/repuestos/ingreso", requireJefe, (req, res) => {
    const { repuesto_id, cantidad, nuevo_costo } = req.body || {};
    const rep = db.repuestos.find((r) => r.id === Number(repuesto_id));
    if (!rep) {
      res.status(404).json({ ok: false, error: "Repuesto no encontrado." });
      return;
    }
    const cant = Math.max(1, Number(cantidad) || 1);
    const costo = Math.max(0, Number(nuevo_costo) || 0);

    runDbTransaction(() => {
      rep.stock += cant;
      if (costo > 0) {
        rep.costo_unitario = costo;
      }
      upsertRepuestoSql(rep);
    });

    res.json({
      ok: true,
      message: `Ingreso de ${cant} unidades guardado.`,
    });
  });

  // Crear nuevo repuesto (Solo Jefatura autenticada)
  router.post("/repuestos/crear", requireJefe, (req, res) => {
    const { codigo, nombre, aplica_a, unidad, stock, stock_minimo, costo_unitario } =
      req.body || {};
    const cod = String(codigo || "").toUpperCase().trim();
    const nom = String(nombre || "").trim();
    if (!cod || !nom) {
      res
        .status(400)
        .json({ ok: false, error: "Código y nombre son obligatorios." });
      return;
    }
    if (db.repuestos.some((r) => r.codigo === cod)) {
      res
        .status(409)
        .json({ ok: false, error: `El código ${cod} ya existe.` });
      return;
    }

    runDbTransaction(() => {
      db.counters.repuestos += 1;
      const nuevo = {
        id: db.counters.repuestos,
        codigo: cod,
        nombre: nom,
        aplica_a: String(aplica_a || "General"),
        unidad: String(unidad || "unidad").trim() || "unidad",
        stock: Math.max(0, Number(stock) || 0),
        stock_minimo: Math.max(0, Number(stock_minimo) || 1),
        costo_unitario: Math.max(0, Number(costo_unitario) || 0),
      };
      db.repuestos.push(nuevo);
      upsertRepuestoSql(nuevo);
    });

    res.json({
      ok: true,
      message: `${cod} — ${nom} creado.`,
    });
  });

  // Admin DB: Simulate 3000 machines (Solo Jefatura)
  router.post("/admin/simular", requireJefe, (_req, res) => {
    const creados = poblarFlotaMasiva(3000);
    res.json({ ok: true, creados, message: `${creados} equipos creados.` });
  });

  // Admin DB: Factory Reset (Solo Jefatura)
  router.post("/admin/reset", requireJefe, (req, res) => {
    const { confirm } = req.body || {};
    if (String(confirm || "").trim() !== "BORRAR") {
      res.status(400).json({ ok: false, error: "Confirmación inválida." });
      return;
    }
    inicializarDb(true);
    res.json({ ok: true, message: "Reset de fábrica completado." });
  });

  // Endpoints de Respaldo Descargable (Protegidos por Jefatura)
  router.get("/backup/zip", requireJefe, (_req, res) => {
    try {
      flushJsonBackupSync();
      try {
        sqlite.pragma("wal_checkpoint(TRUNCATE)");
      } catch {
        // Ignorar si hay lectores simultáneos
      }
      const zip = new AdmZip();
      const rootFiles = [
        "package.json",
        "tsconfig.json",
        "vite.config.ts",
        "index.html",
        "server.ts",
        "metadata.json",
        ".env.example",
        ".gitignore",
        "README.md",
        "rental_valdivia_db.json",
        "rental_valdivia.sqlite",
      ];
      for (const file of rootFiles) {
        const fullPath = path.join(ROOT_DIR, file);
        if (fs.existsSync(fullPath)) {
          zip.addLocalFile(fullPath);
        }
      }
      const folders = ["server", "src", "public", ".agent"];
      for (const folder of folders) {
        const folderPath = path.join(ROOT_DIR, folder);
        if (fs.existsSync(folderPath)) {
          zip.addLocalFolder(folderPath, folder);
        }
      }
      const buffer = zip.toBuffer();
      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition":
          'attachment; filename="rental-valdivia-v12-completo.zip"',
        "Content-Length": buffer.length,
      });
      res.send(buffer);
    } catch (err) {
      console.error("Error generando respaldo ZIP:", err);
      res
        .status(500)
        .json({ ok: false, error: "Error generando archivo ZIP." });
    }
  });

  router.get("/backup/sqlite", requireJefe, (_req, res) => {
    flushJsonBackupSync();
    try {
      sqlite.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      // Ignorar si hay lectores simultáneos
    }
    if (!fs.existsSync(SQLITE_FILE)) {
      res
        .status(404)
        .json({ ok: false, error: "Base de datos SQLite no encontrada." });
      return;
    }
    res.download(SQLITE_FILE, "rental_valdivia.sqlite");
  });

  router.get("/backup/db", requireJefe, (_req, res) => {
    flushJsonBackupSync();
    if (!fs.existsSync(DB_FILE)) {
      res
        .status(404)
        .json({ ok: false, error: "Base de datos no encontrada." });
      return;
    }
    res.download(DB_FILE, "rental_valdivia_db.json");
  });

  router.get("/backup/codigo-completo", requireJefe, (_req, res) => {
    const codeFile = path.join(ROOT_DIR, "RENTAL_VALDIVIA_CODIGO_COMPLETO.md");
    if (!fs.existsSync(codeFile)) {
      res
        .status(404)
        .json({ ok: false, error: "Archivo de código completo no encontrado." });
      return;
    }
    res.download(codeFile, "RENTAL_VALDIVIA_CODIGO_COMPLETO.md");
  });

  return router;
}
