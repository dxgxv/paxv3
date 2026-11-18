import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import {
  ESTADO_DISPONIBLE,
  hoySantiagoISO,
  type Equipo,
  type EventoHistorial,
  type Presupuesto,
  type OrdenTrabajo,
  type Repuesto,
  type SolicitudEmergencia,
  type ArriendoRegistro,
} from "../src/data/catalogs.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, "..");
export const DB_FILE = path.join(ROOT_DIR, "rental_valdivia_db.json");
export const SQLITE_FILE = path.join(ROOT_DIR, "rental_valdivia.sqlite");
export const EVIDENCIAS_DIR = path.join(ROOT_DIR, "public", "evidencias");

export interface OTRepuestoRow {
  id: number;
  ot_id: number;
  repuesto_id: number;
  cantidad: number;
  costo_unitario: number;
  fecha: string;
}

export interface CountersSchema {
  historial: number;
  presupuestos: number;
  ordenes_trabajo: number;
  repuestos: number;
  ot_repuestos: number;
  emergencias: number;
  arriendos: number;
}

export interface DatabaseSchema {
  equipos: Equipo[];
  historial: EventoHistorial[];
  presupuestos: Presupuesto[];
  ordenes_trabajo: OrdenTrabajo[];
  repuestos: Repuesto[];
  ot_repuestos: OTRepuestoRow[];
  emergencias: SolicitudEmergencia[];
  arriendos: ArriendoRegistro[];
  counters: CountersSchema;
}

export const sqlite = new Database(SQLITE_FILE);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");

export let db: DatabaseSchema = {
  equipos: [],
  historial: [],
  presupuestos: [],
  ordenes_trabajo: [],
  repuestos: [],
  ot_repuestos: [],
  emergencias: [],
  arriendos: [],
  counters: {
    historial: 0,
    presupuestos: 0,
    ordenes_trabajo: 0,
    repuestos: 0,
    ot_repuestos: 0,
    emergencias: 0,
    arriendos: 0,
  },
};

export function ahoraStr(): string {
  try {
    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return formatter.format(new Date()).replace(",", "");
  } catch {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function calcularDiasCobrables(
  fechaSalida?: string | null,
  fechaFin?: string | null
): number {
  const s = (fechaSalida || "").trim().slice(0, 10);
  if (!s) return 1;
  const f = (fechaFin || hoySantiagoISO()).trim().slice(0, 10);
  const msIni = new Date(`${s}T00:00:00`).getTime();
  const msFin = new Date(`${f}T00:00:00`).getTime();
  if (Number.isNaN(msIni) || Number.isNaN(msFin)) return 1;
  return Math.max(1, Math.floor((msFin - msIni) / 86400000) + 1);
}

function initSqliteSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS equipos (
      codigo TEXT PRIMARY KEY,
      nombre TEXT,
      categoria TEXT,
      ubicacion_nfc TEXT,
      tipo_medicion TEXT,
      uso_acumulado REAL,
      limite_mantencion REAL,
      horometro_actual REAL,
      ultimo_horometro_mantencion REAL,
      estado_operativo TEXT,
      falla_activa INTEGER,
      panas_reportadas TEXT,
      ultima_observacion TEXT,
      fecha_actualizacion TEXT,
      en_arriendo INTEGER,
      cliente_actual TEXT,
      cliente_rut TEXT,
      ubicacion_actual TEXT,
      fecha_salida TEXT,
      fecha_retorno_estimada TEXT,
      guia_despacho TEXT,
      ultima_evidencia TEXT
    );
    CREATE TABLE IF NOT EXISTS ordenes_trabajo (
      id INTEGER PRIMARY KEY,
      folio TEXT,
      codigo_equipo TEXT,
      tipo TEXT,
      estado TEXT,
      fecha_apertura TEXT,
      fecha_cierre TEXT,
      responsable TEXT,
      mecanico TEXT,
      descripcion TEXT,
      detalle_cierre TEXT,
      costo_repuestos REAL,
      costo_otros REAL
    );
    CREATE TABLE IF NOT EXISTS repuestos (
      id INTEGER PRIMARY KEY,
      codigo TEXT,
      nombre TEXT,
      aplica_a TEXT,
      unidad TEXT,
      stock REAL,
      stock_minimo REAL,
      costo_unitario REAL
    );
    CREATE TABLE IF NOT EXISTS ot_repuestos (
      id INTEGER PRIMARY KEY,
      ot_id INTEGER NOT NULL,
      repuesto_id INTEGER NOT NULL,
      cantidad REAL NOT NULL,
      costo_unitario REAL NOT NULL,
      fecha TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS presupuestos (
      id INTEGER PRIMARY KEY,
      folio TEXT,
      codigo_equipo TEXT,
      nombre_equipo TEXT,
      categoria TEXT,
      fecha_solicitud TEXT,
      solicitante TEXT,
      destinatario_tipo TEXT,
      destinatario_nombre TEXT,
      prioridad TEXT,
      panas_asociadas TEXT,
      detalle_trabajos TEXT,
      costo_repuestos REAL,
      costo_mano_obra REAL,
      costo_insumos REAL,
      monto_total REAL,
      estado_presupuesto TEXT,
      observaciones_resolucion TEXT
    );
    CREATE TABLE IF NOT EXISTS historial (
      id INTEGER PRIMARY KEY,
      codigo_equipo TEXT,
      fecha TEXT,
      tipo_evento TEXT,
      responsable TEXT,
      uso_sumado REAL,
      costo_repuestos REAL,
      detalle TEXT
    );
    CREATE TABLE IF NOT EXISTS emergencias (
      id INTEGER PRIMARY KEY,
      folio TEXT,
      codigo_equipo TEXT,
      nombre_equipo TEXT,
      categoria TEXT,
      fecha_solicitud TEXT,
      created_at_ms INTEGER,
      reportante_nombre TEXT,
      reportante_rut TEXT,
      cliente_obra TEXT,
      ubicacion_faena TEXT,
      panas_reportadas TEXT,
      evidencia_url TEXT,
      motivo_verificado INTEGER,
      estado TEXT,
      fecha_resolucion TEXT,
      observacion_resolucion TEXT
    );
    CREATE TABLE IF NOT EXISTS arriendos (
      id INTEGER PRIMARY KEY,
      codigo_equipo TEXT NOT NULL,
      nombre_equipo TEXT,
      cliente_obra TEXT NOT NULL,
      cliente_rut TEXT,
      ubicacion_faena TEXT,
      guia_despacho TEXT,
      responsable_despacho TEXT,
      fecha_salida TEXT NOT NULL,
      fecha_retorno_estimada TEXT,
      fecha_retorno_real TEXT,
      horometro_salida REAL,
      horometro_retorno REAL,
      dias_cobrables INTEGER,
      estado TEXT NOT NULL,
      observacion TEXT
    );
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      tx_key TEXT PRIMARY KEY,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL
    );
  `);

  const alterCols = [
    "ALTER TABLE equipos ADD COLUMN en_arriendo INTEGER",
    "ALTER TABLE equipos ADD COLUMN cliente_actual TEXT",
    "ALTER TABLE equipos ADD COLUMN cliente_rut TEXT",
    "ALTER TABLE equipos ADD COLUMN ubicacion_actual TEXT",
    "ALTER TABLE equipos ADD COLUMN fecha_salida TEXT",
    "ALTER TABLE equipos ADD COLUMN fecha_retorno_estimada TEXT",
    "ALTER TABLE equipos ADD COLUMN guia_despacho TEXT",
    "ALTER TABLE equipos ADD COLUMN ultima_evidencia TEXT",
    "ALTER TABLE emergencias ADD COLUMN created_at_ms INTEGER",
  ];
  for (const stmt of alterCols) {
    try {
      sqlite.exec(stmt);
    } catch {
      // Columna ya existente
    }
  }

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_equipos_estado ON equipos(estado_operativo);
    CREATE INDEX IF NOT EXISTS idx_equipos_arriendo ON equipos(en_arriendo);
    CREATE INDEX IF NOT EXISTS idx_ot_equipo_estado ON ordenes_trabajo(codigo_equipo, estado);
    CREATE INDEX IF NOT EXISTS idx_ot_repuestos_ot ON ot_repuestos(ot_id);
    CREATE INDEX IF NOT EXISTS idx_presupuestos_estado ON presupuestos(estado_presupuesto);
    CREATE INDEX IF NOT EXISTS idx_presupuestos_folio ON presupuestos(folio);
    CREATE INDEX IF NOT EXISTS idx_historial_equipo ON historial(codigo_equipo, id);
    CREATE INDEX IF NOT EXISTS idx_emergencias_estado ON emergencias(estado, codigo_equipo);
    CREATE INDEX IF NOT EXISTS idx_emergencias_created ON emergencias(created_at_ms);
    CREATE INDEX IF NOT EXISTS idx_arriendos_equipo_estado ON arriendos(codigo_equipo, estado);
    CREATE INDEX IF NOT EXISTS idx_idemp_created ON idempotency_keys(created_at_ms);
  `);
}

initSqliteSchema();

const stmtUpsertEquipo = sqlite.prepare(`
  INSERT OR REPLACE INTO equipos (
    codigo, nombre, categoria, ubicacion_nfc, tipo_medicion,
    uso_acumulado, limite_mantencion, horometro_actual, ultimo_horometro_mantencion,
    estado_operativo, falla_activa, panas_reportadas, ultima_observacion, fecha_actualizacion,
    en_arriendo, cliente_actual, cliente_rut, ubicacion_actual, fecha_salida,
    fecha_retorno_estimada, guia_despacho, ultima_evidencia
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtUpsertOt = sqlite.prepare(`
  INSERT OR REPLACE INTO ordenes_trabajo (
    id, folio, codigo_equipo, tipo, estado, fecha_apertura, fecha_cierre,
    responsable, mecanico, descripcion, detalle_cierre, costo_repuestos, costo_otros
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtUpsertRepuesto = sqlite.prepare(`
  INSERT OR REPLACE INTO repuestos (id, codigo, nombre, aplica_a, unidad, stock, stock_minimo, costo_unitario)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtUpsertOtRepuesto = sqlite.prepare(`
  INSERT OR REPLACE INTO ot_repuestos (id, ot_id, repuesto_id, cantidad, costo_unitario, fecha)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const stmtDeleteOtRepuesto = sqlite.prepare(`DELETE FROM ot_repuestos WHERE id = ?`);

const stmtUpsertPresupuesto = sqlite.prepare(`
  INSERT OR REPLACE INTO presupuestos (
    id, folio, codigo_equipo, nombre_equipo, categoria, fecha_solicitud,
    solicitante, destinatario_tipo, destinatario_nombre, prioridad,
    panas_asociadas, detalle_trabajos, costo_repuestos, costo_mano_obra,
    costo_insumos, monto_total, estado_presupuesto, observaciones_resolucion
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtUpsertHistorial = sqlite.prepare(`
  INSERT OR REPLACE INTO historial (id, codigo_equipo, fecha, tipo_evento, responsable, uso_sumado, costo_repuestos, detalle)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtUpsertEmergencia = sqlite.prepare(`
  INSERT OR REPLACE INTO emergencias (
    id, folio, codigo_equipo, nombre_equipo, categoria, fecha_solicitud, created_at_ms,
    reportante_nombre, reportante_rut, cliente_obra, ubicacion_faena,
    panas_reportadas, evidencia_url, motivo_verificado, estado,
    fecha_resolucion, observacion_resolucion
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtUpsertArriendo = sqlite.prepare(`
  INSERT OR REPLACE INTO arriendos (
    id, codigo_equipo, nombre_equipo, cliente_obra, cliente_rut, ubicacion_faena,
    guia_despacho, responsable_despacho, fecha_salida, fecha_retorno_estimada,
    fecha_retorno_real, horometro_salida, horometro_retorno, dias_cobrables,
    estado, observacion
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtSetKv = sqlite.prepare(
  "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)"
);

export function upsertEquipoSql(e: Equipo): void {
  stmtUpsertEquipo.run(
    e.codigo,
    e.nombre,
    e.categoria,
    e.ubicacion_nfc,
    e.tipo_medicion,
    Number(e.uso_acumulado) || 0,
    Number(e.limite_mantencion) || 15,
    Number(e.horometro_actual) || 0,
    Number(e.ultimo_horometro_mantencion) || 0,
    e.estado_operativo,
    Number(e.falla_activa) || 0,
    e.panas_reportadas || "",
    e.ultima_observacion || "",
    e.fecha_actualizacion || "",
    Number(e.en_arriendo) || 0,
    e.cliente_actual || "",
    e.cliente_rut || "",
    e.ubicacion_actual || "",
    e.fecha_salida || "",
    e.fecha_retorno_estimada || "",
    e.guia_despacho || "",
    e.ultima_evidencia || ""
  );
}

export function upsertOtSql(o: OrdenTrabajo): void {
  stmtUpsertOt.run(
    o.id,
    o.folio,
    o.codigo_equipo,
    o.tipo,
    o.estado,
    o.fecha_apertura,
    o.fecha_cierre || null,
    o.responsable,
    o.mecanico || null,
    o.descripcion,
    o.detalle_cierre || null,
    Number(o.costo_repuestos) || 0,
    Number(o.costo_otros) || 0
  );
}

export function upsertRepuestoSql(r: Repuesto): void {
  stmtUpsertRepuesto.run(
    r.id,
    r.codigo,
    r.nombre,
    r.aplica_a,
    r.unidad,
    Number(r.stock) || 0,
    Number(r.stock_minimo) || 0,
    Number(r.costo_unitario) || 0
  );
}

export function upsertOtRepuestoSql(item: OTRepuestoRow): void {
  stmtUpsertOtRepuesto.run(
    item.id,
    item.ot_id,
    item.repuesto_id,
    Number(item.cantidad) || 0,
    Number(item.costo_unitario) || 0,
    item.fecha
  );
}

export function deleteOtRepuestoSql(id: number): void {
  stmtDeleteOtRepuesto.run(id);
}

export function upsertPresupuestoSql(p: Presupuesto): void {
  stmtUpsertPresupuesto.run(
    p.id,
    p.folio,
    p.codigo_equipo,
    p.nombre_equipo,
    p.categoria,
    p.fecha_solicitud,
    p.solicitante,
    p.destinatario_tipo,
    p.destinatario_nombre,
    p.prioridad,
    p.panas_asociadas,
    p.detalle_trabajos,
    Number(p.costo_repuestos) || 0,
    Number(p.costo_mano_obra) || 0,
    Number(p.costo_insumos) || 0,
    Number(p.monto_total) || 0,
    p.estado_presupuesto,
    p.observaciones_resolucion || ""
  );
}

export function upsertHistorialSql(h: EventoHistorial): void {
  stmtUpsertHistorial.run(
    h.id,
    h.codigo_equipo,
    h.fecha,
    h.tipo_evento,
    h.responsable,
    Number(h.uso_sumado) || 0,
    Number(h.costo_repuestos) || 0,
    h.detalle || ""
  );
}

export function upsertEmergenciaSql(em: SolicitudEmergencia): void {
  stmtUpsertEmergencia.run(
    em.id,
    em.folio,
    em.codigo_equipo,
    em.nombre_equipo,
    em.categoria,
    em.fecha_solicitud,
    Number(em.created_at_ms) || 0,
    em.reportante_nombre,
    em.reportante_rut,
    em.cliente_obra,
    em.ubicacion_faena,
    em.panas_reportadas,
    em.evidencia_url || "",
    Number(em.motivo_verificado) || 0,
    em.estado,
    em.fecha_resolucion || null,
    em.observacion_resolucion || ""
  );
}

export function upsertArriendoSql(a: ArriendoRegistro): void {
  stmtUpsertArriendo.run(
    a.id,
    a.codigo_equipo,
    a.nombre_equipo || "",
    a.cliente_obra,
    a.cliente_rut || "",
    a.ubicacion_faena || "",
    a.guia_despacho || "",
    a.responsable_despacho || "",
    a.fecha_salida,
    a.fecha_retorno_estimada || "",
    a.fecha_retorno_real || null,
    Number(a.horometro_salida) || 0,
    a.horometro_retorno !== null && a.horometro_retorno !== undefined
      ? Number(a.horometro_retorno)
      : null,
    Number(a.dias_cobrables) || 1,
    a.estado,
    a.observacion || ""
  );
}

export function saveCountersSql(): void {
  stmtSetKv.run("counters", JSON.stringify(db.counters));
}

let jsonBackupTimer: NodeJS.Timeout | null = null;
let jsonWriteInFlight = false;

export function scheduleJsonBackup(): void {
  if (jsonBackupTimer) {
    clearTimeout(jsonBackupTimer);
  }
  jsonBackupTimer = setTimeout(() => {
    jsonBackupTimer = null;
    if (jsonWriteInFlight) return;
    jsonWriteInFlight = true;
    const snapshot = JSON.stringify(db, null, 2);
    fs.promises
      .writeFile(DB_FILE, snapshot, "utf-8")
      .catch((err) => {
        console.error("Error en respaldo JSON asíncrono:", err);
      })
      .finally(() => {
        jsonWriteInFlight = false;
      });
  }, 1500);
}

export function flushJsonBackupSync(): void {
  if (jsonBackupTimer) {
    clearTimeout(jsonBackupTimer);
    jsonBackupTimer = null;
  }
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Error escribiendo respaldo JSON síncrono:", err);
  }
}

export function runDbTransaction<T>(fn: () => T): T {
  const tx = sqlite.transaction(fn);
  const result = tx();
  saveCountersSql();
  scheduleJsonBackup();
  return result;
}

export function syncAllTablesSql(): void {
  const tx = sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM equipos").run();
    for (const e of db.equipos) upsertEquipoSql(e);

    sqlite.prepare("DELETE FROM ordenes_trabajo").run();
    for (const o of db.ordenes_trabajo) upsertOtSql(o);

    sqlite.prepare("DELETE FROM repuestos").run();
    for (const r of db.repuestos) upsertRepuestoSql(r);

    sqlite.prepare("DELETE FROM ot_repuestos").run();
    for (const item of db.ot_repuestos) upsertOtRepuestoSql(item);

    sqlite.prepare("DELETE FROM presupuestos").run();
    for (const p of db.presupuestos) upsertPresupuestoSql(p);

    sqlite.prepare("DELETE FROM historial").run();
    for (const h of db.historial) upsertHistorialSql(h);

    sqlite.prepare("DELETE FROM emergencias").run();
    for (const em of db.emergencias) upsertEmergenciaSql(em);

    sqlite.prepare("DELETE FROM arriendos").run();
    for (const a of db.arriendos) upsertArriendoSql(a);

    saveCountersSql();
    stmtSetKv.run("schema_version", "2");
  });
  tx();
  scheduleJsonBackup();
}

export function getIdempotentResponse(
  txKey?: string
): { statusCode: number; payload: unknown } | null {
  if (!txKey || typeof txKey !== "string") return null;
  const clean = txKey.trim();
  if (!clean) return null;
  const row = sqlite
    .prepare(
      "SELECT status_code, response_json FROM idempotency_keys WHERE tx_key = ?"
    )
    .get(clean) as { status_code: number; response_json: string } | undefined;
  if (!row) return null;
  try {
    return {
      statusCode: row.status_code,
      payload: JSON.parse(row.response_json),
    };
  } catch {
    return null;
  }
}

export function saveIdempotentResponse(
  txKey: string | undefined,
  statusCode: number,
  payload: unknown
): void {
  if (!txKey || typeof txKey !== "string") return;
  const clean = txKey.trim();
  if (!clean) return;
  const nowMs = Date.now();
  sqlite
    .prepare(
      "INSERT OR REPLACE INTO idempotency_keys (tx_key, status_code, response_json, created_at_ms) VALUES (?, ?, ?, ?)"
    )
    .run(clean, statusCode, JSON.stringify(payload), nowMs);
  // Purga ligera de llaves antiguas (> 7 días)
  sqlite
    .prepare("DELETE FROM idempotency_keys WHERE created_at_ms < ?")
    .run(nowMs - 7 * 24 * 3600 * 1000);
}

export function registrarEvento(
  codigo: string,
  fecha: string,
  tipo_evento: string,
  responsable: string,
  uso_sumado = 0,
  costo_repuestos = 0,
  detalle = "",
  persistSql = false
): EventoHistorial {
  db.counters.historial += 1;
  const ev: EventoHistorial = {
    id: db.counters.historial,
    codigo_equipo: codigo,
    fecha,
    tipo_evento,
    responsable,
    uso_sumado: Number(uso_sumado) || 0,
    costo_repuestos: Number(costo_repuestos) || 0,
    detalle,
  };
  db.historial.push(ev);
  if (persistSql) {
    upsertHistorialSql(ev);
  }
  return ev;
}

export function otAbierta(codigo: string): OrdenTrabajo | undefined {
  for (let i = db.ordenes_trabajo.length - 1; i >= 0; i--) {
    const ot = db.ordenes_trabajo[i];
    if (ot.codigo_equipo === codigo && ot.estado !== "CERRADA") {
      return ot;
    }
  }
  return undefined;
}

export function abrirOt(
  codigo: string,
  tipo: "CORRECTIVA" | "PREVENTIVA",
  descripcion: string,
  responsable: string,
  ahora: string,
  persistSql = false
): string {
  const existente = otAbierta(codigo);
  if (existente) {
    return existente.folio;
  }
  db.counters.ordenes_trabajo += 1;
  const id = db.counters.ordenes_trabajo;
  const folio = `OT-${String(id).padStart(4, "0")}`;
  const nuevaOt: OrdenTrabajo = {
    id,
    folio,
    codigo_equipo: codigo,
    tipo,
    estado: "ABIERTA",
    fecha_apertura: ahora,
    fecha_cierre: null,
    responsable,
    mecanico: null,
    descripcion,
    detalle_cierre: null,
    costo_repuestos: 0,
    costo_otros: 0,
  };
  db.ordenes_trabajo.push(nuevaOt);
  if (persistSql) {
    upsertOtSql(nuevaOt);
  }
  registrarEvento(
    codigo,
    ahora,
    "APERTURA OT",
    responsable,
    0,
    0,
    `${folio} (${tipo}): ${descripcion}`,
    persistSql
  );
  return folio;
}

export function cerrarOt(
  codigo: string,
  responsable: string,
  detalle_cierre: string,
  costo_otros: number,
  ahora: string,
  persistSql = false
): { folio: string | null; costoInv: number } {
  const existente = otAbierta(codigo);
  if (!existente) {
    return { folio: null, costoInv: 0 };
  }
  const costoInv = db.ot_repuestos
    .filter((r) => r.ot_id === existente.id)
    .reduce((acc, r) => acc + r.cantidad * r.costo_unitario, 0);

  existente.estado = "CERRADA";
  existente.fecha_cierre = ahora;
  existente.mecanico = responsable;
  existente.detalle_cierre = detalle_cierre;
  existente.costo_repuestos = costoInv;
  existente.costo_otros = Number(costo_otros) || 0;

  if (persistSql) {
    upsertOtSql(existente);
  }

  return { folio: existente.folio, costoInv };
}

function normalizeLoadedSchema(raw: Partial<DatabaseSchema>): DatabaseSchema {
  const equipos = Array.isArray(raw.equipos) ? raw.equipos : [];
  const historial = Array.isArray(raw.historial) ? raw.historial : [];
  const presupuestos = Array.isArray(raw.presupuestos) ? raw.presupuestos : [];
  const ordenes_trabajo = Array.isArray(raw.ordenes_trabajo)
    ? raw.ordenes_trabajo
    : [];
  const repuestos = Array.isArray(raw.repuestos) ? raw.repuestos : [];
  const ot_repuestos = Array.isArray(raw.ot_repuestos) ? raw.ot_repuestos : [];
  const emergencias = Array.isArray(raw.emergencias) ? raw.emergencias : [];
  let arriendos = Array.isArray(raw.arriendos) ? raw.arriendos : [];

  let nextArrId = Math.max(0, ...arriendos.map((a) => Number(a.id) || 0));
  // Sincroniza arriendos activos si provienen de versión anterior sin tabla arriendos
  for (const eq of equipos) {
    if (
      eq.en_arriendo === 1 &&
      eq.cliente_actual &&
      !arriendos.some(
        (a) => a.codigo_equipo === eq.codigo && a.estado === "ACTIVO"
      )
    ) {
      nextArrId += 1;
      const salida = eq.fecha_salida || ahoraStr();
      arriendos.push({
        id: nextArrId,
        codigo_equipo: eq.codigo,
        nombre_equipo: eq.nombre,
        cliente_obra: eq.cliente_actual,
        cliente_rut: eq.cliente_rut || "",
        ubicacion_faena: eq.ubicacion_actual || "Faena activa",
        guia_despacho: eq.guia_despacho || "",
        responsable_despacho: "Sistema",
        fecha_salida: salida,
        fecha_retorno_estimada: eq.fecha_retorno_estimada || "",
        fecha_retorno_real: null,
        horometro_salida: Number(eq.horometro_actual) || 0,
        horometro_retorno: null,
        dias_cobrables: calcularDiasCobrables(salida, null),
        estado: "ACTIVO",
        observacion: eq.ultima_observacion || "",
      });
    }
  }

  const maxId = (arr: { id?: number }[]) =>
    arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);

  return {
    equipos,
    historial,
    presupuestos,
    ordenes_trabajo,
    repuestos,
    ot_repuestos,
    emergencias,
    arriendos,
    counters: {
      historial: Math.max(raw.counters?.historial || 0, maxId(historial)),
      presupuestos: Math.max(
        raw.counters?.presupuestos || 0,
        maxId(presupuestos)
      ),
      ordenes_trabajo: Math.max(
        raw.counters?.ordenes_trabajo || 0,
        maxId(ordenes_trabajo)
      ),
      repuestos: Math.max(raw.counters?.repuestos || 0, maxId(repuestos)),
      ot_repuestos: Math.max(
        raw.counters?.ot_repuestos || 0,
        maxId(ot_repuestos)
      ),
      emergencias: Math.max(
        raw.counters?.emergencias || 0,
        maxId(emergencias)
      ),
      arriendos: Math.max(raw.counters?.arriendos || 0, nextArrId),
    },
  };
}

export function inicializarDb(forzarReinicio = false) {
  if (!forzarReinicio) {
    try {
      const schemaVerRow = sqlite
        .prepare("SELECT value FROM kv_store WHERE key = 'schema_version'")
        .get() as { value: string } | undefined;
      const eqCountRow = sqlite
        .prepare("SELECT COUNT(*) as c FROM equipos")
        .get() as { c: number };

      if (schemaVerRow?.value === "2" && eqCountRow.c > 0) {
        const countersRow = sqlite
          .prepare("SELECT value FROM kv_store WHERE key = 'counters'")
          .get() as { value: string } | undefined;
        const parsedCounters = countersRow?.value
          ? (JSON.parse(countersRow.value) as Partial<CountersSchema>)
          : {};

        db = normalizeLoadedSchema({
          equipos: sqlite.prepare("SELECT * FROM equipos").all() as Equipo[],
          historial: sqlite
            .prepare("SELECT * FROM historial ORDER BY id ASC")
            .all() as EventoHistorial[],
          presupuestos: sqlite
            .prepare("SELECT * FROM presupuestos ORDER BY id ASC")
            .all() as Presupuesto[],
          ordenes_trabajo: sqlite
            .prepare("SELECT * FROM ordenes_trabajo ORDER BY id ASC")
            .all() as OrdenTrabajo[],
          repuestos: sqlite
            .prepare("SELECT * FROM repuestos ORDER BY id ASC")
            .all() as Repuesto[],
          ot_repuestos: sqlite
            .prepare("SELECT * FROM ot_repuestos ORDER BY id ASC")
            .all() as OTRepuestoRow[],
          emergencias: sqlite
            .prepare("SELECT * FROM emergencias ORDER BY id ASC")
            .all() as SolicitudEmergencia[],
          arriendos: sqlite
            .prepare("SELECT * FROM arriendos ORDER BY id ASC")
            .all() as ArriendoRegistro[],
          counters: parsedCounters as CountersSchema,
        });
        return;
      }

      // Migración desde kv_store['state'] legado
      const row = sqlite
        .prepare("SELECT value FROM kv_store WHERE key = 'state'")
        .get() as { value: string } | undefined;
      if (row && row.value) {
        const parsed = JSON.parse(row.value) as Partial<DatabaseSchema>;
        if (parsed && Array.isArray(parsed.equipos) && parsed.equipos.length > 0) {
          db = normalizeLoadedSchema(parsed);
          syncAllTablesSql();
          return;
        }
      }
    } catch (err) {
      console.error("Error leyendo estado desde SQLite:", err);
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
        if (parsed && Array.isArray(parsed.equipos) && parsed.equipos.length > 0) {
          db = normalizeLoadedSchema(parsed);
          syncAllTablesSql();
          return;
        }
      } catch (err) {
        console.error("Error leyendo DB JSON existente, recreando:", err);
      }
    }
  }

  db = {
    equipos: [],
    historial: [],
    presupuestos: [],
    ordenes_trabajo: [],
    repuestos: [],
    ot_repuestos: [],
    emergencias: [],
    arriendos: [],
    counters: {
      historial: 0,
      presupuestos: 0,
      ordenes_trabajo: 0,
      repuestos: 0,
      ot_repuestos: 0,
      emergencias: 0,
      arriendos: 0,
    },
  };

  const seedRepuestos: Omit<Repuesto, "id">[] = [
    {
      codigo: "REP-001",
      nombre: "Juego de carbones motor eléctrico",
      aplica_a: "Cortadora Orbital",
      unidad: "juego",
      stock: 6,
      stock_minimo: 2,
      costo_unitario: 12000,
    },
    {
      codigo: "REP-002",
      nombre: "Correa centrífuga (embrague)",
      aplica_a: "Placa Compactadora",
      unidad: "unidad",
      stock: 3,
      stock_minimo: 2,
      costo_unitario: 18500,
    },
    {
      codigo: "REP-003",
      nombre: "Aceite de motor 15W-40",
      aplica_a: "General",
      unidad: "litro",
      stock: 20,
      stock_minimo: 8,
      costo_unitario: 6500,
    },
    {
      codigo: "REP-004",
      nombre: "Acople rápido hidráulico QDC (par)",
      aplica_a: "Unidad Motriz",
      unidad: "par",
      stock: 2,
      stock_minimo: 2,
      costo_unitario: 32000,
    },
    {
      codigo: "REP-005",
      nombre: "Filtro de aire motor bencinero",
      aplica_a: "Unidad Motriz",
      unidad: "unidad",
      stock: 5,
      stock_minimo: 3,
      costo_unitario: 7900,
    },
    {
      codigo: "REP-006",
      nombre: "Bujía",
      aplica_a: "General",
      unidad: "unidad",
      stock: 10,
      stock_minimo: 4,
      costo_unitario: 4500,
    },
    {
      codigo: "REP-007",
      nombre: "Grasa especial de percusión",
      aplica_a: "Martillo Demoledor",
      unidad: "pote",
      stock: 1,
      stock_minimo: 2,
      costo_unitario: 15000,
    },
    {
      codigo: "REP-008",
      nombre: "Sello mecánico bomba sumergible",
      aplica_a: "Motobomba / Bomba Sumergible",
      unidad: "unidad",
      stock: 2,
      stock_minimo: 1,
      costo_unitario: 28000,
    },
    {
      codigo: "REP-009",
      nombre: "Aceite hidráulico ISO 68",
      aplica_a: "General",
      unidad: "litro",
      stock: 15,
      stock_minimo: 10,
      costo_unitario: 5200,
    },
  ];

  for (const r of seedRepuestos) {
    db.counters.repuestos += 1;
    db.repuestos.push({ id: db.counters.repuestos, ...r });
  }

  db.equipos = [
    {
      codigo: "RV-0001",
      nombre: 'Cortadora Orbital Tubos 6-12"',
      categoria: "Cortadora Orbital",
      ubicacion_nfc: "Cara interna base mordaza",
      tipo_medicion: "DIAS",
      uso_acumulado: 14,
      limite_mantencion: 15,
      horometro_actual: 0,
      estado_operativo: ESTADO_DISPONIBLE,
      falla_activa: 0,
      panas_reportadas: "",
      ultima_observacion: "Operativa. Próxima a revisión preventiva.",
      fecha_actualizacion: "2026-10-15 09:30",
    },
    {
      codigo: "RV-0007",
      nombre: "Unidad Motriz Bencinera Honda",
      categoria: "Unidad Motriz",
      ubicacion_nfc: "Tras soporte filtro de aire",
      tipo_medicion: "DIAS",
      uso_acumulado: 8,
      limite_mantencion: 20,
      horometro_actual: 0,
      estado_operativo: "EN_PANA",
      falla_activa: 1,
      panas_reportadas: "Fuga o rotura en acoples rápidos",
      ultima_observacion: "Ingresó con acople dañado.",
      fecha_actualizacion: "2026-10-19 11:20",
    },
  ];

  registrarEvento(
    "RV-0007",
    "2026-10-19 11:20",
    "RECEPCIÓN CON FALLA",
    "Bodega Patio",
    4,
    0,
    "Panas: Fuga en acoples QDC | Pérdida de presión. Se bloquea equipo para taller."
  );
  registrarEvento(
    "RV-0001",
    "2026-10-16 12:00",
    "MANTENCIÓN TALLER",
    "Mecánico Juan P.",
    0,
    28500,
    "Cambio de carbones y pauta preventiva."
  );
  registrarEvento(
    "RV-0001",
    "2026-10-17 18:00",
    "RECEPCIÓN NORMAL",
    "Bodega Patio",
    6,
    0,
    "Vuelve de faena sin daños visibles."
  );

  abrirOt(
    "RV-0007",
    "CORRECTIVA",
    "Fuga o rotura en acoples rápidos",
    "Bodega Patio",
    "2026-10-19 11:20"
  );

  db.counters.presupuestos += 1;
  db.presupuestos.push({
    id: db.counters.presupuestos,
    folio: "PRES-0001",
    codigo_equipo: "RV-0007",
    nombre_equipo: "Unidad Motriz Bencinera Honda",
    categoria: "Unidad Motriz",
    fecha_solicitud: "2026-10-19 12:00",
    solicitante: "Mecánico Jefe",
    destinatario_tipo: "Por definir (Evaluación Interna)",
    destinatario_nombre: "Pendiente asignar destinatario",
    prioridad: "Alta (Equipo Bloqueado)",
    panas_asociadas:
      "Fuga o rotura en acoples rápidos hidráulicos (QDC) | Pérdida de presión hidráulica",
    detalle_trabajos:
      'Reemplazo de juego de acoples rápidos Parker, manguera R2 1/2" y cambio de aceite hidráulico ISO 68.',
    costo_repuestos: 65000,
    costo_mano_obra: 35000,
    costo_insumos: 18000,
    monto_total: 118000,
    estado_presupuesto: "PENDIENTE",
    observaciones_resolucion:
      "Esperando definir si se cobra a cliente o pasa por garantía interna.",
  });

  syncAllTablesSql();
}

export function poblarFlotaMasiva(cantidadObjetivo = 3000): number {
  const actuales = db.equipos.length;
  const faltantes = Math.max(0, cantidadObjetivo - actuales);
  if (faltantes === 0) return 0;

  const plantillas: [string, string, string, "DIAS" | "HORAS", number][] = [
    ["Cortadora Orbital", "Cortadora Orbital", "Base protegida", "DIAS", 15],
    ["Placa Compactadora", "Placa Compactadora", "Base manillar", "DIAS", 15],
    ["Unidad Motriz", "Unidad Motriz", "Jaula interna", "DIAS", 20],
    ["Miniexcavadora", "Maquinaria con Horómetro", "Cabina", "HORAS", 250],
  ];

  const ahora = ahoraStr();
  const existentes = new Set(db.equipos.map((e) => e.codigo));
  let numero = actuales + 1;
  let creados = 0;

  const nuevos: Equipo[] = [];
  while (creados < faltantes) {
    const cod = `RV-${String(numero).padStart(4, "0")}`;
    numero += 1;
    if (existentes.has(cod)) continue;
    existentes.add(cod);

    const [nomBase, cat, ubic, tMed, lim] =
      plantillas[Math.floor(Math.random() * plantillas.length)];
    const maxUso = Math.floor(lim * 1.3);
    const uso = Math.floor(Math.random() * (maxUso + 1));

    const item: Equipo = {
      codigo: cod,
      nombre: `${nomBase} #${numero - 1}`,
      categoria: cat,
      ubicacion_nfc: ubic,
      tipo_medicion: tMed,
      uso_acumulado: uso,
      limite_mantencion: lim,
      horometro_actual: 0,
      estado_operativo: ESTADO_DISPONIBLE,
      falla_activa: 0,
      panas_reportadas: "",
      ultima_observacion: "Demo masiva.",
      fecha_actualizacion: ahora,
    };
    db.equipos.push(item);
    nuevos.push(item);
    creados += 1;
  }

  runDbTransaction(() => {
    for (const eq of nuevos) {
      upsertEquipoSql(eq);
    }
  });
  return creados;
}
