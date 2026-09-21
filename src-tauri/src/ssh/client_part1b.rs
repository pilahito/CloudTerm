async fn authenticate_keyboard_interactive(
    handle: &mut Handle<ClientHandler>,
    user: &str,
    password: &str,
) -> Result<bool, String> {
    let mut response = handle
        .authenticate_keyboard_interactive_start(user.to_string(), None)
        .await
        .map_err(|err| format!("keyboard-interactive no arrancó: {err}"))?;

    for _ in 0..8 {
        match response {
            KeyboardInteractiveAuthResponse::Success => return Ok(true),
            KeyboardInteractiveAuthResponse::Failure { .. } => return Ok(false),
            KeyboardInteractiveAuthResponse::InfoRequest { prompts, .. } => {
                let answers = prompts.iter().map(|_| password.to_string()).collect();
                response = handle
                    .authenticate_keyboard_interactive_respond(answers)
                    .await
                    .map_err(|err| format!("keyboard-interactive falló: {err}"))?;
            }
        }
    }
    Err("el servidor pidió demasiados retos keyboard-interactive".to_string())
}

async fn authenticate(
    handle: &mut Handle<ClientHandler>,
    params: &SessionParams,
) -> Result<(), String> {
    let user = params.username.clone();

    match &params.auth {
        SshAuth::Password { password } => {
            // Ubuntu/Debian (PAM), Windows OpenSSH y muchos NAS publican
            // keyboard-interactive y a veces desactivan password.
            match authenticate_keyboard_interactive(handle, &user, password).await {
                Ok(true) => return Ok(()),
                Ok(false) => {}
                Err(_) => {}
            }
            let result = handle
                .authenticate_password(user.clone(), password.clone())
                .await
                .map_err(|err| format!("fallo al autenticar: {err}"))?;
            if result.success() {
                return Ok(());
            }
            Err("credenciales rechazadas (password y keyboard-interactive)".to_string())
        }

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
            let result = handle
                .authenticate_publickey(
                    user.clone(),
                    PrivateKeyWithHashAlg::new(Arc::new(key), hash_alg),
                )
                .await
                .map_err(|err| format!("fallo al autenticar con clave: {err}"))?;
            if result.success() {
                Ok(())
            } else {
                Err(format!(
                    "la clave {} fue rechazada por el servidor",
                    path.display()
                ))
            }
        }
    }
}

fn resolve_socket_addrs(host: &str, port: u16) -> Result<Vec<std::net::SocketAddr>, String> {
    let mut addrs: Vec<_> = (host, port)
        .to_socket_addrs()
        .map_err(|err| format!("no se resuelve {host}:{port}: {err}"))?
        .collect();
    if addrs.is_empty() {
        return Err(format!("DNS no devolvió direcciones para {host}"));
    }
    // En Windows un AAAA roto deja a russh en IPv6 y nunca prueba IPv4.
    addrs.sort_by_key(|addr| addr.is_ipv6());
    Ok(addrs)
}
