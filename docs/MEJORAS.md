# Mejoras de CloudTerm

Registro de las fases de construcción. Cada fase se compila antes de pasar a la
siguiente (`npx tsc --noEmit`, `npx vite build` y `cargo build`).

Estado global:

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | UI base: barra de título, detección de SO, donativos, Acerca de | ✅ Completada y compilada |
| 2 | Terminal: Dark Neon, russh, autenticación por clave y contraseña | ✅ Completada y compilada |
| 3 | Hosts: SQLite con sqlx, CRUD, importar `~/.ssh/config` | ✅ Completada y compilada |
| 4 | SFTP: panel dual, drag & drop, cola de transferencias | ✅ Completada y compilada |
| 5 | Rediseño visual según el mockup: activity bar, menús, árbol, Pixel Agents | ✅ Completada y verificada en pantalla |

---

# FASE 1 — UI base

**Compilación:** `tsc --noEmit` exit 0 · `vite build` exit 0 · `cargo build` sin cambios.

## 1.1 Barra de título personalizada (sin decoraciones nativas)

`tauri.conf.json` ya declaraba `"decorations": false`; lo que faltaba era una barra
que se comportara como una nativa. Se reescribió `src/components/TitleBar/TitleBar.tsx`:

- **Región de arrastre** con `data-tauri-drag-region` en el `<header>` y en el
  bloque del logotipo.
- **Doble clic para maximizar**, ignorando los clics que caen sobre controles:
  ```tsx
  const handleDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, a, textarea, select")) return;
    void toggleMaximize();
  };
  ```
- **Icono de maximizar/restaurar sincronizado** con el estado real de la ventana,
  incluso si el usuario la maximiza con doble clic o desde el gestor de ventanas.

## 1.2 Detección de SO y controles adaptados

Archivos nuevos:

| Archivo | Responsabilidad |
| --- | --- |
| `src/lib/platform.ts` | `detectOs()` (plugin `os` de Tauri) + `guessOs()` (User-Agent) como respaldo inmediato |
| `src/hooks/usePlatform.ts` | Devuelve `os`, `isMac/isWindows/isLinux`, `modKey` (`⌘` vs `Ctrl`) y `modJoin` |
| `src/hooks/useWindowControls.ts` | `minimize`, `toggleMaximize`, `close` y el estado `maximized` |

Detalles de implementación:

- `platform()` del plugin es **síncrono** (lee `window.__TAURI_OS_PLUGIN_INTERNALS__`),
  pero el `import()` del módulo no lo es. Por eso el primer render usa la heurística
  del User-Agent y el valor autoritativo llega en un `useEffect`.
- `useWindowControls` se suscribe a `onResized` para mantener el icono correcto y
  libera el listener al desmontar (con guarda `disposed` por si el componente se
  desmonta antes de que resuelva el `import()`).
- Todas las llamadas a la ventana se envuelven en `try/catch`: en el dev server
  abierto en un navegador normal no existe el IPC de Tauri y solo se avisa por consola.

Disposición según plataforma:

| SO | Controles | Estilo |
| --- | --- | --- |
| macOS | Izquierda | Semáforos (`#ff5f57`, `#febc2e`, `#28c840`) con el glifo visible solo al pasar el ratón |
| Windows | Derecha | Botones de 11 px de ancho; cerrar se tiñe de rojo |
| Linux | Derecha | Botones de 9 px con esquinas redondeadas; cerrar se tiñe de rojo |

También se adaptan las etiquetas de los atajos: en macOS la barra muestra `⌘K`
y en Windows/Linux `Ctrl+K`.

## 1.3 Botón de donativo (Buy Me a Coffee + PayPal)

Componentes nuevos en `src/components/Donate/`:

- `DonateButton.tsx` — botón compacto con un corazón, en rojo suave, para la barra
  de título.
- `DonateModal.tsx` — modal con los dos niveles de donativo y el recordatorio de
  licencia comercial.
- `index.ts` — barrel.

`src/lib/links.ts` centraliza los enlaces y expone `openExternal()`, que usa el
plugin `shell` (permiso `shell:allow-open`) dentro de Tauri y cae a `window.open`
cuando la app corre en un navegador.

> ✅ **Los enlaces están verificados y activos.** `LINKS.buyMeACoffee` apunta a
> `buymeacoffee.com/pilahito` (forma canónica, sin `www`) y `LINKS.paypal` a
> `paypal.me/pilahito`. Ambos se comprobaron el 2026-09-13: el primero devuelve 200
> con la página del proyecto, y el segundo resuelve a
> `paypal.com/paypalme/pilahito`, que también responde 200.

El estado del modal vive en `uiStore` (`donateOpen` / `setDonateOpen`), así que
también se abre desde la paleta de comandos con la acción
**«Apoyar CloudTerm (Buy Me a Coffee / PayPal)»**.

## 1.4 Botón «Acerca de»

El botón ya existía en la barra; se enriqueció `src/components/About/About.tsx`:

- Fila destacada **«Apoyar el proyecto»** que cierra el modal y abre el de donativos.
- Fila **«Plataforma detectada»** que muestra el SO y cómo se han colocado los
  controles de ventana.
- Los enlaces externos (repositorio) pasan por `openExternal()` en lugar de
  `target="_blank"`, que en un webview de Tauri no abre el navegador del sistema.
- El correo de contacto se copia con `copyToClipboard()` de `lib/links.ts`.

## 1.5 Permisos

`src-tauri/capabilities/default.json` ya concedía lo necesario
(`core:window:allow-minimize`, `-toggle-maximize`, `-close`, `-is-maximized`,
`-start-dragging`, `-maximize`, `-unmaximize`), más `shell:allow-open` y
`os:default`. **No hizo falta tocar capabilities en esta fase.**

## 1.6 Archivos tocados

```
NUEVO   src/lib/platform.ts
NUEVO   src/lib/links.ts
NUEVO   src/hooks/usePlatform.ts
NUEVO   src/hooks/useWindowControls.ts
NUEVO   src/components/Donate/DonateButton.tsx
NUEVO   src/components/Donate/DonateModal.tsx
NUEVO   src/components/Donate/index.ts
EDITADO src/components/TitleBar/TitleBar.tsx   (reescrito)
EDITADO src/components/About/About.tsx         (reescrito)
EDITADO src/components/CommandPalette/CommandPalette.tsx
EDITADO src/stores/uiStore.ts
EDITADO src/App.tsx
```

---

# FASE 2 — Terminal

**Compilación:** `tsc --noEmit` exit 0 · `vite build` exit 0 · `cargo build` exit 0 ·
`cargo test --lib` **4/4 en verde**, incluida una conexión SSH real.

## 2.1 Tema Dark Neon

`src/styles/themes.css` gana el tema `neon`, que pasa a ser el **tema por defecto**
(`:root` y `DEFAULT_SETTINGS.theme`). Negro azulado con acentos cian y magenta,
tanto para la interfaz como para la paleta de 16 colores del terminal:

```
--ct-term-bg   #05060a      --ct-term-cursor  #00e5ff
--ct-term-fg   #e8ecff      --ct-term-red     #ff2e63
--ct-term-cyan #00e5ff      --ct-term-magenta #ff5edb
```

`useTerminal` ya leía la paleta de las variables CSS, así que el cambio de tema se
aplica en caliente sin recrear la sesión: el efecto de opciones vuelve a asignar
`term.options.theme` con `readTerminalTheme()`.

Se añadió `neon` a `ThemeName` y a `THEMES`, de modo que aparece en Ajustes y en la
paleta de comandos.

## 2.2 Backend russh

`src-tauri/src/ssh/client.rs` implementa el transporte. Decisión de diseño clave:
**el núcleo no depende de Tauri**.

```rust
pub struct SessionParams { host, port, username, auth, term, cols, rows, timeout, home_dir }

/// Núcleo puro: se puede probar contra un servidor real sin la app.
pub async fn open_shell(params: &SessionParams)
    -> Result<(Handle<ClientHandler>, Channel<ClientMsg>), String>

/// Capa Tauri: resuelve rutas, divide el canal y lanza las tareas de E/S.
pub async fn open_session(app, request, rx) -> Result<Handle<ClientHandler>, String>
```

Flujo: `client::connect` → autenticación → `channel_open_session` →
`request_pty` → `request_shell` → `split()`.

**Por qué `split()` y no `select!`:** `ChannelReadHalf` y `ChannelWriteHalf`
permiten que lectura y escritura vivan en tareas independientes. Un `select!`
sobre `Channel::wait()` obligaría a razonar sobre la cancelación de esa future;
con dos tareas el problema desaparece y ninguna dirección bloquea a la otra.

`check_server_key` acepta cualquier clave con un `TODO(seguridad)` explícito: falta
contrastar contra `known_hosts` y pedir confirmación al usuario.

## 2.3 Autenticación

| Método | Implementación |
| --- | --- |
| Contraseña | `Handle::authenticate_password` |
| Clave SSH | `load_secret_key(ruta, passphrase)` + `PrivateKeyWithHashAlg::new(Arc<key>, best_supported_rsa_hash())` + `authenticate_publickey` |

Detalles:

- Si no se indica ruta de clave, `resolve_key_path` autodetecta
  `~/.ssh/id_ed25519`, `id_ecdsa` o `id_rsa` en ese orden, con expansión de `~` y
  `$HOME`.
- `best_supported_rsa_hash()` se consulta siempre: para RSA es lo que decide entre
  `rsa-sha2-256/512` y el obsoleto `ssh-rsa`.
- Los errores se traducen a mensajes en castellano con `describeSshError`.

**Flujo de credenciales en la interfaz** (`src/stores/sshStore.ts` + modal):

1. Al conectar, se busca el secreto en el llavero del SO (`secrets_get`).
2. Si lo hay, se usa sin molestar al usuario.
3. Si no, `requestCredentials()` abre el modal y espera una promesa; el modal
   permite alternar entre contraseña y clave, indicar la ruta de la clave y la
   passphrase, y **guardar en el llavero** (nunca en texto plano en disco).
4. Si el servidor rechaza las credenciales —o la clave está cifrada y falta la
   passphrase— se vuelve a preguntar, con el motivo como aviso. Máximo 3 intentos.
5. Los errores que no son de credenciales (host inalcanzable, timeout) no
   reintentan: se muestran en el terminal y en un toast.

El modal se identifica con `key={sessionId-attempt}`, así que cada reintento
reconstruye el formulario con estado limpio.

## 2.4 Integración con xterm.js

`useTerminal` pasa a tener dos modos:

| Modo | Cuándo | Comportamiento |
| --- | --- | --- |
| SSH | la pestaña tiene `connection` | salida real del servidor, entrada por `ssh_write`, resize por `ssh_resize` |
| Local | sin `connection` | shell de demostración (`help`, `clear`, `echo`, `date`, `theme`, `open`) |

Los bytes viajan como `Vec<u8>` y en el frontend se convierten con
`new Uint8Array(payload.data)` antes de `term.write(...)`. Esto **no es un detalle
cosmético**: al pasar bytes en lugar de una cadena, xterm.js decodifica UTF-8 y
respeta los caracteres multibyte que el servidor parta entre dos paquetes SSH
(acentos, emojis, `cmatrix`, etc.). El coste es que cada fragmento se serializa
como un array JSON; la optimización pendiente es usar `tauri::ipc::Channel` con
`InvokeResponseBody::Raw`.

El terminal no se recrea al cambiar de pestaña: las pestañas inactivas quedan
ocultas con `display:none`, y el `ResizeObserver` reajusta el PTY remoto al
volver a mostrarlas.

## 2.5 Verificación con un servidor real

Para no quedarnos en «compila, luego funciona», se levanta un `sshd` de pruebas
en `127.0.0.1:2222` con clave propia y se ejecuta `cargo test --lib`:

```
running 4 tests
test ssh::client::tests::expands_home_prefix ... ok
test ssh::client::tests::rejects_missing_explicit_key ... ok
test ssh::client::tests::wrong_password_is_reported_in_spanish ... ok
test ssh::client::tests::connects_authenticates_and_runs_a_command ... ok

test result: ok. 4 passed; 0 failed
```

La prueba `connects_authenticates_and_runs_a_command` hace el recorrido completo:
conecta, autentica por clave, pide PTY, abre la shell, escribe
`echo cloudterm-smoke-ok` y comprueba que la salida vuelve por el canal. Las
pruebas **se omiten solas** si el sshd de prueba no está levantado, para que
`cargo test` siga sirviendo en cualquier máquina.

Montar el servidor de pruebas:

```bash
D=~/Escritorio/.cloudterm-build/sshd-test
ssh-keygen -q -t ed25519 -f $D/host_ed25519 -N ""
ssh-keygen -q -t ed25519 -f $D/client_ed25519 -N ""
cp $D/client_ed25519.pub $D/authorized_keys
chmod 600 $D/host_ed25519 $D/client_ed25519 $D/authorized_keys
# sshd_config: Port 2222, ListenAddress 127.0.0.1, HostKey, AuthorizedKeysFile,
#              PubkeyAuthentication yes, PasswordAuthentication no, UsePAM no, StrictModes no
/usr/bin/sshd -f $D/sshd_config -D -e
```

## 2.6 Aprendizajes de la API de russh 0.63.3

Detalles que no son evidentes y que costaron una investigación aparte contra el
código fuente de la versión vendorizada:

- `check_server_key` recibe `&PublicKeyOrCertificate` (un enum), **no**
  `&ssh_key::PublicKey`.
- `Handler` solo obliga a definir `type Error`; el resto de métodos tienen
  implementación por defecto, pero la de `check_server_key` devuelve `Ok(false)`,
  así que sin sobrescribirla no se conecta.
- `Channel::data` recibe un `AsyncRead`, no bytes: `channel.data(&buf[..])`.
- `Channel::wait_close` **no existe**; se drena con un bucle sobre `wait()`.
- `russh::pty` es privado: el enum de modos de terminal es `russh::Pty`.
- `connect` devuelve `Result<Handle<H>, H::Error>` mientras que los métodos de
  `Handle` devuelven `Result<_, russh::Error>`.
- `auth::AuthResult` no está reexportado en la raíz: es `russh::client::AuthResult`.

## 2.7 Archivos tocados

```
NUEVO   src/lib/ssh.ts
NUEVO   src/stores/sshStore.ts
NUEVO   src/components/SshAuth/SshAuthModal.tsx
NUEVO   src/components/SshAuth/index.ts
NUEVO   src-tauri/src/ssh/client.rs          (núcleo russh + pruebas)
EDITADO src-tauri/src/ssh/mod.rs             (reescrito: gestor y comandos)
EDITADO src-tauri/src/lib.rs                 (manage + comandos ssh_*)
EDITADO src/hooks/useTerminal.ts             (reescrito: modo SSH + modo local)
EDITADO src/types.ts                         (AuthMethod, Connection.authMethod)
EDITADO src/stores/settingsStore.ts          (Dark Neon por defecto)
EDITADO src/stores/connectionStore.ts
EDITADO src/styles/themes.css
EDITADO src/App.tsx
```

---

# FASE 3 — Hosts sobre SQLite

**Compilación:** `tsc --noEmit` exit 0 · `vite build` exit 0 · `cargo test --lib`
**15/15 en verde** (4 nuevas pruebas de SQLite + 6 del parser de `ssh_config`).

## 3.1 Dependencia

```toml
sqlx = { version = "0.9.0", default-features = false,
         features = ["runtime-tokio", "sqlite", "migrate", "macros"] }
```

`sqlite` compila SQLite embebido, así que no hay dependencia del sistema.
Se evitan las macros `query!` (que exigirían `DATABASE_URL` en tiempo de
compilación): toda la SQL se escribe como cadena y se mapea con
`#[derive(sqlx::FromRow)]`, de modo que el proyecto compila en cualquier máquina
sin preparación previa.

## 3.2 Esquema

`src-tauri/src/db/mod.rs` crea el esquema en la primera consulta. El pool vive en
un `tokio::sync::OnceCell` dentro de `DbState`, así **no hace falta un hook
`setup`** que bloquee el arranque de la ventana: la base se abre y se migra de
forma perezosa.

```sql
CREATE TABLE hosts (
  id, name, host, port, username, protocol,
  group_name, auth_method, private_key_path, use_agent,
  created_at, last_used_at
);
CREATE INDEX idx_hosts_group    ON hosts (group_name);
CREATE INDEX idx_hosts_endpoint ON hosts (host, port, username);

CREATE TABLE settings_kv (key PRIMARY KEY, value, updated_at);
```

Detalles deliberados:

- **`group` es palabra reservada en SQL**, así que la columna se llama
  `group_name` y se expone al frontend como `group` con `#[serde(rename)]`.
- `use_agent` se guarda como `INTEGER` y viaja como `bool`: la conversión la hace
  sqlx y hay una prueba que la cubre.
- Las migraciones se ejecutan **sentencia a sentencia**: SQLite no admite varias
  instrucciones dentro de un mismo `execute`.
- La base vive en `app_data_dir()/cloudterm.db`; `db_location` la expone para
  mostrarla en Ajustes.

## 3.3 CRUD

| Comando | Notas |
| --- | --- |
| `hosts_list` | ordena por grupo y nombre, con `COLLATE NOCASE` |
| `hosts_create` | valida nombre y host; genera id y `created_at` |
| `hosts_update` | actualiza por id y detecta el «no existe» con `rows_affected()` |
| `hosts_delete` | borrado por id |
| `hosts_touch` | actualiza `last_used_at` |
| `hosts_import` | inserción en lote, saltando duplicados |

El frontend dejó de usar `localStorage` (`zustand/persist`) y ahora lee y escribe
en SQLite. `connectionStore` hace **actualización optimista** con reversión: pinta
el cambio de inmediato y, si la base lo rechaza, restaura el estado anterior y
expone el error.

## 3.4 Importar `~/.ssh/config`

`src-tauri/src/db/ssh_config.rs` implementa un lector que respeta la semántica de
OpenSSH («la primera directiva gana» dentro de cada bloque):

- Reconoce `Host`, `HostName`, `User`, `Port` e `IdentityFile`, en las formas
  `Clave valor` y `Clave=valor`, con valores entrecomillados.
- **Descarta los bloques con comodines** (`Host *`, `Host web-?`, `!excluir`): no
  son hosts conectables.
- Usa el **primer alias** como nombre y el alias como `HostName` de reserva.
- Avisa (sin fallar) de los `Include`, que no se siguen, y de los puertos no
  numéricos.
- Asigna el grupo `~/.ssh/config` para que sea fácil distinguir lo importado.

El comando `ssh_config_preview` devuelve la ruta, si existe, las entradas y los
avisos **sin tocar la base**: la interfaz muestra un modal con casillas para que
el usuario elija qué importar, y solo entonces llama a `hosts_import`.

Los duplicados se detectan por la terna `host`/`port`/`username`, así que importar
dos veces es inofensivo.

## 3.5 Pruebas

El esquema y el parser se prueban contra SQLite **en memoria**, sin necesidad de
Tauri ni de tocar los datos del usuario:

```
test db::tests::migrates_and_round_trips_a_host ... ok
test db::tests::primary_key_rejects_duplicates ... ok
test db::tests::ordering_groups_then_names_case_insensitively ... ok
test db::tests::kv_upsert_overwrites_the_previous_value ... ok
test db::ssh_config::tests::parses_hosts_and_skips_wildcards ... ok
test db::ssh_config::tests::uses_first_alias_and_falls_back_to_it_as_hostname ... ok
test db::ssh_config::tests::accepts_equals_syntax ... ok
test db::ssh_config::tests::first_directive_wins_within_a_block ... ok
test db::ssh_config::tests::reports_include_and_bad_port ... ok
test db::ssh_config::tests::ignores_comments_and_directives_outside_a_host_block ... ok
test db::ssh_config::tests::unquotes_values ... ok
```

`migrates_and_round_trips_a_host` es la importante: valida de una vez el SQL de
creación, el `INSERT`, el `SELECT *`, el mapeo `FromRow`, la conversión
`INTEGER ↔ bool` y el `Option<i64>` de `last_used_at`.

## 3.6 Archivos tocados

```
NUEVO   src-tauri/src/db/ssh_config.rs       (parser + 7 pruebas)
NUEVO   src/lib/hosts.ts
NUEVO   src/components/Hosts/ImportSshConfig.tsx
NUEVO   src/components/Hosts/index.ts
EDITADO src-tauri/src/db/mod.rs              (reescrito sobre sqlx + 4 pruebas)
EDITADO src-tauri/src/lib.rs                 (comandos hosts_*)
EDITADO src/stores/connectionStore.ts        (reescrito: SQLite en vez de localStorage)
EDITADO src/stores/uiStore.ts                (importOpen)
EDITADO src/components/Sidebar/Sidebar.tsx   (botón de importar + acciones async)
EDITADO src/components/SshAuth/SshAuthModal.tsx
EDITADO src/components/CommandPalette/CommandPalette.tsx
EDITADO src/App.tsx                          (carga inicial + modal)
EDITADO src-tauri/Cargo.toml                 (sqlx)
```

---

# FASE 4 — SFTP

**Compilación:** `tsc --noEmit` exit 0 · `vite build` exit 0 · `cargo build` exit 0 ·
`cargo test --lib` **18/18 en verde**, con subida y descarga reales contra un
servidor SSH.

## 4.1 Backend

`src-tauri/src/sftp/mod.rs` implementa las tres piezas:

| Comando | Efecto |
| --- | --- |
| `sftp_connect` / `sftp_disconnect` | abre y cierra el subsistema SFTP |
| `sftp_list` | lista un directorio remoto |
| `sftp_mkdir` / `sftp_remove` / `sftp_rename` | operaciones sobre el remoto |
| `sftp_upload` / `sftp_download` | transfieren con progreso |
| `local_home` / `local_list` / `local_mkdir` | panel local |

### Conexión propia para SFTP

`ssh::client::open_sftp` abre **su propia conexión SSH**, en lugar de reutilizar
la del terminal. La razón es concreta: `SftpSession::new` consume el canal con
`into_stream()` y exige un stream `'static`, mientras que el `Handle` del
terminal vive detrás de un `Mutex` síncrono que no se puede mantener bloqueado
durante un `.await` sin volver insensible (`!Send`) la future del comando.

El coste es una conexión extra por panel; la ganancia es que **una transferencia
larga nunca bloquea el terminal** y el modelo de propiedad queda trivial.

`connect_and_auth` se extrajo como base común de `open_shell` y `open_sftp`, así
que ambas rutas comparten configuración, timeouts y autenticación.

### Transferencias

Sin helpers en `russh-sftp`: se hace un bucle de lectura/escritura de 64 KiB. Dos
detalles que importan:

- La subida usa **`create()`**, no `write()`. `SftpSession::write` abre solo con
  `OpenFlags::WRITE`, sin `CREATE` ni `TRUNCATE`: fallaría si el fichero no
  existe y no vaciaría el contenido anterior.
- La subida termina con **`File::close(self).await`**, que espera el acuse del
  servidor. Soltar el `File` sin cerrar descarta los errores de escritura.

El progreso se emite por `sftp://progress` como máximo cada 256 KiB, para no
saturar el IPC con un evento por bloque.

### Listado

Un único tipo `FsEntry` sirve para ambos lados. En remoto se usa el `FileType` del
paquete `NAME`; si el servidor no envía atributos, se pide un `stat` **solo para
ficheros** (pedirlo para cada directorio de un `node_modules` sería un desastre de
latencia). En local, `symlink_metadata` detecta el enlace y `metadata` resuelve si
apunta a un directorio.

## 4.2 Panel dual

`src/components/SFTP/SFTPPanel.tsx` se reescribió por completo:

- Selector de host y botón **Conectar** que reutiliza el mismo flujo de
  credenciales que el terminal (llavero → modal).
- Dos paneles con navegación (doble clic para entrar), subir un nivel, refrescar
  y crear carpeta.
- **Layout adaptable**: un `ResizeObserver` mide el ancho real del panel y apila
  los paneles en vertical por debajo de 560 px. Sin esto, el panel lateral de la
  aplicación (320 px) dejaba dos listas ilegibles. No sirve un breakpoint de
  Tailwind porque depende del viewport, no del contenedor.
- Cada instancia montada genera su propio `sessionId`, de modo que el panel puede
  estar abierto a la vez en una pestaña y en el panel lateral sin que uno cierre
  la sesión del otro.

## 4.3 Drag & drop

Se usa **drag & drop HTML5**, posible porque `tauri.conf.json` declara
`"dragDropEnabled": false`: así el webview no intercepta los eventos nativos y
`dragstart`/`dragover`/`drop` llegan a React.

| Acción | Resultado |
| --- | --- |
| Arrastrar un fichero local al panel remoto | se encola una **subida** |
| Arrastrar un fichero remoto al panel local | se encola una **descarga** |
| Doble clic en un fichero | lo transfiere al otro panel |
| Doble clic en un directorio | entra en él |

El panel destino se resalta mientras se arrastra algo transferible, y solo se
marcan como `draggable` los ficheros: arrastrar una carpeta no haría nada útil
todavía. Como alternativa accesible, cada fila tiene un botón de transferir y
doble clic equivalente.

## 4.4 Cola de transferencias

`src/stores/transferStore.ts` + `TransferQueue.tsx`. La cola es **secuencial a
propósito**: `russh-sftp` aplica un timeout de 10 s por petición medido desde el
envío, y `File` preencola hasta 16 lecturas o escrituras; lanzar varias
transferencias en paralelo sobre la misma sesión multiplica las peticiones en
vuelo y provoca `Error::Timeout` en servidores lentos.

Cada transferencia muestra estado, barra de progreso, bytes transferidos y, si
falla, el error. `completedAt` se incrementa al terminar cada una, y el panel
recarga ambos directorios cuando cambia.

## 4.5 Verificación

Además de las pruebas unitarias de rutas y ordenación, la prueba de integración
hace el recorrido completo contra el `sshd` local:

```
test sftp::tests::uploads_and_downloads_round_trip ... ok
test sftp::tests::joins_and_walks_paths ... ok
test sftp::tests::sorts_directories_before_files ... ok
```

`uploads_and_downloads_round_trip` conecta por SFTP, canonicaliza el directorio
inicial, lista, **sube 56 KB**, comprueba que el fichero aparece en el listado con
el tamaño correcto, **lo descarga a disco y compara byte a byte** el contenido,
para acabar limpiando el fichero remoto y los temporales.

## 4.6 Pendiente y consciente

- **Copia recursiva de directorios.** El arrastre de carpetas avisa de que no está
  soportado; implementarlo requiere un recorrido en anchura que replique la
  jerarquía remota y encolar cada fichero.
- **Cancelar una transferencia en curso.** Hoy se puede quitar de la lista, pero no
  abortar la operación.
- **Reanudar transferencias interrumpidas** (`russh-sftp` no lo trae de serie).
- **FTP/FTPS con `suppaftp`.** La dependencia está declarada y compilada, y el
  panel está preparado para un segundo transporte, pero solo SFTP está conectado.

## 4.7 Archivos tocados

```
NUEVO   src/lib/sftp.ts
NUEVO   src/stores/transferStore.ts
NUEVO   src/components/SFTP/TransferQueue.tsx
EDITADO src/components/SFTP/SFTPPanel.tsx    (reescrito: panel dual + DnD)
EDITADO src-tauri/src/sftp/mod.rs            (reescrito: SFTP real + 3 pruebas)
EDITADO src-tauri/src/ssh/client.rs          (connect_and_auth + open_sftp)
EDITADO src-tauri/src/ssh/mod.rs             (client accesible desde sftp)
EDITADO src-tauri/src/lib.rs                 (SftpManager + comandos)
```

---

# Resumen de verificación

```
npx tsc --noEmit      → exit 0
npx vite build        → exit 0
cargo build           → exit 0
cargo test --lib      → 18 passed; 0 failed
npm run tauri dev     → ventana abierta, Vite en http://localhost:1420
```

Las 18 pruebas cubren: helper de rutas del parser SSH (2), parser de
`~/.ssh/config` (7), esquema SQLite (4), transporte SSH real (4) y SFTP real (3).
Dos de ellas hablan por red con un `sshd` de pruebas y se omiten solas si no está
levantado.

---

# FASE 5 — Rediseño visual (ejemplo visual)

**Verificación:** `tsc --noEmit` exit 0 · `vite build` exit 0 · `cargo test --lib`
**18/18** · y, además, **capturas de pantalla reales** de la aplicación en marcha.

Se recibió un vídeo de referencia (`CONTEXTO__Estás_construyendo_l.mp4`, 10 s,
1280×720). Como no se puede leer un MP4 directamente, se extrajeron fotogramas con
`ffmpeg -vf fps=1` y se analizaron como imágenes. El mockup pide una interfaz tipo
editor: activity bar, barra de menús, árbol de hosts con estado, barra de estado y
—lo más distintivo— **Pixel Agents**, una escena isométrica pixel-art donde cada
host SSH es un personaje en su escritorio.

## 5.1 Qué se añadió

| Elemento del mockup | Implementación |
| --- | --- |
| Activity bar | `components/ActivityBar/` — riel de 48 px con 5 vistas, indicador lateral de activo y badge rojo con las sesiones SSH vivas |
| Barra de menús | `TitleBar` gana **Archivo / Editar / Ver / Ayuda** con desplegables (cierre al clic fuera y con `Escape`) |
| Buscador central | disparador de la paleta, con el ancho y la posición del mockup |
| Iconos de la derecha | campana con punto de notificaciones, paleta, donativo, ajustes, acerca de, barra lateral y avatar |
| Árbol de hosts | `Sidebar` reescrito: grupos plegables con contador, avatar circular por host, píldora verde **Online** y punto de estado |
| Botón «+ New host» | botón punteado en acento, abre el nuevo `NewHostDialog` |
| Pantalla de bienvenida | `components/Welcome/` — título con degradado, atajos `Ctrl + K` en teclas con brillo, 4 acciones rápidas, rejilla en perspectiva y nubes pixel-art |
| Barra de estado | `components/StatusBar/` — fps reales, vista activa, hosts, sesiones, cola, conexión, UTF-8, SSH y reloj |
| **Pixel Agents** | `components/PixelAgents/` — escena isométrica SVG |
| Paleta | `neon` reajustado al mockup: fondo casi negro con tinte azul y acento cian/teal |

## 5.2 Pixel Agents

Una escena SVG isométrica con un puesto de trabajo por host:

- **Proyección** `x = (gx − gy)·30`, `y = (gx + gy)·15`, con las caras dibujadas en
  orden trasero→delantero (algoritmo del pintor) para que la oclusión sea correcta.
- **Personaje pixel-art** hecho de rectángulos con `shape-rendering="crispEdges"`.
  El color del pelo y de la camiseta se deriva del nombre del host con un hash
  FNV-1a, así que **el mismo host siempre se ve igual** y dos hosts distintos nunca
  se confunden.
- **Monitor** con tres líneas de código cuya opacidad depende del estado, y
  **auriculares** del color del estado (verde en línea, gris offline, ámbar sin
  comprobar).
- **Chip flotante** con nombre y latencia real (de `probe_host`).
- **Clic en un agente** abre su terminal; el sondeo se lanza por lotes de 6 para no
  falsear las latencias.

## 5.3 La verificación visual encontró un bug real

Compilar no basta. Para comprobar el resultado se capturó la ventana en marcha:

```bash
export XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-1
hyprctl clients                       # geometría: cloudterm en 3242,81 1231x1352
grim pantalla.png
magick pantalla.png -crop 1231x1352+3242+81 +repage ventana.png
```

El primer fotograma delató un error que ningún test habría pillado: **los
escritorios aparecían lejos de sus personajes**, con mesas huérfanas en el fondo.

La causa: `Slab` y el monitor calculaban sus vértices con `face([gx, gy, …])`, es
decir en coordenadas **absolutas**, pero se renderizaban dentro de un
`<g transform="translate(base)">` ya trasladado al punto base. El desplazamiento se
aplicaba dos veces y cada escritorio se alejaba el doble que su personaje. Se
corrigió dibujándolos en coordenadas locales `(0, 0)`, con un comentario en el
código para que no se reintroduzca.

## 5.4 Capturas

En `docs/capturas/`:

| Archivo | Contenido |
| --- | --- |
| `01-inicio.png` | pantalla de bienvenida |
| `02-terminal.png` | vista de terminales con el shell local |
| `03-pixel-agents.png` | escena isométrica con 7 agentes |
| `comparacion-inicio.png` | mockup vs. implementación (inicio) |
| `comparacion-terminal.png` | mockup vs. implementación (terminal) |
| `comparacion-pixel-agents.png` | mockup vs. implementación (Pixel Agents) |

## 5.5 Notas de método

- Para forzar cada vista durante la verificación se cambió temporalmente
  `activeView` por defecto en `uiStore` y se dejó que HMR recargara. `ydotool` no
  sirvió: `/dev/uinput` no existe en este entorno, así que no hay inyección de
  teclado. El valor se restauró a `"welcome"` al terminar.
- Los 6 hosts usados para poblar la escena eran temporales (`test-pixel-*`) y se
  borraron de SQLite al acabar, dejando la base exactamente como estaba.

## 5.6 Pendiente

- **Arrastrar ficheros desde el gestor de archivos del sistema** al panel SFTP:
  exige poner `dragDropEnabled: true` y usar los eventos nativos de Tauri, que hoy
  están desactivados justamente para que funcione el drag & drop interno.
- **Animar a los agentes** (teclear, levantarse) cuando su sesión está activa.
- Los enlaces de donativo ya no son marcadores de posición: están verificados y
  activos (ver §1.3).

## 5.7 Archivos tocados

```
NUEVO   src/components/ActivityBar/{ActivityBar.tsx,index.ts}
NUEVO   src/components/StatusBar/{StatusBar.tsx,index.ts}
NUEVO   src/components/Welcome/{WelcomeScreen.tsx,index.ts}
NUEVO   src/components/PixelAgents/{PixelAgents.tsx,index.ts}
NUEVO   src/components/Hosts/NewHostDialog.tsx
NUEVO   src/hooks/useFps.ts
NUEVO   docs/capturas/                        (6 imágenes)
EDITADO src/components/TitleBar/TitleBar.tsx  (reescrito: menús + acciones)
EDITADO src/components/Sidebar/Sidebar.tsx    (reescrito: árbol de hosts)
EDITADO src/components/TabBar/TabBar.tsx      (avatares por host)
EDITADO src/components/Hosts/index.ts
EDITADO src/components/CommandPalette/CommandPalette.tsx
EDITADO src/stores/uiStore.ts                 (activeView, grupos, newHostOpen)
EDITADO src/stores/connectionStore.ts         (sondeo de estado)
EDITADO src/hooks/useKeyboardShortcuts.ts     (Ctrl+1..4)
EDITADO src/lib/ssh.ts                        (probeHost)
EDITADO src/lib/utils.ts                      (hash, iniciales, latencia)
EDITADO src/styles/themes.css                 (paleta del mockup)
EDITADO src/App.tsx                           (nuevo layout de 5 zonas)
```

## 5.8 Comando `ssh` en el shell local

Al probar la aplicación se escribió `ssh 192.0.2.10 -p 2222` en la pestaña de
shell local y la respuesta fue `ssh: command not found`. Es un fallo real de
diseño: `ssh` es **lo primero que teclea cualquiera** en un cliente de terminal, y
responder «orden no encontrada» deja al usuario sin salida.

Ahora el shell local entiende:

| Comando | Efecto |
| --- | --- |
| `ssh [usuario@]host [-p puerto]` | busca el host entre los guardados, lo crea si es nuevo, y **convierte esa misma pestaña** en la sesión SSH |
| `hosts` | lista los hosts guardados con su endpoint y protocolo |
| `sftp` | indica dónde vive el panel de archivos (vista Archivos, `Ctrl+3`) |
| `help` | documenta todo lo anterior |

Detalles de la implementación:

- Se parsean `-p`/`--port` y se **ignoran** el resto de opciones (`-i`, `-o`, `-v`…)
  en vez de fallar: es lo que espera quien viene de OpenSSH.
- La búsqueda es por `host` + `puerto` exactos y, si no hay coincidencia, por
  `host` solo; en ese caso se avisa de que se usará el puerto guardado.
- Si el host no existe se guarda en SQLite (diciéndolo por pantalla) y se lanza un
  sondeo de estado, para que aparezca ya en el árbol y en Pixel Agents.
- El cambio de pestaña se **aplaza con `setTimeout`**: hacerlo dentro del propio
  manejador de `onData` desmontaría el terminal mientras se ejecuta su callback.
- Se añadió `setTabConnection` a `tabStore`, que reasigna la conexión de una
  pestaña existente y reinicia su estado.

El banner del shell local también se reescribió para que el comando sea
descubrible, en dos líneas cortas: la versión anterior medía 95 caracteres y xterm
la partía dejando un «elp» huérfano en la línea siguiente.

```
EDITADO src/hooks/useTerminal.ts   (ssh / hosts / sftp + banner)
EDITADO src/stores/tabStore.ts     (setTabConnection)
```

> **Nota de verificación.** Este cambio está comprobado con `tsc`, `vite build` y
> la captura del banner en pantalla. La ejecución del comando en sí **no** pudo
> automatizarse: en este entorno no hay inyección de teclado (`/dev/uinput` no
> existe), así que la ruta `ssh` → `hosts_create` → `ssh_connect` queda pendiente
> de una prueba manual. Lo que sí está cubierto por pruebas es el comando Rust
> `ssh_connect` subyacente.




---

# FASE 6 — Seguridad: verificación de `known_hosts`

**Verificación:** `cargo build` exit 0 · `cargo test --lib` **30/30** ·
`tsc --noEmit` exit 0 · `vite build` exit 0.

Era el riesgo número uno del proyecto: `check_server_key` devolvía `Ok(true)`
siempre, así que cualquiera en medio de la conexión podía hacerse pasar por el
servidor. Ahora CloudTerm rechaza las claves que no reconoce.

## 6.1 Almacén (`src-tauri/src/ssh/known_hosts.rs`)

Formato OpenSSH, una línea por clave, con el puerto 22 omitido como hace
OpenSSH y cualquier otro entre corchetes:

```
servidor.example.com ssh-ed25519 AAAAC3NzaC1lZDI1...
[otro.example.com]:2222 ssh-ed25519 AAAAB3NzaC1yc2E...
```

| Elemento | Detalle |
| --- | --- |
| `KnownHosts::check` | devuelve `Match`, `New` o `Mismatch { old_fingerprint }` |
| `add` / `remove` / `clear` | escritura **atómica**: fichero temporal y `rename` |
| `list` | entradas ordenadas por host y puerto, con la huella ya calculada |
| `fingerprint` | `SHA256:...` en base64, el mismo formato que `ssh-keygen -lf` |

Las entradas con hash (`|1|...`) y los comentarios se ignoran al leer: no se
pueden casar por nombre.

## 6.2 El handshake ya no acepta a ciegas

`ClientHandler` pasa a tener un `TrustContext` con el `AppHandle` y el destino.
El flujo, en `check_server_key`:

| Caso | Qué ocurre |
| --- | --- |
| Coincide | Se conecta |
| Host desconocido | Se emite `ssh://host-key-new`, **se espera la decisión del usuario** y se guarda si acepta |
| Clave cambiada | Se emite `ssh://host-key-mismatch`, se espera, y **por defecto se rechaza** |
| Sin interfaz (headless) | Desconocido → TOFU (guardar y seguir); cambiado → rechazar |

La decisión viaja por un canal `oneshot`: el handshake SSH se queda **bloqueado**
esperando, que es la única forma de preguntar *antes* de confiar. El registro de
decisiones pendientes vive en el estado `HostKeyPrompts`.

## 6.3 Interfaz

- `HostKeyDialog.tsx` — dos variantes: la de host desconocido (chip cian, huella
  y tres botones: *Aceptar y guardar* / *Solo esta vez* / *Cancelar*) y la de
  cambio de clave (fondo rojo, ⚠️ grande, huella anterior tachada frente a la
  nueva, y *Aceptar de todos modos (peligroso)*).
- `KnownHostsSettings.tsx` — en Ajustes: lista de claves con su huella, borrado
  individual, vaciado completo y botón para abrir el fichero.

## 6.4 Comandos nuevos

`known_hosts_list` · `known_hosts_add` · `known_hosts_remove` ·
`known_hosts_clear` · `known_hosts_decide` (además del `known_hosts_path` que ya
existía).

## 6.5 Pruebas (12 nuevas)

```
test_parse_openssh_format · test_parse_no_port
test_parse_ignores_comments_and_hashed_entries · test_host_key_round_trip
test_fingerprint_sha256 · test_check_new_host · test_check_match
test_check_match_with_custom_port · test_check_mismatch
test_add_and_remove · test_add_replaces_existing_entry
test_file_format_is_openssh_compatible
```

Usan **claves ed25519 reales** generadas con `ssh-keygen` (una inventada falla al
decodificar el blob y no probaría nada) y la huella esperada se contrastó con
`ssh-keygen -lf`.

> **Nota.** Sigue sin verificarse el *certificado* de host (`PublicKeyOrCertificate::Certificate`);
> de momento se trata como clave pública. Es el siguiente paso natural.

---

# FASE 7 — IA: transporte real

**Verificación:** `cargo build` exit 0 · `cargo test --lib` **35/35** ·
`tsc --noEmit` exit 0 · `vite build` exit 0 (788 kB, 220 kB gzip).

El panel de IA existía pero no llamaba a ningún modelo. Ahora habla con
proveedores de verdad y **va pintando la respuesta según llega**.

## 7.1 Dos dialectos, un solo camino

`src-tauri/src/ai/mod.rs` cubre lo que hace falta para casi todo el mercado:

| Proveedor | Petición | Respuesta |
| --- | --- | --- |
| **Ollama** | `POST /api/chat` con `stream: true` | una **línea JSON** por fragmento |
| **Compatible con OpenAI** (DeepSeek, LM Studio, vLLM…) | `POST /chat/completions` con `stream: true` | **SSE**: `data: {...}` y `data: [DONE]` |

El parseo vive en funciones puras —`parse_ollama_line`, `parse_sse_line`,
`build_chat_body`— para poder probarlo sin red. El motor lee el flujo por
trozos, va cortando por líneas completas y emite `ai://chunk` con
`{ sessionId, delta, done, error }`.

Un fallo **no lanza excepción hacia el vacío**: se emite un último fragmento con
`error` para que la interfaz conserve lo que ya había escrito el modelo.

## 7.2 Cancelación

`AiManager` guarda un `Arc<AtomicBool>` por conversación; `ai_cancel` lo levanta
y el bucle de lectura corta en la siguiente iteración. `ai_active` lista las que
siguen vivas.

## 7.3 Configuración

`~/.config/com.pilahito.cloudterm/ai.json` con tres proveedores por defecto
(Ollama local, DeepSeek y uno genérico compatible con OpenAI) y, **nunca en el
JSON**, las claves de API: van al llavero con `ai_set_api_key`. `ai_has_api_key`
permite a la interfaz saber si hay clave sin poder leerla.

## 7.4 Comandos nuevos

`ai_config_get` · `ai_config_set` · `ai_set_api_key` · `ai_has_api_key` ·
`ai_models` · `ai_test_provider` · `ai_chat` · `ai_cancel` · `ai_active`.

## 7.5 Interfaz

- `AIPanel.tsx` reescrito: selectores de proveedor y modelo, chips con los
  modelos disponibles, lista de mensajes con **markdown ligero** (bloques de
  código cercados y prosa), respuesta escribiéndose en vivo con cursor, botones
  de enviar, cancelar, limpiar y copiar, e indicador de estado por color.
- `AISettings.tsx`: interruptor general, URL base, modelo, clave de API, botón
  **Probar conexión**, temperatura, tope de tokens e instrucciones del sistema.
- `useAiStore` mantiene la conversación y descarta los fragmentos de otras
  sesiones.

## 7.6 Un hallazgo: Qwen3 «piensa» antes de responder

La prueba contra el servidor real destapó que las respuestas traen
`message.thinking` con `content` vacío mientras el modelo razona. El parser lo
ignora como respuesta pero **lo extrae aparte**, porque confundirlo con un
fragmento vacío hacía que la conversación pareciera no producir nada. El mismo
campo existe como `reasoning_content` en proveedores compatibles con OpenAI.

## 7.7 Pruebas (5 nuevas)

```
test_parse_ollama_line · test_parse_sse_chunk · test_build_chat_body
test_ai_config_defaults · test_ai_chat_real
```

`test_ai_chat_real` **habla con Ollama de verdad** y comprueba que se extrae
texto (o razonamiento) de una respuesta real; se omite sola si el servidor no
está levantado.

> **Corrección de un test.** `test_build_chat_body` falló al comparar `0.2`
> directamente: `f32` no representa ese decimal de forma exacta. Ahora se compara
> con tolerancia, que es como hay que comparar flotantes.

---

# FASE 8 — Pixel Agents: animaciones

**Verificación:** `tsc --noEmit` exit 0 · `vite build` exit 0.

Los personajes eran estáticos. Ahora respiran, teclean y se quejan.

## 8.1 Un personaje con vida propia

`PixelCharacter.tsx` sustituye al grupo de rectángulos que había incrustado en la
escena. Sigue dibujándose con bloques y `shapeRendering="crispEdges"` —el color
del pelo y la camiseta sale del hash del nombre— pero ahora es un `motion.g`.

| Estado | Animación |
| --- | --- |
| **En línea** | Respiración `scaleY [1, 1.03, 1]` en 3 s; los auriculares laten |
| **Con sesión abierta** | Los brazos teclean alternos, `y [0, ∓2.4, 0]` cada 0.4 s |
| **Latencia > 100 ms** | La cabeza niega despacio, con 3 s de pausa entre intentos |
| **Sin conexión** | Quieto, auriculares grises |
| **Entrada** | Deslizamiento desde la izquierda con muelle, escalonado 100 ms |

`useAgentActivity` cruza las pestañas abiertas con el estado que publica el
backend para saber qué hosts tienen sesión viva. El identificador de sesión SSH
**es** el de la pestaña, así que basta con un `Set`.

## 8.2 Accesibilidad y rendimiento

- Con **`prefers-reduced-motion`** (`useReducedMotion` de Motion) el personaje se
  queda completamente quieto. La información sigue estando en el chip, en el
  color de los auriculares y en el punto de estado.
- Solo se animan `transform` y `opacity`, con `will-change: transform` y
  `transform-box: fill-box` para que el origen sea el propio personaje.
- `useAgentActivity` devuelve un `Set` y no una función: su identidad es estable
  y no provoca renders en cascada.

---

# FASE 9 — Easter egg: Pixel Agents se desbloquea donando

**Verificación:** `tsc --noEmit` exit 0 · `vite build` exit 0 (805 kB, 224 kB gzip)
· `cargo test --lib` **35/35**.

Pixel Agents deja de estar visible para todo el mundo: es un premio para quien
apoya el proyecto.

## 9.1 Mecánica

1. Un usuario nuevo **no ve** el icono en la barra lateral.
2. Si llega por la paleta de comandos o por `Ctrl+4`, se encuentra un candado
   pixelado con un botón para apoyar el proyecto.
3. Al pulsar **Buy Me a Coffee** o **PayPal** se anota el instante y se abre el
   navegador del sistema; la ventana pierde el foco.
4. Si vuelve **pasados más de 10 s** (y menos de 5 min), se desbloquea.

El margen de 5 minutos evita regalar el easter egg por una ausencia larga
cualquiera: si se pasa el tiempo, el clic se olvida.

Al desbloquear: aparece el icono con la insignia **✨ NUEVO**, un aviso con
degradado y botón *Ver ahora*, y la primera visita a la escena reproduce la
entrada escalonada con confeti pixelado.

## 9.2 Estado (`cloudterm-easter-eggs` en localStorage)

```json
{
  "npcsUnlocked": true,
  "unlockedAt": 1789321381000,
  "unlocksCount": 1,
  "showNpcs": true,
  "discreetMode": false,
  "hiddenUntil": null,
  "introPlayed": true,
  "badgeSeen": true,
  "donateClickTime": null
}
```

## 9.3 Vista de configuración

`EasterEggSettings.tsx`, en **Ajustes → Easter Eggs**. Solo se muestra si hay algo
que enseñar o si estamos en desarrollo.

- **Estado**: si está desbloqueado, con fecha y número de veces.
- **Visibilidad**: mostrar en la barra lateral · modo discreto · sonidos.
- **Acciones**: reiniciar contador · ocultar 30 días (y volver a mostrar) ·
  reproducir la animación de entrada.
- **Zona peligrosa**: eliminar el desbloqueo (*CONFIRMAR*) · resetear todos los
  easter eggs (*RESET*) · resetear CloudTerm entero (*CONFIRMAR*, solo en dev).
- **Desarrollo**: desbloquear sin donar y volcar el estado interno en JSON.

Las acciones destructivas piden **escribir una palabra**, no un simple «¿seguro?».

## 9.4 Archivos

```
NUEVO   src/stores/easterEggStore.ts
NUEVO   src/hooks/useDonationUnlock.ts
NUEVO   src/components/PixelAgents/PixelLock.tsx
NUEVO   src/components/PixelAgents/PixelConfetti.tsx
NUEVO   src/components/Settings/EasterEggSettings.tsx
EDITADO src/components/Donate/DonateModal.tsx   (marca el clic)
EDITADO src/components/ActivityBar/ActivityBar.tsx
EDITADO src/components/TabBar/TabBar.tsx
EDITADO src/components/PixelAgents/PixelAgents.tsx
EDITADO src/components/Toast/Toast.tsx          (tipo `unlock`)
EDITADO src/components/CommandPalette/CommandPalette.tsx
EDITADO src/components/Settings/Settings.tsx
EDITADO src/stores/uiStore.ts                   (duración del aviso)
EDITADO src/types.ts · src/stores/settingsStore.ts   (ajuste `sounds`)
EDITADO src/App.tsx
```

---

# 10. «No conecta con mi servidor»: tiempo de espera del handshake

Síntoma: `usuario@192.0.2.10:2222` responde al `ping` en 1,3 ms y el puerto
acepta la conexión TCP al instante, pero CloudTerm termina en error.

## 10.1 Diagnóstico

Se midió la ruta completa contra el servidor real:

| Comprobación | Resultado |
| --- | --- |
| `ping 192.0.2.10` | 1,3 ms |
| Puerto 22 | filtrado |
| Puerto 2222 | TCP abierto en ~1 ms |
| Banner SSH (primer contacto) | **> 35 s** |
| Banner SSH (contactos siguientes) | 0,0 s |
| `ssh -o ConnectTimeout=8` | *Connection timed out during banner exchange* |

La clave está en la última fila: el TCP se establece enseguida, pero el
servidor tarda más de 35 s en enviar su identificación en el **primer**
contacto y luego responde al instante. Es la firma clásica de `UseDNS yes` en
`sshd_config`: el servidor hace una búsqueda DNS inversa de la IP del cliente,
la primera resuelve por tiempo de espera y las siguientes salen de la caché.

Medido en tres intentos seguidos con la misma máquina cliente:

| Intento | Tiempo | Resultado |
| --- | --- | --- |
| 1.º | 35,04 s | *Connection timed out during banner exchange* |
| 2.º | 0,25 s | llega a la fase de autenticación |
| 3.º | 0,30 s | llega a la fase de autenticación |

Es decir: **la primera conexión siempre falla y la segunda siempre funciona**,
porque el primer intento deja la respuesta DNS en la caché del servidor. Ese es
el peor comportamiento posible para quien usa la aplicación.

CloudTerm envolvía **todo el handshake** (`client::connect`, que incluye TCP,
intercambio de claves y verificación de la clave del servidor) en un único
presupuesto de 15 s:

```rust
tokio::time::timeout(params.timeout, client::connect(...))
```

15 s < 25 s, así que la conexión moría antes de llegar siquiera a pedir la
contraseña. No era un problema de credenciales ni de `known_hosts`.

## 10.2 Corrección

El presupuesto deja de estar fijado en el frontend y pasa a ser **un ajuste por
host**, guardado en SQLite:

- `hosts.timeout_ms INTEGER NOT NULL DEFAULT 60000`.
- Expuesto como `timeoutMs` en la API (`Connection` / `HostInput`).
- Valor por defecto: **60 s**, holgado frente a los más de 35 s medidos.
- Si el presupuesto se agota **antes de autenticar**, la terminal reintenta una
  vez con las mismas credenciales: como el primer intento ya calentó la caché
  del servidor, el segundo conecta al instante.
- Editable en el nuevo diálogo **Propiedades del host**, con un botón
  *Probar conexión* que usa el mismo presupuesto antes de guardar.
- El mensaje de error ahora explica la causa y sugiere subir el valor en lugar
  de dejar un «tiempo de espera agotado» a secas.

### Migración

`ALTER TABLE` no admite `IF NOT EXISTS` en SQLite, así que la columna se añade
con un `ALTER TABLE hosts ADD COLUMN ...` cuyo error por columna duplicada se
ignora de forma explícita. Las bases ya existentes heredan `60000`, nunca `0`.

## 10.3 Un fallo que apareció al probar: migrar sobre un pool vivo

La primera versión de la migración añadía la columna **sobre el pool ya
abierto**, que es lo natural:

```rust
let pool = SqlitePoolOptions::new().max_connections(4)/*…*/.connect_with(opts).await?;
migrate(&pool).await?;   // ← el ALTER corre aquí, con el pool vivo
```

Al arrancar el binario nuevo contra la base antigua, la aplicación **panicó**:

```
thread 'sqlx-sqlite-worker-0' panicked at sqlx-sqlite-0.9.0/src/row.rs:43:51:
index out of bounds: the len is 12 but the index is 12
```

El `ALTER TABLE` sí había funcionado (la columna quedaba creada), pero alguna
conexión del pool conservaba los metadatos del esquema anterior: el `SELECT *`
seguía reportando 12 columnas mientras el modelo `Host` ya pedía 13.

El fallo era **transitorio** —al segundo arranque la columna ya existía y todo
iba bien—, pero lo habría sufrido todo el mundo al actualizar. La solución es
migrar en una conexión propia que se cierra antes de crear el pool:

```rust
let bootstrap = SqlitePoolOptions::new().max_connections(1)/*…*/.connect_with(opts).await?;
let migrated = migrate(&bootstrap).await;
bootstrap.close().await;   // ← no sobrevive ningún metadato viejo
migrated?;
let pool = SqlitePoolOptions::new().max_connections(4)/*…*/.connect_with(opts).await?;
```

La lógica vive en `db::open_database`, que es lo que se prueba.

## 10.4 Pruebas (3 nuevas)

- `adds_the_timeout_column_to_an_old_database` crea a mano una base con el
  esquema antiguo en un fichero temporal, la abre con `open_database` —el mismo
  camino que usa la aplicación—, comprueba que la columna aparece con el valor
  por defecto y que reabrir no falla. Cubre la ruta que `memory_pool()` no toca,
  porque allí la tabla ya nace con la columna.
- `a_migrated_database_round_trips_hosts` guarda un host, cierra el pool, lo
  reabre y verifica que todo sigue en su sitio.
- `migrates_and_round_trips_a_host` ahora verifica que `timeout_ms` sobrevive al
  ida y vuelta.

Verificado además de extremo a extremo: se fabricó una base con el esquema
antiguo (12 columnas) en la ruta real, se arrancó el binario de release y
migró sin quejarse, dejando `servidor-de-prueba` con `timeout_ms = 60000`.

## 10.5 Nota para el servidor

Subir el tiempo de espera arregla el lado del cliente, pero la causa está en el
servidor. En `/etc/ssh/sshd_config`:

```
UseDNS no
```

y `sudo systemctl restart ssh`. Ahorra más de 35 s a **cualquier** cliente nuevo que
se conecte, no solo a CloudTerm.

## 10.6 Archivos

```
NUEVO   src/components/Hosts/HostSettingsDialog.tsx
NUEVO   src/components/Hosts/fields.tsx
EDITADO src-tauri/src/db/mod.rs              (columna, migración, consultas)
EDITADO src-tauri/src/db/ssh_config.rs
EDITADO src-tauri/src/ssh/client.rs          (60 s y mensaje de error)
EDITADO src-tauri/src/sftp/mod.rs
EDITADO src/types.ts · src/lib/hosts.ts
EDITADO src/stores/connectionStore.ts · src/stores/uiStore.ts
EDITADO src/hooks/useTerminal.ts
EDITADO src/components/SFTP/SFTPPanel.tsx
EDITADO src/components/Hosts/NewHostDialog.tsx · index.ts
EDITADO src/components/Sidebar/Sidebar.tsx
EDITADO src/App.tsx
```

---

# 11. «No se conecta» era en realidad «no abre»: cierre instantáneo en Wayland

Durante toda la fase 10 se dio por supuesto que el problema era la conexión SSH.
El síntoma real del usuario era otro:

> «no abre se cierra instantáneo»

La aplicación arrancaba y moría en el acto, sin llegar a mostrar nada.

## 11.1 Diagnóstico

Lanzando el binario sin variables de entorno, como hace el icono del escritorio:

```text
$ ~/.local/bin/cloudterm
Gdk-Message: 23:22:33.364: Error 71 (Error de protocolo) dispatching to Wayland display.
```

El proceso terminaba en menos de un segundo. La sesión del usuario es
**Wayland con Hyprland** (`XDG_SESSION_TYPE=wayland`, `WAYLAND_DISPLAY=wayland-1`).

Los lanzamientos de prueba anteriores sí funcionaban porque se hacían con
`WEBKIT_DISABLE_DMABUF_RENDERER=1` en el entorno, y esa variable **no estaba en
el lanzador del escritorio**. De ahí que el fallo fuese invisible desde la
terminal y sistemático desde el icono.

Probando cada variable por separado, las tres evitan el cierre:

| Entorno | Resultado |
| --- | --- |
| *(ninguno)* | ❌ se cierra al instante |
| `WEBKIT_DISABLE_DMABUF_RENDERER=1` | ✅ se mantiene abierta |
| `WEBKIT_DISABLE_COMPOSITING_MODE=1` | ✅ se mantiene abierta |
| `GDK_BACKEND=x11` | ✅ se mantiene abierta |

## 11.2 Corrección

Se aplica **dentro del binario**, en `main`, antes de que Tauri cree la ventana y
WebKitGTK se inicialice. Así funciona se lance como se lance —icono, terminal o
`Exec` del `.desktop`— en vez de depender de que cada lanzador traiga la
variable.

```rust
fn main() {
    ajustar_entorno_grafico();
    cloudterm_lib::run()
}
```

Detalles de la decisión:

- Se elige `WEBKIT_DISABLE_DMABUF_RENDERER`, la más específica: solo desactiva
  la ruta de render DMABUF de WebKitGTK, no todo el compositing ni el soporte
  nativo de Wayland.
- Se aplica **solo en Wayland**, detectado por `XDG_SESSION_TYPE` o
  `WAYLAND_DISPLAY` (este último, porque no todos los lanzadores definen el
  primero).
- Si el usuario ya fijó un valor para la variable, **se respeta**: la aplicación
  no pisa una decisión explícita.

## 11.3 Archivos

```
EDITADO src-tauri/src/main.rs   (detección de Wayland y ajuste del entorno)
```

## 11.4 Lo que esto enseña

Un `WEBKIT_DISABLE_DMABUF_RENDERER=1` puesto a mano en las pruebas de la fase 9
—para callar un aviso que se consideró «cosmético»— estaba tapando un cierre
inmediato de la aplicación. El aviso no era cosmético: era el mismo fallo, y
como los lanzamientos manuales siempre llevaban la variable, nunca se vio.

---

# 12. Un fallo latente en `known_hosts`: una clave por host, no por algoritmo

Buscando la causa de «no se conecta» apareció un fallo independiente, en el
camino de verificación de claves del servidor.

## 12.1 El fallo

`KnownHosts::entries` indexaba las entradas del fichero **solo por host y
puerto**:

```rust
map.insert(host_key(&entry.host, entry.port), entry);
```

Un servidor SSH no tiene *una* clave: ofrece varias a la vez. El servidor de
pruebas, sin ir más lejos, anuncia tres:

```
[192.0.2.10]:2222 ssh-ed25519  SHA256:mNYmst3rl2zYpHGMgBtjZOYnnEJE3dKSJCo/KphYDT0
[192.0.2.10]:2222 ssh-rsa      SHA256:ObGF7kMkWouVJt02JFkEgQHKiKPwUlDByfz+QQzOeU4
[192.0.2.10]:2222 ecdsa-sha2-nistp256  SHA256:xuRYAhU/PCAqZbB+dkrNilPEXPfX6KJSPks6jbANkMQ
```

Con esa clave de índice, la segunda entrada **machacaba** a la primera al leer el
fichero, y `check` comparaba el blob recibido contra el de la única entrada que
quedaba, **fuera del tipo que fuera**. Dos consecuencias:

1. **Pérdida de datos**: de las tres claves del host solo sobrevivía una en
   memoria, y al reescribir el fichero las otras desaparecían.
2. **Falso aviso de ataque**: si el cliente negociaba un algoritmo distinto del
   guardado, los blobs no coincidían y `check` devolvía `Mismatch`. CloudTerm
   **rechaza las conexiones con `Mismatch` por defecto**, así que el usuario
   habría visto un «la clave del servidor cambió» sin que nada hubiera cambiado.

Es exactamente lo contrario de lo que debe hacer un `known_hosts`: OpenSSH
guarda una línea por host **y algoritmo**, y añadir una clave de un tipo nuevo
es una primera vez, no una alarma.

En el caso del usuario no llegó a dispararse —russh negocia `ssh-ed25519`, que
es justo lo que hay guardado—, pero habría bastado con que el servidor dejara de
ofrecer ed25519 para que CloudTerm se negase a conectar por un falso positivo.

## 12.2 Corrección

La clave de índice pasa a incluir el tipo:

```rust
fn entry_key(host: &str, port: u16, key_type: &str) -> String {
    format!("{} {key_type}", host_key(host, port))
}
```

Y `check` busca por host, puerto **y tipo**: si no hay entrada de ese algoritmo
devuelve `New` (primera vez, TOFU), no `Mismatch`. `remove` sigue borrando el
host entero, ahora con todas sus claves.

## 12.3 Pruebas (4 nuevas)

- `keeps_one_entry_per_key_type` — ed25519 y ECDSA del mismo host conviven y
  sobreviven a releer el fichero. **Falla con el código anterior.**
- `another_key_type_is_not_a_mismatch` — consultar con un algoritmo no guardado
  da `New`. **Falla con el código anterior.**
- `same_type_different_key_is_a_mismatch` — dentro del mismo tipo, otra clave sí
  se detecta como cambio, con la huella antigua.
- `remove_drops_every_key_type` — borrar el host se lleva todas sus claves.

Se usa una clave ECDSA P-256 real, generada con `ssh-keygen`, porque un blob
inventado no se puede decodificar y no probaría nada.

## 12.4 Archivos

```
EDITADO src-tauri/src/ssh/known_hosts.rs   (índice por tipo + 4 pruebas)
```

---

# 13. La causa real de la lentitud: la autenticación, no el banner

Las fases 10 y 11 dejaron dos cosas resueltas (el cierre en Wayland y el
presupuesto por host), pero la explicación de la lentitud era **incorrecta**.
Decía que el servidor tardaba en enviar su banner. No es eso.

## 13.1 Lo que se midió

Separando las dos fases, con un presupuesto de 300 s:

| Intento | Tiempo hasta autenticar | Resultado |
| --- | --- | --- |
| 1 | **313,2 s** | agotó incluso los 300 s |
| 2 | 5,5 s | llega a autenticar |
| 3 | 54,9 s | llega a autenticar |
| 4 | 56,8 s | llega a autenticar |

Y el error, leído entero, dice exactamente dónde se corta:

```text
tiempo de espera agotado durante la autenticación
```

El transporte —TCP, banner e intercambio de claves— va **siempre** bien. Lo que
se atasca es la fase siguiente: el servidor tarda entre 5 y más de 300 segundos
en atender la petición de inicio de sesión.

Medido por separado, el banner llega en **0,012 s** (6 de 6 intentos) y el
cliente `ssh` del sistema entra en 81 ms. El problema no está en la red ni en el
protocolo de transporte.

## 13.2 Qué significa

Entre terminar el intercambio de claves y contestar al inicio de sesión, `sshd`
hace trabajo propio antes de mirar la credencial. Los dos sospechosos clásicos:

- **`UseDNS yes`**: la búsqueda DNS inversa del cliente. Si el DNS del servidor
  no contesta, la petición espera hasta que el resolver se rinde, y eso encaja
  con la variación observada: a veces está en caché (5 s) y a veces no (>300 s).
- **PAM o el directorio personal**: si `/home` está en un montaje de red que no
  responde, `pam_open_session` se queda esperando lo mismo.

El detalle importante es que la espera **no tiene un tope práctico**: un intento
pasó de 300 s. Eso descarta arreglarlo solo desde el cliente.

## 13.3 Lo que sí puede hacer CloudTerm

1. **Presupuesto propio para la autenticación**, mayor que el del transporte:

   ```rust
   fn auth_budget(connect: Duration) -> Duration {
       const MINIMO: Duration = Duration::from_secs(180);
       if connect > MINIMO { connect } else { MINIMO }
   }
   ```

   180 s cubre con margen el caso habitual (~55 s) y no deja la autenticación con
   menos margen que el transporte cuando el host se configura con más.

2. **Decir lo que está pasando**. Antes, 55 s de silencio parecían un cuelgue.
   Ahora la terminal escribe al conectar y, a los 8 s, avisa de que el servidor
   todavía no responde.

3. **Un mensaje que sirve de algo** cuando se agota: explica que el intercambio
   de claves terminó, que el retraso es del servidor y que `UseDNS no` lo quita.

## 13.4 Lo que hay que arreglar en el servidor

Esto es lo único que resuelve el problema de raíz. En `/etc/ssh/sshd_config`:

```text
UseDNS no
```

```bash
sudo systemctl restart ssh
```

Si con eso sigue lento, el siguiente sospechoso es PAM o el directorio personal
en un montaje de red.

## 13.5 Pruebas

- `auth_budget_never_shrinks_below_the_transport_one` fija la regla: con un host
  de 30 s o 60 s la autenticación tiene 180 s; con uno de 400 s, 400 s.

## 13.6 Archivos

```
EDITADO src-tauri/src/ssh/client.rs   (presupuesto de autenticación y mensajes)
EDITADO src/hooks/useTerminal.ts      (aviso mientras se espera)
```

---

# 14. Inicio de sesión con Google y GitHub, y copia de seguridad

Petición: «agrega opción de poder iniciar sesión con Google y GitHub, para
guardar los datos y cuentas».

## 14.1 La decisión de diseño que condiciona todo

Lo primero es descartar la tentación de repartir un identificador de cliente
común. Google y GitHub solo entregan un token a una aplicación registrada, y ese
registro produce un identificador. Si CloudTerm trajera el suyo incrustado,
**todas** las copias del programa compartirían identidad: quien controlara ese
registro podría ver las autorizaciones de todo el mundo, y bastaría con extraerlo
del binario para suplantarlas.

Así que cada usuario crea el suyo (cinco minutos, gratis) y lo pega en
Ajustes → Cuenta. El identificador **no es secreto** y vive en `auth.json`; los
tokens sí lo son y van al **llavero del sistema**.

## 14.2 Dos flujos distintos, y por qué

| | Google | GitHub |
| --- | --- | --- |
| Flujo | Código de autorización + PKCE | Flujo de dispositivo |
| Redirección | `http://127.0.0.1:<puerto>/callback` | ninguna |
| Secreto de cliente | no hace falta | no hace falta |
| Lo que ve el usuario | el navegador se abre y vuelve solo | un código corto que escribe en github.com/login/device |

**Google** admite PKCE y redirección a `127.0.0.1`, que es lo recomendado para
aplicaciones de escritorio (RFC 8252). El verificador demuestra la identidad sin
custodiar ningún secreto.

**GitHub no admite PKCE** y exige el *secreto de cliente* para canjear el
código. Un secreto dentro de un binario de escritorio no es un secreto:
cualquiera que tenga el ejecutable puede extraerlo. El flujo de dispositivo
existe justo para esto, y solo necesita el identificador de cliente.

## 14.3 Dónde van los datos

Sin servidor intermedio: los hosts y los ajustes viajan del equipo a la cuenta
del propio usuario.

- **GitHub**: un gist secreto `cloudterm-backup.json` (permiso `gist`).
- **Google**: un fichero en la carpeta `appDataFolder` de Drive, que solo ve la
  aplicación y no aparece en el Drive del usuario (permiso `drive.appdata`).

El formato es el mismo en los dos casos, así que una copia hecha con una cuenta
se restaura con la otra:

```json
{ "version": 1, "exportedAt": 1757755200000, "hosts": [...], "settings": {...} }
```

**Las credenciales no se sincronizan nunca.** Ni contraseñas, ni passphrases, ni
claves privadas: se quedan en el llavero de cada equipo. Es deliberado — subir
eso a un gist lo pondría al alcance de quien tenga el enlace.

## 14.4 Detalles que costaron trabajo

- **revés de la restauración**: se hace dentro de una **transacción**: o entran
  todos los hosts de la copia, o no entra ninguno. Una restauración a medias
  dejaría al usuario sin sus hosts y sin los de la nube.
- **Gists recortados**: GitHub devuelve el contenido cortado si el fichero es
  grande y marca `truncated: true`. En ese caso hay que ir a por `raw_url`; sin
  ese detalle, restaurar una copia grande habría fallado con «JSON no válido».
- **Token de Google caducado**: dura una hora. Se renueva en silencio con el de
  renovación, con un minuto de margen para no usarlo justo mientras caduca.
  Google no siempre devuelve otro token de renovación, así que se conserva el
  anterior en vez de perderlo.
- **Correo de GitHub**: el campo `email` del perfil solo viene si es público. Si
  no, se pide aparte a `/user/emails` y se elige el primario **verificado**.
- **Un solo inicio de sesión a la vez**: dos simultáneos compartirían el puerto
  de retorno. Un `Mutex` en el gestor los serializa.
- **`form` y `query` en reqwest 0.13** son *features* opcionales: sin activarlas,
  no existen los métodos.

## 14.5 Pruebas (33 nuevas)

Se prueba todo lo que no necesita credenciales reales:

- **PKCE** (5): forma del verificador, que no se repite, y que el reto es el
  SHA-256 correcto —comprobado contra un valor calculado a mano—.
- **Google** (6): la URL lleva reto, método, `state`, `access_type=offline` y la
  redirección codificada; el `state` que no coincide se rechaza; un `error` se
  reporta.
- **GitHub** (8): interpretación del código de dispositivo, los cuatro estados
  del sondeo (`pending`, `slow_down`, `expired`, `denied`), y la elección del
  correo principal saltándose los no verificados.
- **Copia de seguridad** (6): ida y vuelta, rechazo de una versión futura,
  `settings` opcional, y localización del gist que contiene la copia.
- **Tokens** (4): interpretación de la respuesta de Google, detección de
  caducidad con margen, y que un token sin fecha (GitHub) no caduca solo.
- **Configuración** (4): claves de proveedor y recorte de identificadores.

## 14.6 Lo que no se ha podido probar

El flujo completo contra Google y GitHub **no se ha ejercitado**: hace falta un
identificador de cliente real, que solo puede crear el usuario. Lo que sí está
verificado es todo lo que ocurre alrededor: construcción de URL, PKCE, análisis
de respuestas, máquina de estados del sondeo y formato de la copia.

## 14.7 Archivos

```
NUEVO   src-tauri/src/auth/mod.rs        (tipos, persistencia, 7 comandos)
NUEVO   src-tauri/src/auth/pkce.rs
NUEVO   src-tauri/src/auth/google.rs
NUEVO   src-tauri/src/auth/github.rs
NUEVO   src-tauri/src/auth/sync.rs
NUEVO   src/lib/auth.ts
NUEVO   src/stores/authStore.ts
NUEVO   src/components/Settings/AccountSettings.tsx
NUEVO   docs/CUENTAS.md                  (cómo crear las apps de cliente)
EDITADO src-tauri/src/lib.rs             (módulo, gestor y comandos)
EDITADO src-tauri/Cargo.toml             (sha2, base64, rand, url; form y query)
EDITADO src/components/Settings/Settings.tsx
```

---

# 15. La causa definitiva: el camino de contraseña del servidor

La fase 13 atribuyó la lentitud a la búsqueda DNS inversa (`UseDNS yes`). **Era
falso**, y la forma de descubrirlo fue una comparación mal hecha que había que
corregir.

## 15.1 La medición que engañaba

El cliente `ssh` del sistema entraba en **81 ms**, mientras russh tardaba 55 s.
Eso parecía demostrar que el problema era de russh. No lo era: ese `ssh` corría
con `BatchMode=yes` y sin terminal, así que **nunca enviaba una contraseña**.
Solo pedía la lista de métodos y se rendía:

```text
debug1: Authentications that can continue: publickey,password
usuario@192.0.2.10: Permission denied (publickey,password).
```

Cuando se le fuerza un intento real de contraseña (`SSH_ASKPASS_REQUIRE=force`),
el cliente del sistema hace exactamente lo mismo que russh:

```text
debug1: Next authentication method: password
debug2: we sent a password packet, wait for reply
        ← y ahí se queda, 120 s, sin respuesta
```

## 15.2 La medición que sí decide

Con el mismo servidor y el mismo instante:

| Credencial | Tiempo hasta la respuesta |
| --- | --- |
| Clave pública (incluso **no autorizada**) | **91 ms** |
| Contraseña | **> 120 s, sin respuesta** |

Que una clave no autorizada se rechace en 91 ms es lo importante: sshd contesta
en cuanto la credencial es una clave. El atasco está **solo** en el camino de
contraseña.

Y como la lista de métodos llegaba al instante, la búsqueda DNS de sshd (que
ocurre antes) también iba bien. `UseDNS` no tenía nada que ver.

## 15.3 Qué está roto

Entre recibir el paquete de contraseña y contestar, sshd delega en **PAM**. Los
sospechosos habituales, por orden:

1. Un directorio personal en un montaje de red que no responde.
2. `pam_systemd` esperando a un `systemd-logind` atascado.
3. `pam_sss` / `pam_ldap` con el servidor de directorio inalcanzable.
4. `pam_faillock` sobre un disco lento.

Se comprueba en el servidor mirando `/var/log/auth.log` y el tiempo que tarda
`su - usuario` en local.

## 15.4 La solución, y por qué funciona

**Usar una clave SSH.** No es un apaño: el camino de clave pública no pasa por
PAM, y por eso contesta en 91 ms. CloudTerm ya autodetecta `~/.ssh/id_ed25519`
cuando el host no indica ruta.

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
ssh-copy-id -p 2222 usuario@192.0.2.10    # pide la contraseña y tarda
```

El `ssh-copy-id` sigue sufriendo la espera, porque para instalar la clave hay que
autenticarse una última vez con contraseña. A partir de ahí, todo son
milisegundos.

## 15.5 Lo que cambia en CloudTerm

- El mensaje de tiempo de espera ya no habla de DNS: dice que el transporte fue
  bien, que la credencial es lo que no se contesta y que una clave SSH evita ese
  camino.
- Se distingue **corte de transporte** de **corte de autenticación**. Solo el
  primero se reintenta: reintentar el segundo haría esperar otros tres minutos
  para nada.
- El aviso de la terminal a los 8 s sigue igual.

## 15.6 Archivos

```
EDITADO src-tauri/src/ssh/client.rs   (mensaje y comentario del presupuesto)
EDITADO src/lib/ssh.ts                (descripción del error y distinción de casos)
```

---

# 16. Abrir archivos con un editor externo, y registro de conexiones

Dos cosas en esta fase: una función pedida —abrir con Visual Studio Code u otro
editor— y el registro que hacía falta para poder diagnosticar sin ver la ventana.

## 16.1 Abrir con un editor

El botón aparece en cada archivo de los dos paneles de SFTP (no en las carpetas,
donde no tiene sentido). Al pulsarlo se elige editor entre los **instalados**,
que se detectan buscando en el `PATH`.

| Panel | Qué ocurre |
| --- | --- |
| **Local** | Se lanza el editor sobre el archivo. Nada más. |
| **Remoto** | Se descarga a una carpeta temporal, se abre y se **vigila**. |

Lo interesante es el caso remoto. El archivo se descarga a
`<temporal>/cloudterm-editor/<id>/<nombre>` —una carpeta por edición, para que dos
archivos con el mismo nombre en servidores distintos no se pisen—, se abre con el
editor y se vigila su **firma** (marca de tiempo y tamaño) cada dos segundos.
Cuando cambia —es decir, cuando el usuario guarda— se sube de vuelta. Así se
edita «en su sitio» sin tener que acordarse de subir nada.

Detalles que importan:

- **Respiro tras el cambio**: los editores no escriben de golpe. Tras detectar
  un cambio se esperan 400 ms y se vuelve a leer la firma, para subir el estado
  final y no uno intermedio.
- **Si la subida falla se reintenta**: la firma solo se da por buena cuando el
  servidor la ha aceptado. Si no, se vuelve a intentar en la vuelta siguiente en
  lugar de dar el cambio por subido.
- **`create` al subir**: hace falta `CREATE|TRUNCATE|WRITE`; `write` a secas
  fallaría o dejaría restos del contenido anterior.
- **`close` antes de dar por buena la subida**: espera el acuse del servidor.
- **Al cerrar se borra la copia temporal**, y `editar_terminar` puede hacer una
  última subida por si quedaban cambios sin guardar.
- **Solo editores gráficos**: lanzar `vim` desde una aplicación sin terminal no
  lleva a ninguna parte, así que no se ofrecen.

Detección: `code`, `code-oss`, `codium`, `cursor`, `windsurf`, `zed`, `subl`,
`kate`, `gedit`, `gnome-text-editor`, `xed`, `mousepad`, `pluma`, `notepad++`,
`notepad`. En este equipo se detectan **Visual Studio Code** y **Mousepad**.

Hay una casilla **«No volver a preguntar»**: el editor elegido se recuerda en
`localStorage` y a partir de ahí se abre directamente.

## 16.2 Registro de conexiones

Diagnosticar un fallo de conexión sin acceso a la ventana del usuario es
imposible: solo se sabe lo que él cuente. Ahora cada intento queda anotado en
`<datos>/conexiones.log`:

```
[2026-09-14 00:31:02] conectando a 192.0.2.10:2222 como «demo» con contraseña
[2026-09-14 00:32:47]   ✗ 192.0.2.10:2222 falló tras 105142 ms: el servidor no contestó…
```

Con la hora, el host, el método y cuánto tardó. El fichero se recorta solo
cuando pasa de 256 KB, para que no crezca sin freno. El registro nunca hace
fallar una conexión: si no se puede escribir, se sigue adelante.

## 16.3 Pruebas (7 nuevas)

- `local_name_comes_from_the_remote_path`: `/var/log/` da `log`, no un nombre
  vacío.
- `local_name_never_escapes_the_folder`: ni `..` ni rutas con separadores se
  cuelan en la carpeta temporal.
- `signature_changes_when_the_file_changes`: la firma distingue un archivo
  modificado.
- `a_missing_file_has_no_signature`.
- `ids_do_not_repeat`.
- `only_installed_editors_are_offered`: no se ofrece nada que no esté en el
  `PATH`.
- `detection_matches_the_path_lookup`.

Las dos primeras encontraron sendos fallos reales en la primera versión de
`nombre_local`, que devolvía `archivo` para `/var/log/` y dejaba pasar `..`.

## 16.4 Archivos

```
NUEVO   src-tauri/src/sftp/editor.rs     (detección, apertura, vigilancia)
NUEVO   src/lib/editor.ts
NUEVO   src/components/SFTP/EditorPicker.tsx
EDITADO src-tauri/src/sftp/mod.rs        (submódulo)
EDITADO src-tauri/src/ssh/mod.rs         (registro de conexiones)
EDITADO src-tauri/src/ssh/client.rs      (anota cada intento)
EDITADO src-tauri/src/lib.rs             (gestor y 15 comandos nuevos)
EDITADO src-tauri/Cargo.toml             (chrono)
EDITADO src/components/SFTP/SFTPPanel.tsx
```

---

# 17. Multilenguaje: español, inglés y chino, abierto a cualquiera

Petición: «implementa soporte multilingüe, que en GitHub la gente pueda publicar
sus traducciones; por ahora español completo, inglés y chino».

## 17.1 La decisión que hace que esto funcione

La tentación es meter las traducciones en ficheros TypeScript: dan autocompletado
y el compilador avisa si falta una clave. Se descartó a propósito.

**Traducir no debería exigir saber programar.** Con JSON plano, cualquiera puede
abrir el fichero, cambiar los textos y proponer el cambio desde la web de GitHub,
sin clonar nada ni instalar nada. La comprobación de que no falta nada la hace un
script, no el compilador.

```
src/i18n/locales/es.json   ← referencia
src/i18n/locales/en.json
src/i18n/locales/zh.json
```

## 17.2 Cómo se usa

```tsx
const t = useT();                     // en un componente
t("sftp.upload")
t("common.confirmWord", { word: "CONFIRMAR" })
```

```ts
import { t } from "../i18n";          // en stores, hooks y lib
pushToast("error", t("errors.connect"), detalle);
```

Dos entradas y no una porque tienen ciclos de vida distintos: `useT()` es un hook
que **reacciona** al cambio de idioma, mientras que `t()` se llama en el momento y
sirve para mensajes que ya no se vuelven a pintar (un aviso, una línea de
terminal).

Del español se derivan tres decisiones:

- **Es la referencia.** Si a otro idioma le falta una clave se usa la española.
- **Si tampoco existe, se devuelve la clave** (`sftp.upload`) en vez de una cadena
  vacía: así el hueco se ve en pantalla y alguien lo arregla.
- **El atributo `lang` del documento se sincroniza** (`useDocumentLanguage`). No
  es decorativo: de él dependen las fuentes, la separación de palabras y cómo lo
  leen los lectores de pantalla. El chino se marca `zh-Hans` y no `zh`, porque
  «zh» a secas deja que el sistema elija la variante de fuente.

## 17.3 El trabajo de extracción

**557 claves** repartidas en 623 llamadas, en 78 ficheros. Se repartió en seis
frentes independientes —shell, hosts, ajustes, SFTP/autenticación, varios y
núcleo— y cada frente dejó su propio fragmento de diccionario, que luego se
fusionó con una comprobación de huecos entre idiomas.

Lo que **no** se traduce, y por qué:

| Categoría | Ejemplo |
| --- | --- |
| Protocolos | `ssh`, `sftp`, `ftp` |
| Programas y marcas | Visual Studio Code, Google, PayPal, Pixel Agents |
| Identificadores | `xterm-256color`, `UTF-8`, claves de `localStorage` |
| Datos persistidos | el grupo por defecto `"General"` va a SQLite: traducirlo cambiaría el dato guardado |
| Unidades | `ms`, `0 B` |
| Palabras de confirmación | `CONFIRMAR` y `RESET` se comparan en el código |

Esa última fila es la más fácil de romper: traducir esas dos palabras dejaría la
zona peligrosa de los ajustes **sin poder confirmarse nunca**.

## 17.4 Que las traducciones no se rompan

`scripts/validar-idiomas.mjs` comprueba, para cada idioma:

1. Que tenga **exactamente** las mismas claves que el español.
2. Que no haya valores vacíos.
3. Que los **marcadores** (`{word}`, `{count}`) coincidan con los del español.

Lo tercero es lo que de verdad evita fallos silenciosos: si el chino pierde un
`{word}`, la frase se muestra a medias y nadie se entera hasta que la usa alguien.

```bash
npm run idiomas
```

Se lanza solo al proponer cambios en ficheros de idioma
(`.github/workflows/idiomas.yml`) y **sin `npm install`**: el script únicamente
usa módulos de Node, así que contribuir no requiere montar el proyecto.

### Publicar una traducción

- `docs/IDIOMAS.md` explica el proceso completo, con las reglas de estilo
  (puntuación de cada idioma, longitud, nada de traducción literal) y lo que
  todavía no se traduce.
- `.github/PULL_REQUEST_TEMPLATE.md` (general) y
  `PULL_REQUEST_TEMPLATE/traduccion.md` (específica) acompañan al traductor con
  una lista de comprobación.
- Añadir un idioma son cinco pasos y ninguno toca lógica: copiar un JSON,
  traducirlo, registrarlo en `src/i18n/index.ts` y pasar el validador.

## 17.5 Un ajuste del validador que estaba mal

La primera versión marcaba como error los espacios al principio o al final de un
texto. Saltaron nueve: `donate.introFree`, `hostKey.mismatchWarning1`… Todos
legítimos. Son frases que se parten **alrededor de un enlace o de un resaltado**
y necesitan ese espacio para leerse bien al recomponerlas. La regla se quitó y el
motivo quedó escrito en el script, para que a nadie le tiente volver a ponerla.

## 17.6 Lo que queda fuera

- **Los mensajes del backend siguen en español.** El núcleo Rust devuelve errores
  redactados; traducirlos bien exige convertirlos en códigos, que es otro trabajo.
  Los más frecuentes sí se traducen, porque `describeSshError` los reconoce y los
  convierte en frases del diccionario.
- **El registro de conexiones** (`conexiones.log`) se queda en español a
  propósito: es para diagnóstico y así se puede buscar en él.
- **Los avisos diferidos** (`useEffect` que llaman a `t` con dependencias
  antiguas) podrían salir en el idioma anterior si se cambia de idioma justo
  antes de que se disparen. Es un caso raro y se prefirió no tocar la lógica de
  los efectos para arreglarlo.

## 17.7 Archivos

```
NUEVO   src/i18n/index.ts                       (traductor, hooks y `lang`)
NUEVO   src/i18n/locales/{es,en,zh}.json        (557 claves cada uno)
NUEVO   src/components/Settings/LanguageSettings.tsx
NUEVO   scripts/validar-idiomas.mjs
NUEVO   .github/workflows/idiomas.yml
NUEVO   .github/PULL_REQUEST_TEMPLATE.md
NUEVO   .github/PULL_REQUEST_TEMPLATE/traduccion.md
NUEVO   docs/IDIOMAS.md
EDITADO 78 ficheros de src/ (cadenas → claves de traducción)
EDITADO src/types.ts · src/stores/settingsStore.ts   (ajuste `language`)
EDITADO src/App.tsx · src/components/Settings/Settings.tsx
EDITADO package.json                            (script `idiomas`)
EDITADO README.md · docs/DOCUMENTACION.md
```

---

# 18. Dos gestores de archivos en uno: la oficina y el clásico

Petición: que al activar o desactivar el easter egg cambie el panel de archivos.
Activado, una pequeña oficina donde los personajes mueven los archivos; apagado,
el aspecto de siempre de FileZilla o WinSCP. Y una consola que funcione, con los
comandos remotos por defecto y los locales con `!`.

## 18.1 El easter egg deja de ser decorativo

Hasta ahora, desbloquear los NPC solo añadía una escena en una pestaña. Ahora
cambia **el aspecto de la herramienta**: con los NPC visibles el panel de archivos
es una oficina de píxeles, y sin ellos es el gestor clásico.

La condición es la misma que ya usaba la barra de pestañas (`npcsUnlocked &&
showNpcs`), así que el cambio es inmediato al tocar el ajuste: no hay que
reiniciar ni recargar.

## 18.2 El modo clásico

Es a propósito **la paleta de los gestores de archivos de siempre**:

- Grises, bordes rectos y ni una esquina redondeada.
- Selección azul (`#0a4d8c`), como el Norton Commander.
- Filas y tipografía monoespaciada más densas, para que quepan más archivos.
- **Cabecera de columnas** (Nombre · Tamaño · Modificado), que el modo moderno no
  necesita porque usa iconos y etiquetas relativas.

No es el panel moderno con otro color: quien pide «como FileZilla» espera esa
densidad y esos grises.

## 18.3 La oficina

En el modo píxeles, la cola de transferencias se convierte en una escena:

- A la izquierda el escritorio con monitor (**local**), a la derecha el rack de
  servidores (**remoto**).
- Mientras hay un archivo moviéndose, un agente lo lleva en alto de un extremo al
  otro, siguiendo el **progreso real** de la transferencia; las piernas alternan
  al caminar y el rack parpadea.
- Las marcas del camino se iluminan mientras hay movimiento.
- Sin nada en marcha, la escena lo **dice** en vez de quedarse muda.

La posición del agente no es una animación decorativa: se calcula con
`transferred / size`, así que si la transferencia se atasca el agente se queda
parado donde está. Es información, no adorno.

## 18.4 La consola

Una línea de comandos dentro del gestor, con dos destinos:

| Lo que escribes | Dónde se ejecuta |
| --- | --- |
| `ls -la /var/log` | **en el servidor**, por la misma sesión SSH del panel |
| `!uname -a` | **en tu equipo** |

El prefijo `!` es explícito a propósito: nada se ejecuta en local sin que quien lo
escribe lo haya pedido con esas dos letras. El símbolo del prompt cambia (`❯` para
el servidor, `!` para local) y cada línea del historial lleva su etiqueta, para
que nunca haya duda de dónde se ejecutó algo.

Detalles que importan:

- **El historial se navega con las flechas**, como en cualquier terminal.
- **La salida se recorta a 256 KB** y se avisa. Un `cat` de un fichero enorme
  llenaría la memoria y la ventana; es mejor decir que se cortó.
- **Se agota el tiempo a los 30 s** por defecto, y también se dice.
- **Sin sesión SFTP, los comandos remotos dan error** con un mensaje que explica
  que con `!` sí funcionarían, en vez de ejecutarlos donde no toca.
- **Se distingue stdout de stderr** y se pinta de otro color.

La ejecución remota usa `channel_open_session` + `exec` de russh sobre el mismo
`Handle` que sostiene la sesión SFTP, así que no hace falta abrir otra conexión.

## 18.5 Pruebas (8 nuevas)

Sobre la clasificación de la línea, que es donde está el riesgo:

- Sin prefijo va al servidor; con `!` va a local.
- El prefijo tolera espacios alrededor (`  !  pwd  `).
- Un `!` suelto es un comando local vacío, no un error.
- Un `!` en medio (`echo hola!`) **no** es prefijo: es parte del comando.

Y sobre la ejecución local:

- `echo` devuelve su salida y código 0.
- `exit 3` informa del código 3.
- Un comando vacío no hace nada.

Se usa `echo` y `exit` porque existen tanto en `sh` como en `cmd`, así que las
pruebas valen en cualquier sistema.

## 18.6 Archivos

```
NUEVO   src-tauri/src/sftp/cmd.rs          (ejecución remota y local)
NUEVO   src/lib/cmd.ts
NUEVO   src/components/SFTP/CommandLine.tsx
NUEVO   src/components/SFTP/PixelOffice.tsx
EDITADO src-tauri/src/sftp/mod.rs          (submódulo)
EDITADO src-tauri/src/lib.rs               (3 comandos nuevos)
EDITADO src-tauri/Cargo.toml               (tokio: `process`)
EDITADO src/components/SFTP/SFTPPanel.tsx  (modo clásico y conexión)
EDITADO src/i18n/locales/{es,en,zh}.json   (18 claves nuevas)
```

---

# 19. Hacer visible el inicio de sesión

La fase 14 dejó el inicio de sesión con Google y GitHub completo, con su flujo
PKCE, sus tokens en el llavero y su copia de seguridad. Y aun así hubo que
pedirlo otra vez: **estaba dentro de Ajustes**, después de la sección del
asistente de IA, y no lo encontraba nadie.

Tener una función no es lo mismo que tenerla a mano.

## 19.1 Tres puertas en vez de una

| Sitio | Qué se ve |
| --- | --- |
| **Barra de título** | El avatar si hay sesión; «Cuenta» si no. Siempre visible |
| **Bienvenida** | «Iniciar sesión con Google o GitHub», y solo cuando no hay sesión |
| **Paleta de comandos** | Escribiendo «sesión», «google» o «cuenta» |

El botón de la barra de título es un componente propio (`AccountButton`) y se
coloca **antes** del de donativos: es lo que se busca cuando no encuentras dónde
entrar.

## 19.2 El paso que bloqueaba de verdad

Aun encontrándola, la sección se topaba con el mismo muro: para iniciar sesión
hay que crear antes una aplicación de cliente en Google o GitHub. La interfaz
enseñaba la URL como texto gris truncado, que nadie copia a mano.

Ahora es un **botón que abre la consola del proveedor** en el navegador, con el
texto «Crear la aplicación de cliente en GitHub». Se sigue sin repartir un
identificador común —por lo explicado en la fase 14—, pero el paso previo deja de
ser un callejón.

## 19.3 Archivos

```
NUEVO   src/components/Account/AccountButton.tsx
NUEVO   src/components/Account/index.ts
EDITADO src/components/TitleBar/TitleBar.tsx
EDITADO src/components/Welcome/WelcomeScreen.tsx
EDITADO src/components/CommandPalette/CommandPalette.tsx
EDITADO src/components/Settings/AccountSettings.tsx   (botón a la consola)
EDITADO src/i18n/locales/{es,en,zh}.json              (7 claves nuevas)
EDITADO docs/CUENTAS.md
```

---

# 20. Actualizar desde GitHub, avisar de traducciones ajenas y firmar el código

Tres peticiones en una: una opción de ayuda para actualizar, un aviso cuando una
traducción no la firma el creador, y la marca del autor en todo el código.

## 20.1 Actualizar desde GitHub

**Ayuda → Buscar actualizaciones**. Al abrirse consulta la última publicación del
repositorio y compara versiones.

Lo importante es lo que **no** hace: no descarga ni instala nada por su cuenta.
Actualizar es una decisión del usuario, así que se le enseñan la versión nueva,
las notas y dos botones: ver la publicación o descargar el instalador que
corresponde a su sistema.

Detalles que se resolvieron:

- **Comparación numérica, no de texto.** `1.10.0` es más nueva que `1.9.0`, y
  comparando cadenas saldría lo contrario. Hay una prueba que lo fija.
- **Una publicación más antigua no ofrece «actualizar» hacia atrás.** Si tienes
  una copia de desarrollo por delante, no te manda retroceder.
- **Sin publicaciones todavía no es un error.** El 404 de GitHub se traduce en
  «este repositorio aún no tiene ninguna publicación», que es la verdad.
- **El instalador se elige por sistema**: `.msi` en Windows, `.dmg` en macOS,
  `.AppImage` en Linux.

## 20.2 Avisar de las traducciones ajenas

Un fichero de idioma es **texto que acaba pintándose en la interfaz**. Si
cualquiera puede dejar el suyo, cualquiera puede cambiar lo que la aplicación
dice. No es un ataque exótico: es la consecuencia normal de que las traducciones
estén abiertas, que es justo lo que se pidió en la fase 17.

La solución no es cerrarlas, sino **decir de quién son**:

- Cada idioma lleva firma: `_meta.author` y `_meta.official`.
- Los tres de la casa van firmados por `DavidPilahito7` y se marcan como
  **oficiales**, con una marca verde.
- Los instalados por el usuario salen con **quién los firma** en ámbar.
- Al elegir uno no oficial, **salta un aviso antes de activarlo**:

  > «`de`» lo ha traducido *OtraPersona*, que no es el creador de CloudTerm.
  > ¿Seguro que quieres usarla?

  Con el camino de la carpeta a la vista, para que se pueda comprobar el fichero.

Se puede **instalar un idioma sin recompilar**: se deja el `.json` en
`~/.config/com.pilahito.cloudterm/idiomas/` y aparece en la lista. Hay un botón
para abrir esa carpeta.

Los idiomas que vienen con la aplicación **no se pueden pisar** desde esa
carpeta: un `es.json` suelto ahí se ignora. Si no, la firma no serviría de nada.

Un fichero roto no se descarta en silencio: se lista con su motivo, para que
quien lo puso sepa por qué no funciona.

## 20.3 La marca del autor

Los 117 ficheros de código llevan ahora la misma cabecera:

```
CloudTerm · github.com/pilahito/cloudterm
© 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE
```

Adaptada a cada lenguaje: `//` en Rust y TypeScript, `/* */` en CSS, `<!-- -->` en
HTML. Se respeta el `#!` de los scripts, que tiene que ir en la primera línea.

## 20.4 Pruebas (18 nuevas)

- **Versiones** (5): interpretación con y sin `v`, con sufijos de preestreno y de
  dos componentes; rechazo de basura; y el orden numérico.
- **Publicaciones** (5): detección de versión nueva, misma versión e inferior;
  errores de GitHub; publicación sin etiqueta; y elección del instalador por
  sistema.
- **Idiomas** (8): firma del proyecto, traducción ajena marcada con su motivo,
  fichero sin firma, fichero sin claves, las claves `_meta` fuera del diccionario,
  JSON roto sin reventar, y que los integrados no se puedan reemplazar.

## 20.5 Archivos

```
NUEVO   src-tauri/src/actualizacion.rs      (consulta y comparación de versiones)
NUEVO   src-tauri/src/idiomas.rs            (idiomas instalados y su firma)
NUEVO   src/lib/actualizacion.ts · src/lib/idiomas.ts
NUEVO   src/components/Actualizacion/UpdateDialog.tsx
EDITADO src/i18n/index.ts                   (registro de idiomas en caliente)
EDITADO src/components/Settings/LanguageSettings.tsx  (firmas y aviso)
EDITADO src/components/TitleBar/TitleBar.tsx          (Ayuda → Buscar actualizaciones)
EDITADO src/stores/uiStore.ts · src/App.tsx
EDITADO src/i18n/locales/{es,en,zh}.json    (19 claves nuevas + `_meta`)
EDITADO 117 ficheros de código              (marca del autor)
```

---

# 21. Limpiar los datos personales y el tutorial de bienvenida

Dos cosas antes de publicar: que no salga nada tuyo en el repositorio, y que
quien lo instale entienda qué tiene delante.

## 21.1 Qué se quitó, y por qué así

El escaneo inicial fue un error mío: busqué en todo el directorio y entraron
`node_modules` (175 MB) y `src-tauri/target` (17 GB). Se hace con
`git ls-files`, que es **exactamente lo que se publicaría**, y nada más.

| Dato | Antes | Ahora | Por qué |
| --- | --- | --- | --- |
| IP del servidor | la real | `192.0.2.10` | Rango reservado para documentación (RFC 5737): nunca es una máquina real |
| Puerto | `2220` | `2222` | El no estándar también identifica |
| Usuario | el real | `demo` | — |
| Host de ejemplo | `Servidor de prueba` | `Servidor de prueba` | — |
| Correo | el personal | el *noreply* de GitHub | Ya es público y no expone el personal |
| Rutas | la carpeta personal | `std::env::temp_dir()` | Además de privado, era un fallo: las pruebas solo corrían en un equipo |

Ese último es el más interesante: la carpeta de pruebas del sshd estaba clavada
en tu directorio personal, así que **las pruebas no habrían funcionado en ningún
otro ordenador**. Limpiar el dato arregló un fallo real.

### Un reemplazo demasiado amplio

Cambiar `2220` por `2222` a lo bruto corrompió **tres *checksums*** de
`Cargo.lock`: aparecía la secuencia `2220` dentro de hashes. Se detectó al
revisar el diff, se revirtió el fichero y se dejó el reemplazo donde de verdad
era un puerto.

Es la lección de siempre con los reemplazos globales: `git diff` antes de dar
nada por hecho.

## 21.2 El tutorial de bienvenida

Sale **la primera vez** que se abre la aplicación, y se puede repetir desde
**Ayuda → Ver el tutorial**.

Ocho pasos, y el primero es especial:

1. **Elegir idioma** — español, inglés o chino. Va primero porque todo lo demás
   tiene que leerse en el idioma de quien lo lee.
2. Bienvenida.
3. **Tus servidores** → flecha al árbol de hosts.
4. **Las vistas** → flecha a la barra de actividad.
5. **Pestañas** → flecha a la barra de pestañas.
6. **Tu cuenta** → flecha a los botones de la barra de título.
7. **El estado** → flecha a la barra de estado.
8. **Listo.**

Con **Siguiente**, **Atrás**, **Saltar** y puntos de progreso. Se puede navegar
con las flechas del teclado y salir con `Escape`.

### Cómo apunta la flecha

Cada paso declara un selector. El tutorial busca el elemento, mide dónde está y:

- Oscurece la pantalla **recortando un agujero** sobre el elemento.
- Le pone un borde de acento, para que se vea qué está señalado.
- Coloca la tarjeta al lado que corresponda y dibuja un triángulo que las une.
- **Se recoloca** si la ventana cambia de tamaño.

Los anclajes son `data-tour="sidebar"`, `data-tour="activitybar"`… atributos
propios, no clases: una clase de Tailwind cambia con el diseño y el tutorial
dejaría de encontrar nada.

Si el elemento no está —el árbol plegado, por ejemplo—, la tarjeta sale centrada
sin flecha **en vez de romperse**. Es lo que pasa si alguien cierra la barra
lateral antes de llegar a ese paso.

## 21.3 Archivos

```
NUEVO   src/components/Onboarding/Onboarding.tsx
NUEVO   src/components/Onboarding/index.ts
EDITADO src/components/{Sidebar,ActivityBar,TabBar,StatusBar,TitleBar}  (anclas)
EDITADO src/stores/uiStore.ts · src/stores/settingsStore.ts · src/types.ts
EDITADO src/App.tsx                         (primera vez y repetición)
EDITADO src/i18n/locales/{es,en,zh}.json    (21 claves nuevas)
EDITADO 15 ficheros                          (datos personales)
```

---

# 22. Elegir dónde va la copia: tu nube o tu servidor

Google Drive ya estaba desde la fase 14, pero eso obligaba a tener cuenta en
Google o en GitHub. La petición era clara: **que el usuario decida**, y que si
tiene su propio servidor, pueda usarlo.

## 22.1 Cinco destinos

| Destino | Para quién | Qué pide |
| --- | --- | --- |
| **Una carpeta** | Cualquier nube con cliente de escritorio: Dropbox, OneDrive, Mega, Terabox… y cualquier disco | Una ruta |
| **WebDAV** | Nextcloud, ownCloud, Synology, Box y servidores propios | URL, usuario y contraseña |
| **Mi servidor** | Tu propio servidor por SSH | Host, puerto, usuario, contraseña y carpeta |
| **GitHub** | Gist secreto | Sesión iniciada |
| **Google Drive** | Carpeta privada de la aplicación | Sesión iniciada |

**La carpeta es la opción más lista de todas**, y por eso es la que viene por
defecto. Si tu nube sincroniza una carpeta —que es como funcionan Dropbox,
OneDrive, Mega y compañía—, se apunta CloudTerm ahí y ya está. No hay que
implementar el API de cada servicio ni pedir credenciales a nadie: CloudTerm
escribe un fichero y la nube hace su trabajo.

Eso responde a «otro sistema de la nube como…» para **cualquier** servicio, no
solo para los que yo podría haber ido añadiendo uno a uno.

## 22.2 Mi servidor, reutilizando lo que ya había

El destino de SFTP no escribe un cliente nuevo: usa `open_sftp`, la misma
función que abre el panel de archivos. Eso significa que hereda lo que ya estaba
resuelto:

- **La clave del servidor se verifica** contra el `known_hosts` de CloudTerm,
  igual que en una conexión normal. No es una conexión «de confianza» aparte.
- El **tiempo de espera** y el manejo de errores son los mismos.

Sin carpeta indicada se deja solo el nombre del fichero y el servidor lo
resuelve contra la carpeta personal: así no hay que adivinar dónde aterriza cada
sistema.

## 22.3 El botón de probar

Se sube una copia de prueba y se lee de vuelta. Es a propósito: un servidor puede
aceptar la conexión y **fallar al escribir** —permisos, disco lleno, carpeta
equivocada—, que es justo el fallo que interesa detectar antes de confiarle tus
hosts.

Los errores de WebDAV se traducen a algo útil: un 401 dice «usuario o contraseña
incorrectos», un 404 «la carpeta no existe» y un 507 «no queda espacio». Sin eso,
los tres se ven igual.

## 22.4 Detalles

- **El fichero se llama igual en los cinco destinos**, así que una copia hecha en
  una carpeta se restaura desde tu servidor. Era el objetivo desde el principio.
- **La configuración se guarda con permisos `0600`**, porque dentro van
  contraseñas de WebDAV y de SFTP.
- **Una configuración vieja sigue leyéndose**: si falta el puerto, cae a 22; si
  falta la sección de WebDAV, queda vacía.
- La carpeta propuesta por defecto es `~/CloudTerm`, para no dejar el campo vacío
  sin decir nada.

## 22.5 Pruebas (15 nuevas)

- Expansión de `~` y rutas normales.
- El nombre del fichero es el mismo en los tres destinos propios, y una barra de
  más no produce una doble barra.
- La URL de WebDAV no duplica la barra, con o sin barra final y con espacios.
- El destino por defecto es la carpeta, y no pide sesión.
- Solo GitHub y Google piden sesión.
- Validaciones: carpeta vacía, WebDAV sin URL o con `ftp://`, SFTP sin host y sin
  usuario.
- El puerto de SFTP cae a 22 si falta.
- Ida y vuelta por JSON, y lectura de una configuración antigua sin los campos
  nuevos.
- Escritura y lectura reales en una carpeta temporal, y el error cuando no hay
  copia.

## 22.6 Archivos

```
NUEVO   src-tauri/src/auth/destinos.rs
NUEVO   src/lib/destinos.ts
NUEVO   src/components/Settings/DestinationSettings.tsx
EDITADO src-tauri/src/auth/mod.rs    (subida y bajada despachan por destino)
EDITADO src-tauri/src/lib.rs         (5 comandos nuevos)
EDITADO src/components/Settings/Settings.tsx
EDITADO src/i18n/locales/{es,en,zh}.json   (21 claves nuevas)
```
