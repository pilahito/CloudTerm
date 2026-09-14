// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Folder,
  File as FileIcon,
  Link2,
  ArrowUp,
  RefreshCw,
  FolderPlus,
  Trash2,
  HardDrive,
  Server,
  Plug,
  Loader2,
  Unplug,
  ExternalLink,
} from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useUiStore } from "../../stores/uiStore";
import { useTransferStore } from "../../stores/transferStore";
import {
  baseName,
  joinPath,
  localHome,
  localList,
  localMkdir,
  onSftpProgress,
  parentPath,
  resolveAuth,
  sftpConnect,
  sftpDisconnect,
  sftpList,
  sftpMkdir,
  sftpRemove,
  type FsEntry,
} from "../../lib/sftp";
import { describeSshError } from "../../lib/ssh";
import { editRemote, onEditUploaded, openWith } from "../../lib/editor";
import { cx, formatBytes, formatRelativeTime, uid } from "../../lib/utils";
import { useT } from "../../i18n";
import { TransferQueue } from "./TransferQueue";
import { EditorPicker } from "./EditorPicker";
import { PixelOffice } from "./PixelOffice";
import { CommandLine } from "./CommandLine";
import { useEasterEggStore } from "../../stores/easterEggStore";

type PaneKind = "local" | "remote";

/**
 * Paleta del modo clásico.
 *
 * Es a propósito la de los gestores de archivos de siempre: grises, bordes
 * rectos, cero esquinas redondeadas y selección azul. Quien pide «como
 * FileZilla» no quiere el aspecto moderno con otro color.
 */
const CLASICO = {
  panel: "rounded-none border-[#4a4a4a] bg-[#1e1e1e]",
  cabecera: "rounded-none border-[#4a4a4a] bg-[#2d2d2d] px-1 py-0.5",
  ruta: "rounded-none border-[#4a4a4a] bg-[#141414] px-1 py-0.5",
  fila: "rounded-none px-1 py-[1px]",
  seleccion: "bg-[#0a4d8c] text-white",
  columnas: "border-[#4a4a4a] bg-[#252525] text-[#9a9a9a]",
};

/* -------------------------------------------------------------------------- */
/* Una entrada de la lista                                                    */
/* -------------------------------------------------------------------------- */

function EntryIcon({ entry }: { entry: FsEntry }) {
  if (entry.isSymlink) return <Link2 size={12} className="shrink-0 text-warning" />;
  if (entry.isDir) return <Folder size={12} className="shrink-0 text-accent" />;
  return <FileIcon size={12} className="shrink-0 text-muted" />;
}

const ACTION_BUTTON =
  "grid h-5 w-5 place-items-center rounded text-muted transition-colors hover:bg-elevated hover:text-text disabled:opacity-30";

interface PaneProps {
  kind: PaneKind;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  path: string;
  entries: FsEntry[];
  emptyLabel: string;
  disabled: boolean;
  isDropTarget: boolean;
  dragging: boolean;
  refreshing: boolean;
  onNavigate: (entry: FsEntry) => void;
  onUp: () => void;
  onRefresh: () => void;
  onMkdir: () => void;
  onDelete?: (entry: FsEntry) => void;
  /** Aspecto clásico tipo FileZilla/WinSCP, cuando el easter egg está apagado. */
  clasico?: boolean;
  /** Abre el archivo con un editor externo. */
  onOpenWith?: (entry: FsEntry) => void;
  onTransfer: (entry: FsEntry) => void;
  onDragStartEntry: (entry: FsEntry) => void;
  onDragEndEntry: () => void;
  onDragOverPane: (event: React.DragEvent) => void;
  onDragLeavePane: () => void;
  onDropPane: (event: React.DragEvent) => void;
}

function Pane({
  kind,
  title,
  subtitle,
  icon,
  path,
  entries,
  emptyLabel,
  disabled,
  isDropTarget,
  dragging,
  refreshing,
  onNavigate,
  onUp,
  onRefresh,
  onMkdir,
  onDelete,
  clasico = false,
  onOpenWith,
  onTransfer,
  onDragStartEntry,
  onDragEndEntry,
  onDragOverPane,
  onDragLeavePane,
  onDropPane,
}: PaneProps) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section
      onDragOver={disabled ? undefined : onDragOverPane}
      onDragLeave={onDragLeavePane}
      onDrop={disabled ? undefined : onDropPane}
      className={cx(
        "flex min-h-0 min-w-[220px] flex-1 flex-col overflow-hidden border transition-colors",
        clasico ? CLASICO.panel : "rounded-lg bg-bg/40",
        isDropTarget ? "border-accent bg-accent/10" : "border-border",
        disabled && "opacity-60",
      )}
    >
      <header
        className={cx(
          "flex items-center gap-1.5 border-b border-border",
          clasico ? CLASICO.cabecera : "px-2 py-1.5",
        )}
      >
        {icon}
        <span className="shrink-0 text-[11px] font-medium text-text">{title}</span>
        <span className="truncate text-[10px] text-muted">{subtitle}</span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title={t("common.up")}
            aria-label={t("common.up")}
            onClick={onUp}
            disabled={disabled}
            className={ACTION_BUTTON}
          >
            <ArrowUp size={11} />
          </button>
          <button
            type="button"
            title={t("common.refresh")}
            aria-label={t("common.refresh")}
            onClick={onRefresh}
            disabled={disabled}
            className={ACTION_BUTTON}
          >
            <RefreshCw size={11} className={cx(refreshing && "animate-spin")} />
          </button>
          <button
            type="button"
            title={t("sftp.newFolder")}
            aria-label={t("sftp.newFolder")}
            onClick={onMkdir}
            disabled={disabled}
            className={ACTION_BUTTON}
          >
            <FolderPlus size={11} />
          </button>
        </div>
      </header>

      <p
        className={cx(
          "truncate border-b border-border/60 font-mono text-[10px] text-muted",
          clasico ? CLASICO.ruta : "px-2 py-1",
        )}
        title={path}
      >
        {path || "—"}
      </p>

      {/* En el modo clásico los listados llevan cabecera de columnas. */}
      {clasico && (
        <div
          className={cx(
            "flex shrink-0 items-center gap-1 border-b px-1 py-[1px] font-mono text-[9px] uppercase",
            CLASICO.columnas,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{t("common.name")}</span>
          <span className="w-16 shrink-0 text-right">{t("common.size")}</span>
          <span className="w-20 shrink-0 text-right">{t("common.modified")}</span>
          <span className="w-12 shrink-0" />
        </div>
      )}

      <ul className={cx("min-h-0 flex-1 overflow-y-auto", clasico ? "p-0" : "p-1")}>
        {entries.length === 0 && (
          <li className="px-2 py-6 text-center text-[11px] text-muted">
            {disabled ? emptyLabel : t("sftp.emptyDirectory")}
          </li>
        )}

        {entries.map((entry) => {
          const isSelected = selected === entry.path;
          return (
            <li key={entry.path}>
              <div
                role="button"
                tabIndex={0}
                draggable={!entry.isDir}
                onDragStart={() => onDragStartEntry(entry)}
                onDragEnd={onDragEndEntry}
                onClick={() => setSelected(entry.path)}
                onDoubleClick={() => onNavigate(entry)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onNavigate(entry);
                }}
                title={entry.isDir ? t("sftp.hintOpenFolder") : t("sftp.hintTransfer")}
                className={cx(
                  "group flex cursor-pointer items-center transition-colors",
                  clasico
                    ? cx(CLASICO.fila, "gap-1 font-mono text-[11px]")
                    : "gap-2 rounded px-1.5 py-1 text-[11px]",
                  isSelected
                    ? clasico
                      ? CLASICO.seleccion
                      : "bg-accent/15 text-text"
                    : "text-muted hover:bg-elevated",
                  !entry.isDir && "cursor-grab active:cursor-grabbing",
                )}
              >
                <EntryIcon entry={entry} />
                <span
                  className={cx("min-w-0 flex-1 truncate", clasico ? "" : "text-text")}
                >
                  {entry.name}
                </span>

                <span
                  className={cx(
                    "shrink-0 text-[10px]",
                    clasico ? "w-16 text-right" : "hidden text-muted sm:inline",
                  )}
                >
                  {entry.isDir ? "—" : formatBytes(entry.size)}
                </span>
                <span
                  className={cx(
                    "shrink-0 text-[10px]",
                    clasico ? "w-20 text-right" : "hidden text-muted lg:inline",
                  )}
                >
                  {formatRelativeTime(entry.modified)}
                </span>

                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    title={kind === "remote" ? t("sftp.download") : t("sftp.upload")}
                    aria-label={kind === "remote" ? t("sftp.download") : t("sftp.upload")}
                    onClick={(event) => {
                      event.stopPropagation();
                      onTransfer(entry);
                    }}
                    className={cx(ACTION_BUTTON, "opacity-0 group-hover:opacity-100")}
                  >
                    <ArrowUp size={10} className={cx(kind === "remote" && "rotate-180")} />
                  </button>

                  {/* Solo tiene sentido con archivos, no con carpetas. */}
                  {onOpenWith && !entry.isDir && (
                    <button
                      type="button"
                      title={t("common.openWith")}
                      aria-label={t("sftp.openWithEditorAria", { name: entry.name })}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenWith(entry);
                      }}
                      className={cx(
                        ACTION_BUTTON,
                        "opacity-0 hover:text-accent group-hover:opacity-100",
                      )}
                    >
                      <ExternalLink size={10} />
                    </button>
                  )}

                  {onDelete && (
                    <button
                      type="button"
                      title={t("common.delete")}
                      aria-label={t("common.delete")}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(entry);
                      }}
                      className={cx(
                        ACTION_BUTTON,
                        "opacity-0 hover:text-danger group-hover:opacity-100",
                      )}
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {dragging && (
        <p className="border-t border-border/60 px-2 py-1 text-center text-[10px] text-accent">
          {kind === "remote" ? t("sftp.dropToUpload") : t("sftp.dropToDownload")}
        </p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function SFTPPanel() {
  const t = useT();
  const connections = useConnectionStore((s) => s.connections);
  const pushToast = useUiStore((s) => s.pushToast);
  const enqueue = useTransferStore((s) => s.enqueue);
  const updateProgress = useTransferStore((s) => s.updateProgress);
  const completedAt = useTransferStore((s) => s.completedAt);

  // Una sesión por instancia montada: el panel puede vivir a la vez en una
  // pestaña y en el panel lateral, y no deben pisarse.
  const sessionIdRef = useRef(uid("sftp"));
  const sessionId = sessionIdRef.current;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(true);

  const [targetId, setTargetId] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [localPath, setLocalPath] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [localEntries, setLocalEntries] = useState<FsEntry[]>([]);
  const [remoteEntries, setRemoteEntries] = useState<FsEntry[]>([]);
  const [refreshingLocal, setRefreshingLocal] = useState(false);
  const [refreshingRemote, setRefreshingRemote] = useState(false);

  const [drag, setDrag] = useState<{ entry: FsEntry; from: PaneKind } | null>(null);
  const [dropTarget, setDropTarget] = useState<PaneKind | null>(null);
  /** Archivo pendiente de elegir editor, con el panel del que salió. */
  const [openTarget, setOpenTarget] = useState<{ kind: PaneKind; entry: FsEntry } | null>(null);

  const connection = connections.find((c) => c.id === targetId);

  // El aspecto lo decide el easter egg: con los NPC desbloqueados y visibles, el
  // panel se convierte en la oficina de píxeles; si no, en el gestor clásico.
  const npcsUnlocked = useEasterEggStore((s) => s.npcsUnlocked);
  const showNpcs = useEasterEggStore((s) => s.showNpcs);
  const oficina = npcsUnlocked && showNpcs;

  /* ------------------------------------------------------------------ editor */

  // Cada vez que una edición se sube se avisa, para que el usuario sepa que su
  // cambio llegó al servidor sin tener que mirar nada más.
  useEffect(() => {
    let alive = true;
    let off: (() => void) | null = null;

    void onEditUploaded((upload) => {
      if (upload.ok) {
        pushToast("success", t("sftp.changesUploaded"), `${upload.remotePath} (${upload.detail})`);
      } else {
        pushToast("error", t("sftp.changesUploadFailed"), upload.detail);
      }
    })
      .then((unlisten) => {
        if (alive) off = unlisten;
        else unlisten();
      })
      .catch(() => {
        /* sin Tauri no hay eventos */
      });

    return () => {
      alive = false;
      off?.();
    };
  }, [pushToast]);

  /** Abre el archivo elegido con el editor indicado. */
  const abrirEntrada = async (kind: PaneKind, entry: FsEntry, program: string) => {
    setOpenTarget(null);

    try {
      if (kind === "local") {
        // Un archivo local se abre directamente, sin copias ni vigilancia.
        await openWith(entry.path, program || undefined);
        return;
      }

      if (!program) {
        pushToast(
          "warning",
          t("sftp.chooseEditor"),
          t("sftp.chooseEditorDetail"),
        );
        return;
      }

      const edit = await editRemote(sessionId, entry.path, program);
      pushToast(
        "info",
        t("sftp.editingRemote"),
        `${edit.remotePath} — ${t("sftp.remoteEditHint")}`,
      );
    } catch (err) {
      pushToast("error", t("sftp.openFailed"), String(err));
    }
  };

  /* ----------------------------------------------------------------- utils */

  // El panel lateral de 320 px necesita apilar los paneles en vertical.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 560));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!targetId && connections.length > 0) setTargetId(connections[0].id);
  }, [connections, targetId]);

  useEffect(() => {
    localHome()
      .then(setLocalPath)
      .catch((err: unknown) =>
        pushToast("error", t("sftp.homeFailed"), String(err)),
      );
  }, [pushToast]);

  const refreshLocal = useCallback(
    async (path: string) => {
      setRefreshingLocal(true);
      try {
        setLocalEntries(await localList(path));
      } catch (err) {
        pushToast("error", t("sftp.localReadFailed"), String(err));
        setLocalEntries([]);
      } finally {
        setRefreshingLocal(false);
      }
    },
    [pushToast],
  );

  const refreshRemote = useCallback(
    async (path: string) => {
      setRefreshingRemote(true);
      try {
        setRemoteEntries(await sftpList(sessionId, path));
      } catch (err) {
        pushToast("error", t("sftp.remoteReadFailed"), String(err));
        setRemoteEntries([]);
      } finally {
        setRefreshingRemote(false);
      }
    },
    [sessionId, pushToast],
  );

  useEffect(() => {
    if (localPath) void refreshLocal(localPath);
  }, [localPath, refreshLocal]);

  // Progreso de las transferencias.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let disposed = false;
    void onSftpProgress((payload) =>
      updateProgress(payload.transferId, payload.transferred, payload.total, payload.done),
    ).then((unlisten) => {
      if (disposed) unlisten?.();
      else stop = unlisten;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [updateProgress]);

  // Tras cada transferencia terminada se recargan ambos paneles.
  useEffect(() => {
    if (completedAt === 0) return;
    if (localPath) void refreshLocal(localPath);
    if (remotePath) void refreshRemote(remotePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedAt]);

  // Al desmontar se cierra la sesión SFTP.
  useEffect(
    () => () => {
      void sftpDisconnect(sessionId).catch(() => {
        /* ya estaba cerrada */
      });
    },
    [sessionId],
  );

  /* -------------------------------------------------------------- conexión */

  const connect = async () => {
    if (!connection) {
      pushToast("warning", t("sftp.selectHost"), t("sftp.selectHostDetail"));
      return;
    }

    setBusy(true);
    setStatus("connecting");
    setError(null);

    try {
      const auth = await resolveAuth(connection, sessionId);
      if (!auth) {
        setStatus("idle");
        return;
      }

      const info = await sftpConnect({
        sessionId,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        auth,
        timeoutMs: connection.timeoutMs ?? 60_000,
      });

      setStatus("ready");
      setRemotePath(info.home);
      setRemoteEntries(await sftpList(sessionId, info.home));
      pushToast("success", t("sftp.connected"), `${connection.username}@${connection.host}`);
    } catch (err) {
      const message = describeSshError(String(err));
      setError(message);
      setStatus("error");
      pushToast("error", t("sftp.connectFailed"), message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    void sftpDisconnect(sessionId)
      .catch(() => undefined)
      .finally(() => {
        setStatus("idle");
        setRemoteEntries([]);
        setRemotePath("");
      });
  };

  /* ------------------------------------------------------------ navegación */

  const transfer = (source: PaneKind, entry: FsEntry) => {
    if (entry.isDir) {
      pushToast(
        "warning",
        t("sftp.foldersUnsupported"),
        t("sftp.foldersUnsupportedDetail"),
      );
      return;
    }

    if (source === "local") {
      if (status !== "ready") {
        pushToast("warning", t("sftp.noConnection"), t("sftp.connectBeforeUpload"));
        return;
      }
      const remoteTarget = joinPath(remotePath, entry.name);
      enqueue([
        {
          sessionId,
          direction: "upload",
          name: entry.name,
          localPath: entry.path,
          remotePath: remoteTarget,
          size: entry.size,
        },
      ]);
      pushToast("info", t("sftp.queuedUpload"), `${entry.name} → ${remoteTarget}`);
      return;
    }

    const localTarget = joinPath(localPath, entry.name);
    enqueue([
      {
        sessionId,
        direction: "download",
        name: entry.name,
        localPath: localTarget,
        remotePath: entry.path,
        size: entry.size,
      },
    ]);
    pushToast("info", t("sftp.queuedDownload"), `${entry.name} → ${localTarget}`);
  };

  const navigate = (kind: PaneKind, entry: FsEntry) => {
    if (entry.isDir) {
      if (kind === "local") setLocalPath(entry.path);
      else setRemotePath(entry.path);
      return;
    }
    transfer(kind, entry);
  };

  const handleDrop = (target: PaneKind) => (event: React.DragEvent) => {
    event.preventDefault();
    setDropTarget(null);
    const dragged = drag;
    setDrag(null);
    if (!dragged || dragged.from === target) return;
    transfer(dragged.from, dragged.entry);
  };

  const handleDragOver = (target: PaneKind) => (event: React.DragEvent) => {
    if (!drag || drag.from === target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropTarget(target);
  };

  /* ----------------------------------------------------------------- mkdir */

  const makeDirectory = async (kind: PaneKind) => {
    const name = window.prompt(
      kind === "local" ? t("sftp.newLocalFolderPrompt") : t("sftp.newRemoteFolderPrompt"),
    );
    if (!name?.trim()) return;
    const clean = name.trim();

    try {
      if (kind === "local") {
        await localMkdir(joinPath(localPath, clean));
        await refreshLocal(localPath);
      } else {
        if (status !== "ready") {
          pushToast("warning", t("sftp.noConnection"), t("sftp.connectFirst"));
          return;
        }
        await sftpMkdir(sessionId, joinPath(remotePath, clean));
        await refreshRemote(remotePath);
      }
      pushToast("success", t("sftp.folderCreated"), clean);
    } catch (err) {
      pushToast("error", t("sftp.folderCreateFailed"), String(err));
    }
  };

  const removeRemote = async (entry: FsEntry) => {
    if (!window.confirm(t("sftp.confirmDeleteRemote", { name: entry.name }))) return;
    try {
      await sftpRemove(sessionId, entry.path, entry.isDir);
      await refreshRemote(remotePath);
      pushToast("success", t("sftp.deleted"), entry.name);
    } catch (err) {
      pushToast("error", t("sftp.deleteFailed"), String(err));
    }
  };

  /* ---------------------------------------------------------------- render */

  const connected = status === "ready";

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      {/* Barra de conexión */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Server size={12} className="shrink-0 text-muted" />
        <select
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          disabled={connected || busy}
          className="min-w-0 flex-1 rounded-md border border-border bg-bg/60 px-1.5 py-1 text-[11px] text-text focus:border-accent/60 focus:outline-none disabled:opacity-60"
        >
          {connections.length === 0 && (
            <option value="">{t("sftp.noSavedConnections")}</option>
          )}
          {connections.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.username}@{item.host}:{item.port}
            </option>
          ))}
        </select>

        {connected ? (
          <>
            <span className="shrink-0 rounded bg-success/20 px-1.5 py-0.5 text-[10px] text-success">
              {t("sftp.statusConnected")}
            </span>
            <button
              type="button"
              onClick={disconnect}
              title={t("sftp.disconnect")}
              aria-label={t("sftp.disconnect")}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-danger"
            >
              <Unplug size={12} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={connect}
            disabled={busy || !connection}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Plug size={11} />}
            {status === "connecting" ? t("sftp.connecting") : t("sftp.connect")}
          </button>
        )}
      </div>

      {error && (
        <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[10px] text-danger">
          {error}
        </p>
      )}

      {/* Paneles */}
      <div className={cx("flex min-h-0 flex-1 gap-2 p-2", wide ? "flex-row" : "flex-col")}>
        <Pane
          kind="local"
          title={t("sftp.paneLocal")}
          subtitle={baseName(localPath) || "~"}
          icon={<HardDrive size={12} className="shrink-0 text-muted" />}
          path={localPath}
          entries={localEntries}
          emptyLabel={t("common.loading")}
          disabled={!localPath}
          isDropTarget={dropTarget === "local"}
          dragging={Boolean(drag) && drag?.from === "remote"}
          refreshing={refreshingLocal}
          onNavigate={(entry) => navigate("local", entry)}
          onUp={() => setLocalPath(parentPath(localPath))}
          onRefresh={() => void refreshLocal(localPath)}
          onMkdir={() => void makeDirectory("local")}
          clasico={!oficina}
          onTransfer={(entry) => transfer("local", entry)}
          onOpenWith={(entry) => setOpenTarget({ kind: "local", entry })}
          onDragStartEntry={(entry) => setDrag({ entry, from: "local" })}
          onDragEndEntry={() => {
            setDrag(null);
            setDropTarget(null);
          }}
          onDragOverPane={handleDragOver("local")}
          onDragLeavePane={() => setDropTarget(null)}
          onDropPane={handleDrop("local")}
        />

        <Pane
          kind="remote"
          title={t("sftp.paneRemote")}
          subtitle={connected ? baseName(remotePath) || "/" : t("sftp.disconnected")}
          icon={<Server size={12} className="shrink-0 text-muted" />}
          path={remotePath}
          entries={remoteEntries}
          emptyLabel={t("sftp.emptyRemote")}
          disabled={!connected}
          isDropTarget={dropTarget === "remote"}
          dragging={Boolean(drag) && drag?.from === "local"}
          refreshing={refreshingRemote}
          onNavigate={(entry) => navigate("remote", entry)}
          onUp={() => setRemotePath(parentPath(remotePath))}
          onRefresh={() => void refreshRemote(remotePath)}
          onMkdir={() => void makeDirectory("remote")}
          onDelete={(entry) => void removeRemote(entry)}
          clasico={!oficina}
          onTransfer={(entry) => transfer("remote", entry)}
          onOpenWith={(entry) => setOpenTarget({ kind: "remote", entry })}
          onDragStartEntry={(entry) => setDrag({ entry, from: "remote" })}
          onDragEndEntry={() => {
            setDrag(null);
            setDropTarget(null);
          }}
          onDragOverPane={handleDragOver("remote")}
          onDragLeavePane={() => setDropTarget(null)}
          onDropPane={handleDrop("remote")}
        />
      </div>

      {/* Con los NPC activos, la cola se ve como una oficina donde un agente
          lleva los archivos de un escritorio al otro. */}
      {oficina ? <PixelOffice /> : <TransferQueue />}

      <CommandLine sessionId={connection && sessionId ? sessionId : null} compacto={!oficina} />

      <EditorPicker
        target={
          openTarget
            ? {
                kind: openTarget.kind,
                path: openTarget.entry.path,
                name: openTarget.entry.name,
              }
            : null
        }
        onClose={() => setOpenTarget(null)}
        onPick={(program) => {
          if (openTarget) void abrirEntrada(openTarget.kind, openTarget.entry, program);
        }}
      />

      <p className="shrink-0 border-t border-border px-2.5 py-1 text-[10px] text-muted">
        {t("sftp.footerHint")}
      </p>
    </div>
  );
}

export default SFTPPanel;
