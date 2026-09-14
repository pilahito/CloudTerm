// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Cliente SSH sobre `russh`: conexión, autenticación y shell interactiva.
//!
//! El núcleo ([`open_shell`]) es **independiente de Tauri**, de modo que puede
//! probarse contra un servidor real sin levantar la aplicación. La capa Tauri
//! ([`open_session`]) añade la resolución de rutas del sistema, los eventos
//! hacia el frontend y las tareas de E/S.
//!
//! Flujo de una sesión:
//!
//! 1. `client::connect` con un [`ClientHandler`] propio.
//! 2. Autenticación por contraseña o por clave (con detección automática de
//!    `~/.ssh/id_ed25519`, `id_ecdsa` e `id_rsa` si no se indica ruta).
//! 3. `channel_open_session` + `request_pty` + `request_shell`.
//! 4. `split()` del canal en mitades de lectura y escritura, cada una en su
//!    propia tarea de Tokio. Así lectura y escritura nunca se bloquean entre sí
//!    y no hace falta `select!` (que obligaría a razonar sobre la cancelación
//!    de `Channel::wait`).

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use russh::client::{self, Handle, Msg as ClientMsg};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{Channel, ChannelMsg as SshChannelMsg, Disconnect};
use russh_sftp::client::SftpSession;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

use super::known_hosts::{fingerprint, HostKeyStatus, KnownHosts};
use super::{
    emit_status, forget_session, DataPayload, HostKeyDecision, HostKeyPrompt, HostKeyPrompts,
    SessionCommand, SshAuth, SshConnectRequest, STATUS_CLOSED, STATUS_CONNECTED, STATUS_ERROR,
};

/// Cuánto se espera a que el usuario decida sobre una clave desconocida o
/// cambiada antes de aplicar la política por defecto.
const HOST_KEY_TIMEOUT: Duration = Duration::from_secs(90);

/// Manejador de eventos del cliente.
///
/// Verifica la clave del servidor contra `known_hosts`: acepta la conocida,
/// pregunta por la desconocida y **rechaza** la que ha cambiado. Sin `trust`
/// (pruebas) no hay a quién preguntar y se acepta, que es lo que quieren las
/// pruebas de integración contra un servidor local.
pub struct ClientHandler {
    trust: Option<TrustContext>,
}

/// Lo que hace falta para verificar y preguntar.
pub struct TrustContext {
    app: AppHandle,
    host: String,
    port: u16,
}

impl ClientHandler {
    /// Manejador que no verifica nada. Solo para pruebas.
    pub fn insecure() -> Self {
        Self { trust: None }
    }

    /// Manejador que contrasta la clave contra el `known_hosts` de la aplicación.
    pub fn verifying(app: AppHandle, host: String, port: u16) -> Self {
        Self {
            trust: Some(TrustContext { app, host, port }),
        }
    }
}

impl TrustContext {
    /// Pregunta al usuario y espera su decisión. Devuelve `None` si no hay
    /// interfaz que pueda responder o si se agota el tiempo.
    async fn ask(
        &self,
        event: &str,
        key: &russh::keys::PublicKey,
        old_fingerprint: Option<String>,
    ) -> Option<HostKeyDecision> {
        // Sin ventanas (perfil headless) no hay nadie que conteste.
        if self.app.webview_windows().is_empty() {
            return None;
        }

        let (key_type, _) = super::known_hosts::key_parts_for_prompt(key);
        let request_id = format!("hk-{}-{}", self.host, self.port);
        let (sender, receiver) = tokio::sync::oneshot::channel();

        let prompts = self.app.state::<HostKeyPrompts>();
        prompts.0.lock().await.insert(request_id.clone(), sender);

        let _ = self.app.emit(
            event,
            HostKeyPrompt {
                request_id: request_id.clone(),
                host: self.host.clone(),
                port: self.port,
                key_type,
                fingerprint: fingerprint(key),
                old_fingerprint,
            },
        );

        let decision = tokio::time::timeout(HOST_KEY_TIMEOUT, receiver)
            .await
            .ok()
            .and_then(Result::ok);

        self.app.state::<HostKeyPrompts>().0.lock().await.remove(&request_id);
        decision
    }
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let Some(trust) = &self.trust else {
            return Ok(true);
        };

        let public = server_public_key.public_key();
        let Ok(store) = KnownHosts::from_app(&trust.app) else {
            // Si no se puede leer el fichero no se bloquea al usuario.
            return Ok(true);
        };

        match store.check(&trust.host, trust.port, &public) {
            Ok(HostKeyStatus::Match) => Ok(true),

            // Primera vez: se pregunta. Si nadie contesta se aplica TOFU
            // (guardar y seguir), que es el comportamiento de `accept-new`.
            Ok(HostKeyStatus::New) => {
                match trust.ask("ssh://host-key-new", &public, None).await {
                    Some(decision) => {
                        if decision.accept && decision.remember {
                            let _ = store.add(&trust.host, trust.port, &public);
                        }
                        Ok(decision.accept)
                    }
                    None => {
                        let _ = store.add(&trust.host, trust.port, &public);
                        Ok(true)
                    }
                }
            }

            // La clave cambió: por defecto NO se conecta.
            Ok(HostKeyStatus::Mismatch { old_fingerprint }) => {
                let decision = trust
                    .ask(
                        "ssh://host-key-mismatch",
                        &public,
                        Some(old_fingerprint),
                    )
                    .await;
                match decision {
                    Some(decision) if decision.accept => {
                        let _ = store.add(&trust.host, trust.port, &public);
                        Ok(true)
                    }
                    _ => Ok(false),
                }
            }

            Err(_) => Ok(true),
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Núcleo independiente de Tauri                                              */
/* -------------------------------------------------------------------------- */

/// Parámetros ya resueltos de una conexión.
#[derive(Debug, Clone)]
pub struct SessionParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
    pub term: String,
    pub cols: u32,
    pub rows: u32,
    pub timeout: Duration,
    /// Directorio personal para autodetectar claves (`None` = `$HOME`).
    pub home_dir: Option<PathBuf>,
    /// Contexto de la aplicación para verificar la clave del servidor. `None`
    /// en las pruebas, que se conectan a un servidor local de confianza.
    pub app: Option<AppHandle>,
}

/// Directorio personal según la plataforma. En Windows no existe `HOME`.
fn home_from_env() -> Option<String> {
    std::env::var("HOME")
        .ok()
        .or_else(|| std::env::var("USERPROFILE").ok())
        .filter(|value| !value.is_empty())
}

/// Expansión mínima de `~` y `$HOME` en rutas escritas a mano.
///
/// Acepta `~/ruta` y `~\ruta` porque en Windows el usuario escribe la barra
/// invertida, y deja la cadena intacta si no hay forma de resolver el inicio.
pub fn shellexpand(input: &str) -> String {
    let trimmed = input.trim();
    let Some(home) = home_from_env() else {
        return trimmed.to_string();
    };

    if trimmed == "~" {
        return home;
    }
    if let Some(rest) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        return format!("{home}/{rest}");
    }
    trimmed.replace("$HOME", &home).replace("%USERPROFILE%", &home)
}

/// Resuelve la clave privada: la indicada, o la primera de las claves por
/// defecto de OpenSSH que exista.
pub fn resolve_key_path(home_dir: Option<&Path>, requested: Option<&str>) -> Result<PathBuf, String> {
    if let Some(path) = requested {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(shellexpand(trimmed));
            if candidate.exists() {
                return Ok(candidate);
            }
            return Err(format!("no existe la clave privada {}", candidate.display()));
        }
    }

    let home = match home_dir {
        Some(home) => home.to_path_buf(),
        None => PathBuf::from(
            std::env::var("HOME").map_err(|_| "no se pudo resolver el directorio personal".to_string())?,
        ),
    };
    let ssh_dir = home.join(".ssh");
    for name in ["id_ed25519", "id_ecdsa", "id_rsa"] {
        let candidate = ssh_dir.join(name);
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("no se encontró ninguna clave en ~/.ssh (id_ed25519, id_ecdsa, id_rsa)".to_string())
}

async fn authenticate(
    handle: &mut Handle<ClientHandler>,
    params: &SessionParams,
) -> Result<(), String> {
    let user = params.username.clone();

    let result = match &params.auth {
        SshAuth::Password { password } => handle
            .authenticate_password(user, password.clone())
            .await
            .map_err(|err| format!("fallo al autenticar: {err}"))?,

        SshAuth::Key {
            key_path,
            passphrase,
        } => {
            let path = resolve_key_path(params.home_dir.as_deref(), key_path.as_deref())?;
            let key = load_secret_key(&path, passphrase.as_deref())
                .map_err(|err| format!("no se pudo leer {}: {err}", path.display()))?;
            let hash_alg = handle
                .best_supported_rsa_hash()
                .await
                .map_err(|err| format!("negociación RSA fallida: {err}"))?
                .flatten();
            handle
                .authenticate_publickey(user, PrivateKeyWithHashAlg::new(Arc::new(key), hash_alg))
                .await
                .map_err(|err| format!("fallo al autenticar con clave: {err}"))?
        }
    };

    if result.success() {
        Ok(())
    } else {
        Err("credenciales rechazadas por el servidor".to_string())
    }
}

/// Conecta y autentica. Base común de la shell y del subsistema SFTP.
///
/// Anota el intento y su resultado en el registro de conexiones: cuando algo
/// falla en el equipo de otra persona, ese registro es la única forma de saber
/// qué pasó sin ver la ventana.
pub async fn connect_and_auth(params: &SessionParams) -> Result<Handle<ClientHandler>, String> {
    let address = format!("{}:{}", params.host, params.port);
    let started = std::time::Instant::now();

    if let Some(app) = &params.app {
        super::log_line(
            app,
            &format!(
                "conectando a {address} como «{}» con {}",
                params.username,
                match &params.auth {
                    SshAuth::Password { .. } => "contraseña",
                    SshAuth::Key { .. } => "clave",
                }
            ),
        );
    }

    let result = connect_and_auth_inner(params, &address).await;

    if let Some(app) = &params.app {
        let ms = started.elapsed().as_millis();
        match &result {
            Ok(_) => super::log_line(app, &format!("  ✓ {address} conectado en {ms} ms")),
            Err(err) => super::log_line(app, &format!("  ✗ {address} falló tras {ms} ms: {err}")),
        }
    }

    result
}

async fn connect_and_auth_inner(
    params: &SessionParams,
    address: &str,
) -> Result<Handle<ClientHandler>, String> {
    let config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(300)),
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        nodelay: true,
        ..client::Config::default()
    });

    // La clave del servidor se verifica solo cuando hay aplicación: en las
    // pruebas se conecta a un servidor local de confianza.
    let handler = match &params.app {
        Some(app) => ClientHandler::verifying(app.clone(), params.host.clone(), params.port),
        None => ClientHandler::insecure(),
    };

    let mut handle = tokio::time::timeout(
        params.timeout,
        client::connect(config, (params.host.as_str(), params.port), handler),
    )
    .await
    .map_err(|_| {
        format!(
            "tiempo de espera agotado al conectar con {address} ({} s). \
             El host acepta la conexión pero no completa el intercambio de claves; \
             sube el tiempo de espera del host en sus propiedades.",
            params.timeout.as_secs()
        )
    })?
    .map_err(|err| {
        // Un fallo de handshake por clave rechazada es el caso más habitual y
        // merece un mensaje que se entienda.
        if err.to_string().contains("UnknownKey") {
            format!("clave del servidor {address} rechazada: no coincide con la guardada")
        } else {
            format!("no se pudo conectar con {address}: {err}")
        }
    })?;

    let budget = auth_budget(params.timeout);
    tokio::time::timeout(budget, authenticate(&mut handle, params))
        .await
        .map_err(|_| {
            format!(
                "el servidor no contestó al inicio de sesión en {} s. \
                 El transporte fue bien —la clave del servidor se verificó— y es la \
                 credencial la que se queda sin respuesta. Pasa cuando el servidor \
                 tiene lento el camino de contraseña (PAM, un directorio personal en \
                 un montaje de red, o `UseDNS yes`). Con una clave SSH ese camino no \
                 se toca: añade tu clave pública al servidor y cambia el host a \
                 autenticación por clave.",
                budget.as_secs()
            )
        })??;

    Ok(handle)
}

/// Presupuesto de la fase de autenticación.
///
/// Es bastante mayor que el del transporte porque hay servidores que tardan
/// decenas de segundos en atender una credencial. Medido contra uno de ellos:
/// la lista de métodos llega al instante, pero el paquete de contraseña se queda
/// sin respuesta más de dos minutos, mientras que el camino de clave pública
/// contesta en 91 ms.
///
/// Nunca es menor que el presupuesto del transporte, para que subir el del host
/// no deje la autenticación con menos margen.
fn auth_budget(connect: Duration) -> Duration {
    const MINIMO: Duration = Duration::from_secs(180);
    if connect > MINIMO {
        connect
    } else {
        MINIMO
    }
}

/// Conecta, autentica y deja abierta una shell interactiva.
///
/// Devuelve el `Handle` (que debe conservarse: al soltarlo russh cierra la
/// conexión) y el canal ya con PTY y shell solicitados.
pub async fn open_shell(
    params: &SessionParams,
) -> Result<(Handle<ClientHandler>, Channel<ClientMsg>), String> {
    let handle = connect_and_auth(params).await?;

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|err| format!("no se pudo abrir el canal de sesión: {err}"))?;

    channel
        .request_pty(
            false,
            &params.term,
            params.cols,
            params.rows,
            0,
            0,
            &[],
        )
        .await
        .map_err(|err| format!("no se pudo solicitar el PTY: {err}"))?;

    channel
        .request_shell(true)
        .await
        .map_err(|err| format!("no se pudo abrir la shell remota: {err}"))?;

    Ok((handle, channel))
}

/// Conecta, autentica y abre el subsistema SFTP.
///
/// Se usa una conexión propia (no se reutiliza el canal de la shell) porque
/// `SftpSession::new` consume el canal con `into_stream()` y necesita un stream
/// `'static`; además así una transferencia larga nunca bloquea el terminal.
pub async fn open_sftp(
    params: &SessionParams,
) -> Result<(Handle<ClientHandler>, SftpSession), String> {
    let handle = connect_and_auth(params).await?;

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|err| format!("no se pudo abrir el canal SFTP: {err}"))?;

    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|err| format!("el servidor no acepta el subsistema sftp: {err}"))?;

    let session = SftpSession::new(channel.into_stream())
        .await
        .map_err(|err| format!("no se pudo iniciar la sesión SFTP: {err}"))?;

    Ok((handle, session))
}

/* -------------------------------------------------------------------------- */
/* Capa Tauri                                                                 */
/* -------------------------------------------------------------------------- */

/// Conecta y lanza las tareas de E/S que conectan el canal con el frontend.
///
/// Devuelve el `Handle` de la sesión, que el gestor debe conservar.
pub async fn open_session(
    app: AppHandle,
    request: SshConnectRequest,
    rx: mpsc::UnboundedReceiver<SessionCommand>,
) -> Result<Handle<ClientHandler>, String> {
    let home_dir = app.path().home_dir().ok();

    let params = SessionParams {
        host: request.host.clone(),
        port: request.port,
        username: request.username.clone(),
        auth: request.auth.clone(),
        term: request.term.clone(),
        cols: request.cols,
        rows: request.rows,
        timeout: Duration::from_millis(request.timeout_ms.unwrap_or(60_000)),
        home_dir,
        app: Some(app.clone()),
    };

    let (handle, channel) = open_shell(&params).await?;

    let (mut read_half, write_half) = channel.split();
    let session_id = request.session_id.clone();

    // --- tarea de escritura -------------------------------------------------
    let mut rx = rx;
    let write_app = app.clone();
    let write_id = session_id.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(command) = rx.recv().await {
            let outcome = match command {
                SessionCommand::Data(bytes) => write_half.data(&bytes[..]).await,
                SessionCommand::Resize { cols, rows } => {
                    write_half.window_change(cols, rows, 0, 0).await
                }
                SessionCommand::Eof => write_half.eof().await,
                SessionCommand::Close => {
                    let _ = write_half.close().await;
                    break;
                }
            };
            if let Err(err) = outcome {
                emit_status(&write_app, &write_id, STATUS_ERROR, Some(err.to_string()));
                break;
            }
        }
    });

    // --- tarea de lectura ---------------------------------------------------
    let read_app = app.clone();
    let read_id = session_id.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(message) = read_half.wait().await {
            match message {
                // stdout y stderr se reenvían juntos para no perder mensajes.
                SshChannelMsg::Data { data } | SshChannelMsg::ExtendedData { data, .. } => {
                    let _ = read_app.emit(
                        "ssh://data",
                        DataPayload {
                            session_id: read_id.clone(),
                            data: data.to_vec(),
                        },
                    );
                }
                SshChannelMsg::Eof | SshChannelMsg::Close => break,
                SshChannelMsg::ExitStatus { exit_status } => {
                    emit_status(
                        &read_app,
                        &read_id,
                        STATUS_CLOSED,
                        Some(format!("el proceso remoto terminó con código {exit_status}")),
                    );
                    break;
                }
                SshChannelMsg::ExitSignal { signal_name, .. } => {
                    emit_status(
                        &read_app,
                        &read_id,
                        STATUS_CLOSED,
                        Some(format!("el proceso remoto recibió la señal {signal_name:?}")),
                    );
                    break;
                }
                _ => {}
            }
        }

        emit_status(&read_app, &read_id, STATUS_CLOSED, None);
        // La sesión ya no sirve: se retira del gestor.
        forget_session(&read_app, &read_id);
    });

    emit_status(&app, &session_id, STATUS_CONNECTED, None);
    Ok(handle)
}

/// Cierra ordenadamente una conexión.
pub async fn close(handle: Handle<ClientHandler>) {
    // `disconnect` toma `&self`, así que no hace falta mutabilidad.
    let _ = handle
        .disconnect(Disconnect::ByApplication, "CloudTerm", "es")
        .await;
}

/* -------------------------------------------------------------------------- */
/* Pruebas de integración contra un sshd local                                */
/* -------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const TEST_HOST: &str = "127.0.0.1";
    const TEST_PORT: u16 = 2222;

    fn test_dir() -> PathBuf {
        PathBuf::from("std::env::temp_dir().join("cloudterm-sshd-test")")
    }

    /// El sshd de prueba es opcional: si no está levantado, la prueba se omite
    /// en lugar de fallar, para que `cargo test` siga siendo útil en cualquier
    /// máquina.
    fn server_ready() -> bool {
        std::net::TcpStream::connect((TEST_HOST, TEST_PORT)).is_ok()
            && test_dir().join("client_ed25519").exists()
    }

    fn params() -> SessionParams {
        SessionParams {
            host: TEST_HOST.to_string(),
            port: TEST_PORT,
            username: std::env::var("USER").unwrap_or_else(|_| "root".to_string()),
            auth: SshAuth::Key {
                key_path: Some(
                    test_dir()
                        .join("client_ed25519")
                        .to_string_lossy()
                        .into_owned(),
                ),
                passphrase: None,
            },
            term: "xterm-256color".to_string(),
            cols: 100,
            rows: 30,
            timeout: Duration::from_secs(10),
            home_dir: None,
            app: None,
        }
    }

    #[test]
    fn test_shellexpand_variants() {
        // Sin `~` la cadena se devuelve intacta (recortada).
        assert_eq!(shellexpand("/etc/ssh/sshd_config"), "/etc/ssh/sshd_config");
        assert_eq!(shellexpand("  /etc/hosts  "), "/etc/hosts");

        // Con `~`, `~/` y `~\` (Windows) se antepone el directorio personal.
        if let Some(home) = home_from_env() {
            assert_eq!(shellexpand("~/x"), format!("{home}/x"));
            assert_eq!(shellexpand("~\\x"), format!("{home}/x"));
            assert_eq!(shellexpand("~"), home);
            assert_eq!(shellexpand("$HOME/y"), format!("{home}/y"));
        }
    }

    #[test]
    fn expands_home_prefix() {
        // Sin `~` la cadena se devuelve intacta.
        assert_eq!(shellexpand("/etc/ssh/sshd_config"), "/etc/ssh/sshd_config");
        // Con `~` se antepone HOME cuando existe.
        if let Ok(home) = std::env::var("HOME") {
            assert_eq!(shellexpand("~/x"), format!("{home}/x"));
        }
    }

    #[test]
    fn rejects_missing_explicit_key() {
        let err = resolve_key_path(None, Some("/no/existe/id_ed25519")).unwrap_err();
        assert!(err.contains("no existe la clave privada"), "{err}");
    }

    /// La autenticación siempre tiene más margen que el transporte, porque es
    /// donde sshd hace su búsqueda DNS inversa.
    #[test]
    fn auth_budget_never_shrinks_below_the_transport_one() {
        // Un host con el tiempo de espera bajo sigue teniendo margen para
        // autenticar: es la fase que se atasca cuando el DNS del servidor falla.
        assert_eq!(auth_budget(Duration::from_secs(30)), Duration::from_secs(180));
        assert_eq!(auth_budget(Duration::from_secs(60)), Duration::from_secs(180));

        // Y subirlo en el host sube también el de la autenticación.
        assert_eq!(
            auth_budget(Duration::from_secs(400)),
            Duration::from_secs(400)
        );
    }

    /// Diagnóstico: qué clave de servidor negocia russh con un host real.
    ///
    /// Sirve para comprobar que la clave que llega es la misma que CloudTerm
    /// tiene guardada en su `known_hosts`. Se lanza con
    /// `cargo test -- --ignored diagnostico_clave_servidor --nocapture`.
    #[tokio::test]
    #[ignore = "necesita red y un servidor SSH concreto"]
    async fn diagnostico_clave_servidor() {
        struct Probe;
        impl client::Handler for Probe {
            type Error = russh::Error;

            async fn check_server_key(
                &mut self,
                key: &PublicKeyOrCertificate,
            ) -> Result<bool, Self::Error> {
                let public = key.public_key();
                let tipo = public
                    .to_openssh()
                    .ok()
                    .and_then(|s| s.split_whitespace().next().map(str::to_string))
                    .unwrap_or_else(|| "?".to_string());
                eprintln!("  tipo negociado:  {tipo}");
                eprintln!(
                    "  huella:          {}",
                    crate::ssh::known_hosts::fingerprint(&public)
                );
                Ok(true)
            }
        }

        let host = std::env::var("CLOUDTERM_TEST_HOST").unwrap_or_else(|_| "192.0.2.10".into());
        let port: u16 = std::env::var("CLOUDTERM_TEST_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(2220);

        let config = std::sync::Arc::new(client::Config {
            inactivity_timeout: Some(Duration::from_secs(120)),
            ..client::Config::default()
        });

        eprintln!("conectando a {host}:{port}");
        match tokio::time::timeout(
            Duration::from_secs(60),
            client::connect(config, (host.as_str(), port), Probe),
        )
        .await
        {
            Ok(Ok(_)) => eprintln!("resultado: handshake completado"),
            Ok(Err(err)) => eprintln!("resultado: error de conexión: {err}"),
            Err(_) => eprintln!("resultado: tiempo de espera agotado"),
        }
    }

    /// Comprobación manual contra un servidor real de la red local.
    ///
    /// No corre en `cargo test` normal porque necesita red y un host concreto:
    /// se lanza con `cargo test -- --ignored conecta_con_servidor_real`.
    ///
    /// Lo que verifica es que el **transporte** llega hasta la autenticación
    /// dentro del presupuesto. Con una contraseña inventada el servidor debe
    /// rechazarla; si el error fuese un tiempo de espera, el presupuesto
    /// seguiría siendo corto para el banner de ese servidor.
    #[tokio::test]
    #[ignore = "necesita red y un servidor SSH concreto"]
    async fn conecta_con_servidor_real() {
        let host = std::env::var("CLOUDTERM_TEST_HOST").unwrap_or_else(|_| "192.0.2.10".into());
        let port: u16 = std::env::var("CLOUDTERM_TEST_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(2220);
        let username = std::env::var("CLOUDTERM_TEST_USER").unwrap_or_else(|_| "david".into());

        let params = SessionParams {
            host: host.clone(),
            port,
            username,
            auth: SshAuth::Password {
                password: "contrasena-deliberadamente-mala".to_string(),
            },
            term: "xterm-256color".to_string(),
            cols: 80,
            rows: 24,
            timeout: Duration::from_secs(
                std::env::var("CLOUDTERM_TEST_TIMEOUT")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(60),
            ),
            home_dir: None,
            // Sin `app`: no se consulta `known_hosts` ni se pregunta al usuario.
            app: None,
        };

        let started = std::time::Instant::now();
        let outcome = connect_and_auth(&params).await;
        let elapsed = started.elapsed();
        eprintln!("handshake contra {host}:{port} en {elapsed:?}");

        match outcome {
            Ok(_) => panic!("no debería autenticar con una contraseña inventada"),
            Err(err) => {
                assert!(
                    !err.contains("tiempo de espera agotado"),
                    "el handshake se agotó tras {elapsed:?}: {err}"
                );
                eprintln!("rechazo esperado: {err}");
            }
        }
    }

    #[tokio::test]
    async fn connects_authenticates_and_runs_a_command() {
        if !server_ready() {
            eprintln!("sshd de prueba no disponible en {TEST_HOST}:{TEST_PORT}; prueba omitida");
            return;
        }

        let (handle, mut channel) = open_shell(&params()).await.expect("conexión SSH");
        assert!(!handle.is_closed(), "la sesión debería seguir abierta");

        // La shell ya está lista: se le manda un comando y se lee hasta ver el eco.
        channel
            .data(&b"echo cloudterm-smoke-ok\n"[..])
            .await
            .expect("envío a la shell");

        let mut seen = String::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
        loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            match tokio::time::timeout(remaining, channel.wait()).await {
                Ok(Some(SshChannelMsg::Data { data })) => {
                    seen.push_str(&String::from_utf8_lossy(&data));
                    if seen.contains("cloudterm-smoke-ok") {
                        break;
                    }
                }
                Ok(Some(SshChannelMsg::Eof) | Some(SshChannelMsg::Close)) | Ok(None) => break,
                Ok(Some(_)) => {}
                Err(_) => break,
            }
        }

        assert!(
            seen.contains("cloudterm-smoke-ok"),
            "no se vio la salida del comando; recibido: {seen:?}"
        );

        channel.eof().await.ok();
        close(handle).await;
    }

    #[tokio::test]
    async fn wrong_password_is_reported_in_spanish() {
        if !server_ready() {
            eprintln!("sshd de prueba no disponible; prueba omitida");
            return;
        }

        let mut bad = params();
        // El sshd de prueba solo acepta clave pública, así que la contraseña
        // siempre falla y el mensaje debe ser el nuestro.
        bad.auth = SshAuth::Password {
            password: "definitivamente-incorrecta".to_string(),
        };

        // `Handle` no implementa `Debug`, así que no vale `unwrap_err()`.
        let err = match open_shell(&bad).await {
            Ok(_) => panic!("el sshd de prueba no acepta contraseñas: no debería haber conectado"),
            Err(err) => err,
        };
        assert!(
            err.contains("credenciales rechazadas") || err.contains("fallo al autenticar"),
            "mensaje inesperado: {err}"
        );
    }
}
