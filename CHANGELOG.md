# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
El proyecto usa [versionado semántico](https://semver.org/lang/es/).

---

## [Unreleased]

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
