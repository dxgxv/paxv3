# Rental Valdivia V12 — Control de Taller, Flota & Telemetría NFC

Sistema industrial integral para la gestión operativa de maquinaria de arriendo, control de despachos/retornos con alertas de vencimiento, mantenciones preventivas y correctivas, vinculación mediante chips **NFC / Códigos QR**, órdenes de trabajo (OT), bodega de repuestos, protocolo de emergencia de doble firma y aprobación ejecutiva de presupuestos.

---

## Arquitectura Actual del Repositorio

Aplicación **Full-Stack TypeScript** (React 19 + Vite + Express + SQLite WAL + PWA Offline):

### Frontend Modular (`/src`)
- **`/src/App.tsx`**: Consola principal, sincronización de sesión Jefatura (`authenticated_jefe`), lectura con fallback en caché IndexedDB y auto-reenvío de cola offline (`useOfflineSync`).
- **`/src/components/EstacionTrabajo.tsx`** + **`/src/components/estacion/*`**: Ficha técnica por equipo, recepción/despacho con fecha de retorno estimada, guía y validación RUT Módulo 11, bloqueo automático de doble arriendo, banco mecánico (OTs, reversión de repuestos, pautas preventivas, diagnóstico asistido), solicitud de presupuestos y bitácora completa.
- **`/src/components/PanelJefatura.tsx`** + **`/src/components/jefatura/*`**: Módulo protegido por sesión HMAC-SHA256 (`HttpOnly; SameSite=Lax`) con 5 sub-pestañas: 2da Autorización de Emergencias, Bandeja de Presupuestos, Auditoría de OTs, Bodega & Stock, y Arriendos/Analítica/Respaldos protegidos.
- **`/src/components/SemaforoPatio.tsx`**: Monitor LED de disponibilidad, filtro rápido de unidades `En Obra` y `Atrasos`, y acciones rápidas de patio.
- **`/src/components/ModuloEmergencia.tsx`**: Botón de emergencia en terreno con 1ra firma (RUT Módulo 11, fotografía comprimida o verificación técnica) y soporte de envío offline en cola local.
- **`/src/components/EnrolarMaquina.tsx`**: Alta técnica de maquinaria nueva, enlaces profundos `/?id=CODIGO` y generación de QR.
- **`/src/lib/offlineStore.ts`** & **`/src/lib/apiClient.ts`**: Persistencia local IndexedDB (`cache` + `outbox`), idempotencia mediante `client_tx_id`, y compresión cliente de imágenes.

### Backend Modular (`/server` + `/server.ts`)
- **`/server.ts`**: Entrypoint Express en puerto 3000 montando las rutas `/api/*`, evidencias estáticas y middleware Vite/SPA.
- **`/server/security.ts`**: Firma HMAC-SHA256 de cookies de Jefatura (`rv_jefe_session`), middleware `createRequireJefe`, y guardado seguro de evidencias con verificación de magic bytes (`JPEG`/`PNG`/`WebP`) y límite de 5 MB.
- **`/server/db.ts`**: SQLite en modo WAL (`rental_valdivia.sqlite`) con tablas relacionales (`equipos`, `arriendos`, `presupuestos`, `ordenes_trabajo`, `repuestos`, `ot_repuestos`, `emergencias`, `historial`, `idempotency_keys`), transacciones incrementales por entidad y respaldo JSON diferido/asíncrono (`rental_valdivia_db.json`).
- **`/server/routes/*`**: Routers separados por dominio (`fleet.ts`, `emergencies.ts`, `workshop.ts`, `management.ts`).

---

## Instalación y Ejecución Local

### 1. Requisitos previos
- **Node.js** v18 o superior.

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Copia `.env.example` a `.env` y personaliza tus credenciales:
```bash
cp .env.example .env
```
- `PASSWORD_JEFE`: Clave para el Panel de Jefatura (cámbiala en `.env` antes de salir a producción).
- `SESSION_SECRET`: Secreto opcional para firmar cookies de sesión HMAC-SHA256 (si se omite, se genera y persiste automáticamente en SQLite).
- `TELEFONO_TALLER`: Número de WhatsApp receptor de alertas de terreno (ej. `56912345678`).
- `GEMINI_API_KEY`: Clave opcional de Google Gemini para diagnóstico mecánico asistido.

### 4. Iniciar servidor y compilar producción
```bash
npm run dev
npm run build
```
La aplicación estará disponible en `http://localhost:3000`.

---

## Grabación de Chips NFC en Maquinaria

1. Abre el módulo **Enrolar Máquina (NFC)** o selecciona cualquier equipo en la **Estación de Trabajo**.
2. Copia la URL del equipo (formato: `https://tu-dominio.com/?id=RV-0001`).
3. En tu teléfono móvil, abre **NFC Tools** &rarr; **Escribir** &rarr; **Añadir un registro** &rarr; **URL / URI** y graba el enlace en el tag del chasis.
