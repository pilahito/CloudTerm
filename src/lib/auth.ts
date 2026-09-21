// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Puente con el inicio de sesión y la copia de seguridad del backend.
 *
 * Los tokens viven en el llavero del sistema: aquí solo se manejan los datos
 * públicos de la cuenta y los identificadores de cliente, que no son secretos.
 * El inicio de sesión abre el navegador (PKCE + 127.0.0.1). No hay código de dispositivo.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type AuthProvider = "google" | "github";

export interface AuthConfig {
  googleClientId: string;
  githubClientId: string;
  githubClientSecret?: string;
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
  hasGithubSecret?: boolean;
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

export function onAuthChanged(handler: (account: Account) => void): Promise<UnlistenFn> {
  return listen<Account>("auth://changed", (event) => handler(event.payload));
}

export function onHostsChanged(handler: () => void): Promise<UnlistenFn> {
  return listen("hosts://changed", () => handler());
}
