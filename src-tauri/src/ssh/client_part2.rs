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

    let addrs = resolve_socket_addrs(&params.host, params.port)?;
    let mut last_err = None;
    let mut handle = None;
    for addr in addrs {
        let attempt = match &params.app {
            Some(app) => ClientHandler::verifying(app.clone(), params.host.clone(), params.port),
            None => ClientHandler::insecure(),
        };
        match tokio::time::timeout(
            params.timeout,
            client::connect(config.clone(), addr, attempt),
        )
        .await
        {
            Ok(Ok(h)) => {
                handle = Some(h);
                break;
            }
            Ok(Err(err)) => {
                let text = err.to_string();
                last_err = Some(if text.contains("UnknownKey") {
                    format!("clave del servidor {address} rechazada: no coincide con la guardada")
                } else {
                    format!("no se pudo conectar con {addr}: {err}")
                });
            }
            Err(_) => {
                last_err = Some(format!(
                    "tiempo de espera agotado al conectar con {addr} ({} s)",
                    params.timeout.as_secs()
                ));
            }
        }
    }
    let mut handle = handle.ok_or_else(|| {
        last_err.unwrap_or_else(|| format!("no se pudo conectar con {address}"))
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

fn auth_budget(connect: Duration) -> Duration {
    const MINIMO: Duration = Duration::from_secs(180);
    if connect > MINIMO {
        connect
    } else {
        MINIMO
    }
}

fn default_pty_modes() -> Vec<(russh::Pty, u32)> {
    use russh::Pty;
    vec![
        (Pty::VINTR, 3),
        (Pty::VQUIT, 28),
        (Pty::VERASE, 127),
        (Pty::VKILL, 21),
        (Pty::VEOF, 4),
        (Pty::VSTART, 17),
        (Pty::VSTOP, 19),
        (Pty::VSUSP, 26),
        (Pty::ICRNL, 1),
        (Pty::IXON, 1),
        (Pty::IUTF8, 1),
        (Pty::ISIG, 1),
        (Pty::ICANON, 1),
        (Pty::ECHO, 1),
        (Pty::ECHOE, 1),
        (Pty::ECHOK, 1),
        (Pty::IEXTEN, 1),
        (Pty::ECHOCTL, 1),
        (Pty::ECHOKE, 1),
        (Pty::OPOST, 1),
        (Pty::ONLCR, 1),
        (Pty::CS8, 1),
        (Pty::TTY_OP_ISPEED, 38400),
        (Pty::TTY_OP_OSPEED, 38400),
    ]
}

pub async fn open_shell(
    params: &SessionParams,
) -> Result<(Handle<ClientHandler>, Channel<ClientMsg>), String> {
    let handle = connect_and_auth(params).await?;

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|err| format!("no se pudo abrir el canal de sesión: {err}"))?;

    let modes = default_pty_modes();
    let term = if params.term.trim().is_empty() {
        "xterm-256color"
    } else {
        params.term.trim()
    };
    let cols = params.cols.max(2);
    let rows = params.rows.max(2);

    let pty = channel
        .request_pty(true, term, cols, rows, 0, 0, &modes)
        .await;
    if pty.is_err() {
        let _ = channel
            .request_pty(false, "xterm", cols, rows, 0, 0, &modes)
            .await;
    }

    channel
        .request_shell(true)
        .await
        .map_err(|err| format!("no se pudo abrir la shell remota: {err}"))?;

    Ok((handle, channel))
}

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
