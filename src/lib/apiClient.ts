import {
  enqueueOutbox,
  listOutbox,
  removeOutboxItem,
  updateOutboxError,
} from "./offlineStore";

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T & { ok?: boolean; error?: string; message?: string };
  queuedOffline?: boolean;
}

function generateTxId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function apiRequest<T = Record<string, unknown>>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = { ok: res.ok, error: res.ok ? undefined : `Error HTTP ${res.status}` };
  }

  return {
    ok: res.ok && data?.ok !== false,
    status: res.status,
    data,
  };
}

export async function submitFieldMutation<T = Record<string, unknown>>(
  url: string,
  body: Record<string, unknown>,
  label: string
): Promise<ApiResult<T>> {
  const clientTxId =
    typeof body.client_tx_id === "string" && body.client_tx_id
      ? body.client_tx_id
      : generateTxId();
  const payload = { ...body, client_tx_id: clientTxId };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueueOutbox({
      id: clientTxId,
      url,
      method: "POST",
      body: payload,
      label,
    });
    return {
      ok: true,
      status: 202,
      queuedOffline: true,
      data: {
        ok: true,
        message: `Sin señal: "${label}" guardado en cola local del dispositivo y se enviará al recuperar conexión.`,
      } as T & { ok: boolean; message: string },
    };
  }

  try {
    return await apiRequest<T>(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch {
    // Falla de red real (túnel, caída temporal): encolar automáticamente
    await enqueueOutbox({
      id: clientTxId,
      url,
      method: "POST",
      body: payload,
      label,
    });
    return {
      ok: true,
      status: 202,
      queuedOffline: true,
      data: {
        ok: true,
        message: `Conexión inestable: "${label}" encolado en el dispositivo para sincronización automática.`,
      } as T & { ok: boolean; message: string },
    };
  }
}

export async function flushOfflineOutbox(): Promise<{
  synced: number;
  failed: number;
  errors: string[];
}> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, failed: 0, errors: [] };
  }
  const items = await listOutbox();
  if (items.length === 0) {
    return { synced: 0, failed: 0, errors: [] };
  }

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const res = await apiRequest(item.url, {
        method: item.method,
        body: JSON.stringify(item.body),
      });
      if (res.ok) {
        await removeOutboxItem(item.id);
        synced += 1;
      } else if (res.status >= 400 && res.status < 500) {
        // Error lógico definitivo (ej. conflicto o RUT inválido): descartar para no bloquear la cola o registrar error
        const msg = res.data?.error || `Error ${res.status} en ${item.label}`;
        errors.push(`${item.label}: ${msg}`);
        await removeOutboxItem(item.id);
        failed += 1;
      } else {
        const msg = res.data?.error || `Error servidor (${res.status})`;
        await updateOutboxError(item.id, msg);
        failed += 1;
        errors.push(`${item.label}: ${msg}`);
        break;
      }
    } catch {
      // Sin red nuevamente -> detener ciclo FIFO sin perder orden
      break;
    }
  }

  return { synced, failed, errors };
}

export async function compressImageBase64(
  file: File,
  maxWidth = 1280,
  quality = 0.78
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Lectura de imagen inválida"));
    reader.onerror = () => reject(new Error("No se pudo leer la fotografía"));
    reader.readAsDataURL(file);
  });

  if (typeof document === "undefined") return dataUrl;

  return await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
