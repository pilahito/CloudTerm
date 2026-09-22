# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
El proyecto usa [versionado semántico](https://semver.org/lang/es/).

---

## [Unreleased]

---

## [1.0.8] — 2026-09-22

### Android

- **Arreglada la compilación del APK**, que fallaba al aplicar el parche de
  firma con `Unresolved reference: util` / `Unresolved reference: io`. En el DSL
  de Kotlin, `java.util.Properties` no resuelve: dentro de un script de Gradle
  `java` es la extensión `java` del proyecto, no el paquete. Ahora las clases se
  importan y se usan por su nombre simple.
- El parche se ha comprobado contra la plantilla real que genera
  `tauri android init`: imports únicos, firma solo en `release`, llaves
  equilibradas e idempotencia.

> La 1.0.7 publicó los instaladores de escritorio correctamente, pero su APK no
> llegó a compilarse por este fallo.

---

## [1.0.7] — 2026-09-22

### Cuenta y sincronización

- **Inicio de sesión con Google y GitHub sin configurar nada**: el binario puede
  traer identificadores de cliente integrados, así que el usuario solo pulsa
  «Iniciar sesión» (flujo OAuth de escritorio por *loopback* `127.0.0.1` + PKCE).
- Si no hay identificadores integrados, la pantalla de Cuenta pide el Client ID
  con un campo y un botón **Guardar**, y la alerta roja desaparece en cuanto se
  guarda uno válido. Quien quiera usar su propia aplicación de Google o GitHub
  sigue pudiendo hacerlo.
- El botón de inicio de sesión se habilita solo cuando hay credenciales y avisa
  mientras espera al navegador.
- Los identificadores se pueden inyectar en el build con
  `CLOUDTERM_GOOGLE_CLIENT_ID` y `CLOUDTERM_GITHUB_CLIENT_ID`, o pegarse en
  `src-tauri/src/auth/clients.rs`.

### Android

- **Corregido el APK de publicación, que salía sin firmar**: el parche de Gradle
  insertaba la firma en el bloque `debug` en lugar de `release`, así que
  `apksigner verify` fallaba en cada compilación. El script ya no depende de
  `python3` ni de coincidencias frágiles de texto.
- **Corregido el almacén de secretos**: intentaba escribir en
  `/data/com.pilahito.cloudterm`, un directorio del sistema donde Android no
  deja escribir. Ahora usa el directorio privado de la aplicación.
- El actualizador ya no intenta lanzar `pkexec` ni `xdg-open` en Android, donde
  no existen: esas actualizaciones llegan por la tienda o reinstalando el APK.
- `cargo check` para `aarch64-linux-android` sale sin ningún aviso.
- El flujo de trabajo instala SDK 36 y el NDK que pide la plantilla de Tauri, y
  la versión del CLI queda fijada.

### Mantenimiento

- `build-installers.yml` deriva la versión de `package.json` en lugar de
  llevarla escrita a mano, que era lo que provocaba desajustes con los tags.
- `src-tauri/gen/` (proyecto Android generado) pasa a `.gitignore`.

---

## [1.0.5] — 2026-09-21

### SSH

- Autenticación **keyboard-interactive** (prompts TOTP / 2FA del servidor).
- Resolución de hosts con **IPv4 primero** para evitar caídas en Windows y Linux.
- Cadena de **fallback de PTY** si el servidor cierra el canal con el modo pedido.

### Instaladores

- `.exe` NSIS, `.deb` y AppImage publicados en Releases.

---

## [1.0.4] — 2026-09-21

### Windows

- El panel local entiende rutas `C:\\u2026`, sube hasta «Este equipo» y lista las unidades.
- La barra de título ya no captura los clics: arrastre solo en las zonas vacías, botones al tamaño de Windows 11, sombra de ventana.
- Los comandos locales (`!\u2026`) usan PowerShell y no abren una consola negra.
- Se detectan VS Code y el resto de editores por `.cmd` y por su carpeta de instalación.
- Fuente por defecto: Cascadia Code. WebView2 no se duerme con la ventana al fondo (la terminal sigue viva).
- El instalador descarga WebView2 si falta.

### Instaladores

- El .exe de Windows usa banners NSIS propios (cabecera y lateral), textos en
  español/inglés/chino, enlace a GitHub en la página final y desinstalador
  `Uninstall CloudTerm.exe`.
- Linux genera `.deb` y AppImage con el `.desktop` `Development;Network;TerminalEmulator`.
- Flujo `.github/workflows/build-installers.yml` (Windows x64, Linux amd64 y arm64).

### Cuentas

- Google y GitHub se vinculan **abriendo el navegador**. Ya no hay que escribir
  un código de dispositivo.

### Terminal y archivos

- La pestaña local abre un intérprete real: PowerShell o `cmd` en Windows, `$SHELL` en Unix.
- Las carpetas se copian de forma recursiva; una transferencia en curso se puede cancelar.
- `~/ruta` en Windows usa `USERPROFILE` y el separador del sistema.

### Documentación

- Vídeo de ejemplo en la pantalla de inicio; GIF en el README y en el perfil.

---

## [1.0.3] — 2026-09-20

Instaladores de escritorio y APK de Android en el mismo tag.

---

## [1.0.0] — 2026-09-14

Primera versión estable. Cliente SSH y SFTP de escritorio con interfaz propia,
construido sobre Tauri 2, React 19 y `russh`.

[1.0.5]: https://github.com/pilahito/cloudterm/releases/tag/v1.0.5
[1.0.4]: https://github.com/pilahito/cloudterm/releases/tag/v1.0.4
[1.0.0]: https://github.com/pilahito/cloudterm/releases/tag/v1.0.0
