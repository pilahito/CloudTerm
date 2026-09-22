/**
 * Detección de hardware del dispositivo y elección de modelo local (llama.cpp).
 *
 * En el webview de Android se puede leer:
 *   - `navigator.deviceMemory`      RAM aproximada en GB (Chromium/Android)
 *   - `navigator.hardwareConcurrency` núcleos
 *   - `navigator.storage.estimate()`  espacio libre real
 * Con eso se elige el modelo más grande que el móvil puede mover con holgura:
 * la regla práctica es que el GGUF + contexto quepa en ~60% de la RAM.
 */

export interface HardwareInfo {
  ramGb: number;
  nucleos: number;
  libreGb: number;
  arquitectura: string;
}

export interface ModeloSugerido {
  id: string;
  nombre: string;
  parametros: string;
  cuantizacion: string;
  tamanoGb: number;
  url: string;
  /** Contexto recomendado para no quedarse sin RAM */
  contexto: number;
  motivo: string;
}

// Modelos pequeños, buenos en código y con GGUF listo para llama.cpp
const CATALOGO: Array<Omit<ModeloSugerido, "contexto" | "motivo"> & { minRamGb: number }> = [
  {
    id: "qwen2.5-coder-0.5b",
    nombre: "Qwen2.5-Coder 0.5B",
    parametros: "0.5B",
    cuantizacion: "Q4_K_M",
    tamanoGb: 0.4,
    minRamGb: 2,
    url: "https://huggingface.co/Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf",
  },
  {
    id: "qwen2.5-coder-1.5b",
    nombre: "Qwen2.5-Coder 1.5B",
    parametros: "1.5B",
    cuantizacion: "Q4_K_M",
    tamanoGb: 1.0,
    minRamGb: 3,
    url: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
  },
  {
    id: "qwen2.5-coder-3b",
    nombre: "Qwen2.5-Coder 3B",
    parametros: "3B",
    cuantizacion: "Q4_K_M",
    tamanoGb: 1.9,
    minRamGb: 6,
    url: "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf",
  },
  {
    id: "llama-3.2-3b",
    nombre: "Llama 3.2 3B",
    parametros: "3B",
    cuantizacion: "Q4_K_M",
    tamanoGb: 2.0,
    minRamGb: 6,
    url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  },
  {
    id: "qwen2.5-coder-7b",
    nombre: "Qwen2.5-Coder 7B",
    parametros: "7B",
    cuantizacion: "Q4_K_M",
    tamanoGb: 4.4,
    minRamGb: 12,
    url: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf",
  },
];

export async function detectarHardware(): Promise<HardwareInfo> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  let libreGb = 0;
  try {
    const estimacion = await navigator.storage?.estimate?.();
    if (estimacion?.quota) {
      libreGb = (estimacion.quota - (estimacion.usage ?? 0)) / 1024 ** 3;
    }
  } catch {
    libreGb = 0;
  }
  return {
    // deviceMemory viene redondeado a potencias de 2 (4, 8…); si no existe, 4 GB
    ramGb: nav.deviceMemory ?? 4,
    nucleos: nav.hardwareConcurrency ?? 4,
    libreGb: Math.max(0, Number(libreGb.toFixed(1))),
    arquitectura: /arm64|aarch64/i.test(navigator.userAgent) ? "arm64" : "otra",
  };
}

/** Modelo más grande que el dispositivo puede mover, y por qué. */
export function recomendarModelo(hardware: HardwareInfo): ModeloSugerido {
  const presupuesto = hardware.ramGb * 0.6; // RAM usable para el modelo
  const posibles = CATALOGO.filter(
    (modelo) => modelo.tamanoGb <= presupuesto && (!hardware.libreGb || modelo.tamanoGb < hardware.libreGb),
  );
  const elegido = posibles.length ? posibles[posibles.length - 1] : CATALOGO[0];
  const contexto = hardware.ramGb >= 12 ? 8192 : hardware.ramGb >= 6 ? 4096 : 2048;
  const motivo = posibles.length
    ? `Con ${hardware.ramGb} GB de RAM (${hardware.nucleos} núcleos) puedes mover hasta ~${presupuesto.toFixed(1)} GB`
    : `Solo ${hardware.ramGb} GB de RAM: se elige el modelo más pequeño`;
  return structuredClone({ ...elegido, contexto, motivo }) as ModeloSugerido;
}

/** Todos los que caben, del más grande al más pequeño (para poder elegir a mano). */
export function modelosCompatibles(hardware: HardwareInfo): ModeloSugerido[] {
  const presupuesto = hardware.ramGb * 0.6;
  return CATALOGO.filter((modelo) => modelo.tamanoGb <= presupuesto)
    .map((modelo) => ({
      ...modelo,
      contexto: hardware.ramGb >= 12 ? 8192 : hardware.ramGb >= 6 ? 4096 : 2048,
      motivo: `cabe en ${hardware.ramGb} GB de RAM`,
    }))
    .reverse();
}

/** Argumentos con los que lanzar llama-server para ese modelo y contexto. */
export function comandoLlamaServer(modelo: ModeloSugerido, rutaModelo: string): string {
  return [
    "llama-server",
    `-m ${rutaModelo}`,
    "--host 127.0.0.1",
    "--port 8080",
    `-c ${modelo.contexto}`,
    "-t 4", // hilos; se puede subir a los núcleos grandes del dispositivo
    "--n-gpu-layers 0", // en móvil, CPU primero: la GPU por OpenCL/Vulkan aún da problemas
  ].join(" ");
}

export function catalogoCompleto(): Array<(typeof CATALOGO)[number]> {
  return CATALOGO;
}
