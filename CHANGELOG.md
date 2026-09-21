# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
El proyecto usa [versionado semántico](https://semver.org/lang/es/).

---

## [Unreleased]

### Windows

- El panel local entiende rutas `C:\…`, sube hasta «Este equipo» y lista las unidades.
- La barra de título ya no captura los clics: arrastre solo en las zonas vacías, botones al tamaño de Windows 11, sombra de ventana.
- Los comandos locales (`!…`) usan PowerShell y no abren una consola negra.
- Se detectan VS Code y el resto de editores por `.cmd` y por su carpeta de instalación.
- Fuente por defecto: Cascadia Code. WebView2 no se duerme con la ventana al fondo (la terminal sigue viva).
- El instalador descarga WebView2 si falta.

### Documentación

- El vídeo de ejemplo (`CONTEXTO__Estás_construyendo_l.mp4`) vive en
  `docs/capturas/ejemplo.mp4` y se reproduce en la pantalla de inicio.

### Terminal y archivos

- La pestaña local abre un intérprete real: PowerShell o `cmd` en Windows, `$SHELL` en Unix.
- Las carpetas se copian de forma recursiva; una transferencia en curso se puede cancelar.
- La versión de «Acerca de» y del banner coincide con `1.0.0`.
- `~/ruta` en Windows usa `USERPROFILE` y el separador del sistema.

---

## [1.0.0] — 2026-09-14

Primera versión estable. Cliente SSH y SFTP de escritorio con interfaz propia,
construido sobre Tauri 2, React 19 y `russh`.

### Verificado a fondo

Esto es lo que se ha comprobado de verdad, no lo que se espera que funcione:

- **91 pruebas** en el núcleo Rust (`cargo test --lib`), todas en verde.
- **Compilación sin avisos** y `tsc --noEmit` limpio.
- **582 claves × 3 idiomas** con paridad comprobada automáticamente.
- **La aplicación arranca y se usa** en Linux con Wayland (Hyprland).

### Añadido

**Terminal y conexiones**

- Terminales con `xterm.js`, temas en caliente y ajuste al tamaño de la ventana.
- SSH real sobre `russh`, con autenticación por contraseña o clave y passphrase.
- Verificación de la clave del servidor contra un `known_hosts` propio, con
  detección de cambios y TOFU para hosts nuevos.
- Tiempo de espera configurable **por host**, con presupuesto propio para la
  autenticación.
- Registro de conexiones en `conexiones.log` para poder diagnosticar sin acceso a
  la ventana.

**Archivos**

- Panel SFTP de doble panel con arrastrar y soltar, cola de transferencias y
  progreso.
- Importación de `~/.ssh/config` con vista previa y detección de duplicados.
- **Abrir con tu editor**: los archivos remotos se descargan, se abren y se
  vuelven a subir al guardar.
- **Consola integrada**: los comandos van al servidor por defecto; con `!`
  delante, a tu equipo.
- Hosts en SQLite, no en un fichero de texto.

**Interfaz**

- Barra de actividad, árbol de hosts con grupos, barra de estado y paleta de
  comandos (`Ctrl/Cmd + K`).
- Ventana sin decoraciones, con barra de título propia adaptada a cada sistema.
- **Tres idiomas**: español, inglés y chino simplificado, con las traducciones
  abiertas a cualquiera mediante JSON y validación automática.
- 6 temas (Dark Neon por defecto).

**Cuenta y datos**

- **Inicio de sesión con Google y GitHub**, cada usuario con su propia aplicación
  de cliente: sin intermediarios y sin secretos en el binario.
- Copia de seguridad de hosts y ajustes en un gist secreto o en la carpeta
  privada de Drive. Las credenciales nunca se sincronizan.
- Credenciales en el llavero del sistema operativo.

**Asistente**

- Panel de IA para explicar errores y proponer comandos, con soporte de Ollama
  local y de la API de DeepSeek.

**Extras**

- Pixel Agents: tus servidores como personajes de una escena isométrica.
- La oficina de transferencias: con los NPC activados, la cola se convierte en
  una escena donde un agente mueve los archivos según el progreso real.
- Con los NPC apagados, el panel de archivos adopta el aspecto clásico de
  FileZilla o WinSCP.

### Lo que NO está verificado

Se dice aquí para que nadie se lleve una sorpresa:

- **Windows, macOS y Android**: los flujos de compilación existen, pero **nunca
  se han ejecutado**. No hay binarios de esas plataformas probados.
- **El inicio de sesión con Google y GitHub** no se ha ejercitado de extremo a
  extremo: hace falta un identificador de cliente real, que crea cada usuario.
  Lo que sí está probado es todo lo de alrededor (PKCE, análisis de respuestas,
  máquina de estados del sondeo, formato de la copia).
- **La consola integrada y «abrir con editor»** contra un servidor real: se han
  probado sus piezas, no el recorrido completo.
- **Los mensajes del backend** siguen en español; los más frecuentes se traducen
  en la interfaz.

### Notas

- Los mensajes de error del núcleo Rust están redactados en español. Traducirlos
  bien exige convertirlos en códigos, y queda para más adelante.
- En Wayland, la aplicación desactiva el *renderer* DMABUF de WebKitGTK para
  evitar un cierre inmediato al arrancar. Se puede revertir fijando
  `WEBKIT_DISABLE_DMABUF_RENDERER=0` en el entorno.

[1.0.0]: https://github.com/pilahito/cloudterm/releases/tag/v1.0.0
