<div align="center">

![CloudTerm](docs/brand/banner-readme.png)

**Terminal SSH/SFTP de escritorio con transferencia de archivos y asistente IA.**

Tauri 2 · React 19 · TypeScript · Rust · Tailwind CSS · SQLite · xterm.js

[![Licencia: AGPL-3.0](https://img.shields.io/badge/licencia-AGPL--3.0-22d3ee)](./LICENSE)
[![Pruebas](https://img.shields.io/badge/pruebas-18%20%E2%9C%94-28c878)](docs/DOCUMENTACION.md#13-pruebas)
[![Rust](https://img.shields.io/badge/rust-1.89%2B-facc15)](https://rustup.rs)
[![Buy Me a Coffee](https://img.shields.io/badge/%E2%98%95-inv%C3%ADtame%20a%20un%20caf%C3%A9-facc15)](https://buymeacoffee.com/pilahito)

</div>

---

## Qué es CloudTerm

CloudTerm es un cliente de terminal moderno para trabajar con servidores remotos:
sesiones SSH en pestañas, un panel SFTP de doble panel para mover archivos, un
asistente IA para entender la salida de la consola y credenciales guardadas en el
llavero del sistema operativo (nunca en texto plano).

## Modelo de licencia

CloudTerm se publica bajo **GNU AGPL-3.0-or-later**, con un modelo dual pensado
para que el proyecto sea sostenible sin dejar fuera a quien lo usa para aprender o
para trabajar en sus propios servidores:

| Uso | Coste | Condiciones |
| --- | --- | --- |
| **Personal, educativo y proyectos open source** | **Gratis** | Usa, modifica y comparte el código bajo los términos de la AGPL-3.0. |
| **Empresas y uso comercial interno** | **Licencia comercial** | Escríbenos y acordamos una licencia que se ajuste a tu organización. |
| **SaaS / reventa como producto** | **Licencia comercial** | La AGPL exige publicar las modificaciones; la licencia comercial lo evita. |

> **¿Usas CloudTerm en tu empresa?** Escribe a **<57416155+pilahito@users.noreply.github.com>** y te
> enviamos las condiciones. Comprar una licencia comercial es, literalmente, lo
> que mantiene el proyecto vivo.

El texto completo de la licencia está en [`LICENSE`](./LICENSE).

## Apoyar el proyecto

CloudTerm es gratis para uso personal y seguirá siéndolo. Si te ahorra tiempo,
un café paga infraestructura, certificados y las horas que le echo:

- ☕ **[Buy Me a Coffee](https://buymeacoffee.com/pilahito)** — donativo puntual, sin registro.
- 💙 **[PayPal](https://paypal.me/pilahito)** — donativo libre o recurrente.

También ayuda muchísimo **compartir el proyecto**, abrir *issues* con errores bien
descritos y enviar *pull requests*.

## Características

- **Pestañas de terminal** con `xterm.js` y ajuste automático al tamaño de la ventana.
- **Activity bar y barra de estado** con fps reales, sesiones vivas y cola de transferencias.
- **Árbol de hosts** con grupos plegables, avatar por host y estado *Online* con latencia.
- **Pixel Agents**: tus servidores como personajes en una escena isométrica; un clic abre su terminal.
- **Paleta de comandos** (`Ctrl/Cmd + K`) para ejecutar cualquier acción sin ratón.
- **Panel SFTP** de doble panel (local ↔ remoto) con drag & drop, cola de transferencias y progreso.
- **Abrir con tu editor**: los archivos remotos se descargan, se abren en VS Code (o el que uses) y se vuelven a subir al guardar.
- **Importación de `~/.ssh/config`** con vista previa y detección de duplicados.
- **Hosts en SQLite** (`sqlx`), no en un fichero de texto.
- **Asistente IA** para explicar errores, proponer comandos y revisar configuraciones.
- **Inicio de sesión con Google y GitHub** para guardar hosts y ajustes en tu propia cuenta, sin servidor intermedio.
- **En español, inglés y chino**, con las traducciones abiertas a cualquiera: [docs/IDIOMAS.md](docs/IDIOMAS.md).
- **6 temas** (Dark Neon por defecto, Midnight, Dracula, Nord, Solarized Dark, Daylight) en caliente.
- **Credenciales en el llavero** del SO vía `keyring` (Secret Service, Keychain, Credential Manager).
- **Ventana sin decoraciones** con barra de título propia adaptada a cada sistema.

## 🎁 Easter Eggs

**CloudTerm esconde sorpresas.** Descubre cómo desbloquearlas.

No vamos a destriparte nada aquí: parte de la gracia es encontrarlo. Si eres
desarrollador y quieres añadir uno nuevo, la mecánica completa está en
[`docs/EASTER-EGGS.md`](./docs/EASTER-EGGS.md) — pero ese documento **sí** lleva
spoilers.

Lo único que te adelantamos: hay algo que solo se desbloquea **apoyando el
proyecto**. Si aún no lo has visto, prueba por ahí. ☕

## Atajos de teclado

| Atajo | Acción |
| --- | --- |
| `Ctrl/Cmd + K` | Paleta de comandos |
| `Ctrl/Cmd + T` | Nueva pestaña de terminal |
| `Ctrl/Cmd + W` | Cerrar pestaña activa |
| `Ctrl/Cmd + B` | Alternar barra lateral |
| `Ctrl/Cmd + ,` | Ajustes |
| `Ctrl/Cmd + +` / `-` | Tamaño de fuente de la terminal |

## Requisitos

- **Node.js** 18+ y **npm**
- **Rust** estable (instalado con [rustup](https://rustup.rs))
- Dependencias de Tauri 2 para tu sistema:
  - **Linux (Debian/Ubuntu):** `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - **Linux (Arch):** `webkit2gtk-4.1 base-devel curl wget file openssl libappindicator-gtk3 librsvg`
  - **macOS:** Xcode Command Line Tools
  - **Windows:** Microsoft C++ Build Tools + WebView2

## Puesta en marcha

```bash
# 1. Dependencias del frontend
npm install

# 2. Modo desarrollo (levanta Vite y compila el backend Rust)
npm run tauri dev

# 3. Build de producción + instaladores
npm run tauri build
```

El servidor de desarrollo de Vite escucha en <http://localhost:1420>.

## Estructura del proyecto

```
CloudTerm/
├── src/                          # Frontend React + TypeScript
│   ├── components/
│   │   ├── ActivityBar/          # Riel de iconos con badge de sesiones vivas
│   │   ├── TitleBar/             # Menús Archivo/Editar/Ver/Ayuda + controles de ventana
│   │   ├── Sidebar/              # Árbol de hosts: grupos, avatar, Online, latencia
│   │   ├── TabBar/               # Pestañas con avatar del host
│   │   ├── Welcome/              # Pantalla de inicio (Ctrl+K)
│   │   ├── PixelAgents/          # Escena isométrica: un personaje por host
│   │   ├── SFTP/                 # Panel dual + cola de transferencias
│   │   ├── Hosts/                # Nuevo host + importar ~/.ssh/config
│   │   ├── SshAuth/              # Modal de credenciales
│   │   ├── CommandPalette/       # Paleta de comandos (Ctrl+K)
│   │   ├── Settings/ · AI/ · Donate/ · About/ · Toast/
│   ├── hooks/                    # useTerminal, useFps, usePlatform, useWindowControls…
│   ├── lib/                      # Puentes con Rust: ssh, sftp, hosts
│   ├── stores/                   # Estado global con Zustand
│   ├── styles/themes.css         # 6 temas como variables CSS
│   ├── App.tsx                   # Layout de 5 zonas
│   └── main.tsx
└── src-tauri/                    # Backend Rust
    ├── capabilities/default.json
    ├── src/
    │   ├── ssh/                  # russh: conexión, auth, PTY, shell + gestor
    │   ├── sftp/                 # SFTP, transferencias y panel local
    │   ├── db/                   # SQLite (sqlx) + parser de ~/.ssh/config
    │   ├── config/               # Ajustes persistentes + llavero (keyring)
    │   ├── lib.rs                # Builder + 35 comandos
    │   └── main.rs
    ├── Cargo.toml
    └── tauri.conf.json
```

## Documentación

| Documento | Contenido |
| --- | --- |
| [`docs/DOCUMENTACION.md`](./docs/DOCUMENTACION.md) | **Referencia técnica completa**: arquitectura, modelo de datos, los 35 comandos de Tauri, eventos, flujos, pruebas y limitaciones |
| [`docs/MEJORAS.md`](./docs/MEJORAS.md) | Diario de construcción: las 5 fases con sus decisiones y errores |
| [`docs/IDIOMAS.md`](./docs/IDIOMAS.md) | Cómo traducir CloudTerm y publicar un idioma nuevo |
| [`docs/CUENTAS.md`](./docs/CUENTAS.md) | Inicio de sesión con Google y GitHub, paso a paso |
| [`docs/IA-LOCAL.md`](./docs/IA-LOCAL.md) | Cómo está montado el modelo de lenguaje local (Ollama + Qwen3) y cómo cambiarlo |
| [`docs/EASTER-EGGS.md`](./docs/EASTER-EGGS.md) | ⚠️ **Spoilers**: mecánica de los easter eggs y guía para añadir nuevos |
| [`docs/PLATAFORMAS.md`](./docs/PLATAFORMAS.md) | Estado real en Linux, Windows, macOS y Android |
| [`docs/brand/`](./docs/brand/) | Logotipo, banners e iconos, con el script que los genera |
| [`docs/capturas/`](./docs/capturas/) | Capturas de la aplicación y comparativas con el diseño de referencia |

## Estado del desarrollo

| Área | Estado |
| --- | --- |
| Shell de la aplicación: activity bar, menús, árbol, barra de estado | ✅ Funcional |
| Terminal `xterm.js` con 6 temas (Dark Neon por defecto) | ✅ Funcional |
| Transporte SSH real (`russh`) con PTY, shell y resize | ✅ Funcional |
| Autenticación por clave SSH y contraseña, con llavero del sistema | ✅ Funcional |
| Hosts en SQLite (`sqlx`) con CRUD e importación de `~/.ssh/config` | ✅ Funcional |
| SFTP real: subir, bajar, mkdir, borrar, renombrar | ✅ Funcional |
| Panel dual con drag & drop y cola de transferencias | ✅ Funcional |
| Pixel Agents con latencia real de cada host | ✅ Funcional |
| Verificación de `known_hosts` | ⚠️ **Pendiente (riesgo de seguridad)** |
| Copia recursiva de carpetas por SFTP | 🚧 Pendiente |
| Cancelar / reanudar transferencias | 🚧 Pendiente |
| FTP/FTPS con `suppaftp` | 🚧 Pendiente |
| Verificación de claves de servidor (`known_hosts` con confirmación) | ✅ Funcional |
| Transporte de IA real (Ollama y compatible con OpenAI, en streaming) | ✅ Funcional |
| Pixel Agents animado (respiración, tecleo, latencia) | ✅ Funcional |
| Easter eggs con desbloqueo por donativo y vista de configuración | ✅ Funcional |
| Compilación para Windows y macOS | 🟡 Preparada, sin verificar |
| Compilación para Android | 🔴 Experimental |
| Firma y notarización de binarios | 🚧 Pendiente |

El detalle de cada punto, con el porqué de las decisiones, está en
[`docs/DOCUMENTACION.md`](./docs/DOCUMENTACION.md).

## Contribuir

1. Haz un fork y crea una rama: `git checkout -b feat/mi-mejora`.
2. Sigue el estilo del código existente (Prettier + `rustfmt`).
3. Abre un pull request describiendo el *qué* y el *por qué*.

Al enviar una contribución aceptas que se distribuya bajo la AGPL-3.0 y que el
mantenedor pueda ofrecerla también bajo licencia comercial.

## Contacto

**57416155+pilahito@users.noreply.github.com** — soporte, licencias comerciales y colaboraciones.

---

<div align="center">
<sub>© pilahito · CloudTerm se distribuye bajo GNU AGPL-3.0-or-later.</sub>
</div>
