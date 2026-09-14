# Informe de construcción — CloudTerm

Fecha: 2026-09-13 · Máquina: Arch Linux (Wayland + NVIDIA RTX 3060)
Ruta final: `~/Proyectos/CloudTerm`

---

## 1. Resultado

**Estado: ✅ funcionando.** `npm run tauri dev` compila el backend Rust y abre la
ventana de CloudTerm.

| Comprobación | Resultado |
| --- | --- |
| `tsc --noEmit` | exit 0 (sin errores de tipos) |
| `vite build` | exit 0 · 2311 módulos · bundle 692 kB (gzip 196 kB) |
| `cargo build` (vía `tauri dev`) | exit 0 · 670 crates · 475 `.rlib` |
| Ventana Tauri | abierta (proceso `target/debug/cloudterm`, 36 hilos, conexión Wayland activa) |
| Dev server | **http://localhost:1420** → HTTP 200 |
| Hot reload | verificado (rebuild automático al tocar `Cargo.toml` y `capabilities/`) |

## 2. Estructura final

```
CloudTerm/
├── .vscode/{settings.json, extensions.json}
├── .gitignore                      # Node + Rust + Tauri + datos locales
├── LICENSE                         # AGPL-3.0 (690 líneas) + cláusula comercial
├── README.md                       # modelo de licencia, stack, atajos, estado
├── index.html · tailwind.config.js · postcss.config.js
├── package.json · tsconfig.json · tsconfig.node.json · vite.config.ts
├── public/tauri.svg
├── src/
│   ├── App.tsx · main.tsx · types.ts · index.css · vite-env.d.ts
│   ├── components/
│   │   ├── TitleBar/     TitleBar.tsx      # barra propia + controles de ventana
│   │   ├── TabBar/       TabBar.tsx        # pestañas de sesión
│   │   ├── Sidebar/      Sidebar.tsx       # conexiones guardadas, grupos, búsqueda
│   │   ├── CommandPalette/ CommandPalette.tsx  # Ctrl+K
│   │   ├── Settings/     Settings.tsx      # tema, fuente, IA, llavero
│   │   ├── SFTP/         SFTPPanel.tsx     # doble panel local ↔ remoto
│   │   ├── AI/           AIPanel.tsx       # asistente IA
│   │   ├── About/        About.tsx         # licencia + contacto
│   │   └── Toast/        Toast.tsx         # notificaciones
│   ├── hooks/    useTerminal.ts · useTheme.ts · useKeyboardShortcuts.ts
│   ├── lib/      utils.ts
│   ├── stores/   connectionStore.ts · tabStore.ts · settingsStore.ts · uiStore.ts
│   └── styles/   themes.css                # 5 temas como variables CSS
└── src-tauri/
    ├── Cargo.toml · Cargo.lock · build.rs · tauri.conf.json
    ├── capabilities/default.json
    ├── icons/
    └── src/
        ├── main.rs · lib.rs
        ├── config/  mod.rs · secrets.rs    # ajustes + keyring
        ├── db/      mod.rs                 # almacén JSON local
        ├── ssh/     mod.rs                 # russh + tokio (probe_host real)
        └── sftp/    mod.rs                 # russh-sftp / suppaftp (contrato)
```

**89 archivos** de código (sin `node_modules/` ni `src-tauri/target/`).

## 3. Comandos ejecutados

```bash
# 0. Toolchain (Rust NO estaba instalado)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
     --profile minimal --default-toolchain stable --no-modify-path
#   → rustc 1.98.1 · cargo 1.98.1

# 1. Scaffold
npm create tauri-app@latest . -- --template react-ts --manager npm \
     --identifier com.pilahito.cloudterm --yes
npm install

# 2. Dependencias frontend
npm install zustand motion lucide-react clsx
npm install xterm xterm-addon-fit xterm-addon-web-links
npm install -D tailwindcss@^3.4.0 postcss autoprefixer
npx tailwindcss init -p
npm install @tauri-apps/plugin-shell @tauri-apps/plugin-os

# 3. Dependencias Rust (resueltas por cargo, no a mano)
cargo add russh russh-sftp
cargo add suppaftp --features tokio-rustls-ring
cargo add keyring@3 --features linux-native,apple-native,windows-native,crypto-rust

# 4. Metadatos + licencia
npm pkg set name=cloudterm version=0.1.0 license=AGPL-3.0-or-later \
  author="pilahito <57416155+pilahito@users.noreply.github.com>" ...
curl -sSfL https://www.gnu.org/licenses/agpl-3.0.txt >> LICENSE

# 5. Verificación y ejecución
npx tsc --noEmit
npx vite build
npm run tauri dev
```

Versiones resueltas: `tauri 2.11.5` · `russh 0.63.3` · `russh-sftp 3.0.0` ·
`suppaftp 12.0.0` · `keyring 3.6.3` · `tokio 1.53.1` · `vite 8.3.0` · `react 19.1`.

## 4. Errores encontrados y solución

| # | Error | Causa | Solución |
| --- | --- | --- | --- |
| 1 | `rustc: orden no encontrada` | Rust no instalado en el sistema | rustup con perfil mínimo, toolchain estable |
| 2 | `Sistema de ficheros de sólo lectura` al escribir en `~/Proyectos` | El sandbox de sesión montaba `/` y `/home` en `ro`, con solo el workspace en `rw` | Escalada a acceso total (el usuario pasó luego la sesión a `danger-full-access`) |
| 3 | `npx tailwindcss init -p` falla | Tailwind v4 eliminó el comando `init` | Fijar `tailwindcss@^3.4` para conservar el flujo pedido (`init -p` + PostCSS + `tailwind.config.js`) |
| 4 | `failed to select a version for libcrux-ml-kem ^0.0.3: version 0.0.3 is yanked` | `cargo add` instaló `russh 0.54.6` (con una dependencia retirada) porque el **resolutor MSRV** se ancló al `rust-version = "1.77.2"` que yo había declarado | Quitar `rust-version` del `Cargo.toml`; `cargo` pasó a resolver `russh 0.63.3`, que compila |
| 5 | `Module '"lucide-react"' has no exported member 'Github'` (+ `[MISSING_EXPORT]` en Vite) | lucide-react v1 eliminó los iconos de marca | Sustituir `Github` por `Code2` en `About.tsx` |
| 6 | `cannot find '__cmd__secrets_set' in 'config'` (6 errores) | `#[tauri::command]` genera items ocultos `__cmd__*` que **no** viajan por un `pub use` | Registrar los comandos con su ruta real: `config::secrets::secrets_set` en `lib.rs` |
| 7 | Permisos de capability inexistentes | `shell:allow-open` y `os:default` exigían los plugins `tauri-plugin-shell` / `tauri-plugin-os`, y los permisos *core* necesitan prefijo `core:` | Añadir ambos plugins (Rust + npm) y reescribir `capabilities/default.json` como `core:default`, `core:window:*`, `shell:allow-open`, `os:default` |
| 8 | `MESA-EGL: failed to create dri2 screen` (ruido) | Renderizador DMA-BUF de WebKitGTK sobre Wayland + NVIDIA | `WEBKIT_DISABLE_DMABUF_RENDERER=1` en el script de arranque. Son avisos: la app arranca igualmente |

## 5. Decisiones de diseño

- **Los directorios de componentes no quedaron vacíos.** Carpetas vacías no
  compilan nada y no sobreviven a git. Cada componente tiene su `.tsx` + `index.ts`
  funcional, así que la app arranca con UI real.
- **Temas por variables CSS** en `src/styles/themes.css`, consumidas como tokens de
  Tailwind: cambiar de tema no requiere recompilar ni recargar.
- **La terminal funciona de verdad** (`xterm.js` + `FitAddon` + `WebLinksAddon`) con
  un shell local de demostración (`help`, `clear`, `echo`, `date`, `theme`, `open`).
  El transporte SSH es lo único que falta.
- **Comandos Rust reales, no stubs**: `app_info`, `load_config`, `save_config`,
  `db_get/db_set/db_keys`, `probe_host` (TCP + lectura del banner SSH con `tokio`) y
  `secrets_set/get/delete` (`keyring`). `probe_host` ya es funcional.
- **`russh` y `suppaftp` están declarados y compilados**, pero sus módulos exponen
  solo el contrato de datos: escribir código contra una API que cambia entre
  versiones menores habría comprometido la compilación. Se documenta con `TODO`.

## 6. Siguiente paso recomendado

**Conectar el transporte SSH real**, que es lo que convierte el esqueleto en producto:

1. `src-tauri/src/ssh/mod.rs`: implementar `client::Handler` y `russh::client::connect`
   reutilizando `SshConfig`, y exponer `ssh_connect` / `ssh_write` / `ssh_resize` como
   comandos Tauri que emitan eventos al frontend.
2. `src/hooks/useTerminal.ts`: sustituir el `TODO(ssh)` del `onData` por
   `invoke("ssh_write", { sessionId, data })` y volcar los eventos del canal en
   `term.write()`.
3. `src-tauri/src/sftp/mod.rs`: sobre esa misma sesión, montar `russh-sftp` para
   `list_remote_dir` y las transferencias (y `suppaftp` para FTP/FTPS).
4. Verificar el `known_hosts` propio antes de autenticar y guardar la passphrase en
   el llavero con `config::secrets::secrets_set`.

Deudas menores detectadas:

- `xterm`, `xterm-addon-fit` y `xterm-addon-web-links` están **deprecados** por sus
  equivalentes con scope (`@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`).
  Se mantuvieron porque fueron los pedidos explícitamente; migrarlos es un cambio de
  imports.
- El bundle principal pesa 692 kB. Conviene cargar `xterm.js` y `motion` con
  `import()` dinámico.
