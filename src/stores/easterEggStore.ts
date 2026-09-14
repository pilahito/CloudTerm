import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Cuánto hay que estar fuera para considerar que se ha ido a donar. */
const DONATE_TRIP_MS = 10_000;
/** Pasado este tiempo sin volver, se olvida el clic. */
const DONATE_FORGIVE_MS = 5 * 60 * 1000;

interface EasterEggState {
  /** Pixel Agents está desbloqueado. */
  npcsUnlocked: boolean;
  unlockedAt: number | null;
  /** Cuántas veces se ha desbloqueado (se reinicia al eliminarlo). */
  unlocksCount: number;
  /** Mostrarlo en la barra lateral sin perder el desbloqueo. */
  showNpcs: boolean;
  /** Sin animaciones de entrada. */
  discreetMode: boolean;
  /** Oculto hasta esta marca de tiempo (epoch ms). */
  hiddenUntil: number | null;
  /** La animación de entrada ya se ha visto. */
  introPlayed: boolean;
  /** La insignia «NUEVO» ya se ha visto. */
  badgeSeen: boolean;
  /** Momento del último clic en un botón de donativo. */
  donateClickTime: number | null;

  markDonateClicked: () => void;
  /** Comprueba si toca desbloquear (al volver el foco). Devuelve si lo hizo. */
  checkUnlock: () => boolean;
  unlockNow: () => void;
  resetUnlock: () => void;
  setShowNpcs: (value: boolean) => void;
  setDiscreet: (value: boolean) => void;
  hideFor: (days: number) => void;
  clearHide: () => void;
  markIntroPlayed: () => void;
  markBadgeSeen: () => void;
  /** Vuelve a lanzar la animación de entrada. */
  triggerIntro: () => void;
  resetCounters: () => void;
  /** Borra todo el estado de easter eggs. */
  resetAll: () => void;
}

export const useEasterEggStore = create<EasterEggState>()(
  persist(
    (set, get) => ({
      npcsUnlocked: false,
      unlockedAt: null,
      unlocksCount: 0,
      showNpcs: true,
      discreetMode: false,
      hiddenUntil: null,
      introPlayed: false,
      badgeSeen: false,
      donateClickTime: null,

      markDonateClicked: () => set({ donateClickTime: Date.now() }),

      checkUnlock: () => {
        const { donateClickTime, npcsUnlocked } = get();
        if (!donateClickTime) return false;
        if (Date.now() - donateClickTime < DONATE_TRIP_MS) return false;

        // Se ha ido y ha vuelto: se desbloquea. Un segundo desbloqueo no
        // reinicia la animación de entrada, solo suma al contador.
        set((state) => ({
          npcsUnlocked: true,
          unlockedAt: state.unlockedAt ?? Date.now(),
          unlocksCount: state.unlocksCount + 1,
          donateClickTime: null,
          introPlayed: state.npcsUnlocked ? state.introPlayed : false,
          badgeSeen: state.npcsUnlocked ? state.badgeSeen : false,
        }));
        return !npcsUnlocked;
      },

      unlockNow: () =>
        set((state) => ({
          npcsUnlocked: true,
          unlockedAt: state.unlockedAt ?? Date.now(),
          unlocksCount: state.unlocksCount + 1,
          donateClickTime: null,
          showNpcs: true,
          hiddenUntil: null,
        })),

      resetUnlock: () =>
        set({
          npcsUnlocked: false,
          unlockedAt: null,
          unlocksCount: 0,
          showNpcs: true,
          introPlayed: false,
          badgeSeen: false,
          donateClickTime: null,
        }),

      setShowNpcs: (value) => set({ showNpcs: value }),
      setDiscreet: (value) => set({ discreetMode: value }),

      hideFor: (days) =>
        set({ hiddenUntil: Date.now() + days * 24 * 60 * 60 * 1000 }),

      clearHide: () => set({ hiddenUntil: null }),

      markIntroPlayed: () => set({ introPlayed: true }),
      markBadgeSeen: () => set({ badgeSeen: true }),

      triggerIntro: () => {
        if (!get().npcsUnlocked) return;
        set({ introPlayed: false });
      },

      resetCounters: () => set({ unlocksCount: 0, introPlayed: false, badgeSeen: false }),

      resetAll: () =>
        set({
          npcsUnlocked: false,
          unlockedAt: null,
          unlocksCount: 0,
          showNpcs: true,
          discreetMode: false,
          hiddenUntil: null,
          introPlayed: false,
          badgeSeen: false,
          donateClickTime: null,
        }),
    }),
    { name: "cloudterm-easter-eggs", version: 1 },
  ),
);

/**
 * ¿Debe verse el icono de Pixel Agents ahora mismo?
 *
 * Hace falta tenerlo desbloqueado, querer mostrarlo y no haberlo ocultado
 * temporalmente.
 */
export function selectNpcsVisible(): boolean {
  const { npcsUnlocked, showNpcs, hiddenUntil } = useEasterEggStore.getState();
  if (!npcsUnlocked || !showNpcs) return false;
  if (hiddenUntil !== null && Date.now() < hiddenUntil) return false;
  return true;
}

export const DONATE_TRIP_MS_FOR_TESTS = DONATE_TRIP_MS;
export const DONATE_FORGIVE_MS_FOR_TESTS = DONATE_FORGIVE_MS;
