// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Tipos de `ace-builds` que usa el editor de la pestaña Código.
 *
 * El paquete `ace-builds` no trae declaraciones y no existe un
 * `@types/ace-builds` fiable, así que se declara aquí lo poco que se usa: crear
 * el editor, leer y escribir el texto, escuchar cambios y el atajo Ctrl+S.
 *
 * Los modos (`mode-kotlin`, `theme-tomorrow_night`, etc.) se importan solo por
 * su efecto secundario, para que Ace los registre; por eso la declaración
 * comodín de abajo.
 */

declare module "ace-builds/src-noconflict/ace" {
  /** Editor de Ace, con lo justo que se usa desde aquí. */
  export interface AceEditorInstance {
    /** Texto actual del documento. */
    getValue(): string;
    /** Reemplaza el texto. `cursorPos` es -1 para no mover el cursor. */
    setValue(texto: string, cursorPos?: number): void;
    /** Cambia el tema, p. ej. `ace/theme/tomorrow_night`. */
    setTheme(tema: string): void;
    /** Mueve el cursor al final del documento. */
    clearSelection(): void;
    /** Modo de resaltado, p. ej. `ace/mode/kotlin`. */
    session: { setMode(modo: string): void };
    /** Opciones del editor; se usa para el tabulado y el ajuste de línea. */
    setOptions(opciones: Record<string, unknown>): void;
    /** Suscripción a un evento del editor. */
    on(evento: string, cb: () => void): void;
    /** Cancela todas las suscripciones hechas con `on`. */
    off(evento: string): void;
    /** Atajos propios del editor. */
    commands: {
      removeCommand(comando: string): void;
      addCommand(comando: {
        name: string;
        bindKey: { win: string; mac: string };
        exec: () => void;
      }): void;
    };
    /** Ejecuta un comando concreto en nombre del usuario. */
    execCommand(comando: string): void;
    /** Destruye el editor y libera el DOM. */
    destroy(): void;
    /** Da el foco al editor. */
    focus(): void;
    /** Activa o desactiva la edición (modo solo lectura). */
    setReadOnly(soloLectura: boolean): void;
    /** Mueve el cursor a una posición. */
    moveCursorTo(linea: number, columna: number): void;
  }

  /**
   * Espacio de nombres de Ace.
   *
   * El componente escribe `ace.Ace.Editor` para el `useRef`, así que tiene que
   * existir colgando del valor por defecto.
   */
  export namespace Ace {
    export type Editor = AceEditorInstance;
  }

  /** Opciones de creación del editor. */
  export interface AceEditorOptions {
    value?: string;
    mode?: string;
    theme?: string;
    fontSize?: string | number;
    showPrintMargin?: boolean;
    useWorker?: boolean;
    wrap?: boolean;
    tabSize?: number;
    useSoftTabs?: boolean;
    highlightActiveLine?: boolean;
    [clave: string]: unknown;
  }

  const ace: {
    /** Crea (o recupera) un editor dentro del elemento indicado. */
    edit(elemento: HTMLElement | string, opciones?: AceEditorOptions): AceEditorInstance;
    /** Espacio de nombres de Ace, donde se registran los modos. */
    require(ruta: string): void;
  };

  export default ace;
}

/**
 * Modos, temas y extensiones de Ace.
 *
 * Se importan por su efecto secundario, así que no se usa ningún símbolo: basta
 * con que TypeScript sepa que el módulo existe.
 */
declare module "ace-builds/src-noconflict/*";
