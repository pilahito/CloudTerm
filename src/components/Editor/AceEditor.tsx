import { useEffect, useRef } from "react";
import ace from "ace-builds/src-noconflict/ace";
import type { AceEditorInstance } from "ace-builds/src-noconflict/ace";
import "ace-builds/src-noconflict/mode-kotlin";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-html";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-sh";
import "ace-builds/src-noconflict/theme-tomorrow_night";
import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-noconflict/ext-searchbox";

/**
 * Editor de código del tab Código (Ace, el mismo motor que usa Acode).
 *
 * Uso:
 *   <AceEditor path="src/Main.kt" value={texto} onChange={setTexto} onSave={guardar} />
 *
 * - El modo se deduce por la extensión (`path`).
 * - `Ctrl/Cmd+S` llama a `onSave` (para subirlo por SFTP).
 */
export interface AceEditorProps {
  path: string;
  value: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
  readOnly?: boolean;
}

const MODOS: Array<[RegExp, string]> = [
  [/\.(kt|kts)$/i, "ace/mode/kotlin"],
  [/\.(js|jsx|mjs|cjs|ts|tsx)$/i, "ace/mode/javascript"],
  [/\.py$/i, "ace/mode/python"],
  [/\.(html|htm|vue|svelte)$/i, "ace/mode/html"],
  [/\.(json|jsonc)$/i, "ace/mode/json"],
  [/\.(sh|bash|zsh)$/i, "ace/mode/sh"],
];

function modoPara(path: string): string {
  const encontrado = MODOS.find(([patron]) => patron.test(path));
  return encontrado ? encontrado[1] : "ace/mode/text";
}

export function AceEditor({ path, value, onChange, onSave, readOnly = false }: AceEditorProps) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const editor = useRef<AceEditorInstance | null>(null);
  const guardar = useRef(onSave);
  guardar.current = onSave;

  // Crear el editor una sola vez
  useEffect(() => {
    if (!contenedor.current) {
      return;
    }
    const instancia = ace.edit(contenedor.current);
    instancia.setTheme("ace/theme/tomorrow_night");
    instancia.setOptions({
      fontSize: "13px",
      showPrintMargin: false,
      wrap: true,
      useWorker: false, // en Android los workers dan problemas
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: false,
    });
    instancia.commands.addCommand({
      name: "guardar",
      bindKey: { win: "Ctrl-S", mac: "Command-S" },
      exec: () => guardar.current?.(instancia.getValue()),
    });
    instancia.on("change", () => onChange?.(instancia.getValue()));
    editor.current = instancia;
    return () => {
      instancia.destroy();
      editor.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modo segun la extension del fichero abierto
  useEffect(() => {
    editor.current?.session.setMode(modoPara(path));
  }, [path]);

  // Contenido y solo-lectura
  useEffect(() => {
    const instancia = editor.current;
    if (!instancia) {
      return;
    }
    if (instancia.getValue() !== value) {
      instancia.setValue(value, -1); // -1: no mueve el cursor
    }
  }, [value]);

  useEffect(() => {
    editor.current?.setReadOnly(readOnly);
  }, [readOnly]);

  return <div ref={contenedor} style={{ flex: 1, minHeight: 0, width: "100%" }} />;
}

export default AceEditor;
