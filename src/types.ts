/**
 * CloudTerm — shared domain types.
 * These mirror the serde structs in `src-tauri/src/{ssh,sftp,config,db}`.
 */

export type ConnectionProtocol = "ssh" | "sftp" | "ftp" | "ftps";

/** Cómo se autentica CloudTerm contra el servidor. */
export type AuthMethod = "password" | "key";

export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  protocol: ConnectionProtocol;
  group: string;
  /** Método preferido; el modal de credenciales permite cambiarlo al vuelo. */
  authMethod: AuthMethod;
  /** Path to a private key, or "" para autodetectar en ~/.ssh. */
  privateKeyPath: string;
  useAgent: boolean;
  /**
   * Presupuesto del handshake SSH en milisegundos.
   *
   * Holgado a propósito: algunos servidores tardan decenas de segundos en
   * enviar su banner cuando hacen DNS inverso del cliente.
   * Por defecto 60 s.
   */
  timeoutMs: number;
  createdAt: number;
  lastUsedAt: number | null;
}

export type TabKind = "terminal" | "sftp";

export type TabStatus = "idle" | "connecting" | "connected" | "error" | "closed";

export interface Tab {
  id: string;
  title: string;
  kind: TabKind;
  /** null means a local shell. */
  connectionId: string | null;
  status: TabStatus;
  error?: string;
}

export type ThemeName = "neon" | "midnight" | "dracula" | "nord" | "solarized" | "daylight";

export interface Settings {
  theme: ThemeName;
  fontSize: number;
  fontFamily: string;
  cursorBlink: boolean;
  scrollback: number;
  sidebarOpen: boolean;
  aiEnabled: boolean;
  aiModel: string;
  aiEndpoint: string;
  confirmOnClose: boolean;
  /** Reproducir un sonido al desbloquear un easter egg. */
  sounds: boolean;
  copyOnSelect: boolean;
  /**
   * Idioma de la interfaz.
   *
   * Se guarda como texto y no como unión de literales para que añadir un idioma
   * nuevo sea dejar un fichero en `src/i18n/locales` y nada más.
   */
  language: string;
}

export type ToastKind = "info" | "success" | "warning" | "error" | "unlock";

export interface ToastMessage {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
}

export interface SftpEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number | null;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}
