import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Request, Response, NextFunction } from "express";
import type Database from "better-sqlite3";

export const JEFE_COOKIE_NAME = "rv_jefe_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

let cachedSecret: string | null = null;

export function getSessionSecret(sqlite: Database.Database): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (cachedSecret) return cachedSecret;

  try {
    const row = sqlite
      .prepare("SELECT value FROM kv_store WHERE key = 'session_secret'")
      .get() as { value: string } | undefined;
    if (row?.value) {
      cachedSecret = row.value;
      return cachedSecret;
    }
    const generated = crypto.randomBytes(32).toString("hex");
    sqlite
      .prepare("INSERT OR REPLACE INTO kv_store (key, value) VALUES ('session_secret', ?)")
      .run(generated);
    cachedSecret = generated;
    return generated;
  } catch {
    cachedSecret = crypto.randomBytes(32).toString("hex");
    return cachedSecret;
  }
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

export function verifyJefePassword(passwordInput: string): boolean {
  const pwdInput = String(passwordInput || "");
  const expected = process.env.PASSWORD_JEFE || "valdivia2026";
  if (!pwdInput || !expected) return false;
  const bufA = Buffer.from(pwdInput, "utf8");
  const bufB = Buffer.from(expected, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function signJefeToken(sqlite: Database.Database): string {
  const secret = getSessionSecret(sqlite);
  const payload = {
    role: "jefe",
    exp: Date.now() + SESSION_TTL_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifyJefeToken(
  token: string | undefined,
  sqlite: Database.Database
): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;

  const secret = getSessionSecret(sqlite);
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  const sigBuf = Buffer.from(sigB64, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as { role?: string; exp?: number };
    return parsed.role === "jefe" && Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}

export function isJefeAuthenticated(
  req: Request,
  sqlite: Database.Database
): boolean {
  const cookies = parseCookies(req.headers.cookie);
  return verifyJefeToken(cookies[JEFE_COOKIE_NAME], sqlite);
}

export function setJefeSessionCookie(
  req: Request,
  res: Response,
  sqlite: Database.Database
): void {
  const token = signJefeToken(sqlite);
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const isHttps =
    req.secure || req.headers["x-forwarded-proto"] === "https";
  const attrs = [
    `${JEFE_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (isHttps && process.env.NODE_ENV === "production") {
    attrs.push("Secure");
  }
  res.setHeader("Set-Cookie", attrs.join("; "));
}

export function clearJefeSessionCookie(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    `${JEFE_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export function createRequireJefe(sqlite: Database.Database) {
  return function requireJefe(req: Request, res: Response, next: NextFunction) {
    if (isJefeAuthenticated(req, sqlite)) {
      next();
      return;
    }
    res.status(401).json({
      ok: false,
      error:
        "Acceso restringido a Jefatura. Inicia sesión en el Panel de Jefatura para continuar.",
    });
  };
}

function detectImageExtension(buf: Buffer): ".jpg" | ".png" | ".webp" | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return ".jpg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return ".png";
  }
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return ".webp";
  }
  return null;
}

export function saveEvidenceImage(
  fotoBase64: string,
  codigoEquipo: string,
  tag: string,
  evidenciasDir: string
): string {
  const raw = String(fotoBase64 || "").trim();
  const dataUrlMatch = raw.match(
    /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i
  );

  let b64Payload = raw;
  if (raw.startsWith("data:")) {
    if (!dataUrlMatch) {
      throw new Error(
        "Formato de imagen no permitido. Solo se aceptan archivos JPG, PNG o WEBP."
      );
    }
    b64Payload = dataUrlMatch[2];
  }

  const buffer = Buffer.from(b64Payload.replace(/\s+/g, ""), "base64");
  if (buffer.length === 0) {
    throw new Error("Archivo de evidencia vacío o corrupto.");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("La fotografía excede el máximo permitido de 5 MB.");
  }

  const ext = detectImageExtension(buffer);
  if (!ext) {
    throw new Error(
      "Contenido binario inválido. Solo se aceptan imágenes reales JPG, PNG o WEBP."
    );
  }

  const safeCode = codigoEquipo.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 24);
  const safeTag = tag.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 24);
  const stamp = `${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const fileName = `${safeCode}_${safeTag}_${stamp}${ext}`;

  const resolvedDir = path.resolve(evidenciasDir);
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }
  const fullPath = path.resolve(resolvedDir, fileName);
  if (!fullPath.startsWith(resolvedDir + path.sep)) {
    throw new Error("Ruta de evidencia fuera del directorio autorizado.");
  }

  fs.writeFileSync(fullPath, buffer);
  return `/evidencias/${fileName}`;
}
