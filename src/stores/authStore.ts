// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Estado de la sesión y de la copia de seguridad.
 *
 * Guarda solo lo que puede vivir en memoria y en disco sin ser secreto: los
 * identificadores de cliente y los datos públicos de la cuenta. Los tokens se
 * quedan en el llavero, del lado del backend.
 */

import { create } from "zustand";
import {
  authConfigSet,
  authSignIn,
  authSignOut,
  authState,
  authSyncPull,
  authSyncPush,
  type Account,
  type AuthConfig,
  type AuthProvider,
  type RestoreOutcome,
  type SyncOutcome,
} from "../lib/auth";
import { t } from "../i18n";

const EMPTY_CONFIG: AuthConfig = { googleClientId: "", githubClientId: "" };

/**
 * Campos derivados de las credenciales que manda el backend.
 *
 * El backend decide si hay identificador utilizable (el del usuario o el que
 * trae el binario integrado). La interfaz solo refleja esa decisión: así el
 * botón de iniciar sesión y la alerta roja nunca se contradicen.
 */
function readinessOf(state: {
  googleReady?: boolean;
  githubReady?: boolean;
  googleBuiltIn?: boolean;
  githubBuiltIn?: boolean;
}) {
  return {
    googleReady: Boolean(state.googleReady),
    githubReady: Boolean(state.githubReady),
    googleBuiltIn: Boolean(state.googleBuiltIn),
    githubBuiltIn: Boolean(state.githubBuiltIn),
  };
}

interface AuthStoreState {
  config: AuthConfig;
  account: Account | null;
  loaded: boolean;
  hasGithubSecret: boolean;
  /** Si se puede iniciar sesión con cada proveedor. */
  googleReady: boolean;
  githubReady: boolean;
  /** Si ese proveedor funciona gracias al identificador integrado. */
  googleBuiltIn: boolean;
  githubBuiltIn: boolean;
  busy: AuthProvider | null;
  syncing: boolean;
  lastSync: string | null;

  load: () => Promise<void>;
  saveConfig: (config: AuthConfig) => Promise<boolean>;
  signIn: (provider: AuthProvider) => Promise<Account | null>;
  signOut: (provider: AuthProvider) => Promise<void>;
  push: (settings: unknown) => Promise<SyncOutcome | null>;
  pull: () => Promise<RestoreOutcome | null>;
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  config: EMPTY_CONFIG,
  account: null,
  loaded: false,
  hasGithubSecret: false,
  googleReady: false,
  githubReady: false,
  googleBuiltIn: false,
  githubBuiltIn: false,
  busy: null,
  syncing: false,
  lastSync: null,

  load: async () => {
    try {
      const state = await authState();
      set({
        config: state.config,
        account: state.account,
        loaded: true,
        hasGithubSecret: Boolean(state.hasGithubSecret),
        ...readinessOf(state),
      });
    } catch {
      set({ loaded: true });
    }
  },

  saveConfig: async (config) => {
    try {
      const state = await authConfigSet(config);
      set({
        config: state.config,
        account: state.account,
        hasGithubSecret: Boolean(state.hasGithubSecret),
        ...readinessOf(state),
      });
      return true;
    } catch {
      return false;
    }
  },

  signIn: async (provider) => {
    set({ busy: provider, lastSync: null });
    try {
      const account = await authSignIn(provider);
      set({ account, busy: null });
      return account;
    } catch (error) {
      set({ busy: null, lastSync: messageOf(error) });
      return null;
    }
  },

  signOut: async (provider) => {
    try {
      const state = await authSignOut(provider);
      set({ account: state.account, lastSync: null });
    } catch {
      /* si falla, la sesión sigue como estaba */
    }
  },

  push: async (settings) => {
    set({ syncing: true, lastSync: null });
    try {
      const outcome = await authSyncPush(settings);
      set({
        syncing: false,
        lastSync: t("auth.syncPushResult", {
          action: outcome.action,
          hosts: outcome.hosts,
        }),
      });
      return outcome;
    } catch (error) {
      set({ syncing: false, lastSync: messageOf(error) });
      return null;
    }
  },

  pull: async () => {
    set({ syncing: true, lastSync: null });
    try {
      const outcome = await authSyncPull();
      set({
        syncing: false,
        lastSync: t("auth.syncPullResult", { hosts: outcome.hosts }),
      });
      return outcome;
    } catch (error) {
      set({ syncing: false, lastSync: messageOf(error) });
      return null;
    }
  },
}));
