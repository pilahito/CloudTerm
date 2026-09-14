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
  type DeviceCode,
  type RestoreOutcome,
  type SyncOutcome,
} from "../lib/auth";
import { t } from "../i18n";

const EMPTY_CONFIG: AuthConfig = { googleClientId: "", githubClientId: "" };

interface AuthStoreState {
  config: AuthConfig;
  account: Account | null;
  loaded: boolean;
  /** Proveedor cuyo inicio de sesión está en curso, si hay alguno. */
  busy: AuthProvider | null;
  /** Código que el usuario debe escribir en GitHub, mientras dura el flujo. */
  device: DeviceCode | null;
  syncing: boolean;
  /** Mensaje del último resultado, para enseñarlo en la vista. */
  lastSync: string | null;

  load: () => Promise<void>;
  saveConfig: (config: AuthConfig) => Promise<boolean>;
  signIn: (provider: AuthProvider) => Promise<Account | null>;
  signOut: (provider: AuthProvider) => Promise<void>;
  setDevice: (device: DeviceCode | null) => void;
  push: (settings: unknown) => Promise<SyncOutcome | null>;
  pull: () => Promise<RestoreOutcome | null>;
}

/** Texto del error, venga como venga. */
function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  config: EMPTY_CONFIG,
  account: null,
  loaded: false,
  busy: null,
  device: null,
  syncing: false,
  lastSync: null,

  load: async () => {
    try {
      const state = await authState();
      set({ config: state.config, account: state.account, loaded: true });
    } catch {
      // Fuera de Tauri (servidor de desarrollo en el navegador) no hay `invoke`.
      set({ loaded: true });
    }
  },

  saveConfig: async (config) => {
    try {
      const state = await authConfigSet(config);
      set({
        config: state.config,
        // Cambiar de aplicación de cliente invalida la sesión anterior.
        account: state.account,
      });
      return true;
    } catch {
      return false;
    }
  },

  signIn: async (provider) => {
    set({ busy: provider, device: null, lastSync: null });
    try {
      const account = await authSignIn(provider);
      set({ account, busy: null, device: null });
      return account;
    } catch (error) {
      set({ busy: null, device: null, lastSync: messageOf(error) });
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

  setDevice: (device) => set({ device }),

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
