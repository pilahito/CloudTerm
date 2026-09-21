// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useRef, useState } from "react";
import {
  Minus,
  Square,
  Copy,
  X,
  PanelLeft,
  Search,
  SlidersHorizontal,
  Info,
  Bell,
  User,
  Command,
} from "lucide-react";
import { useUiStore, type ViewId } from "../../stores/uiStore";
import { useTabStore } from "../../stores/tabStore";
import { usePlatform } from "../../hooks/usePlatform";
import { useWindowControls } from "../../hooks/useWindowControls";
import { DonateButton } from "../Donate";
import { AccountButton } from "../Account";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

interface MenuItem {
  label?: string;
  hint?: string;
  separator?: boolean;
  run?: () => void;
}

/* -------------------------------------------------------------------------- */
/* Controles de ventana                                                       */
/* -------------------------------------------------------------------------- */

/** macOS: semáforos a la izquierda, con el glifo visible solo al pasar el ratón. */
function MacTrafficLights({
  onClose,
  onMinimize,
  onToggleMaximize,
}: {
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}) {
  const t = useT();
  const dot =
    "group/light grid h-3 w-3 place-items-center rounded-full transition-transform active:scale-90";
  const glyph = "text-black/55 opacity-0 transition-opacity group-hover/light:opacity-100";

  return (
    <div className="flex shrink-0 items-center gap-2 pl-3 pr-2">
      <button type="button" aria-label={t("common.close")} title={t("common.close")} onClick={onClose} className={cx(dot, "bg-[#ff5f57]")}>
        <X size={7} strokeWidth={3} className={glyph} />
      </button>
      <button type="button" aria-label={t("titlebar.minimize")} title={t("titlebar.minimize")} onClick={onMinimize} className={cx(dot, "bg-[#febc2e]")}>
        <Minus size={7} strokeWidth={3} className={glyph} />
      </button>
      <button
        type="button"
        aria-label={t("titlebar.maximize")}
        title={t("titlebar.maximize")}
        onClick={onToggleMaximize}
        className={cx(dot, "bg-[#28c840]")}
      >
        <Square size={5} strokeWidth={3} className={glyph} />
      </button>
    </div>
  );
}

/** Windows / Linux: botones a la derecha. */
function DesktopControls({
  variant,
  maximized,
  onClose,
  onMinimize,
  onToggleMaximize,
}: {
  variant: "windows" | "linux";
  maximized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}) {
  const t = useT();
  const win = variant === "windows";
  const base = win
    ? "grid h-10 w-[46px] place-items-center text-muted transition-colors"
    : "grid h-6 w-9 place-items-center rounded text-muted transition-colors";

  return (
    <div className="flex h-full shrink-0 items-center">
      <button type="button" title={t("titlebar.minimize")} aria-label={t("titlebar.minimize")} onClick={onMinimize} className={cx(base, "hover:bg-elevated hover:text-text")}>
        <Minus size={14} />
      </button>
      <button
        type="button"
        title={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
        aria-label={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
        onClick={onToggleMaximize}
        className={cx(base, "hover:bg-elevated hover:text-text")}
      >
        {maximized ? <Copy size={11} /> : <Square size={10} />}
      </button>
      <button
        type="button"
        title={t("common.close")}
        aria-label={t("common.close")}
        onClick={onClose}
        className={cx(base, win ? "hover:bg-[#e81123] hover:text-white" : "hover:bg-danger hover:text-white")}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Barra de título                                                            */
/* -------------------------------------------------------------------------- */

export function TitleBar() {
  const t = useT();
  const { os, isMac, isWindows, modKey, modJoin } = usePlatform();
  const { maximized, minimize, toggleMaximize, close } = useWindowControls();

  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  const setDonateOpen = useUiStore((s) => s.setDonateOpen);
  const setUpdateOpen = useUiStore((s) => s.setUpdateOpen);
  const setTourOpen = useUiStore((s) => s.setTourOpen);
  const setImportOpen = useUiStore((s) => s.setImportOpen);
  const setNewHostOpen = useUiStore((s) => s.setNewHostOpen);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const toasts = useUiStore((s) => s.toasts);

  const openTab = useTabStore((s) => s.openTab);
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId));

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLElement | null>(null);

  // Cierra el menú al hacer clic fuera o pulsar Escape.
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const go = (view: ViewId) => () => setActiveView(view);

  const MENUS: Array<{ id: string; label: string; items: MenuItem[] }> = [
    {
      id: "archivo",
      label: t("titlebar.menu.file"),
      items: [
        {
          label: t("titlebar.newTerminal"),
          hint: `${modKey}${modJoin}T`,
          run: () => {
            openTab({ kind: "terminal" });
            setActiveView("terminal");
          },
        },
        { label: t("titlebar.newHost"), run: () => setNewHostOpen(true) },
        { label: t("titlebar.importSshConfig"), run: () => setImportOpen(true) },
        { separator: true },
        { label: t("titlebar.commandPalette"), hint: `${modKey}${modJoin}K`, run: () => setPaletteOpen(true) },
        { separator: true },
        { label: t("titlebar.quit"), run: close },
      ],
    },
    {
      id: "editar",
      label: t("titlebar.menu.edit"),
      items: [
        { label: t("titlebar.settings"), hint: `${modKey}${modJoin},`, run: () => setSettingsOpen(true) },
        {
          label: t("titlebar.clearNotifications"),
          run: () => useUiStore.setState({ toasts: [] }),
        },
      ],
    },
    {
      id: "ver",
      label: t("titlebar.menu.view"),
      items: [
        { label: t("view.welcome"), run: go("welcome") },
        { label: t("view.terminal"), run: go("terminal") },
        { label: t("view.files"), run: go("files") },
        { label: t("view.pixel"), run: go("pixel") },
        { separator: true },
        { label: t("titlebar.toggleSidebar"), hint: `${modKey}${modJoin}B`, run: () => toggleSidebar() },
      ],
    },
    {
      id: "ayuda",
      label: t("titlebar.menu.help"),
      items: [
        { label: t("tour.replay"), run: () => setTourOpen(true) },
        { label: t("update.check"), run: () => setUpdateOpen(true) },
        { label: t("titlebar.about"), run: () => setAboutOpen(true) },
        { label: t("titlebar.supportProject"), run: () => setDonateOpen(true) },
      ],
    },
  ];

  const controls =
    os === "macos" ? (
      <MacTrafficLights onClose={close} onMinimize={minimize} onToggleMaximize={toggleMaximize} />
    ) : (
      <DesktopControls
        variant={os === "windows" ? "windows" : "linux"}
        maximized={maximized}
        onClose={close}
        onMinimize={minimize}
        onToggleMaximize={toggleMaximize}
      />
    );

  const iconButton =
    "grid h-6 w-6 place-items-center rounded text-muted transition-colors hover:bg-elevated hover:text-text";

  return (
    <header
      ref={barRef}
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, input, a, [role='menu']")) return;
        void toggleMaximize();
      }}
      className={cx(
        "relative z-30 flex shrink-0 items-center gap-1 border-b border-border bg-surface",
        isWindows ? "h-10" : "h-9",
        isMac ? "pl-0 pr-2" : "pl-2 pr-0",
      )}
    >
      {isMac && controls}

      {!isMac && (
        <div className="flex h-full shrink-0 items-center gap-1.5 pl-1 pr-2" data-tauri-drag-region>
          <div className="grid h-5 w-5 place-items-center rounded bg-accent text-[10px] font-bold text-accentfg">
            CT
          </div>
        </div>
      )}

      {/* Barra de menús */}
      <nav className="flex shrink-0 items-center">
        {MENUS.map((menu) => (
          <div key={menu.id} className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((current) => (current === menu.id ? null : menu.id))}
              onMouseEnter={() => openMenu && setOpenMenu(menu.id)}
              className={cx(
                "rounded px-2 py-1 text-[11px] transition-colors",
                openMenu === menu.id ? "bg-elevated text-text" : "text-muted hover:text-text",
              )}
            >
              {menu.label}
            </button>

            {openMenu === menu.id && (
              <div
                role="menu"
                className="absolute left-0 top-full z-50 mt-1 min-w-56 rounded-lg border border-border bg-elevated py-1 shadow-2xl"
              >
                {menu.items.map((item, index) =>
                  item.separator ? (
                    <div key={`sep-${index}`} className="my-1 h-px bg-border" />
                  ) : (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenu(null);
                        item.run?.();
                      }}
                      className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-[11px] text-muted transition-colors hover:bg-accent/15 hover:text-text"
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint && <span className="shrink-0 text-[10px] text-muted">{item.hint}</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Zonas de arrastre: el header entero no puede ser drag-region en Windows
          o los clics de menú y botones se comen. */}
      <div data-tauri-drag-region className="h-full min-w-2 flex-1" />

      {/* Buscador central */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-6 w-full max-w-md items-center gap-2 rounded-md border border-border bg-bg/60 px-2.5 text-left text-[11px] text-muted transition-colors hover:border-accent/60 hover:text-text"
      >
        <Search size={12} className="shrink-0" />
        <span className="flex-1 truncate">
          {activeTab
            ? t("titlebar.searchWithTab", { title: activeTab.title })
            : t("titlebar.search")}
        </span>
        <kbd className="shrink-0 rounded border border-border px-1 py-0.5 text-[9px]">
          {modKey}
          {modJoin}K
        </kbd>
      </button>

      <div data-tauri-drag-region className="h-full min-w-2 flex-1" />

      {/* Acciones de la derecha */}
      <div data-tour="titlebar-actions" className="flex h-full shrink-0 items-center gap-0.5">
        <span className={cx(iconButton, "relative")} title={t("titlebar.notifications", { count: toasts.length })}>
          <Bell size={13} />
          {toasts.length > 0 && (
            <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-danger" />
          )}
        </span>

        <button type="button" title={t("titlebar.commandPalette")} aria-label={t("titlebar.commandPalette")} onClick={() => setPaletteOpen(true)} className={iconButton}>
          <Command size={13} />
        </button>

        {/* La cuenta va antes que el donativo: es lo que se busca cuando no
            encuentras dónde iniciar sesión. */}
        <AccountButton className="h-6" />

        <DonateButton className="h-6 w-6" />

        <button type="button" title={t("titlebar.settings")} aria-label={t("titlebar.settings")} onClick={() => setSettingsOpen(true)} className={iconButton}>
          <SlidersHorizontal size={13} />
        </button>

        <button type="button" title={t("titlebar.about")} aria-label={t("titlebar.about")} onClick={() => setAboutOpen(true)} className={iconButton}>
          <Info size={13} />
        </button>

        <button
          type="button"
          title={sidebarOpen ? t("titlebar.hideSidebar") : t("titlebar.showSidebar")}
          aria-label={t("titlebar.toggleSidebar")}
          onClick={() => toggleSidebar()}
          className={iconButton}
        >
          <PanelLeft size={13} />
        </button>

        <span className="ml-1 grid h-5 w-5 place-items-center rounded-full bg-accent/20 text-accent" title={t("titlebar.localSession")}>
          <User size={12} />
        </span>

        {!isMac && <div className="mx-1 h-4 w-px bg-border" />}
        {!isMac && controls}
      </div>
    </header>
  );
}

export default TitleBar;
