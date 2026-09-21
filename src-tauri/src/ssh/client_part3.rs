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
        forget_session(&read_app, &read_id);
    });

    emit_status(&app, &session_id, STATUS_CONNECTED, None);
    Ok(handle)
}

/// Cierra ordenadamente una conexión.
pub async fn close(handle: Handle<ClientHandler>) {
    let _ = handle
        .disconnect(Disconnect::ByApplication, "CloudTerm", "es")
        .await;
}
