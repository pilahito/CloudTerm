# CloudTerm — Documentación técnica

Referencia completa del proyecto: qué es, cómo está construido, qué comandos
expone y qué le falta.

| | |
| --- | --- |
| **Versión** | 0.1.0 |
| **Licencia** | GNU AGPL-3.0-or-later (licencia comercial para empresas) |
| **Stack** | Tauri 2 · React 19 · TypeScript · Rust · Tailwind CSS · SQLite |
| **Tamaño** | 68 archivos fuente · ~6 460 líneas TS/TSX · ~2 590 líneas Rust |
| **Estado** | Funcional y verificado: 18/18 pruebas, compila y arranca |

---

## 1. Qué es CloudTerm

Un cliente de terminal SSH/SFTP de escritorio. Abre sesiones en pestañas, mueve
archivos con un panel dual, guarda los hosts en SQLite, importa `~/.ssh/config`,
importa las credenciales al llavero del sistema y visualiza tu flota de servidores
como personajes en una escena isométrica.

**Gratis para uso personal.** Para uso comercial interno o integración en un
producto hace falta licencia comercial: <57416155+pilahito@users.noreply.github.com>.

---

## 2. Estado actual

| Área | Estado |
| --- | --- |
| Barra de título propia sin decoraciones, adaptada a macOS / Windows / Linux | ✅ |
| Activity bar, barra de menús, barra de estado con fps reales | ✅ |
| Terminal `xterm.js` con tema Dark Neon y 5 temas más | ✅ |
| SSH real sobre `russh`: PTY, shell, resize, keepalive | ✅ |
| Autenticación por clave SSH y por contraseña, con llavero del SO | ✅ |
| Hosts en SQLite con CRUD completo | ✅ |
| Importación de `~/.ssh/config` con vista previa | ✅ |
| SFTP real: listar, subir, bajar, mkdir, borrar, renombrar | ✅ |
| Panel dual local ↔ remoto con drag & drop y cola de transferencias | ✅ |
| Pixel Agents: escena isométrica con latencia real | ✅ |
| **Copia recursiva de carpetas por SFTP** | ❌ pendiente |
| **Cancelar / reanudar transferencias** | ❌ pendiente |
| **FTP/FTPS** (`suppaftp` está compilado, sin conectar) | ❌ pendiente |
| **Verificación de `known_hosts`** (hoy acepta cualquier clave) | ⚠️ riesgo |
| **Llamadas reales al modelo de IA** (el panel existe, el transporte no) | ❌ pendiente |

---

## 3. Requisitos

- **Node.js** 18+ y **npm**
- **Rust** estable ([rustup](https://rustup.rs))
- Dependencias de Tauri 2:
  - **Arch:** `webkit2gtk-4.1 base-devel curl wget file openssl libappindicator-gtk3 librsvg`
  - **Debian/Ubuntu:** `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - **macOS:** Xcode Command Line Tools
  - **Windows:** Microsoft C++ Build Tools + WebView2

SQLite va embebido en `sqlx`, así que no hay dependencia de sistema para la base
de datos.

---

## 4. Puesta en marcha

```bash
npm install                # dependencias del frontend
npm run tauri dev          # Vite en :1420 + compila y abre la app
npm run tauri build        # instaladores de producción
```

El servidor de desarrollo escucha en <http://localhost:1420>.

Comandos auxiliares:

```bash
npx tsc --noEmit                              # comprobación de tipos
npx vite build                                # build del frontend
cd src-tauri && cargo test --lib              # 18 pruebas del backend
cd src-tauri && cargo build                   # solo el backend
```

---

## 5. Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│  WebView (React 19 + TypeScript)                             │
│                                                              │
│  components/   ActivityBar · TitleBar · Sidebar · TabBar     │
│                Welcome · PixelAgents · SFTP · AI · Settings  │
│                Hosts · SshAuth · Donate · About · Toast      │
│  stores/       uiStore · connectionStore · tabStore          │
│                sshStore · transferStore · settingsStore      │
│  hooks/        useTerminal · usePlatform · useWindowControls │
│                useKeyboardShortcuts · useTheme · useFps      │
│  lib/          ssh · sftp · hosts · links · platform · utils │
└───────────────────────────┬──────────────────────────────────┘
                            │  invoke()  ↑  eventos
                            │  (IPC de Tauri)
┌───────────────────────────┴──────────────────────────────────┐
│  Backend Rust                                                │
│                                                              │
│  ssh/    client.rs  russh: conectar, autenticar, PTY, shell  │
│          mod.rs     SshManager + comandos + eventos          │
│  sftp/   mod.rs     SftpManager, transferencias, panel local │
│  db/     mod.rs     sqlx/SQLite: hosts + pares clave/valor   │
│          ssh_config.rs  parser de ~/.ssh/config              │
│  config/ mod.rs     ajustes persistentes en JSON             │
│          secrets.rs llavero del SO vía keyring               │
└──────────────────────────────────────────────────────────────┘
```

**Principio de diseño:** el núcleo de red no depende de Tauri. `ssh::client::open_shell`
y `open_sftp` reciben un `SessionParams` y devuelven tipos de `russh`, sin
`AppHandle` de por medio. Eso permite probarlos contra un servidor real sin
levantar la aplicación — y así se hace en las pruebas.

---

## 6. Estructura de archivos

```
CloudTerm/
├── index.html · vite.config.ts · tailwind.config.js · postcss.config.js
├── package.json · tsconfig.json · tsconfig.node.json
├── README.md · LICENSE · .gitignore · .vscode/
│
├── src/
│   ├── main.tsx · App.tsx · types.ts · index.css · vite-env.d.ts
│   ├── components/
│   │   ├── ActivityBar/     Riel de iconos con badge de sesiones vivas
│   │   ├── TitleBar/        Menús Archivo/Editar/Ver/Ayuda + controles de ventana
│   │   ├── Sidebar/         Árbol de hosts: grupos, avatar, Online, latencia
│   │   ├── TabBar/          Pestañas con avatar del host y panel derecho
│   │   ├── Welcome/         Pantalla de inicio con el atajo Ctrl+K
│   │   ├── PixelAgents/     Escena isométrica: un personaje por host
│   │   ├── SFTP/            Panel dual + cola de transferencias
│   │   ├── Hosts/           NewHostDialog + ImportSshConfig
│   │   ├── SshAuth/         Modal de credenciales (clave o contraseña)
│   │   ├── CommandPalette/  Paleta de comandos (Ctrl+K)
│   │   ├── Settings/        Ajustes: tema, fuente, IA, llavero
│   │   ├── AI/              Panel del asistente (sin transporte)
│   │   ├── Donate/          Botón y modal de donativos
│   │   ├── About/           Acerca de: licencia, plataforma, contacto
│   │   └── Toast/           Notificaciones
│   ├── hooks/               useTerminal (xterm + SSH), useFps, usePlatform,
│   │                        useWindowControls, useKeyboardShortcuts, useTheme
│   ├── lib/                 Puentes con Rust: ssh, sftp, hosts
│   │                        + links, platform, utils
│   ├── stores/              Estado global con Zustand
│   └── styles/themes.css    6 temas como variables CSS
│
├── src-tauri/
│   ├── Cargo.toml · build.rs · tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/
│   └── src/
│       ├── main.rs          Punto de entrada
│       ├── lib.rs           Builder, plugins, gestores y 35 comandos
│       ├── ssh/             client.rs (núcleo russh) + mod.rs (comandos)
│       ├── sftp/            SFTP + sistema de archivos local
│       ├── db/              SQLite + parser de ssh_config
│       └── config/          Ajustes + secretos
│
└── docs/
    ├── DOCUMENTACION.md     Este documento
    ├── MEJORAS.md           Diario de construcción (5 fases)
    ├── INFORME-CONSTRUCCION.md
    ├── IA-LOCAL.md           Modelo de lenguaje local (Ollama + DSH)
    ├── brand/               Logotipo, banners e iconos (generados por script)
    └── capturas/            Capturas, comparativas y vídeo de ejemplo (`ejemplo.mp4`)
```

---

## 7. Dónde se guardan los datos

| Qué | Ruta (Linux) |
| --- | --- |
| Base de datos SQLite | `~/.local/share/com.pilahito.cloudterm/cloudterm.db` |
| Ajustes (JSON) | `~/.config/com.pilahito.cloudterm/cloudterm.json` |
| `known_hosts` propio | `~/.config/com.pilahito.cloudterm/known_hosts` |
| Credenciales | **Llavero del SO**, nunca en disco |

En macOS y Windows las rutas las resuelve Tauri (`app_data_dir` / `app_config_dir`).
El comando `db_location` devuelve la ruta real de la base.

### Esquema

```sql
CREATE TABLE hosts (
  id               TEXT PRIMARY KEY,
  name             TEXT    NOT NULL,
  host             TEXT    NOT NULL,
  port             INTEGER NOT NULL DEFAULT 22,
  username         TEXT    NOT NULL DEFAULT '',
  protocol         TEXT    NOT NULL DEFAULT 'ssh',      -- ssh | sftp | ftp | ftps
  group_name       TEXT    NOT NULL DEFAULT 'General',  -- 'group' es reservada en SQL
  auth_method      TEXT    NOT NULL DEFAULT 'key',      -- key | password
  private_key_path TEXT    NOT NULL DEFAULT '',
  use_agent        INTEGER NOT NULL DEFAULT 0,          -- booleano
  created_at       INTEGER NOT NULL,                    -- ms UNIX
  last_used_at     INTEGER
);
CREATE INDEX idx_hosts_group    ON hosts (group_name);
CREATE INDEX idx_hosts_endpoint ON hosts (host, port, username);

CREATE TABLE settings_kv (
  key        TEXT PRIMARY KEY,
  value      TEXT    NOT NULL,   -- JSON serializado
  updated_at INTEGER NOT NULL
);
```

---

## 8. Referencia de comandos Tauri

35 comandos, todos invocables desde el frontend con `invoke("<nombre>", { ... })`.
Los argumentos viajan en **camelCase**.

### Aplicación y ajustes

| Comando | Argumentos | Devuelve |
| --- | --- | --- |
| `app_info` | — | nombre, versión, identificador, licencia, contacto |
| `load_config` | — | `AppConfig` (o los valores por defecto si no existe) |
| `save_config` | `config: AppConfig` | — |

### Llavero del sistema

| Comando | Argumentos | Devuelve |
| --- | --- | --- |
| `secrets_set` | `key`, `value` | — |
| `secrets_get` | `key` | `string \| null` |
| `secrets_delete` | `key` | — (idempotente) |

Servicio `com.pilahito.cloudterm`; la clave usada para un host es
`ssh:{usuario}@{host}:{puerto}`.

### Hosts (SQLite)

| Comando | Argumentos | Devuelve |
| --- | --- | --- |
| `hosts_list` | — | `Host[]` ordenados por grupo y nombre (sin distinguir mayúsculas) |
| `hosts_create` | `input: HostInput` | `Host` |
| `hosts_update` | `host: Host` | `Host` (error si el id no existe) |
| `hosts_delete` | `id` | — |
| `hosts_touch` | `id` | — (actualiza `last_used_at`) |
| `hosts_import` | `hosts: HostInput[]` | `Host[]` realmente insertados |
| `db_get` / `db_set` / `db_keys` | `key` [+ `value`] | pares clave/valor |
| `db_location` | — | ruta del fichero `.db` |

`hosts_import` salta los duplicados por la terna `host` + `puerto` + `usuario`, así
que importar dos veces es inofensivo.

### SSH

| Comando | Argumentos | Devuelve |
| --- | --- | --- |
| `probe_host` | `host`, `port`, `timeoutMs?` | `{ reachable, latencyMs, banner, message }` |
| `ssh_connect` | `request: SshConnectRequest` | `SshSessionInfo` |
| `ssh_write` | `sessionId`, `data: number[]` | — |
| `ssh_resize` | `sessionId`, `cols`, `rows` | — |
| `ssh_disconnect` | `sessionId` | — |
| `ssh_sessions` | — | `string[]` de sesiones abiertas |
| `known_hosts_path` | — | ruta del fichero |

`SshConnectRequest`:

```ts
{
  sessionId: string;      // el id de la pestaña
  host: string;
  port: number;
  username: string;
  auth: { kind: "password"; password: string }
      | { kind: "key"; keyPath: string | null; passphrase: string | null };
  term: string;           // por defecto "xterm-256color"
  cols: number; rows: number;
  timeoutMs?: number;     // por defecto 15000
}
```

Si `keyPath` es `null` o vacío, el backend autodetecta
`~/.ssh/id_ed25519`, `id_ecdsa` o `id_rsa`, en ese orden.

### SFTP y sistema de archivos local

| Comando | Argumentos | Devuelve |
| --- | --- | --- |
| `sftp_connect` | `request: SftpConnectRequest` | `{ sessionId, home, message }` |
| `sftp_disconnect` | `sessionId` | — |
| `sftp_list` | `sessionId`, `path` | `FsEntry[]` |
| `sftp_mkdir` | `sessionId`, `path` | — |
| `sftp_remove` | `sessionId`, `path`, `isDir` | — |
| `sftp_rename` | `sessionId`, `from`, `to` | — |
| `sftp_upload` | `sessionId`, `transferId`, `localPath`, `remotePath` | bytes transferidos |
| `sftp_download` | `sessionId`, `transferId`, `remotePath`, `localPath` | bytes transferidos |
| `local_home` | — | directorio personal |
| `local_list` | `path` | `FsEntry[]` |
| `local_mkdir` | `path` | — |

`FsEntry` es común a ambos lados: `{ name, path, isDir, isSymlink, size, modified,
permissions }`, con `modified` en milisegundos UNIX y `permissions` en octal
(`"0644"`).

### `~/.ssh/config`

| Comando | Argumentos | Devuelve |
| --- | --- | --- |
| `ssh_config_preview` | — | `{ path, exists, entries: HostInput[], warnings: string[] }` |

No toca la base: solo lee y parsea. La inserción la hace después `hosts_import`
con las entradas que el usuario haya marcado.

---

## 9. Eventos del backend

| Evento | Payload | Cuándo |
| --- | --- | --- |
| `ssh://data` | `{ sessionId, data: number[] }` | salida del servidor (stdout y stderr juntos) |
| `ssh://status` | `{ sessionId, status, message }` | `connecting` · `connected` · `closed` · `error` |
| `sftp://progress` | `{ transferId, transferred, total, done }` | cada 256 KiB y al terminar |

`data` viaja como array de bytes y el frontend lo convierte con
`new Uint8Array(payload.data)` antes de `term.write(...)`. **No es un detalle
cosmético:** al pasar bytes en vez de una cadena, xterm.js decodifica UTF-8 y
respeta los caracteres multibyte que el servidor parta entre dos paquetes SSH.

---

## 10. Atajos de teclado

| Atajo | Acción |
| --- | --- |
| `Ctrl/Cmd + K` | Paleta de comandos |
| `Ctrl/Cmd + Shift + P` | Paleta de comandos (alternativo) |
| `Ctrl/Cmd + T` | Nueva pestaña de terminal |
| `Ctrl/Cmd + W` | Cerrar pestaña activa |
| `Ctrl/Cmd + B` | Alternar barra lateral |
| `Ctrl/Cmd + ,` | Ajustes |
| `Ctrl/Cmd + 1` | Vista Inicio |
| `Ctrl/Cmd + 2` | Vista Terminales |
| `Ctrl/Cmd + 3` | Vista Archivos (SFTP) |
| `Ctrl/Cmd + 4` | Vista Pixel Agents |
| `Ctrl/Cmd + +` / `-` | Tamaño de fuente del terminal |

En macOS los rótulos muestran `⌘` en lugar de `Ctrl` (lo resuelve `usePlatform`).

### Comandos del shell local

La pestaña «Shell local» no es un PTY del sistema: es un shell de demostración con
estos comandos. Al escribir `ssh`, la pestaña **se convierte** en la sesión real.

| Comando | Efecto |
| --- | --- |
| `ssh [usuario@]host [-p puerto]` | busca el host, lo guarda si es nuevo y conecta |
| `hosts` | lista los hosts guardados |
| `sftp` | indica dónde está el panel de archivos |
| `help` · `clear` · `echo` · `date` · `whoami` | utilidades |
| `theme <nombre>` | cambia el tema en caliente |
| `open <ruta\|url>` | abre con el navegador del sistema |

---

## 11. Temas

`src/styles/themes.css` define cada tema como un juego de variables CSS en
tripletas RGB. Tailwind las consume como tokens (`bg-bg`, `text-muted`,
`border-border`, `bg-accent`…), así que **cambiar de tema no recompila nada**.

Disponibles: **Dark Neon** (por defecto), Midnight, Dracula, Nord, Solarized Dark
y Daylight. Cada uno define además la paleta de 16 colores del terminal
(`--ct-term-*`), que `useTerminal` lee con `getComputedStyle` y aplica en caliente
sin recrear la sesión.

---

## 12. Idiomas

La interfaz está traducida a **español**, **inglés** y **chino simplificado**, y
añadir otro idioma no requiere tocar código.

- Los diccionarios son ficheros JSON planos en `src/i18n/locales/`.
- El español es la **referencia**: lo que falte en otro idioma cae al español y,
  si tampoco existe, se muestra la clave para que el hueco se vea.
- `useT()` da el traductor dentro de un componente; `t()` sirve fuera de ellos
  (stores, hooks, lib). Los marcadores se escriben `{asi}`.
- `useDocumentLanguage()` mantiene el atributo `lang` del documento, del que
  dependen las fuentes y los lectores de pantalla.
- `node scripts/validar-idiomas.mjs` comprueba que todos los idiomas tengan las
  mismas claves y los mismos marcadores. Se lanza solo en las propuestas de
  cambio que tocan traducciones (`.github/workflows/idiomas.yml`).

Los **mensajes del backend** (Rust) siguen en español; los más frecuentes se
traducen en `describeSshError` (`src/lib/ssh.ts`), que es donde se convierten en
frases para el usuario.

La guía para traductores está en [`IDIOMAS.md`](./IDIOMAS.md).

## 13. Flujos clave

### Conectar por SSH

1. La pestaña pide credenciales: primero al llavero (`secrets_get`).
2. Si no hay nada, `requestCredentials()` abre el modal y espera una promesa.
3. `ssh_connect` → `russh`: conectar, autenticar, `request_pty`, `request_shell`.
4. El canal se parte con `split()` en dos mitades, cada una en su tarea de Tokio.
5. La salida llega por `ssh://data`; el teclado sale por `ssh_write`.
6. Si el servidor rechaza las credenciales, se vuelve a preguntar (máximo 3
   intentos) mostrando el motivo. Los errores de red no reintentan.

### Importar hosts

`ssh_config_preview` parsea el fichero y devuelve las entradas sin tocar la base →
el modal muestra casillas → `hosts_import` inserta solo lo marcado, saltando
duplicados → se lanza un sondeo de estado para poblar el árbol.

### Transferir un archivo

Arrastrar una fila de un panel al otro (o doble clic) encola una transferencia.
La cola es **secuencial a propósito**: `russh-sftp` aplica 10 s de timeout por
petición desde el envío y precarga hasta 16 escrituras; paralelizar sobre la misma
sesión provoca `Error::Timeout` en servidores lentos.

---

## 14. Pruebas

`cd src-tauri && cargo test --lib` → **18 pruebas**, todas en verde.

| Grupo | Qué cubre |
| --- | --- |
| `db::ssh_config::tests` (7) | comodines descartados, primer alias, sintaxis `Clave=valor`, `Include` avisado, puertos inválidos, comillas |
| `db::tests` (4) | migración + ida y vuelta de un host, clave primaria, orden por grupo/nombre, upsert de clave/valor |
| `ssh::client::tests` (4) | expansión de `~`, clave inexistente, **conexión SSH real** con PTY y shell, contraseña rechazada |
| `sftp::tests` (3) | unión de rutas, orden directorios-antes-que-ficheros, **subida y descarga reales por SFTP** |

Las pruebas que hablan por red usan un `sshd` de pruebas en `127.0.0.1:2222` y **se
omiten solas** si no está levantado, para que `cargo test` siga sirviendo en
cualquier máquina. Ver `docs/MEJORAS.md` §2.5 para montarlo.

---

## 15. Compilar para distribución

```bash
npm run tauri build
```

Genera el binario y los instaladores en `src-tauri/target/release/bundle/`.
El perfil de release usa `lto = true`, `codegen-units = 1`, `opt-level = 3`,
`panic = "abort"` y `strip = true`.

**Antes de publicar una release:**

- [ ] Verificar `known_hosts` en `ssh::client::ClientHandler::check_server_key`
      (hoy devuelve `Ok(true)` siempre).
- [x] Iconos propios en `src-tauri/icons/`, generados desde `docs/brand/icon.svg`
      con `npx tauri icon`. Ver `docs/brand/README.md` para regenerarlos.
- [ ] Confirmar que `github.com/pilahito/cloudterm` es la URL real del repositorio.
- [ ] Subir `version` en `package.json`, `src-tauri/Cargo.toml` y
      `src-tauri/tauri.conf.json` (hoy los tres dicen `0.1.0`).

---

## 16. Limitaciones conocidas

| Limitación | Detalle |
| --- | --- |
| `known_hosts` sin verificar | **Riesgo de seguridad real.** `check_server_key` acepta cualquier clave de servidor, así que no hay protección contra MITM. Es lo primero que hay que arreglar antes de publicar. |
| Carpetas por SFTP | La cola transfiere ficheros sueltos; arrastrar una carpeta avisa de que la copia recursiva está pendiente. |
| Sin cancelar ni reanudar transferencias | Se pueden quitar de la lista, no abortar la operación en curso. |
| FTP/FTPS | `suppaftp` está declarado y compilado, pero solo SFTP está conectado. |
| IA sin transporte | El panel funciona, la llamada al modelo no está implementada. |
| SSH solo por `russh` | No se usa `ssh-agent` ni `ProxyJump`. |
| Arrastrar desde el gestor de archivos | `dragDropEnabled: false` en `tauri.conf.json`, necesario para que funcione el drag & drop interno. |
| Paquetes `xterm` deprecados | Se usan `xterm`, `xterm-addon-fit` y `xterm-addon-web-links` porque fueron los pedidos; lo vigente es `@xterm/*`. |
| Bundle de 700 kB | Convendría cargar `xterm.js` y `motion` con `import()` dinámico. |

---

## 17. Solución de problemas

**`MESA-EGL: failed to create dri2 screen` en Linux con NVIDIA**
Aviso no fatal del renderizador DMA-BUF de WebKitGTK. Se silencia con
`WEBKIT_DISABLE_DMABUF_RENDERER=1` antes de `npm run tauri dev`.

**`rustc: orden no encontrada`**
Rust no está instalado o `~/.cargo/bin` no está en el `PATH`:
`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`

**`error: failed to select a version for libcrux-ml-kem`**
`russh` antiguo con dependencias retiradas. Asegúrate de que `Cargo.toml` **no**
declara `rust-version`: el resolutor MSRV ancla versiones antiguas y rompe la
resolución.

**`cannot find __cmd__...` al registrar un comando**
`#[tauri::command]` genera items ocultos que **no** viajan por un `pub use`.
Registra los comandos con su ruta completa (`config::secrets::secrets_set`).

**`failed to open uinput device` al usar `ydotool`**
El módulo `uinput` no está disponible. No hay inyección de teclado en ese entorno;
no afecta a CloudTerm.

**El terminal no conecta y no dice por qué**
Mira el evento `ssh://status`: el último mensaje se pinta en rojo dentro del propio
terminal y también como notificación.

---

## 18. Licencia y contacto

CloudTerm se distribuye bajo **GNU AGPL-3.0-or-later**.

| Uso | Coste |
| --- | --- |
| Personal, educativo y open source | Gratis, bajo los términos de la AGPL-3.0 |
| Empresas y uso comercial interno | Licencia comercial |
| SaaS / reventa como producto | Licencia comercial |

- ☕ [Buy Me a Coffee](https://buymeacoffee.com/pilahito)
- 💙 [PayPal](https://paypal.me/pilahito)
- ✉️ <57416155+pilahito@users.noreply.github.com>

El texto completo está en [`LICENSE`](../LICENSE).
