// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useState } from "react";
import { Activity, Server, Plug, ArrowUpDown, Wifi, WifiOff, Clock } from "lucide-react";
import { useUiStore, type ViewId } from "../../stores/uiStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useSshStore } from "../../stores/sshStore";
import { useTransferStore } from "../../stores/transferStore";
import { useFps } from "../../hooks/useFps";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

const VIEW_KEY: Record<ViewId, string> = {
  welcome: "view.welcome",
  terminal: "view.terminal",
  files: "view.files",
  pixel: "view.pixel",
};

function Cell({
  icon,
  label,
  title,
  tone,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  title?: string;
  tone?: "default" | "accent" | "success" | "danger";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title ?? label}
      className={cx(
        "flex items-center gap-1 px-1.5 py-0.5",
        onClick && "transition-colors hover:bg-elevated hover:text-text",
        tone === "accent" && "text-accent",
        tone === "success" && "text-success",
        tone === "danger" && "text-danger",
      )}
    >
      {icon}
      {label}
    </Tag>
  );
}

/**
 * Barra de estado inferior.
 *
 * Todo lo que muestra es real: fotogramas por segundo medidos con
 * `requestAnimationFrame`, número de hosts, sesiones SSH vivas, transferencias
 * en cola y la hora del sistema.
 */
export function StatusBar() {
  const t = useT();
  const activeView = useUiStore((s) => s.activeView);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const setRightPanel = useUiStore((s) => s.setRightPanel);

  const hosts = useConnectionStore((s) => s.connections.length);
  const probes = useConnectionStore((s) => s.probes);
  const online = Object.values(probes).filter((probe) => probe.reachable).length;

  const statuses = useSshStore((s) => s.status);
  const sessions = Object.values(statuses).filter((status) => status === "connected").length;

  const transfers = useTransferStore((s) => s.transfers);
  const pending = transfers.filter((t) => t.status === "queued" || t.status === "running").length;

  const fps = useFps();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const connected = sessions > 0;

  return (
    <footer
      data-tour="statusbar"
      className="flex h-6 shrink-0 items-center gap-1 border-t border-border bg-surface px-2 text-[10px] text-muted select-none"
    >
      <Cell
        icon={<Activity size={10} />}
        label={t("statusbar.fps", { fps })}
        tone={fps < 30 ? "danger" : "default"}
        title={t("statusbar.fpsTooltip")}
      />

      <span className="text-border">|</span>
      <Cell label={t(VIEW_KEY[activeView])} onClick={() => setActiveView("welcome")} />

      <div className="ml-auto flex items-center gap-1">
        <Cell
          icon={<Server size={10} />}
          label={t("statusbar.hosts", { count: hosts })}
          title={t("statusbar.hostsTooltip", { count: hosts, online })}
          onClick={() => setActiveView("pixel")}
        />
        <Cell
          icon={<Plug size={10} />}
          label={t("statusbar.sessions", { count: sessions })}
          tone={sessions > 0 ? "accent" : "default"}
          onClick={() => setActiveView("terminal")}
        />
        <Cell
          icon={<ArrowUpDown size={10} />}
          label={t("statusbar.transfers", { count: pending })}
          tone={pending > 0 ? "accent" : "default"}
          onClick={() => {
            setActiveView("files");
            setRightPanel("sftp");
          }}
        />

        <span className="text-border">|</span>

        <Cell
          icon={connected ? <Wifi size={10} /> : <WifiOff size={10} />}
          label={connected ? t("statusbar.connected") : t("statusbar.disconnected")}
          tone={connected ? "success" : "default"}
        />
        <Cell label="UTF-8" title={t("statusbar.encoding")} />
        <Cell label="SSH" title={t("statusbar.transport")} />
        <Cell
          icon={<Clock size={10} />}
          label={now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        />
      </div>
    </footer>
  );
}

export default StatusBar;
