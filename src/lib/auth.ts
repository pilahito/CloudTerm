/**
 * Puente con el inicio de sesión y la copia de seguridad del backend.
 *
 * Los tokens viven en el llavero del sistema: aquí solo se manejan los datos
 * públicos de la cuenta y los identificadores de cliente, que no son secretos.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type AuthProvider = "google" | "github";

export interface AuthConfig {
  googleClientId: string;
  githubClientId: string;
}

export interface Account {
  provider: AuthProvider;
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
}

export interface AuthState {
  config: AuthConfig;
  account: Account | null;
}

/** Lo que hay que enseñarle al usuario para autorizar en GitHub. */
export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface SyncOutcome {
  provider: string;
  action: string;
  hosts: number;
  destination: string;
}

export interface RestoreOutcome {
  hosts: number;
  settings: unknown;
}

/** Nombre legible del proveedor. */
export function providerLabel(provider: AuthProvider): string {
  return provider === "google" ? "Google" : "GitHub";
}

export function authState(): Promise<AuthState> {
  return invoke<AuthState>("auth_state");
}

export function authConfigSet(config: AuthConfig): Promise<AuthState> {
  return invoke<AuthState>("auth_config_set", { config });
}

export function authSignIn(provider: AuthProvider): Promise<Account> {
  return invoke<Account>(
    provider === "google" ? "auth_sign_in_google" : "auth_sign_in_github",
  );
}

export function authSignOut(provider: AuthProvider): Promise<AuthState> {
  return invoke<AuthState>("auth_sign_out", { provider });
}

export function authSyncPush(settings: unknown): Promise<SyncOutcome> {
  return invoke<SyncOutcome>("auth_sync_push", { settings });
}

export function authSyncPull(): Promise<RestoreOutcome> {
  return invoke<RestoreOutcome>("auth_sync_pull");
}

/**
 * Avisa cuando GitHub entrega el código que el usuario debe escribir.
 *
 * Solo lo emite el flujo de GitHub: Google devuelve el control por la
 * redirección al navegador.
 */
export function onDeviceCode(handler: (code: DeviceCode) => void): Promise<UnlistenFn> {
  return listen<DeviceCode>("auth://device-code", (event) => handler(event.payload));
}

/** Avisa cuando la cuenta que tiene la sesión cambia. */
export function onAuthChanged(handler: (account: Account) => void): Promise<UnlistenFn> {
  return listen<Account>("auth://changed", (event) => handler(event.payload));
}

/** Avisa cuando se han reemplazado los hosts (por ejemplo al restaurar). */
export function onHostsChanged(handler: () => void): Promise<UnlistenFn> {
  return listen("hosts://changed", () => handler());
}
