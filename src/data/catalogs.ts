export const ESTADO_DISPONIBLE = "DISPONIBLE" as const;
export const ESTADO_PRE_ALERTA = "PRE_ALERTA" as const;
export const ESTADO_EN_PANA = "EN_PANA" as const;
export const ESTADO_EN_PRESUPUESTO = "EN_PRESUPUESTO" as const;

export type EstadoOperativo =
  | typeof ESTADO_DISPONIBLE
  | typeof ESTADO_PRE_ALERTA
  | typeof ESTADO_EN_PANA
  | typeof ESTADO_EN_PRESUPUESTO;

export type TipoMedicion = "DIAS" | "HORAS";

export const OT_ESTADOS_ABIERTOS = [
  "ABIERTA",
  "EN PROCESO",
  "ESPERANDO REPUESTO",
] as const;

export type EstadoOT = (typeof OT_ESTADOS_ABIERTOS)[number] | "CERRADA";

export type SemaforoKey = "OPERATIVA" | "MANTENCION" | "PANA" | "PRESUPUESTO";

export interface Equipo {
  codigo: string;
  nombre: string;
  categoria: string;
  ubicacion_nfc: string;
  tipo_medicion: TipoMedicion;
  uso_acumulado: number;
  limite_mantencion: number;
  horometro_actual: number;
  ultimo_horometro_mantencion?: number;
  horas_para_mantencion?: number;
  porcentaje_vida_util?: number;
  estado_operativo: EstadoOperativo;
  falla_activa: number;
  panas_reportadas: string;
  ultima_observacion: string;
  fecha_actualizacion: string;
  semaforo?: string;
  en_arriendo?: number;
  cliente_actual?: string;
  cliente_rut?: string;
  ubicacion_actual?: string;
  fecha_salida?: string;
  fecha_retorno_estimada?: string;
  guia_despacho?: string;
  ultima_evidencia?: string;
  dias_en_arriendo?: number;
  dias_atraso?: number;
  arriendo_vencido?: boolean;
}

export interface ArriendoRegistro {
  id: number;
  codigo_equipo: string;
  nombre_equipo?: string;
  cliente_obra: string;
  cliente_rut: string;
  ubicacion_faena: string;
  guia_despacho: string;
  responsable_despacho: string;
  fecha_salida: string;
  fecha_retorno_estimada: string;
  fecha_retorno_real: string | null;
  horometro_salida: number;
  horometro_retorno: number | null;
  dias_cobrables: number;
  estado: "ACTIVO" | "DEVUELTO";
  observacion: string;
}

export interface EventoHistorial {
  id: number;
  codigo_equipo: string;
  fecha: string;
  tipo_evento: string;
  responsable: string;
  uso_sumado: number;
  costo_repuestos: number;
  detalle: string;
}

export interface Presupuesto {
  id: number;
  folio: string;
  codigo_equipo: string;
  nombre_equipo: string;
  categoria: string;
  fecha_solicitud: string;
  solicitante: string;
  destinatario_tipo: string;
  destinatario_nombre: string;
  prioridad: string;
  panas_asociadas: string;
  detalle_trabajos: string;
  costo_repuestos: number;
  costo_mano_obra: number;
  costo_insumos: number;
  monto_total: number;
  estado_presupuesto: string;
  observaciones_resolucion: string;
}

export interface OrdenTrabajo {
  id: number;
  folio: string;
  codigo_equipo: string;
  tipo: "CORRECTIVA" | "PREVENTIVA";
  estado: EstadoOT;
  fecha_apertura: string;
  fecha_cierre: string | null;
  responsable: string;
  mecanico: string | null;
  descripcion: string;
  detalle_cierre: string | null;
  costo_repuestos: number;
  costo_otros: number;
}

export interface Repuesto {
  id: number;
  codigo: string;
  nombre: string;
  aplica_a: string;
  unidad: string;
  stock: number;
  stock_minimo: number;
  costo_unitario: number;
}

export interface OTRepuestoItem {
  id: number;
  ot_id: number;
  repuesto_id: number;
  codigo: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  costo_unitario: number;
  subtotal: number;
  fecha: string;
}

export interface SolicitudEmergencia {
  id: number;
  folio: string;
  codigo_equipo: string;
  nombre_equipo: string;
  categoria: string;
  fecha_solicitud: string;
  created_at_ms?: number;
  reportante_nombre: string;
  reportante_rut: string;
  cliente_obra: string;
  ubicacion_faena: string;
  panas_reportadas: string;
  evidencia_url: string;
  motivo_verificado: number;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  fecha_resolucion: string | null;
  observacion_resolucion: string;
}

export function normalizarRut(rut: string): string {
  return String(rut || "")
    .replace(/[.\-\s]/g, "")
    .toUpperCase()
    .trim();
}

export function validarRutChileno(rut: string): {
  valido: boolean;
  normalizado: string;
  formateado: string;
  error?: string;
} {
  const clean = normalizarRut(rut);
  if (!clean || clean.length < 7 || clean.length > 9) {
    return {
      valido: false,
      normalizado: clean,
      formateado: rut.trim(),
      error: "El RUT debe tener entre 7 y 9 caracteres (ej: 15.432.198-K).",
    };
  }
  if (!/^\d{6,8}[0-9K]$/.test(clean)) {
    return {
      valido: false,
      normalizado: clean,
      formateado: rut.trim(),
      error: "Formato de RUT inválido. Usa números y dígito verificador (0-9 o K).",
    };
  }
  const cuerpo = clean.slice(0, -1);
  const dvIngresado = clean.slice(-1);
  if (/^(\d)\1+$/.test(cuerpo)) {
    return {
      valido: false,
      normalizado: clean,
      formateado: rut.trim(),
      error: "RUT inválido: dígitos repetidos.",
    };
  }

  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const resto = 11 - (suma % 11);
  const dvEsperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  if (dvIngresado !== dvEsperado) {
    return {
      valido: false,
      normalizado: clean,
      formateado: rut.trim(),
      error: `Dígito verificador incorrecto (esperado -${dvEsperado}).`,
    };
  }

  const cuerpoFmt = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return {
    valido: true,
    normalizado: clean,
    formateado: `${cuerpoFmt}-${dvIngresado}`,
  };
}

export function hoySantiagoISO(): string {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function calcularEstadoArriendo(eq: {
  en_arriendo?: number;
  fecha_salida?: string | null;
  fecha_retorno_estimada?: string | null;
}): {
  diasEnObra: number;
  diasAtraso: number;
  estaVencido: boolean;
} {
  if (eq.en_arriendo !== 1) {
    return { diasEnObra: 0, diasAtraso: 0, estaVencido: false };
  }
  const hoyStr = hoySantiagoISO();
  const hoyMs = new Date(`${hoyStr}T00:00:00`).getTime();

  let diasEnObra = 1;
  if (eq.fecha_salida) {
    const salidaFecha = eq.fecha_salida.trim().slice(0, 10);
    const salidaMs = new Date(`${salidaFecha}T00:00:00`).getTime();
    if (!Number.isNaN(salidaMs)) {
      diasEnObra = Math.max(1, Math.floor((hoyMs - salidaMs) / 86400000) + 1);
    }
  }

  let diasAtraso = 0;
  let estaVencido = false;
  if (eq.fecha_retorno_estimada) {
    const estFecha = eq.fecha_retorno_estimada.trim().slice(0, 10);
    const estMs = new Date(`${estFecha}T00:00:00`).getTime();
    if (!Number.isNaN(estMs) && hoyMs > estMs) {
      diasAtraso = Math.floor((hoyMs - estMs) / 86400000);
      estaVencido = diasAtraso > 0;
    }
  }

  return { diasEnObra, diasAtraso, estaVencido };
}

export function extraerEvidenciasTexto(texto?: string | null): string[] {
  if (!texto) return [];
  const matches = texto.match(/\/evidencias\/[^\s\]]+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

export const PANAS_POR_CATEGORIA: Record<string, string[]> = {
  "Cortadora Orbital": [
    "Desgaste o rotura de carbones del motor eléctrico",
    "Falta de engrase / trabamiento en cabezal giratorio o husillo",
    "Juego excesivo o deformación en mordazas de sujeción",
    "Cable blindado cortado o enchufe industrial (Legrand/Mennekes) dañado",
    "Portadisco rodado o seguro de traba roto",
    "Recalentamiento de motor / inducido con olor a quemado",
  ],
  "Placa Compactadora": [
    "Correa centrífuga (embrague) cortada, quemada o destensada",
    "Fuga o bajo nivel de aceite en unidad vibradora (excitador)",
    "Silentblocks (gomas amortiguadoras) cortados o fatigados",
    "Carburador sucio / motor se ahoga o no mantiene ralentí",
    "Piola de aceleración o cuerda de partida retráctil cortada",
    "Fisura en base compactadora o pernos de soporte sueltos",
  ],
  "Unidad Motriz": [
    "Fuga o rotura en acoples rápidos hidráulicos (QDC)",
    "Pérdida de presión hidráulica al tomar temperatura de trabajo",
    "Manguera de alta presión reventada o con malla de acero expuesta",
    "Bajo nivel o contaminación de aceite de motor / hidráulico (agua en aceite)",
    "No enciende en frío (bujía empastada, bobina o filtro saturado)",
    "Válvula de alivio o retorno hidráulico obstruido",
  ],
  "Maquinaria con Horómetro": [
    "Fuga de aceite hidráulico en cilindros, sellos o banco de válvulas",
    "Falla eléctrica de arranque (batería descargada, alternador o motor de partida)",
    "Pérdida de potencia del motor diésel (filtros saturados o inyectores)",
    "Sobrecalentamiento de motor (radiador obstruido, termostato o bomba de agua)",
    "Desgaste / juego excesivo en pasadores, bujes o corona de giro",
    "Oruga destensada / cortada o neumático dañado",
  ],
  "Generador Eléctrico": [
    "Generador enciende pero no entrega voltaje (falla de AVR o carbones)",
    "Disparo constante de automático / disyuntor por sobrecarga o cortocircuito",
    "Fuga de combustible o aire en línea de petróleo (no parte)",
    "Falla en panel digital / horómetro o sensor de presión de aceite",
    "Batería sin carga o bornes sulfatados",
    "Ruido anormal en rodamiento de alternador",
  ],
  "Martillo Demoledor": [
    "Desgaste de carbones o falla en interruptor de gatillo",
    "Pérdida de percusión (desgaste de o-rings de pistón o falta de grasa especial)",
    "Portaherramienta / retenedor de punta o cincel quebrado",
    "Cable de alimentación cortado en prensaestopa",
    "Fuga de grasa por sellos del cabezal",
  ],
  "Motobomba / Bomba Sumergible": [
    "No levanta presión / no succiona (sello mecánico o rodete desgastado)",
    "Entrada de agua al estator eléctrico (falla de aislación / salta diferencial)",
    "Carcasa o difusor obstruido por lodo/piedras de faena",
    "Cuerda de partida o carburador con agua en cuba (motobomba combustión)",
    "Acoples Storz quebrados o sin goma de sello",
  ],
};

export const DANOS_FISICOS: string[] = [
  "Golpe, abolladura o fisura en chasis / carcasa",
  "Pieza, accesorio o herramienta faltante",
  "Componente quebrado por mal uso u operación indebida",
  "Cable, manguera o enchufe cortado / aplastado",
  "Daño por agua, barro o contaminación en faena",
  "Equipo intervenido o reparado por terceros",
];

export const PAUTAS_MECANICAS: Record<string, string[]> = {
  "Cortadora Orbital": [
    "Revisión y limpieza de carbones del motor eléctrico",
    "Inspección de holgura en cabezal giratorio y mordazas de sujeción",
    "Verificación de estado de portadisco y seguro de traba",
    "Revisión de cableado blindado y enchufe industrial (Legrand/Mennekes)",
    "Engrase general de husillo y puntos móviles",
  ],
  "Placa Compactadora": [
    "Revisión de tensión y desgaste de correa centrífuga (embrague)",
    "Verificación de nivel de aceite en unidad vibradora (excitador)",
    "Inspección de silentblocks (gomas amortiguadoras) y chasis",
    "Limpieza de carburador y filtro de combustible",
    "Ajuste de piola de aceleración y parada de emergencia",
  ],
  "Unidad Motriz": [
    "Cambio de aceite de motor (15W-40) y revisión de fugas",
    "Verificación de nivel y estado de aceite hidráulico / retorno",
    "Limpieza o reemplazo de filtro de aire y revisión de bujía",
    "Inspección de acoples rápidos hidráulicos (QDC) y mangueras de alta presión",
    "Prueba de presión de trabajo y encendido en frío",
  ],
  "Maquinaria con Horómetro": [
    "Cambio de aceite de motor y filtro primario/secundario",
    "Revisión de sistema hidráulico, cilindros y sellos",
    "Inspección de filtros de aire (primario y seguridad) y separador de agua",
    "Engrase de pasadores, bujes y corona de giro",
    "Verificación de sistema eléctrico, alternador y batería",
  ],
  "Generador Eléctrico": [
    "Cambio de aceite de motor, filtro de aceite y filtro de combustible",
    "Medición de voltaje en vacío y con carga (verificación de AVR y frecuencia 50Hz)",
    "Revisión de nivel de refrigerante y tensión de correa de ventilador",
    "Inspección de batería, cargador de mantención y paradas de emergencia",
    "Limpieza de gabinete insonorizado y drenaje de decantador de agua",
  ],
  "Martillo Demoledor": [
    "Revisión de medida de carbones y limpieza de colector del inducido",
    "Reemplazo de grasa especial de percusión y revisión de sellos",
    "Inspección de portaherramienta, pasador de retención y buje guía",
    "Chequeo de continuidad y aislación de cable de poder e interruptor",
    "Apriete general de pernos de carcasa con torque y prueba de golpe",
  ],
  "Motobomba / Bomba Sumergible": [
    "Inspección de rodete (impulsor), voluta y holgura de desgaste",
    "Verificación de sello mecánico y nivel de aceite de cámara de sello",
    "Medición de aislación de bobinado (Megger) y estado de cable sumergible",
    "Revisión de acoples rápidos Storz, empaquetaduras y canastillo de succión",
    "Prueba hidráulica de caudal y presión en banco de prueba",
  ],
};

export function calcularSemaforo(eq: {
  falla_activa: number;
  estado_operativo: string;
  uso_acumulado: number;
  limite_mantencion: number;
}): string {
  const condPreAlerta = eq.estado_operativo === ESTADO_PRE_ALERTA;
  const condPana =
    !condPreAlerta &&
    (eq.falla_activa === 1 || eq.estado_operativo === ESTADO_EN_PANA);
  const condPres = eq.estado_operativo === ESTADO_EN_PRESUPUESTO;
  const condMant = eq.uso_acumulado >= Math.max(1, eq.limite_mantencion);

  let sem = "OPERATIVA (LISTA)";
  if (condMant) sem = "PIDE MANTENCIÓN";
  if (condPreAlerta) sem = "PRE-ALERTA EMERGENCIA (MANTENCIÓN)";
  if (condPana) sem = "EN PANA (TALLER)";
  if (condPres) sem = "ESPERANDO PRESUPUESTO";
  return sem;
}

export function getSemaforoKey(semaforo?: string): SemaforoKey {
  const s = (semaforo || "").toUpperCase();
  if (s.includes("PRESUPUESTO") || s.includes("🟣")) return "PRESUPUESTO";
  if (s.includes("PRE-ALERTA") || s.includes("PRE_ALERTA")) return "MANTENCION";
  if (s.includes("PANA") || s.includes("🔴")) return "PANA";
  if (s.includes("MANTENCI") || s.includes("🟡")) return "MANTENCION";
  return "OPERATIVA";
}

export function cleanSemaforoLabel(semaforo?: string): string {
  const s = (semaforo || "").toUpperCase();
  if (s.includes("PRE-ALERTA") || s.includes("PRE_ALERTA")) {
    return "PRE-ALERTA EMERGENCIA (2DA FIRMA)";
  }
  const key = getSemaforoKey(semaforo);
  switch (key) {
    case "PRESUPUESTO":
      return "ESPERANDO PRESUPUESTO";
    case "PANA":
      return "EN PANA (TALLER)";
    case "MANTENCION":
      return "PIDE MANTENCIÓN";
    default:
      return "OPERATIVA (LISTA)";
  }
}

export function formatCLP(amount: number): string {
  const rounded = Math.round(Number(amount) || 0);
  return "$" + rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function duracionLegible(desdeStr?: string | null, hastaStr?: string | null): string {
  if (!desdeStr) return "—";
  try {
    const parseDate = (s: string) => {
      const [dPart, tPart] = s.trim().split(" ");
      return new Date(`${dPart}T${tPart || "00:00"}:00`);
    };
    const desde = parseDate(desdeStr);
    const hasta = hastaStr ? parseDate(hastaStr) : new Date();
    if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) return "—";
    const horas = Math.max((hasta.getTime() - desde.getTime()) / 3600000, 0);
    if (horas < 48) {
      return `${Math.round(horas)} h`;
    }
    return `${(horas / 24).toFixed(1)} días`;
  } catch {
    return "—";
  }
}
