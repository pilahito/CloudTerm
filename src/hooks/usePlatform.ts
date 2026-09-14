import { useEffect, useState } from "react";
import { detectOs, guessOs, type OsName } from "../lib/platform";

export interface PlatformInfo {
  os: OsName;
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
  /** Etiqueta de la tecla modificadora principal del SO. */
  modKey: string;
  /** Separador entre modificador y tecla ("+" en Win/Linux, "" en macOS). */
  modJoin: string;
}

function describe(os: OsName): PlatformInfo {
  return {
    os,
    isMac: os === "macos",
    isWindows: os === "windows",
    isLinux: os === "linux",
    modKey: os === "macos" ? "⌘" : "Ctrl",
    modJoin: os === "macos" ? "" : "+",
  };
}

/** Devuelve el SO actual, refinándolo con el plugin `os` tras el primer render. */
export function usePlatform(): PlatformInfo {
  const [os, setOs] = useState<OsName>(() => guessOs());

  useEffect(() => {
    let alive = true;
    detectOs().then((value) => {
      if (alive) setOs(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  return describe(os);
}
