# Plataformas

Estado real de CloudTerm en cada sistema, y qué falta para cada uno.

| Plataforma | Estado | Dónde se compila |
| --- | --- | --- |
| **Linux** | ✅ Compilado y probado | En esta máquina |
| **macOS** | 🟡 Preparado, sin verificar | GitHub Actions |
| **Windows** | 🟡 Preparado, sin verificar | GitHub Actions |
| **Android** | 🔴 Experimental | GitHub Actions |

> **Sé honesto con lo que sigue.** Linux es la única plataforma que se ha
> compilado y ejecutado de verdad. Windows y macOS están **preparados** (código
> sin suposiciones de Linux, iconos y configuración listos) pero **no
> verificados**: en esta máquina no hay mingw ni un mac, y Tauri no se
> cross-compila de forma fiable desde Linux.

---

## Linux

Es donde se desarrolla. Requisitos:

```bash
# Arch
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl \
               libappindicator-gtk3 librsvg

# Debian / Ubuntu
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
                 libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

```bash
npm install && npm run tauri dev
```

Genera `.deb`, `.rpm` y `.AppImage` con `npm run tauri build`.

---

## Windows

### Qué ya está preparado

- **Iconos**: `src-tauri/icons/` incluye `.ico` y los logotipos de Microsoft
  Store, generados desde `docs/brand/icon.svg`.
- **Llavero**: `keyring` está compilado con la característica `windows-native`,
  que usa el Administrador de credenciales.
- **Rutas**: la resolución de directorios va por la API de Tauri, no por rutas
  fijas. `shellexpand` acepta `~\ruta`, `$HOME` y `%USERPROFILE%`.
- **Permisos de fichero**: `sftp/mod.rs` tiene la versión `#[cfg(unix)]` y un
  respaldo para sistemas sin modos POSIX; en Windows la columna de permisos sale
  vacía en vez de mentir.
- **Ventana**: la barra de título adapta los controles al SO (macOS a la
  izquierda con semáforos, Windows y Linux a la derecha).

### Cómo compilarlo

**En Windows** (lo recomendado):

```powershell
# Requisitos: Microsoft C++ Build Tools + WebView2 + Rust + Node
npm install
npm run tauri build
```

**Desde Linux** no es viable: Tauri necesita el enlazador de MSVC y las
bibliotecas de Windows, y `x86_64-pc-windows-gnu` no está soportado de forma
oficial. Para eso está el flujo de GitHub Actions.

### Flujo automático

`.github/workflows/escritorio.yml` compila Windows, macOS y Linux en paralelo y
deja los instaladores en un borrador de release. Se lanza con una etiqueta:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

---

## macOS

Igual que Windows: iconos `.icns` listos, `keyring` con `apple-native`, y los
controles de ventana ya se dibujan como semáforos a la izquierda. Compila en el
flujo de Actions para `aarch64-apple-darwin` (Apple Silicon) y
`x86_64-apple-darwin` (Intel).

Para macOS el binario tendría que **firmarse y notarizarse** antes de
distribuirlo fuera de la App Store; sin eso, Gatekeeper avisa al abrirlo. No está
hecho.

---

## Android

### Estado: experimental

Tauri 2 soporta Android, pero CloudTerm **no está adaptado todavía**. Lo que
falta no es empaquetado, es producto:

| Pieza | Situación |
| --- | --- |
| Interfaz | Se renderiza, pero está pensada para ratón y ventana grande |
| Terminal | 🔴 **Sin implementar.** El backend abre un PTY con `russh`, que en Android no existe como en escritorio |
| SFTP | Debería funcionar (es red pura), sin probar |
| Llavero | `keyring` en Android no tiene backend; habría que usar el Keystore |
| Barra de título | No tiene sentido: en Android manda el sistema |
| Barra de estado | Habría que integrarla con la del sistema |

### Cómo se compila

No se puede desde esta máquina: **no hay JDK, ni SDK, ni NDK**. Instalarlos son
varios GB.

En una máquina preparada:

```bash
# Requisitos
#   JDK 17+          (temurin)
#   Android SDK      (platform 34, build-tools, platform-tools)
#   Android NDK      (27.x)
#   variables: ANDROID_HOME, NDK_HOME

rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android

npm install
npx tauri android init     # crea src-tauri/gen/android
npx tauri android build --apk
```

El APK sale en
`src-tauri/gen/android/app/build/outputs/apk/universal/release/`.

O con el flujo `.github/workflows/android.yml`, que instala todo lo anterior y
sube el APK como artefacto.

### Qué haría falta para que fuera útil

1. **Terminal**: o un PTY local de Android (`/system/bin/sh`) o dejar claro que
   la app es sólo cliente SSH. Lo segundo es más honesto y más rápido.
2. **Llavero**: sustituir `keyring` por el Keystore de Android tras una capa de
   abstracción.
3. **Interfaz táctil**: la barra lateral y los paneles duales necesitan otro
   diseño en pantalla estrecha.
4. **Permisos**: `INTERNET` (para SSH) y nada más; el APK no debería pedir
   almacenamiento.

---

## Resumen de lo que falta por plataforma

| | Linux | Windows | macOS | Android |
| --- | --- | --- | --- | --- |
| Código preparado | ✅ | ✅ | ✅ | 🟡 |
| Iconos | ✅ | ✅ | ✅ | ✅ |
| Compilado y probado | ✅ | ❌ | ❌ | ❌ |
| Flujo de compilación | ✅ | ✅ | ✅ | ✅ |
| Firma / notarización | — | ❌ | ❌ | ❌ |
| Adaptación de producto | — | — | — | ❌ |
