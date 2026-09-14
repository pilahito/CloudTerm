// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, X, Check, Sparkles } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { LANGUAGES, useT } from "../../i18n";
import { cx } from "../../lib/utils";

/** De qué lado se coloca la burbuja respecto al elemento señalado. */
type Lado = "right" | "left" | "bottom" | "top";

interface Paso {
  id: string;
  /** Clave del título. */
  titulo: string;
  /** Clave del texto. */
  cuerpo: string;
  /** Selector del elemento al que apuntar; sin él, el paso va centrado. */
  objetivo?: string;
  lado?: Lado;
}

/**
 * Los pasos del tutorial.
 *
 * El primero es especial: elegir idioma. Se hace antes que nada porque el resto
 * del tutorial tiene que leerse en el idioma de quien lo lee.
 */
const PASOS: Paso[] = [
  { id: "idioma", titulo: "tour.languageTitle", cuerpo: "tour.languageBody" },
  { id: "bienvenida", titulo: "tour.welcomeTitle", cuerpo: "tour.welcomeBody" },
  {
    id: "hosts",
    titulo: "tour.hostsTitle",
    cuerpo: "tour.hostsBody",
    objetivo: '[data-tour="sidebar"]',
    lado: "right",
  },
  {
    id: "vistas",
    titulo: "tour.viewsTitle",
    cuerpo: "tour.viewsBody",
    objetivo: '[data-tour="activitybar"]',
    lado: "right",
  },
  {
    id: "pestanas",
    titulo: "tour.tabsTitle",
    cuerpo: "tour.tabsBody",
    objetivo: '[data-tour="tabbar"]',
    lado: "bottom",
  },
  {
    id: "cuenta",
    titulo: "tour.accountTitle",
    cuerpo: "tour.accountBody",
    objetivo: '[data-tour="titlebar-actions"]',
    lado: "bottom",
  },
  {
    id: "estado",
    titulo: "tour.statusTitle",
    cuerpo: "tour.statusBody",
    objetivo: '[data-tour="statusbar"]',
    lado: "top",
  },
  { id: "listo", titulo: "tour.readyTitle", cuerpo: "tour.readyBody" },
];

/** Rectángulo de un elemento, o `null` si no está en pantalla. */
function rectDe(selector?: string): DOMRect | null {
  if (!selector) return null;
  const nodo = document.querySelector(selector);
  if (!nodo) return null;

  const rect = nodo.getBoundingClientRect();
  // Un elemento sin tamaño no se puede señalar.
  if (rect.width === 0 || rect.height === 0) return null;
  return rect;
}

/** Coloca la burbuja sin que se salga de la ventana. */
function colocar(
  rect: DOMRect,
  lado: Lado,
  ancho: number,
  alto: number,
): { left: number; top: number } {
  const margen = 16;
  const hueco = 18;

  let left = 0;
  let top = 0;

  switch (lado) {
    case "right":
      left = rect.right + hueco;
      top = rect.top + rect.height / 2 - alto / 2;
      break;
    case "left":
      left = rect.left - ancho - hueco;
      top = rect.top + rect.height / 2 - alto / 2;
      break;
    case "bottom":
      left = rect.left + rect.width / 2 - ancho / 2;
      top = rect.bottom + hueco;
      break;
    case "top":
      left = rect.left + rect.width / 2 - ancho / 2;
      top = rect.top - alto - hueco;
      break;
  }

  // Se mete dentro de la ventana si se ha salido.
  left = Math.max(margen, Math.min(left, window.innerWidth - ancho - margen));
  top = Math.max(margen, Math.min(top, window.innerHeight - alto - margen));

  return { left, top };
}

interface Props {
  /** Se llama al terminar o al saltar. */
  onDone: () => void;
}

/**
 * Tutorial de bienvenida.
 *
 * Aparece la primera vez que se abre la aplicación: elige el idioma y va
 * señalando con una flecha cada parte de la interfaz, con una frase que explica
 * para qué sirve.
 */
export function Onboarding({ onDone }: Props) {
  const t = useT();
  const update = useSettingsStore((s) => s.update);
  const language = useSettingsStore((s) => s.settings.language);

  const [indice, setIndice] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const burbuja = useRef<HTMLDivElement | null>(null);
  const [medidas, setMedidas] = useState({ ancho: 340, alto: 200 });

  const paso = PASOS[indice];
  const esUltimo = indice === PASOS.length - 1;
  const esPrimero = indice === 0;

  // El elemento señalado puede moverse (o cambiar de tamaño). Se vuelve a medir
  // en cada paso y cuando la ventana cambia.
  const medir = useCallback(() => {
    setRect(rectDe(paso.objetivo));
    const nodo = burbuja.current;
    if (nodo) {
      setMedidas({ ancho: nodo.offsetWidth, alto: nodo.offsetHeight });
    }
  }, [paso.objetivo]);

  useEffect(() => {
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir]);

  // Al cambiar de paso, se vuelve a medir ya con la burbuja nueva pintada.
  useEffect(() => {
    const id = window.requestAnimationFrame(medir);
    return () => window.cancelAnimationFrame(id);
  }, [indice, medir]);

  // Teclado: flechas para moverse, Escape para salir.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "ArrowRight") setIndice((i) => Math.min(i + 1, PASOS.length - 1));
      else if (evento.key === "ArrowLeft") setIndice((i) => Math.max(i - 1, 0));
      else if (evento.key === "Escape") onDone();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onDone]);

  const posicion = useMemo(
    () => (rect ? colocar(rect, paso.lado ?? "right", medidas.ancho, medidas.alto) : null),
    [rect, paso.lado, medidas],
  );

  /** El agujero iluminado: un poco más grande que el elemento. */
  const foco = rect
    ? {
        left: rect.left - 6,
        top: rect.top - 6,
        width: rect.width + 12,
        height: rect.height + 12,
      }
    : null;

  const terminar = () => {
    update({ onboardingDone: true });
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[95]">
      {/* Oscurecido. Con un elemento señalado, se recorta un agujero; si no, se
          cubre todo y la tarjeta va centrada. */}
      {foco ? (
        <>
          <div
            className="absolute bg-black/70"
            style={{ left: 0, top: 0, right: 0, height: Math.max(0, foco.top) }}
          />
          <div
            className="absolute bg-black/70"
            style={{
              left: 0,
              top: foco.top + foco.height,
              right: 0,
              bottom: 0,
            }}
          />
          <div
            className="absolute bg-black/70"
            style={{
              left: 0,
              top: foco.top,
              width: Math.max(0, foco.left),
              height: foco.height,
            }}
          />
          <div
            className="absolute bg-black/70"
            style={{
              left: foco.left + foco.width,
              top: foco.top,
              right: 0,
              height: foco.height,
            }}
          />
          {/* El borde del agujero, para que se vea qué está señalado. */}
          <div
            className="pointer-events-none absolute rounded-md border-2 border-accent"
            style={{ ...foco, boxShadow: "0 0 0 4px rgb(var(--ct-accent) / 0.25)" }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/80" />
      )}

      {/* La tarjeta. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={paso.id}
          ref={burbuja}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.16 }}
          className={cx(
            "absolute flex w-[340px] flex-col rounded-xl border border-border bg-surface shadow-2xl",
            posicion ? "" : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          )}
          style={posicion ? { left: posicion.left, top: posicion.top } : undefined}
        >
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles size={14} className="shrink-0 text-accent" />
            <h2 className="text-sm font-semibold">{t(paso.titulo)}</h2>
            <button
              type="button"
              aria-label={t("tour.skip")}
              onClick={terminar}
              className="ml-auto grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
            >
              <X size={14} />
            </button>
          </header>

          <div className="space-y-3 px-4 py-3">
            <p className="text-[11px] leading-relaxed text-muted">{t(paso.cuerpo)}</p>

            {/* El primer paso es elegir idioma. */}
            {paso.id === "idioma" && (
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => update({ language: item.id })}
                    className={cx(
                      "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors",
                      language === item.id
                        ? "border-accent bg-accent/15 text-text"
                        : "border-border text-muted hover:text-text",
                    )}
                  >
                    {language === item.id && <Check size={11} className="text-accent" />}
                    {item.nativeLabel}
                  </button>
                ))}
              </div>
            )}
          </div>

          <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
            {/* Puntos de progreso. */}
            <div className="flex items-center gap-1">
              {PASOS.map((p, i) => (
                <span
                  key={p.id}
                  className={cx(
                    "h-1.5 rounded-full transition-all",
                    i === indice ? "w-4 bg-accent" : "w-1.5 bg-border",
                  )}
                />
              ))}
            </div>

            <span className="ml-1 text-[9px] text-muted">
              {indice + 1}/{PASOS.length}
            </span>

            <div className="ml-auto flex items-center gap-1.5">
              {!esPrimero && (
                <button
                  type="button"
                  onClick={() => setIndice((i) => Math.max(i - 1, 0))}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
                >
                  <ChevronLeft size={11} /> {t("tour.back")}
                </button>
              )}

              <button
                type="button"
                onClick={() => (esUltimo ? terminar() : setIndice((i) => i + 1))}
                className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90"
              >
                {esUltimo ? t("tour.start") : t("tour.next")}
                {!esUltimo && <ChevronRight size={11} />}
              </button>
            </div>
          </footer>
        </motion.div>
      </AnimatePresence>

      {/* La flecha que señala. Solo cuando hay algo a lo que apuntar. */}
      {foco && posicion && (
        <Flecha
          foco={foco}
          burbuja={{
            left: posicion.left,
            top: posicion.top,
            width: medidas.ancho,
            height: medidas.alto,
          }}
          lado={paso.lado ?? "right"}
        />
      )}
    </div>
  );
}

/** Triángulo que une la burbuja con el elemento señalado. */
function Flecha({
  foco,
  burbuja,
  lado,
}: {
  foco: { left: number; top: number; width: number; height: number };
  burbuja: { left: number; top: number; width: number; height: number };
  lado: Lado;
}) {
  const tamano = 8;

  // El triángulo se coloca en el centro del lado que mira al elemento.
  const estilo: React.CSSProperties = { position: "absolute", width: 0, height: 0 };
  const color = "rgb(var(--ct-accent))";

  switch (lado) {
    case "right":
      Object.assign(estilo, {
        left: burbuja.left - tamano,
        top: Math.max(
          burbuja.top + 24,
          Math.min(
            foco.top + foco.height / 2 - tamano,
            burbuja.top + burbuja.height - 36,
          ),
        ),
        borderTop: `${tamano}px solid transparent`,
        borderBottom: `${tamano}px solid transparent`,
        borderRight: `${tamano}px solid ${color}`,
      });
      break;
    case "left":
      Object.assign(estilo, {
        left: burbuja.left + burbuja.width,
        top: foco.top + foco.height / 2 - tamano,
        borderTop: `${tamano}px solid transparent`,
        borderBottom: `${tamano}px solid transparent`,
        borderLeft: `${tamano}px solid ${color}`,
      });
      break;
    case "bottom":
      Object.assign(estilo, {
        left: foco.left + foco.width / 2 - tamano,
        top: burbuja.top - tamano,
        borderLeft: `${tamano}px solid transparent`,
        borderRight: `${tamano}px solid transparent`,
        borderBottom: `${tamano}px solid ${color}`,
      });
      break;
    case "top":
      Object.assign(estilo, {
        left: foco.left + foco.width / 2 - tamano,
        top: burbuja.top + burbuja.height,
        borderLeft: `${tamano}px solid transparent`,
        borderRight: `${tamano}px solid transparent`,
        borderTop: `${tamano}px solid ${color}`,
      });
      break;
  }

  return <span style={estilo} />;
}

export default Onboarding;
