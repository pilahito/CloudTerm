# Easter Eggs de CloudTerm

> ⚠️ **Spoilers.** Este documento destripa los easter eggs. El README solo dice que
> existen, a propósito.

---

## 🎁 Pixel Agents

El único easter egg por ahora, y el más elaborado: una oficina isométrica donde
cada host guardado es un personaje en su escritorio, con su latencia real.

### Cómo se desbloquea

1. Abre **Apoyar el proyecto** (el corazón de la barra de título, o la acción de
   la paleta de comandos).
2. Pulsa **Buy Me a Coffee** o **PayPal**. Se abre el navegador del sistema y la
   ventana de CloudTerm pierde el foco.
3. Vuelve a CloudTerm **pasados más de 10 segundos**.

Con eso basta: no hay que completar el donativo. La idea es agradecer la
intención, no cobrar por un easter egg.

**Si tardas más de 5 minutos**, el clic se olvida y hay que repetirlo. Es
deliberado: si no, cualquier ausencia larga desbloquearía la escena sin querer.

### Qué pasa al desbloquear

- El icono aparece en la barra lateral con la insignia **✨ NUEVO**.
- Sale un aviso con degradado y un botón **Ver ahora** que lleva directo.
- La primera visita reproduce una entrada escalonada de los personajes, con
  confeti pixelado.

### Cómo se elimina

**Ajustes → Easter Eggs → Zona peligrosa → Eliminar desbloqueo** (hay que escribir
`CONFIRMAR`). Pixel Agents vuelve a bloquearse y solo se recupera donando otra vez.

También hay **Resetear TODOS los easter eggs** (escribir `RESET`), que borra el
estado completo, y en modo desarrollo **Resetear TODO CloudTerm**, que además
borra ajustes y hosts.

### Ocultarlo sin perderlo

Si ya lo desbloqueaste y prefieres no verlo:

- **Mostrar Pixel Agents en la barra lateral** — lo esconde sin perder nada.
- **Ocultar 30 días** — desaparece y vuelve solo al pasar la fecha.
- **Modo discreto** — sigue visible pero sin animaciones de entrada.

---

## Cómo añadir un easter egg nuevo

1. **Añade el estado** a `src/stores/easterEggStore.ts`. El store ya persiste en
   `localStorage` bajo `cloudterm-easter-eggs`, así que basta con declarar el
   campo y su acción; no hay que tocar la serialización.

   ```ts
   interface EasterEggState {
     // …
     miEasterEgg: boolean;
     unlockMiEasterEgg: () => void;
   }
   ```

2. **Define el disparador**. Los que dependen de una acción del usuario (como
   donar) van en un hook propio, siguiendo `useDonationUnlock.ts`. Los que
   dependen de un logro interno pueden comprobarse donde ocurra.

3. **Decide cómo se ve bloqueado**. `PixelLock.tsx` es el ejemplo: un candado
   pixelado que no revela el truco, con una pista y un botón.

4. **Añade la vista** en `src/components/Settings/EasterEggSettings.tsx`,
   respetando la estructura: estado arriba, visibilidad, acciones y zona
   peligrosa con confirmación escrita.

5. **Añade una salida de desarrollo**. Cualquier easter egg es imposible de
   probar si hay que donar cada vez: incluye una acción en la paleta bajo
   `import.meta.env.DEV`.

### Reglas

- **Nunca en el README.** El README solo puede decir que existen.
- **Sin castigos.** Un easter egg no debe romper nada ni molestar a quien no lo
  busca: si no lo descubres, no notas su ausencia.
- **Accesible.** Respeta `prefers-reduced-motion` (usa `useReducedMotion` de
  Motion) y no dependas solo del color para comunicar.
- **Reversible.** Todo desbloqueo tiene que poder deshacerse desde Ajustes.
- **Sin telemetría.** El estado vive en `localStorage` y no sale de la máquina.

---

## Estado persistido

`localStorage["cloudterm-easter-eggs"]`:

| Campo | Tipo | Qué guarda |
| --- | --- | --- |
| `npcsUnlocked` | `boolean` | Pixel Agents está desbloqueado |
| `unlockedAt` | `number \| null` | Cuándo se desbloqueó por primera vez |
| `unlocksCount` | `number` | Cuántas veces se ha desbloqueado |
| `showNpcs` | `boolean` | Mostrarlo en la barra lateral |
| `discreetMode` | `boolean` | Sin animaciones de entrada |
| `hiddenUntil` | `number \| null` | Oculto hasta esta marca de tiempo |
| `introPlayed` | `boolean` | La animación de entrada ya se vio |
| `badgeSeen` | `boolean` | La insignia «NUEVO» ya se vio |
| `donateClickTime` | `number \| null` | Momento del último clic en donar |

Borrar esa clave de `localStorage` equivale a **Resetear TODOS los easter eggs**.
