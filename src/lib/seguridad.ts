// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Puente con el bloqueo de la aplicación y el segundo factor.
 *
 * Hay dos formas de identificarse —cuenta local o un proveedor— pero el segundo
 * factor es obligatorio en las dos: un código de seis dígitos de tu aplicación
 * de autenticación.
 */

import { invoke } from "@tauri-apps/api/core";

/** Cómo se identifica el usuario. */
export type Metodo = "local" | "google" | "github";

export interface EstadoSeguridad {
  configurado: boolean;
  metodo: Metodo | null;
  usuario: string | null;
  /** Siempre `true` si hay bloqueo: no es opcional. */
  segundoFactor: boolean;
  recuperacionRestante: number;
}

/** Datos del alta, antes de confirmarla. */
export interface Alta {
  secreto: string;
  uri: string;
  /** Código QR en SVG, listo para insertar. */
  qr: string;
}

export interface Resultado {
  ok: boolean;
  /** Se usó un código de recuperación en vez del de la aplicación. */
  recuperacion: boolean;
  restantes: number;
  motivo: string | null;
}

export function estadoSeguridad(): Promise<EstadoSeguridad> {
  return invoke<EstadoSeguridad>("auth_seguridad_estado");
}

/** Empieza el alta: genera el secreto y devuelve el QR. */
export function altaEmpezar(
  metodo: Metodo,
  usuario: string,
  contrasena?: string,
): Promise<Alta> {
  return invoke<Alta>("auth_alta_empezar", {
    metodo,
    usuario,
    contrasena: contrasena ?? null,
  });
}

/** Confirma el alta. Devuelve los códigos de recuperación (única vez). */
export function altaConfirmar(codigo: string): Promise<string[]> {
  return invoke<string[]>("auth_alta_confirmar", { codigo });
}

/** Verifica las credenciales para desbloquear. */
export function desbloquear(
  codigo: string,
  usuario?: string,
  contrasena?: string,
): Promise<Resultado> {
  return invoke<Resultado>("auth_desbloquear", {
    usuario: usuario ?? null,
    contrasena: contrasena ?? null,
    codigo,
  });
}

/** Quita el bloqueo, demostrando antes quién eres. */
export function quitarSeguridad(
  codigo: string,
  usuario?: string,
  contrasena?: string,
): Promise<Resultado> {
  return invoke<Resultado>("auth_seguridad_quitar", {
    usuario: usuario ?? null,
    contrasena: contrasena ?? null,
    codigo,
  });
}

/** ¿Hay que pedir el segundo factor tras entrar con un proveedor? */
export function pideSegundoFactor(): Promise<boolean> {
  return invoke<boolean>("auth_pide_segundo_factor");
}
