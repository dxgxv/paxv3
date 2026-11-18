export interface OperadorPerfil {
  nombre: string;
  rut: string;
  rol: "Patio / Despacho" | "Mecánico Taller" | "Operador en Obra" | "Jefatura";
}

const STORAGE_KEY = "rv_operador_perfil";

const DEFAULT_PERFIL: OperadorPerfil = {
  nombre: "",
  rut: "",
  rol: "Patio / Despacho",
};

export function loadOperadorPerfil(): OperadorPerfil {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PERFIL;
    const parsed = JSON.parse(raw);
    return {
      nombre: typeof parsed.nombre === "string" ? parsed.nombre : "",
      rut: typeof parsed.rut === "string" ? parsed.rut : "",
      rol: parsed.rol || "Patio / Despacho",
    };
  } catch {
    return DEFAULT_PERFIL;
  }
}

export function saveOperadorPerfil(perfil: OperadorPerfil): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(perfil));
    window.dispatchEvent(new CustomEvent("rv-perfil-changed", { detail: perfil }));
  } catch {
    // ignore storage errors
  }
}
