// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useState } from "react";
import { Cloud, FolderOpen, Server, Code2, HardDrive, Loader2, Plug, Check } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import {
  DESTINOS,
  destinosAbrir,
  destinosCarpetaSugerida,
  destinosEstado,
  destinosGuardar,
  destinosProbar,
  type ConfigDestinos,
  type Destino,
} from "../../lib/destinos";
import { openExternal } from "../../lib/links";
import { useT } from "../../i18n";
import { cx } from "../../lib/utils";

const INPUT =
  "w-full rounded-md border border-border bg-bg/60 px-2 py-1.5 text-[11px] text-text placeholder:text-muted focus:border-accent/60 focus:outline-none";

const BOTON =
  "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] transition-colors";

/** Icono de cada destino. */
const ICONOS: Record<Destino, React.ReactNode> = {
  carpeta: <FolderOpen size={11} />,
  webdav: <Cloud size={11} />,
  sftp: <Server size={11} />,
  github: <Code2 size={11} />,
  google: <HardDrive size={11} />,
};

const VACIA: ConfigDestinos = {
  activo: "carpeta",
  carpeta: "",
  webdav: { url: "", usuario: "", contrasena: "" },
  sftp: { host: "", puerto: 22, usuario: "", contrasena: "", ruta: "" },
};

/**
 * Ajustes → Cuenta → dónde se guarda la copia.
 *
 * La carpeta es la opción más socorrida: si tu nube sincroniza una carpeta,
 * apúntale CloudTerm y ya está, sin que la aplicación sepa nada de ese servicio.
 */
export function DestinationSettings() {
  const t = useT();
  const pushToast = useUiStore((s) => s.pushToast);

  const [config, setConfig] = useState<ConfigDestinos>(VACIA);
  const [cargado, setCargado] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void destinosEstado()
      .then((leida) => {
        if (vivo) setConfig(leida);
      })
      .catch(() => {
        /* fuera de Tauri se queda la vacía */
      })
      .finally(() => {
        if (vivo) setCargado(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Al elegir carpeta por primera vez se propone una ruta sensata.
  useEffect(() => {
    if (!cargado || config.activo !== "carpeta" || config.carpeta) return;
    void destinosCarpetaSugerida()
      .then((sugerida) => setConfig((c) => (c.carpeta ? c : { ...c, carpeta: sugerida })))
      .catch(() => {
        /* sin sugerencia, se escribe a mano */
      });
  }, [cargado, config.activo, config.carpeta]);

  const cambiar = (parcial: Partial<ConfigDestinos>) =>
    setConfig((c) => ({ ...c, ...parcial }));

  const guardar = async () => {
    setResultado(null);
    try {
      const guardada = await destinosGuardar(config);
      setConfig(guardada);
      pushToast("success", t("destinos.saved"), t(`destinos.kind.${guardada.activo}`));
      return true;
    } catch (err) {
      pushToast("error", t("destinos.saveFailed"), String(err));
      return false;
    }
  };

  const probar = async () => {
    setProbando(true);
    setResultado(null);
    try {
      const donde = await destinosProbar(config);
      setResultado(donde);
      pushToast("success", t("destinos.testOk"), donde);
    } catch (err) {
      const texto = String(err);
      setResultado(texto);
      pushToast("error", t("destinos.testFailed"), texto);
    } finally {
      setProbando(false);
    }
  };

  const abrirCarpeta = async () => {
    try {
      const ruta = await destinosAbrir(config);
      await openExternal(`file://${ruta}`);
    } catch (err) {
      pushToast("error", t("destinos.openFailed"), String(err));
    }
  };

  const conSesion = config.activo === "github" || config.activo === "google";

  return (
    <section className="mt-2 border-t border-border">
      <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <Cloud size={11} /> {t("destinos.title")}
      </h3>

      <p className="py-1.5 text-[10px] leading-relaxed text-muted">{t("destinos.intro")}</p>

      <div className="flex flex-wrap gap-1.5 pb-2">
        {DESTINOS.map((destino) => (
          <button
            key={destino}
            type="button"
            onClick={() => cambiar({ activo: destino })}
            className={cx(
              BOTON,
              config.activo === destino
                ? "border-accent bg-accent/15 text-text"
                : "border-border text-muted hover:text-text",
            )}
          >
            {ICONOS[destino]}
            {t(`destinos.kind.${destino}`)}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 pb-2">
        <p className="text-[10px] leading-relaxed text-muted">
          {t(`destinos.hint.${config.activo}`)}
        </p>

        {config.activo === "carpeta" && (
          <>
            <input
              value={config.carpeta}
              onChange={(e) => cambiar({ carpeta: e.target.value })}
              placeholder="/home/tu-usuario/Dropbox/CloudTerm"
              className={cx(INPUT, "font-mono")}
            />
            <button
              type="button"
              onClick={() => void abrirCarpeta()}
              className={cx(BOTON, "text-muted hover:text-text")}
            >
              <FolderOpen size={11} /> {t("destinos.openFolder")}
            </button>
          </>
        )}

        {config.activo === "webdav" && (
          <>
            <input
              value={config.webdav.url}
              onChange={(e) => cambiar({ webdav: { ...config.webdav, url: e.target.value } })}
              placeholder="https://nube.example.com/remote.php/dav/files/usuario"
              className={cx(INPUT, "font-mono")}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <input
                value={config.webdav.usuario}
                onChange={(e) =>
                  cambiar({ webdav: { ...config.webdav, usuario: e.target.value } })
                }
                placeholder={t("common.user")}
                className={INPUT}
              />
              <input
                type="password"
                value={config.webdav.contrasena}
                onChange={(e) =>
                  cambiar({ webdav: { ...config.webdav, contrasena: e.target.value } })
                }
                placeholder={t("common.password")}
                className={INPUT}
              />
            </div>
          </>
        )}

        {config.activo === "sftp" && (
          <>
            <div className="grid grid-cols-[1fr_5rem] gap-1.5">
              <input
                value={config.sftp.host}
                onChange={(e) => cambiar({ sftp: { ...config.sftp, host: e.target.value } })}
                placeholder="servidor.example.com"
                className={INPUT}
              />
              <input
                value={String(config.sftp.puerto)}
                onChange={(e) =>
                  cambiar({
                    sftp: { ...config.sftp, puerto: Number(e.target.value.replace(/\D/g, "")) || 22 },
                  })
                }
                inputMode="numeric"
                className={INPUT}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                value={config.sftp.usuario}
                onChange={(e) => cambiar({ sftp: { ...config.sftp, usuario: e.target.value } })}
                placeholder={t("common.user")}
                className={INPUT}
              />
              <input
                type="password"
                value={config.sftp.contrasena}
                onChange={(e) => cambiar({ sftp: { ...config.sftp, contrasena: e.target.value } })}
                placeholder={t("common.password")}
                className={INPUT}
              />
            </div>
            <input
              value={config.sftp.ruta}
              onChange={(e) => cambiar({ sftp: { ...config.sftp, ruta: e.target.value } })}
              placeholder={t("destinos.sftpPathPlaceholder")}
              className={cx(INPUT, "font-mono")}
            />
          </>
        )}

        {conSesion && <p className="text-[10px] text-muted">{t("destinos.sessionNeeded")}</p>}

        {resultado && (
          <p className="truncate font-mono text-[9px] text-muted" title={resultado}>
            {resultado}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void guardar()}
            className={cx(BOTON, "border-accent/50 bg-accent/10 text-text")}
          >
            <Check size={11} /> {t("common.save")}
          </button>

          {/* Los destinos con cuenta se comprueban al iniciar sesión. */}
          {!conSesion && (
            <button
              type="button"
              disabled={probando}
              onClick={() => void probar()}
              className={cx(BOTON, "text-muted hover:text-text", probando && "opacity-40")}
            >
              {probando ? <Loader2 size={11} className="animate-spin" /> : <Plug size={11} />}
              {t("destinos.test")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default DestinationSettings;
