// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Code2, Mail, Scale, Cpu, Heart, MonitorSmartphone } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { usePlatform } from "../../hooks/usePlatform";
import { OS_LABEL } from "../../lib/platform";
import { LINKS, CONTACT_EMAIL, openExternal, copyToClipboard } from "../../lib/links";
import { useT } from "../../i18n";

function Row({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border border-border bg-bg/50 p-2.5 text-left transition-colors hover:border-accent/60"
    >
      <span className="shrink-0 text-accent">{icon}</span>
      <span className="min-w-0">
        <span className="block text-text">{title}</span>
        <span className="mt-0.5 block truncate">{detail}</span>
      </span>
    </button>
  );
}

export function About() {
  const t = useT();
  const open = useUiStore((s) => s.aboutOpen);
  const setOpen = useUiStore((s) => s.setAboutOpen);
  const setDonateOpen = useUiStore((s) => s.setDonateOpen);
  const pushToast = useUiStore((s) => s.pushToast);
  const { os } = usePlatform();
  const [version, setVersion] = useState("1.0.0");

  useEffect(() => {
    void import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => {
        /* en el navegador no hay IPC */
      });
  }, []);

  const copyEmail = () => {
    copyToClipboard(CONTACT_EMAIL).then((ok) =>
      pushToast(
        ok ? "success" : "warning",
        ok ? t("about.emailCopied") : t("common.copyManual"),
        CONTACT_EMAIL,
      ),
    );
  };

  const go = (url: string) => {
    openExternal(url).catch((err: unknown) =>
      pushToast("error", t("common.linkOpenFailed"), String(err)),
    );
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
              <div className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[11px] font-bold text-accentfg">
                CT
              </div>
              <div>
                <h2 className="text-sm font-semibold leading-tight">CloudTerm</h2>
                <p className="text-[10px] text-muted">
                  {t("about.version", { version, os: OS_LABEL[os] })}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setOpen(false)}
                className="ml-auto grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
              >
                <X size={14} />
              </button>
            </header>

            <div className="space-y-3 px-4 py-4 text-[11px] leading-relaxed text-muted">
              <p>
                {t("about.description")}
              </p>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setDonateOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-left transition-colors hover:border-danger"
              >
                <Heart size={13} className="shrink-0 text-danger" />
                <div>
                  <div className="text-text">{t("donate.supportProject")}</div>
                  <p className="mt-0.5">
                    {t("about.supportDetail")}
                  </p>
                </div>
              </button>

              <div className="flex items-start gap-2 rounded-lg border border-border bg-bg/50 p-2.5">
                <Scale size={13} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <div className="text-text">GNU AGPL-3.0-or-later</div>
                  <p className="mt-0.5">
                    {t("about.licenseDetail")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-border bg-bg/50 p-2.5">
                <Cpu size={13} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <div className="text-text">Stack</div>
                  <p className="mt-0.5">
                    Tauri 2 · React 19 · TypeScript · Tailwind CSS · Zustand · xterm.js · russh ·
                    russh-sftp · suppaftp · sqlx · keyring
                  </p>
                </div>
              </div>

              <Row
                icon={<Mail size={13} />}
                title={t("about.contact")}
                detail={CONTACT_EMAIL}
                onClick={copyEmail}
              />

              <Row
                icon={<Code2 size={13} />}
                title={t("about.sourceCode")}
                detail="github.com/pilahito/cloudterm"
                onClick={() => go(LINKS.repository)}
              />

              <div className="flex items-center gap-2 rounded-lg border border-border bg-bg/50 p-2.5">
                <MonitorSmartphone size={13} className="shrink-0 text-accent" />
                <div>
                  <div className="text-text">{t("about.detectedPlatform")}</div>
                  <div className="mt-0.5">
                    {os === "macos"
                      ? t("about.platformMacos")
                      : t("about.platformDetail", { os: OS_LABEL[os] })}
                  </div>
                </div>
              </div>
            </div>

            <footer className="border-t border-border px-4 py-3 text-center text-[10px] text-muted">
              {t("about.footer", { year: new Date().getFullYear() })}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default About;
