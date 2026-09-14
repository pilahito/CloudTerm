import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";

/** Applies the selected theme + terminal font to the document root. */
export function useTheme() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const fontFamily = useSettingsStore((s) => s.settings.fontFamily);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.setProperty("--ct-font-mono", fontFamily);
  }, [theme, fontFamily]);

  return theme;
}
