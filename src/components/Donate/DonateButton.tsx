import { Heart } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

/**
 * Botón compacto para la barra de título. Abre el modal de donativos.
 * Se pinta en rojo suave para distinguirlo de las acciones neutras.
 */
export function DonateButton({ className }: { className?: string }) {
  const t = useT();
  const setDonateOpen = useUiStore((s) => s.setDonateOpen);

  return (
    <button
      type="button"
      title={t("donate.supportCloudTerm")}
      aria-label={t("donate.supportCloudTerm")}
      onClick={() => setDonateOpen(true)}
      className={cx(
        "grid h-7 w-7 place-items-center rounded-md text-danger/80 transition-colors",
        "hover:bg-danger/15 hover:text-danger",
        className,
      )}
    >
      <Heart size={15} />
    </button>
  );
}

export default DonateButton;
