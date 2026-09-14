import { Languages, Check } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { LANGUAGES, useLanguage, useT } from "../../i18n";
import { cx } from "../../lib/utils";

/** Ajustes → Idioma. */
export function LanguageSettings() {
  const t = useT();
  // `useLanguage` resuelve el caso de ajustes guardados antes de que existiera
  // el idioma: sin él, ningún botón aparecería seleccionado.
  const language = useLanguage();
  const update = useSettingsStore((s) => s.update);

  return (
    <section className="mt-2 border-t border-border">
      <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <Languages size={11} /> {t("language.label")}
      </h3>

      <p className="py-1.5 text-[10px] leading-relaxed text-muted">{t("language.hint")}</p>

      <div className="flex flex-wrap gap-1.5 pb-2">
        {LANGUAGES.map((item) => {
          const activo = item.id === language;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => update({ language: item.id })}
              className={cx(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors",
                activo
                  ? "border-accent bg-accent/15 text-text"
                  : "border-border text-muted hover:text-text",
              )}
            >
              {activo && <Check size={11} className="text-accent" />}
              {/* El nombre va en su propio idioma: es como lo busca quien lo habla. */}
              <span>{item.nativeLabel}</span>
              {!activo && <span className="text-[9px] text-muted">{item.label}</span>}
            </button>
          );
        })}
      </div>

      <p className="pb-2 text-[10px] text-muted">{t("language.translatedBy")}</p>
    </section>
  );
}

export default LanguageSettings;
