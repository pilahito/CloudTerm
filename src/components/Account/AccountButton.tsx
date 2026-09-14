import { useEffect } from "react";
import { UserRound } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useUiStore } from "../../stores/uiStore";
import { useT } from "../../i18n";
import { cx } from "../../lib/utils";

/**
 * Acceso a la cuenta desde la barra de título.
 *
 * Existe porque la sección de Cuenta vive dentro de Ajustes y era fácil no
 * encontrarla nunca. Con esto, si no hay sesión se ve un botón que lo dice, y si
 * la hay se ve el avatar: en los dos casos, un clic lleva al sitio.
 */
export function AccountButton({ className }: { className?: string }) {
  const t = useT();
  const account = useAuthStore((s) => s.account);
  const loaded = useAuthStore((s) => s.loaded);
  const load = useAuthStore((s) => s.load);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  useEffect(() => {
    void load();
  }, [load]);

  const etiqueta = account
    ? t("account.signedInAs", { name: account.email || account.name })
    : t("account.signIn");

  return (
    <button
      type="button"
      title={etiqueta}
      aria-label={etiqueta}
      onClick={() => setSettingsOpen(true)}
      className={cx(
        "flex items-center gap-1.5 rounded px-1.5 transition-colors hover:bg-elevated",
        account ? "text-text" : "text-muted hover:text-text",
        className,
      )}
    >
      {account?.avatarUrl ? (
        <img
          src={account.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-4 w-4 shrink-0 rounded-full"
        />
      ) : loaded && !account ? (
        <>
          <UserRound size={12} className="shrink-0" />
          <span className="hidden text-[10px] sm:inline">{t("account.signInShort")}</span>
        </>
      ) : (
        <UserRound size={12} className="shrink-0" />
      )}
    </button>
  );
}

export default AccountButton;
