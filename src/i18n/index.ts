/**
 * Traducciones de la interfaz.
 *
 * Cada idioma es un fichero `.json` plano en `locales/`, con claves con puntos
 * (`sftp.upload`, `settings.language`). Se usa JSON a propósito: cualquiera puede
 * traducir sin saber TypeScript, y las herramientas de traducción lo entienden.
 *
 * El **español es la referencia**: si a otro idioma le falta una clave, se usa la
 * española y, si tampoco existe, se devuelve la propia clave para que el fallo
 * se vea en vez de esconderse.
 *
 * Para añadir un idioma: copia `locales/en.json`, tradúcelo, y añádelo a
 * `DICCIONARIOS` y a `LANGUAGES`. El resto lo comprueba
 * `scripts/validar-idiomas.mjs`.
 */

import { useCallback, useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import en from "./locales/en.json";
import es from "./locales/es.json";
import zh from "./locales/zh.json";

/** Idioma de la interfaz. */
export type Language = "es" | "en" | "zh";

/** Ficha de un idioma, para el selector de ajustes. */
export interface LanguageInfo {
  id: Language;
  /** Nombre en el idioma de la interfaz. */
  label: string;
  /** Nombre en su propio idioma, que es como lo busca quien lo habla. */
  nativeLabel: string;
}

/** Idiomas disponibles, en el orden en que se ofrecen. */
export const LANGUAGES: LanguageInfo[] = [
  { id: "es", label: "Español", nativeLabel: "Español" },
  { id: "en", label: "Inglés", nativeLabel: "English" },
  { id: "zh", label: "Chino simplificado", nativeLabel: "简体中文" },
];

/** Idioma que se usa cuando no hay ninguno guardado. */
export const IDIOMA_POR_DEFECTO: Language = "es";

type Diccionario = Record<string, string>;

const DICCIONARIOS: Record<Language, Diccionario> = {
  es: es as Diccionario,
  en: en as Diccionario,
  zh: zh as Diccionario,
};

/** Valores que se pueden interpolar en un texto. */
export type Variables = Record<string, string | number>;

/** ¿Es uno de los idiomas que sabemos hablar? */
export function esIdiomaValido(value: unknown): value is Language {
  return typeof value === "string" && value in DICCIONARIOS;
}

/** Todos los idiomas que tienen diccionario. */
export function idiomas(): Language[] {
  return Object.keys(DICCIONARIOS) as Language[];
}

/** Claves de un idioma, ordenadas. Lo usa la validación. */
export function clavesDe(language: Language): string[] {
  return Object.keys(DICCIONARIOS[language] ?? {}).sort();
}

/** Claves de referencia: las del idioma por defecto. */
export function clavesDeReferencia(): string[] {
  return clavesDe(IDIOMA_POR_DEFECTO);
}

/**
 * Sustituye los `{marcadores}` por sus valores.
 *
 * Si falta una variable se deja el marcador tal cual: es preferible ver
 * `{host}` en pantalla que un hueco vacío sin explicación.
 */
function interpolar(texto: string, vars?: Variables): string {
  if (!vars) return texto;
  return texto.replace(/\{(\w+)\}/g, (todo, clave: string) =>
    clave in vars ? String(vars[clave]) : todo,
  );
}

/**
 * Traduce una clave a un idioma concreto.
 *
 * Si la clave no está en ese idioma se cae al idioma por defecto; si tampoco
 * está, se devuelve la clave.
 */
export function traducir(language: Language, key: string, vars?: Variables): string {
  const texto = DICCIONARIOS[language]?.[key] ?? DICCIONARIOS[IDIOMA_POR_DEFECTO][key];
  if (texto === undefined) return key;
  return interpolar(texto, vars);
}

/** Idioma activo, leído del estado de ajustes. */
function idiomaActivo(): Language {
  const guardado = useSettingsStore.getState().settings.language;
  return esIdiomaValido(guardado) ? guardado : IDIOMA_POR_DEFECTO;
}

/**
 * Traduce con el idioma activo **fuera de un componente**.
 *
 * Para componentes se prefiere `useT()`, que reacciona al cambio de idioma.
 */
export function t(key: string, vars?: Variables): string {
  return traducir(idiomaActivo(), key, vars);
}

/**
 * Traductor del idioma activo, como hook.
 *
 * Devuelve una función estable mientras no cambie el idioma, para poder usarla
 * en dependencias de `useMemo` y `useEffect` sin provocar bucles.
 */
export function useT(): (key: string, vars?: Variables) => string {
  const language = useSettingsStore((s) =>
    esIdiomaValido(s.settings.language) ? s.settings.language : IDIOMA_POR_DEFECTO,
  );

  return useCallback(
    (key: string, vars?: Variables) => traducir(language, key, vars),
    [language],
  );
}

/** Idioma activo, como hook. */
export function useLanguage(): Language {
  return useSettingsStore((s) =>
    esIdiomaValido(s.settings.language) ? s.settings.language : IDIOMA_POR_DEFECTO,
  );
}

/**
 * Código BCP-47 de cada idioma, para el atributo `lang` del documento.
 *
 * El chino se marca como `zh-Hans` (simplificado) porque «zh» a secas deja que
 * el sistema elija la variante de fuente, y con simplificado eso se nota.
 */
const ETIQUETAS: Record<Language, string> = {
  es: "es",
  en: "en",
  zh: "zh-Hans",
};

/**
 * Mantiene el `lang` del documento en sincronía con el idioma activo.
 *
 * No es decorativo: de él dependen la elección de fuentes, la separación de
 * palabras y cómo lo pronuncian los lectores de pantalla.
 */
export function useDocumentLanguage(): void {
  const language = useLanguage();
  useEffect(() => {
    document.documentElement.lang = ETIQUETAS[language] ?? language;
  }, [language]);
}
