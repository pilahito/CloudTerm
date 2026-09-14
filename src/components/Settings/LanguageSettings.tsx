// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Languages, Check, AlertTriangle, FolderOpen, ShieldCheck, Loader2 } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { LANGUAGES, useIdiomasStore, useLanguage, useT, type LanguageInfo } from "../../i18n";
import { carpetaIdiomas, idiomasExternos } from "../../lib/idiomas";
import { openExternal } from "../../lib/links";
import { cx } from "../../lib/utils";

/** Ajustes → Idioma. */
export function LanguageSettings() {
  const t = useT();
  const pushToast = useUiStore((s) => s.pushToast);
  // `useLanguage` resuelve el caso de ajustes guardados antes de que existiera
  // el idioma: sin él, ningún botón aparecería seleccionado.
  const language = useLanguage();
  const update = useSettingsStore((s) => s.update);

  const externos = useIdiomasStore((s) => s.externos);
  const registrar = useIdiomasStore((s) => s.registrar);

  const [cargando, setCargando] = useState(true);
  const [pendiente, setPendiente] = useState<LanguageInfo | null>(null);

  // Los idiomas instalados se leen al abrir los ajustes y se registran para que
  // el traductor pueda usarlos enseguida.
  useEffect(() => {
    let vivo = true;
    void idiomasExternos()
      .then((lista) => {
        if (!vivo) return;
        for (const externo of lista) {
          // Un fichero roto no se registra: no hay nada que traducir con él.
          if (externo.claves === 0) continue;
          registrar(
            {
              id: externo.id,
              label: externo.nombre || externo.id,
              nativeLabel: externo.nombre || externo.id,
              oficial: externo.oficial,
              autor: externo.autor,
              ruta: externo.ruta,
            },
            externo.diccionario,
          );
        }
      })
      .catch(() => {
        /* fuera de Tauri no hay idiomas instalados */
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
    };
  }, [registrar]);

  const abrirCarpeta = async () => {
    try {
      const ruta = await carpetaIdiomas();
      await openExternal(`file://${ruta}`);
    } catch (err) {
      pushToast("error", t("language.openFolderFailed"), String(err));
    }
  };

  /** Aplica el idioma, avisando antes si no lo firma el autor del proyecto. */
  const elegir = (info: LanguageInfo) => {
    if (!info.oficial) {
      setPendiente(info);
      return;
    }
    update({ language: info.id });
  };

  const confirmar = () => {
    if (pendiente) update({ language: pendiente.id });
    setPendiente(null);
  };

  const todos: LanguageInfo[] = [...LANGUAGES, ...externos];

  return (
    <section className="mt-2 border-t border-border">
      <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <Languages size={11} /> {t("language.label")}
      </h3>

      <p className="py-1.5 text-[10px] leading-relaxed text-muted">{t("language.hint")}</p>

      <div className="space-y-1 pb-1">
        {todos.map((item) => {
          const activo = item.id === language;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => elegir(item)}
              className={cx(
                "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors",
                activo
                  ? "border-accent bg-accent/15 text-text"
                  : "border-border text-muted hover:text-text",
              )}
            >
              {activo ? (
                <Check size={11} className="shrink-0 text-accent" />
              ) : (
                <span className="w-[11px] shrink-0" />
              )}

              {/* El nombre va en su propio idioma: es como lo busca quien lo habla. */}
              <span className="shrink-0">{item.nativeLabel}</span>

              <span className="ml-auto flex min-w-0 items-center gap-1.5 text-[9px]">
                {item.oficial ? (
                  <span className="flex shrink-0 items-center gap-0.5 text-success">
                    <ShieldCheck size={9} />
                    {t("language.official")}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-0.5 text-warning">
                    <AlertTriangle size={9} />
                    {t("language.byAuthor", { author: item.autor || t("common.unknown") })}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 py-1.5">
        <button
          type="button"
          onClick={() => void abrirCarpeta()}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-accent/60 hover:text-text"
        >
          {cargando ? <Loader2 size={10} className="animate-spin" /> : <FolderOpen size={10} />}
          {t("language.openFolder")}
        </button>
        <span className="min-w-0 flex-1 text-[9px] leading-relaxed text-muted">
          {t("language.folderHint")}
        </span>
      </div>

      {/* Aviso antes de usar un idioma que no firma el autor del proyecto. */}
      <AnimatePresence>
        {pendiente && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-6 backdrop-blur-[2px]"
            onClick={() => setPendiente(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-xl border border-warning/40 bg-surface shadow-2xl"
            >
              <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                <AlertTriangle size={15} className="text-warning" />
                <h2 className="text-sm font-semibold">{t("language.warningTitle")}</h2>
              </header>

              <div className="space-y-2 px-4 py-4">
                <p className="text-[11px] leading-relaxed text-text">
                  {t("language.warningBody", {
                    author: pendiente.autor || t("common.unknown"),
                    id: pendiente.id,
                  })}
                </p>
                <p className="text-[10px] leading-relaxed text-muted">
                  {t("language.warningDetail")}
                </p>
                {pendiente.ruta && (
                  <p className="truncate font-mono text-[9px] text-muted" title={pendiente.ruta}>
                    {pendiente.ruta}
                  </p>
                )}
              </div>

              <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
                <button
                  type="button"
                  onClick={() => setPendiente(null)}
                  className="rounded-md border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={confirmar}
                  className="ml-auto rounded-md border border-warning/50 bg-warning/15 px-3 py-1.5 text-[11px] font-medium text-text transition-colors hover:bg-warning/25"
                >
                  {t("language.useAnyway")}
                </button>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export default LanguageSettings;
