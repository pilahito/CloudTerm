import { ArrowUp, X, CheckCircle2, XCircle, Loader2, Clock, Trash2 } from "lucide-react";
import { useTransferStore, type Transfer } from "../../stores/transferStore";
import { formatBytes, cx } from "../../lib/utils";
import { useT } from "../../i18n";

function StatusIcon({ status }: { status: Transfer["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 size={12} className="animate-spin text-accent" />;
    case "done":
      return <CheckCircle2 size={12} className="text-success" />;
    case "error":
      return <XCircle size={12} className="text-danger" />;
    default:
      return <Clock size={12} className="text-muted" />;
  }
}

function TransferRow({ transfer }: { transfer: Transfer }) {
  const t = useT();
  const remove = useTransferStore((s) => s.remove);
  const percent =
    transfer.size > 0
      ? Math.min(100, Math.round((transfer.transferred / transfer.size) * 100))
      : transfer.status === "done"
        ? 100
        : 0;

  return (
    <li className="group flex items-center gap-2 rounded-md border border-border bg-bg/40 px-2 py-1.5">
      <StatusIcon status={transfer.status} />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <ArrowUp
            size={10}
            className={cx(
              "shrink-0 text-muted",
              transfer.direction === "download" && "rotate-180",
            )}
          />
          <span className="truncate text-[11px] text-text">{transfer.name}</span>
        </span>

        {transfer.status === "error" ? (
          <span className="mt-0.5 block truncate text-[10px] text-danger">
            {transfer.error ?? t("sftp.transferError")}
          </span>
        ) : (
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-border">
            <span
              className={cx(
                "block h-full transition-[width] duration-200",
                transfer.status === "done" ? "bg-success" : "bg-accent",
              )}
              style={{ width: `${percent}%` }}
            />
          </span>
        )}
      </span>

      <span className="shrink-0 text-right text-[10px] text-muted">
        {transfer.size > 0
          ? `${formatBytes(transfer.transferred)} / ${formatBytes(transfer.size)}`
          : formatBytes(transfer.transferred)}
      </span>

      <button
        type="button"
        title={t("sftp.removeFromList")}
        aria-label={t("sftp.removeFromList")}
        onClick={() => remove(transfer.id)}
        className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted opacity-0 transition-opacity hover:bg-border hover:text-text group-hover:opacity-100"
      >
        <X size={11} />
      </button>
    </li>
  );
}

export function TransferQueue() {
  const t = useT();
  const transfers = useTransferStore((s) => s.transfers);
  const running = useTransferStore((s) => s.running);
  const clearFinished = useTransferStore((s) => s.clearFinished);

  if (transfers.length === 0) return null;

  const pending = transfers.filter((item) => item.status === "queued" || item.status === "running").length;

  return (
    <section className="flex max-h-44 shrink-0 flex-col border-t border-border">
      <header className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {t("sftp.transfers")}
        </span>
        <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] text-muted">
          {pending > 0 ? t("sftp.pendingCount", { count: pending }) : `${transfers.length}`}
        </span>
        {running && <Loader2 size={11} className="animate-spin text-accent" />}
        <button
          type="button"
          onClick={clearFinished}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:text-text"
        >
          <Trash2 size={10} /> {t("sftp.clearCompleted")}
        </button>
      </header>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {transfers.map((transfer) => (
          <TransferRow key={transfer.id} transfer={transfer} />
        ))}
      </ul>
    </section>
  );
}

export default TransferQueue;
