/**
 * Puente con la apertura de archivos en un editor externo.
 *
 * Para un archivo local basta con lanzar el editor. Para uno remoto el backend
 * lo descarga, lo abre y lo vigila: cada vez que se guarda, lo vuelve a subir.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Clave donde se recuerda el editor elegido. */
const PREFERIDO_KEY = "cloudterm-editor";

export interface Editor {
  id: string;
  label: string;
  program: string;
}

/** Una edición abierta sobre un archivo remoto. */
export interface RemoteEdit {
  id: string;
  sessionId: string;
  remotePath: string;
  localPath: string;
  program: string;
  uploadedAt: number | null;
  error: string | null;
}

/** Aviso de que un archivo se ha vuelto a subir. */
export interface EditUpload {
  id: string;
  remotePath: string;
  ok: boolean;
  detail: string;
}

/** Editores gráficos instalados en este equipo. */
export function listEditors(): Promise<Editor[]> {
  return invoke<Editor[]>("editores_disponibles");
}

/** Abre una ruta local. Sin `program`, con la aplicación predeterminada. */
export function openWith(path: string, program?: string): Promise<void> {
  return invoke("abrir_con", { ruta: path, program: program ?? null });
}

/**
 * Descarga un archivo remoto, lo abre con el editor y lo deja vigilado.
 *
 * A partir de aquí, cada guardado se sube solo.
 */
export function editRemote(
  sessionId: string,
  remotePath: string,
  program: string,
): Promise<RemoteEdit> {
  return invoke<RemoteEdit>("editar_remoto", { sessionId, remotePath, program });
}

export function listEdits(): Promise<RemoteEdit[]> {
  return invoke<RemoteEdit[]>("editar_listar");
}

/** Sube los cambios sin esperar a que el archivo cambie. */
export function pushEdit(id: string): Promise<RemoteEdit> {
  return invoke<RemoteEdit>("editar_subir", { id });
}

/** Deja de vigilar y borra la copia temporal. */
export function finishEdit(id: string, upload: boolean): Promise<void> {
  return invoke("editar_terminar", { id, subirCambios: upload });
}

export function closeAllEdits(): Promise<void> {
  return invoke("editar_cerrar_todas");
}

/** Carpeta temporal donde se dejan las copias de trabajo. */
export function editorFolder(): Promise<string> {
  return invoke<string>("editar_carpeta");
}

/** Avisa cada vez que una edición se sube (o falla al subir). */
export function onEditUploaded(handler: (upload: EditUpload) => void): Promise<UnlistenFn> {
  return listen<EditUpload>("edit://subido", (event) => handler(event.payload));
}

/** Editor recordado, si el usuario marcó «no volver a preguntar». */
export function preferredEditor(): string | null {
  try {
    return localStorage.getItem(PREFERIDO_KEY);
  } catch {
    return null;
  }
}

/** Recuerda el editor elegido. */
export function rememberEditor(program: string): void {
  try {
    localStorage.setItem(PREFERIDO_KEY, program);
  } catch {
    /* sin almacenamiento, se pregunta cada vez */
  }
}

/** Olvida el editor recordado. */
export function forgetEditor(): void {
  try {
    localStorage.removeItem(PREFERIDO_KEY);
  } catch {
    /* nada que borrar */
  }
}
