// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { Coffee, ExternalLink, Heart, X, Scale } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useUiStore } from "../../stores/uiStore";
import { LINKS, CONTACT_EMAIL, openExternal } from "../../lib/links";
import { useEasterEggStore } from "../../stores/easterEggStore";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

interface TierProps {
  title: string;
  description: string;
  cta: string;
  url: string;
  accent?: string;
  icon: React.ReactNode;
  onOpen: (url: string) => void;
}

function DonateTier({ title, description, cta, url, accent, icon, onOpen }: TierProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      className={cx(
        "group flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all",
        "border-border bg-bg/50 hover:border-accent/60 hover:bg-elevated",
      )}
    >
      <span
        className={cx(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white",
          accent ?? "bg-accent",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-text">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">{description}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent">
        {cta}
        <ExternalLink size={11} className="transition-transform group-hover:-translate-y-0.5" />
      </span>
    </button>
  );
}

export function DonateModal() {
  const t = useT();
  const open = useUiStore((s) => s.donateOpen);
  const setOpen = useUiStore((s) => s.setDonateOpen);
  const pushToast = useUiStore((s) => s.pushToast);

  const handleOpen = (url: string) => {
    // Se apunta el momento: si la ventana pierde el foco y vuelve pasados unos
    // segundos, `useDonationUnlock` entiende que ha ido a donar.
    useEasterEggStore.getState().markDonateClicked();

    openExternal(url)
      .then(() => pushToast("success", t("donate.openingBrowser"), url))
      .catch((err: unknown) => pushToast("error", t("common.linkOpenFailed"), String(err)));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Heart size={15} className="text-danger" />
              <h2 className="text-sm font-semibold">{t("donate.title")}</h2>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setOpen(false)}
                className="ml-auto grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
              >
                <X size={14} />
              </button>
            </header>

            <div className="space-y-3 px-4 py-4">
              <p className="text-[11px] leading-relaxed text-muted">
                {t("donate.introFree")}
                <strong className="text-text">{t("donate.introFreeStrong")}</strong>
                {t("donate.introRest")}
              </p>

              <DonateTier
                title="Buy Me a Coffee"
                description={t("donate.bmcDescription")}
                cta={t("donate.bmcCta")}
                url={LINKS.buyMeACoffee}
                accent="bg-[#ffdd00] text-black"
                icon={<Coffee size={16} className="text-black" />}
                onOpen={handleOpen}
              />

              <DonateTier
                title="PayPal"
                description={t("donate.paypalDescription")}
                cta={t("donate.paypalCta")}
                url={LINKS.paypal}
                accent="bg-[#0070ba]"
                icon={<Heart size={15} />}
                onOpen={handleOpen}
              />

              <div className="flex items-start gap-2 rounded-lg border border-border bg-bg/50 p-2.5">
                <Scale size={13} className="mt-0.5 shrink-0 text-accent" />
                <p className="text-[10px] leading-relaxed text-muted">
                  {t("donate.commercial")}{" "}
                  <span className="text-text">{CONTACT_EMAIL}</span>
                </p>
              </div>
            </div>

            <footer className="border-t border-border px-4 py-3 text-center text-[10px] text-muted">
              {t("donate.footer")}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default DonateModal;
