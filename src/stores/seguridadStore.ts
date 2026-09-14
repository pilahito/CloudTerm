// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Estado del bloqueo de la aplicación.
 *
 * El desbloqueo vive solo en memoria: al cerrar CloudTerm hay que volver a
 * entrar. Guardarlo en disco haría que el bloqueo no sirviera de nada, porque
 * quien tuviera el equipo tendría también la sesión abierta.
 */

import { create } from "zustand";
import {
  altaConfirmar,
  altaEmpezar,
  desbloquear,
  estadoSeguridad,
  pideSegundoFactor,
  quitarSeguridad,
  type Alta,
  type EstadoSeguridad,
  type Metodo,
  type Resultado,
} from "../lib/seguridad";

const SIN_CONFIGURAR: EstadoSeguridad = {
  configurado: false,
  metodo: null,
  usuario: null,
  segundoFactor: false,
  recuperacionRestante: 0,
};

interface SeguridadState {
  estado: EstadoSeguridad;
  cargado: boolean;
  /** Desbloqueado en esta ejecución. Nunca se persiste. */
  desbloqueado: boolean;
  /** Alta en curso, si la hay. */
  alta: Alta | null;
  /** Códigos de recuperación recién entregados; se enseñan una sola vez. */
  recuperacion: string[] | null;
  cargando: boolean;
  error: string | null;

  cargar: () => Promise<void>;
  empezarAlta: (metodo: Metodo, usuario: string, contrasena?: string) => Promise<boolean>;
  confirmarAlta: (codigo: string) => Promise<boolean>;
  cancelarAlta: () => void;
  verificar: (codigo: string, usuario?: string, contrasena?: string) => Promise<Resultado>;
  quitar: (codigo: string, usuario?: string, contrasena?: string) => Promise<Resultado>;
  /** ¿Hace falta el segundo factor ahora mismo? */
  requiereSegundoFactor: () => Promise<boolean>;
  olvidarRecuperacion: () => void;
}

function mensajeDe(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

export const useSeguridadStore = create<SeguridadState>((set) => ({
  estado: SIN_CONFIGURAR,
  cargado: false,
  desbloqueado: false,
  alta: null,
  recuperacion: null,
  cargando: false,
  error: null,

  cargar: async () => {
    try {
      const estado = await estadoSeguridad();
      set({
        estado,
        cargado: true,
        // Sin bloqueo configurado no hay nada que desbloquear.
        desbloqueado: !estado.configurado,
      });
    } catch {
      // Fuera de Tauri no hay `invoke`: se deja pasar, que es lo que se espera
      // en el servidor de desarrollo.
      set({ cargado: true, desbloqueado: true });
    }
  },

  empezarAlta: async (metodo, usuario, contrasena) => {
    set({ cargando: true, error: null });
    try {
      const alta = await altaEmpezar(metodo, usuario, contrasena);
      set({ alta, cargando: false });
      return true;
    } catch (error) {
      set({ cargando: false, error: mensajeDe(error) });
      return false;
    }
  },

  confirmarAlta: async (codigo) => {
    set({ cargando: true, error: null });
    try {
      const recuperacion = await altaConfirmar(codigo);
      const estado = await estadoSeguridad();
      set({
        recuperacion,
        alta: null,
        estado,
        desbloqueado: true,
        cargando: false,
      });
      return true;
    } catch (error) {
      set({ cargando: false, error: mensajeDe(error) });
      return false;
    }
  },

  cancelarAlta: () => set({ alta: null, error: null }),

  verificar: async (codigo, usuario, contrasena) => {
    try {
      const resultado = await desbloquear(codigo, usuario, contrasena);
      if (resultado.ok) {
        set({ desbloqueado: true, error: null });
        const estado = await estadoSeguridad();
        set({ estado });
      } else {
        set({ error: resultado.motivo });
      }
      return resultado;
    } catch (error) {
      const motivo = mensajeDe(error);
      set({ error: motivo });
      return { ok: false, recuperacion: false, restantes: 0, motivo };
    }
  },

  quitar: async (codigo, usuario, contrasena) => {
    try {
      const resultado = await quitarSeguridad(codigo, usuario, contrasena);
      if (resultado.ok) {
        set({
          estado: SIN_CONFIGURAR,
          desbloqueado: true,
          recuperacion: null,
          error: null,
        });
      } else {
        set({ error: resultado.motivo });
      }
      return resultado;
    } catch (error) {
      const motivo = mensajeDe(error);
      set({ error: motivo });
      return { ok: false, recuperacion: false, restantes: 0, motivo };
    }
  },

  requiereSegundoFactor: async () => {
    try {
      return await pideSegundoFactor();
    } catch {
      return false;
    }
  },

  olvidarRecuperacion: () => set({ recuperacion: null }),
}));

/** ¿Hay que enseñar la pantalla de bloqueo? */
export function useBloqueado(): boolean {
  const cargado = useSeguridadStore((s) => s.cargado);
  const configurado = useSeguridadStore((s) => s.estado.configurado);
  const desbloqueado = useSeguridadStore((s) => s.desbloqueado);
  return cargado && configurado && !desbloqueado;
}
