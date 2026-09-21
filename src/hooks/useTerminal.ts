// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import { useSshStore } from "../stores/sshStore";
import { useTabStore } from "../stores/tabStore";
import { useConnectionStore } from "../stores/connectionStore";
import { t } from "../i18n";
import { guessOs } from "../lib/platform";
import type { Connection, TabStatus } from "../types";
import {
  describeSshError,
  isCredentialError,
  isHandshakeTimeout,
  loadSecret,
  onSshData,
  onSshStatus,
  secretKey,
  sshConnect,
  sshDisconnect,
  sshResize,
  sshWrite,
  type SshAuthSpec,
} from "../lib/ssh";
import { onPtyData, onPtyStatus, ptyClose, ptyOpen, ptyResize, ptyWrite } from "../lib/pty";

/** Lee la paleta de terminal del tema activo desde las variables CSS. */
function readTerminalTheme(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--ct-term-bg", "#0b0f18"),
    foreground: v("--ct-term-fg", "#dbe4f3"),
    cursor: v("--ct-term-cursor", "#58a6ff"),
    cursorAccent: v("--ct-term-bg", "#0b0f18"),
    selectionBackground: v("--ct-term-selection", "#1f3350"),
    black: v("--ct-term-black", "#12161f"),
    red: v("--ct-term-red", "#f85149"),
    green: v("--ct-term-green", "#3fb950"),
    yellow: v("--ct-term-yellow", "#d29922"),
    blue: v("--ct-term-blue", "#58a6ff"),
    magenta: v("--ct-term-magenta", "#bc8cff"),
    cyan: v("--ct-term-cyan", "#39c5cf"),
    white: v("--ct-term-white", "#b1bac4"),
    brightBlack: v("--ct-term-bright-black", "#3d444d"),
    brightRed: v("--ct-term-bright-red", "#ff7b72"),
    brightGreen: v("--ct-term-bright-green", "#56d364"),
    brightYellow: v("--ct-term-bright-yellow", "#e3b341"),
    brightBlue: v("--ct-term-bright-blue", "#79c0ff"),
    brightMagenta: v("--ct-term-bright-magenta", "#d2a8ff"),
    brightCyan: v("--ct-term-bright-cyan", "#56d4dd"),
    brightWhite: v("--ct-term-bright-white", "#f0f6fc"),
  };
}

function banner(term: Terminal, label: string) {
  const accent = "\x1b[38;2;0;229;255m";
  const dim = "\x1b[38;2;122;127;168m";
  const reset = "\x1b[0m";

  term.writeln(`${accent}  ██████╗██╗      ██████╗ ██╗   ██╗██████╗ ████████╗███████╗██████╗ ███╗   ███╗${reset}`);
  term.writeln(`${accent} ██╔════╝██║     ██╔═══██╗██║   ██║██╔══██╗╚══██╔══╝██╔════╝██╔══██╗████╗ ████║${reset}`);
  term.writeln(`${accent} ██║     ██║     ██║   ██║██║   ██║██║  ██║   ██║   █████╗  ██████╔╝██╔████╔██║${reset}`);
  term.writeln(`${accent} ██║     ██║     ██║   ██║██║   ██║██║  ██║   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║${reset}`);
  term.writeln(`${accent} ╚██████╗███████╗╚██████╔╝╚██████╔╝██████╔╝   ██║   ███████╗██║  ██║██║ ╚═╝ ██║${reset}`);
  term.writeln(`${accent}  ╚═════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝    ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝${reset}`);
  term.writeln("");
  term.writeln(`${dim}  CloudTerm 1.0.0 — ${label}${reset}`);
  term.writeln(`${dim}  ${t("terminal.demoSession")}${reset}`);
  term.writeln(`${dim}  ${t("terminal.bannerConnect")} \x1b[0mssh usuario@host${reset}`);
  term.writeln(
    `${dim}  ${t("terminal.bannerHostsHint")} \x1b[0mhosts${dim} ${t("terminal.bannerHelpHint")} \x1b[0mhelp${reset}`,
  );
  term.writeln("");
}

export interface UseTerminalOptions {
  /** Identificador de la pestaña; se usa como id de sesión SSH. */
  sessionId: string;
  label?: string;
  /** Si viene, la pestaña abre una sesión SSH real en lugar del shell local. */
  connection?: Connection;
}

/**
 * Monta una instancia de xterm.js en `hostRef`.
 *
 * Dos modos:
 *
 * * **SSH** (`connection` presente): los bytes que llegan por el evento
 *   `ssh://data` se escriben en el terminal como `Uint8Array`, de modo que
 *   xterm.js decodifica UTF-8 respetando los caracteres multibyte partidos
 *   entre fragmentos. La entrada del usuario viaja a `ssh_write` y los cambios
 *   de tamaño a `ssh_resize`.
 * * **Local** (sin `connection`): PTY real (PowerShell / `$SHELL`). Si el
 *   sistema no puede abrirlo, cae a un intérprete mínimo de demostración.
 */
export function useTerminal(
  hostRef: React.RefObject<HTMLDivElement | null>,
  options: UseTerminalOptions,
) {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // La configuración de la conexión se lee en el momento de conectar; así el
  // efecto no se reejecuta cada vez que el store la reemplaza.
  const connectionRef = useRef(options.connection);
  connectionRef.current = options.connection;

  const sessionId = options.sessionId;
  const connectionId = options.connection?.id ?? null;
  const label = options.label ?? t("terminal.localShell");

  const fontSize = useSettingsStore((s) => s.settings.fontSize);
  const fontFamily = useSettingsStore((s) => s.settings.fontFamily);
  const cursorBlink = useSettingsStore((s) => s.settings.cursorBlink);
  const scrollback = useSettingsStore((s) => s.settings.scrollback);
  const theme = useSettingsStore((s) => s.settings.theme);
  const pushToast = useUiStore((s) => s.pushToast);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const connection = connectionRef.current;
    let disposed = false;
    const disposers: Array<() => void> = [];

    const term = new Terminal({
      fontFamily,
      fontSize,
      cursorBlink,
      scrollback,
      allowProposedApi: true,
      convertEol: false,
      // Solo el shell local de demostración: una sesión SSH es POSIX.
      windowsMode: !connection && guessOs() === "windows",
      theme: readTerminalTheme(),
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;

    const raf = requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        /* el contenedor aún no es medible */
      }
    });

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* estados transitorios de layout */
      }
      if (connection) {
        void sshResize(sessionId, term.cols, term.rows).catch(() => {
          /* la sesión puede no estar lista todavía */
        });
      } else {
        void ptyResize(sessionId, term.cols, term.rows).catch(() => {
          /* el PTY puede no estar listo todavía */
        });
      }
    });
    observer.observe(host);

    /* ------------------------------------------------------------------ */
    /* Modo SSH                                                            */
    /* ------------------------------------------------------------------ */
    if (connection) {
      const setStatus = (status: TabStatus, message?: string) => {
        useSshStore.getState().setStatus(sessionId, status, message);
        useTabStore.getState().setTabStatus(sessionId, status, message);
      };

      setStatus("connecting");
      term.writeln(`\x1b[38;2;122;127;168m${t("terminal.connectingTo", { label })}\x1b[0m`);

      void (async () => {
        const [stopData, stopStatus] = await Promise.all([
          onSshData((payload) => {
            if (payload.sessionId !== sessionId) return;
            term.write(new Uint8Array(payload.data));
          }),
          onSshStatus((payload) => {
            if (payload.sessionId !== sessionId) return;
            setStatus(payload.status, payload.message ?? undefined);
            if (payload.status === "closed") {
              term.writeln(`\r\n\x1b[38;2;122;127;168m${t("terminal.sessionClosed")}\x1b[0m`);
            }
          }),
        ]);

        if (disposed) {
          stopData?.();
          stopStatus?.();
          return;
        }
        if (stopData) disposers.push(stopData);
        if (stopStatus) disposers.push(stopStatus);

        // Credenciales iniciales: lo guardado en el llavero, o el modal.
        const key = secretKey(connection);
        const stored = await loadSecret(key);
        let auth: SshAuthSpec | null = null;

        if (connection.authMethod === "key") {
          auth = {
            kind: "key",
            keyPath: connection.privateKeyPath || null,
            passphrase: stored,
          };
        } else if (stored) {
          auth = { kind: "password", password: stored };
        }

        let lastError = "";
        // Un corte por tiempo de espera antes de autenticar se reintenta una
        // sola vez: el primer intento suele calentar la caché DNS del servidor
        // y el segundo conecta al instante.
        let timedOut = false;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (disposed) return;

          if (!auth) {
            auth = await useSshStore
              .getState()
              .requestCredentials(sessionId, connection, lastError || undefined);
            if (!auth) {
              term.writeln(`\r\n\x1b[33m${t("terminal.connectionCancelled")}\x1b[0m`);
              setStatus("closed");
              return;
            }
          }

          // Aviso si el servidor tarda: hay servidores que se quedan decenas de
          // segundos antes de atender el inicio de sesión, y sin decir nada
          // parece que la aplicación se ha colgado.
          let aviso = 0;

          try {
            if (attempt === 0) {
              term.writeln(
                `\x1b[90m${t("terminal.connectingToTarget", {
                  target: `${connection.host}:${connection.port}`,
                })}\x1b[0m`,
              );
            }
            aviso = window.setTimeout(() => {
              term.writeln(`\x1b[90m  ${t("terminal.serverSlow")}\x1b[0m`);
            }, 8_000);

            await sshConnect({
              sessionId,
              host: connection.host,
              port: connection.port,
              username: connection.username,
              auth,
              term: "xterm-256color",
              cols: term.cols,
              rows: term.rows,
              timeoutMs: connection.timeoutMs ?? 60_000,
            });
            return;
          } catch (err) {
            const raw = String(err);
            lastError = describeSshError(raw);

            // Se reintenta con las mismas credenciales: el fallo fue de red.
            if (isHandshakeTimeout(raw) && !timedOut) {
              timedOut = true;
              term.writeln(`\r\n\x1b[33m${t("terminal.serverTimeoutRetrying")}\x1b[0m`);
              continue;
            }

            if (!isCredentialError(raw)) {
              term.writeln(`\r\n\x1b[31m${lastError}\x1b[0m`);
              pushToast("error", t("terminal.connectFailed", { host: connection.host }), lastError);
              return;
            }

            // Credenciales inválidas: se descartan y se vuelve a preguntar.
            auth = null;
          } finally {
            window.clearTimeout(aviso);
          }
        }

        term.writeln(`\r\n\x1b[31m${t("terminal.tooManyAttempts")}\x1b[0m`);
      })();

      const inputSub = term.onData((data) => {
        void sshWrite(sessionId, new TextEncoder().encode(data)).catch(() => {
          /* sesión cerrada */
        });
      });
      disposers.push(() => inputSub.dispose());
    } else {
      /* ---------------------------------------------------------------- */
      /* Modo local: PTY real, demostración si el sistema no puede abrirlo */
      /* ---------------------------------------------------------------- */
      const startDemo = () => {
      banner(term, label);

      let buffer = "";
      const prompt = () => {
        term.write(`\x1b[38;2;40;200;120m❯\x1b[0m `);
      };
      prompt();

      /**
       * `ssh [usuario@]host [-p puerto]` desde el shell local.
       *
       * Es lo primero que teclea cualquiera en un cliente de terminal, así que
       * en vez de responder «command not found» se busca el host entre los
       * guardados (o se guarda si es nuevo) y **esta misma pestaña** pasa a ser
       * la sesión SSH.
       */
      const sshFromShell = async (args: string[]) => {
        let port: number | null = null;
        let target = "";

        for (let index = 0; index < args.length; index += 1) {
          const arg = args[index];
          if (arg === "-p" || arg === "--port") {
            const value = Number(args[index + 1]);
            if (Number.isFinite(value) && value > 0 && value < 65536) port = value;
            else
              term.writeln(
                `\x1b[33m${t("terminal.invalidPort", { value: args[index + 1] ?? "" })}\x1b[0m`,
              );
            index += 1;
            continue;
          }
          // Se ignoran otras opciones (-i, -o, -v…) en lugar de fallar.
          if (arg.startsWith("-")) continue;
          if (!target) target = arg;
        }

        if (!target) {
          term.writeln(t("terminal.usageSsh"));
          term.writeln(`     ${t("terminal.usageHosts")}`);
          return;
        }

        const at = target.lastIndexOf("@");
        const user = at > 0 ? target.slice(0, at) : "";
        const host = at > 0 ? target.slice(at + 1) : target;
        if (!host) {
          term.writeln(`\x1b[31m${t("terminal.emptyHost")}\x1b[0m`);
          return;
        }

        const store = useConnectionStore.getState();
        let connection =
          store.connections.find((c) => c.host === host && c.port === port) ??
          store.connections.find((c) => c.host === host);

        if (connection && port !== null && connection.port !== port) {
          term.writeln(
            `\x1b[33m${t("terminal.portNote", {
              name: connection.name,
              port: connection.port,
            })}\x1b[0m`,
          );
        }

        if (!connection) {
          const created = await store.addConnection({
            name: host,
            host,
            port: port ?? 22,
            username: user,
            protocol: "ssh",
          });
          if (!created) {
            term.writeln(`\x1b[31m${t("terminal.saveHostFailed")}\x1b[0m`);
            return;
          }
          connection = created;
          const endpoint = `${user ? `${user}@` : ""}${host}:${connection.port}`;
          term.writeln(
            `\x1b[38;2;108;124;148m${t("terminal.newHostSaved", { endpoint })}\x1b[0m`,
          );
          void store.refreshStatuses();
        } else if (user && user !== connection.username) {
          // El usuario escrito a mano manda para esta conexión.
          void store.updateConnection(connection.id, { username: user });
          connection = { ...connection, username: user };
        }

        const label = `${connection.username ? `${connection.username}@` : ""}${connection.host}:${connection.port}`;
        term.writeln(`\x1b[38;2;34;211;238m${t("terminal.connectingToTarget", { target: label })}\x1b[0m`);

        // Se aplaza: cambiar el estado aquí dentro desmontaría este terminal
        // mientras se ejecuta su propio manejador de `onData`.
        const tabId = sessionId;
        const targetConnectionId = connection.id;
        const targetTitle = connection.name;
        window.setTimeout(() => {
          useTabStore.getState().setTabConnection(tabId, targetConnectionId, targetTitle);
          useUiStore.getState().setActiveView("terminal");
        }, 60);
      };

      const runLocalCommand = (raw: string) => {
        const line = raw.trim();
        if (!line) return;
        const [cmd, ...args] = line.split(/\s+/);
        switch (cmd) {
          case "help":
            term.writeln(t("terminal.helpTitle"));
            term.writeln(`  ${t("terminal.helpSsh")}`);
            term.writeln(`  ${t("terminal.helpHosts")}`);
            term.writeln(`  ${t("terminal.helpHelp")}`);
            term.writeln(`  ${t("terminal.helpClear")}`);
            term.writeln(`  ${t("terminal.helpEcho")}`);
            term.writeln(`  ${t("terminal.helpDate")}`);
            term.writeln(`  ${t("terminal.helpWhoami")}`);
            term.writeln(`  ${t("terminal.helpTheme")}`);
            term.writeln(`  ${t("terminal.helpOpen")}`);
            term.writeln("");
            term.writeln(`\x1b[38;2;108;124;148m${t("terminal.helpSftp")}\x1b[0m`);
            break;
          case "ssh":
            void sshFromShell(args);
            break;
          case "hosts": {
            const list = useConnectionStore.getState().connections;
            if (list.length === 0) {
              term.writeln(t("terminal.noHosts"));
              term.writeln(t("terminal.noHostsHint"));
              break;
            }
            term.writeln(t("terminal.savedHostsCount", { count: list.length }));
            for (const item of list) {
              const endpoint = `${item.username ? `${item.username}@` : ""}${item.host}:${item.port}`;
              term.writeln(`  ${item.name.padEnd(20)} ${endpoint.padEnd(28)} [${item.protocol}]`);
            }
            break;
          }
          case "sftp":
            term.writeln(t("terminal.sftpHint"));
            break;
          case "clear":
            term.clear();
            break;
          case "echo":
            term.writeln(args.join(" "));
            break;
          case "date":
            term.writeln(new Date().toString());
            break;
          case "whoami":
            term.writeln("cloudterm");
            break;
          case "theme": {
            const name = args[0] as never;
            if (["neon", "midnight", "dracula", "nord", "solarized", "daylight"].includes(args[0])) {
              useSettingsStore.getState().setTheme(name);
              term.writeln(t("terminal.themeChanged", { name: args[0] }));
            } else {
              term.writeln(t("terminal.themeUnknown", { name: args[0] ?? t("terminal.emptyValue") }));
            }
            break;
          }
          case "open": {
            const target = args.join(" ");
            if (!target) {
              term.writeln(t("terminal.usageOpen"));
              break;
            }
            import("@tauri-apps/plugin-shell")
              .then(({ open }) => open(target))
              .then(() => term.writeln(t("terminal.opening", { target })))
              .catch((err: unknown) => {
                term.writeln(`\x1b[31m${t("terminal.openFailed", { error: String(err) })}\x1b[0m`);
                pushToast("error", t("terminal.openFailedTitle"), String(err));
              });
            break;
          }
          default:
            term.writeln(`\x1b[31m${t("terminal.commandNotFound", { cmd })}\x1b[0m`);
        }
      };

      const inputSub = term.onData((data) => {
        switch (data) {
          case "\r":
            term.write("\r\n");
            runLocalCommand(buffer);
            buffer = "";
            prompt();
            break;
          case "\u007F":
            if (buffer.length > 0) {
              buffer = buffer.slice(0, -1);
              term.write("\b \b");
            }
            break;
          case "\u0003":
            term.write("^C\r\n");
            buffer = "";
            prompt();
            break;
          case "\u000C":
            term.clear();
            break;
          default:
            if (data >= " ") {
              buffer += data;
              term.write(data);
            }
        }
      });
      disposers.push(() => inputSub.dispose());
      };

      void (async () => {
        try {
          const [stopData, stopStatus] = await Promise.all([
            onPtyData((payload) => {
              if (payload.sessionId !== sessionId) return;
              term.write(new Uint8Array(payload.data));
            }),
            onPtyStatus((payload) => {
              if (payload.sessionId !== sessionId) return;
              if (payload.status === "closed") {
                term.writeln(`\r\n\x1b[38;2;122;127;168m${t("terminal.sessionClosed")}\x1b[0m`);
              }
            }),
          ]);
          if (disposed) {
            stopData?.();
            stopStatus?.();
            return;
          }
          if (stopData) disposers.push(stopData);
          if (stopStatus) disposers.push(stopStatus);

          await ptyOpen({ sessionId, cols: term.cols, rows: term.rows });
          if (disposed) {
            void ptyClose(sessionId).catch(() => undefined);
            return;
          }

          const inputSub = term.onData((data) => {
            void ptyWrite(sessionId, new TextEncoder().encode(data)).catch(() => {
              /* PTY cerrado */
            });
          });
          disposers.push(() => inputSub.dispose());
        } catch {
          startDemo();
        }
      })();
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      disposers.forEach((dispose) => dispose());
      if (connection) {
        void sshDisconnect(sessionId).catch(() => {
          /* ya estaba cerrada */
        });
      } else {
        void ptyClose(sessionId).catch(() => {
          /* no había PTY */
        });
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // Solo se reconecta si cambia la pestaña o la conexión asociada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, connectionId]);

  // Actualiza las opciones del terminal sin destruir la sesión.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    term.options.fontFamily = fontFamily;
    term.options.cursorBlink = cursorBlink;
    term.options.scrollback = scrollback;
    term.options.theme = readTerminalTheme();
  }, [fontSize, fontFamily, cursorBlink, scrollback, theme]);

  return { termRef, fitRef };
}
