//! Lector de `~/.ssh/config`.
//!
//! El formato de OpenSSH es «la primera directiva gana»: dentro de un bloque
//! `Host`, la primera aparición de `HostName`, `User`, `Port` o `IdentityFile`
//! es la que se aplica, y los bloques se evalúan en orden. Este lector replica
//! esa semántica para cada bloque de forma independiente.
//!
//! Limitaciones conscientes:
//!
//! * Las entradas con comodines (`Host *`, `Host web-?`) se descartan: no son
//!   hosts conectables.
//! * `Include` no se sigue; se avisa para que el usuario lo sepa.
//! * No se aplica herencia entre bloques (un `Host *` con `User` común no se
//!   propaga a los bloques siguientes).

use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::HostInput;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigPreview {
    pub path: String,
    pub exists: bool,
    pub entries: Vec<HostInput>,
    /// Directivas que no se han podido aplicar, para avisar en la interfaz.
    pub warnings: Vec<String>,
}

/// Estado acumulado de un bloque `Host ...`.
#[derive(Default)]
struct Block {
    aliases: Vec<String>,
    hostname: Option<String>,
    user: Option<String>,
    port: Option<i64>,
    identity_file: Option<String>,
    /// El bloque tiene comodines y no debe importarse.
    skip: bool,
}

fn unquote(value: &str) -> String {
    let trimmed = value.trim();
    let bytes = trimmed.as_bytes();
    if bytes.len() >= 2 {
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return trimmed[1..trimmed.len() - 1].to_string();
        }
    }
    trimmed.to_string()
}

/// Separa `Clave valor` o `Clave=valor` en (clave en minúsculas, valor).
fn split_directive(line: &str) -> Option<(String, String)> {
    if let Some((key, value)) = line.split_once('=') {
        let key = key.trim();
        if !key.is_empty() && !key.contains(char::is_whitespace) {
            return Some((key.to_ascii_lowercase(), unquote(value)));
        }
    }

    let mut parts = line.splitn(2, char::is_whitespace);
    let key = parts.next()?.trim();
    if key.is_empty() {
        return None;
    }
    let value = parts.next().unwrap_or("").trim();
    Some((key.to_ascii_lowercase(), unquote(value)))
}

fn push_block(block: Block, out: &mut Vec<HostInput>) {
    if block.skip || block.aliases.is_empty() {
        return;
    }
    let name = block.aliases[0].clone();
    let host = block.hostname.clone().unwrap_or_else(|| name.clone());
    out.push(HostInput {
        name,
        host,
        port: block.port.unwrap_or(22),
        username: block.user.unwrap_or_default(),
        protocol: "ssh".to_string(),
        group_name: "~/.ssh/config".to_string(),
        auth_method: "key".to_string(),
        private_key_path: block.identity_file.unwrap_or_default(),
        use_agent: false,
        timeout_ms: super::default_timeout_ms(),
    });
}

/// Convierte el contenido de un `ssh_config` en hosts importables.
pub fn parse(content: &str) -> (Vec<HostInput>, Vec<String>) {
    let mut entries = Vec::new();
    let mut warnings = Vec::new();
    let mut current: Option<Block> = None;

    for (index, raw) in content.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let Some((key, value)) = split_directive(line) else {
            warnings.push(format!("línea {}: no se pudo interpretar «{line}»", index + 1));
            continue;
        };

        match key.as_str() {
            "host" => {
                if let Some(block) = current.take() {
                    push_block(block, &mut entries);
                }
                let aliases: Vec<String> = value.split_whitespace().map(str::to_string).collect();
                let has_wildcard = aliases.is_empty()
                    || aliases
                        .iter()
                        .any(|alias| alias.contains('*') || alias.contains('?') || alias.starts_with('!'));
                current = Some(Block {
                    aliases,
                    skip: has_wildcard,
                    ..Block::default()
                });
            }
            "hostname" => {
                if let Some(block) = current.as_mut() {
                    if block.hostname.is_none() {
                        block.hostname = Some(value);
                    }
                }
            }
            "user" => {
                if let Some(block) = current.as_mut() {
                    if block.user.is_none() {
                        block.user = Some(value);
                    }
                }
            }
            "port" => {
                if let Some(block) = current.as_mut() {
                    if block.port.is_none() {
                        match value.parse::<i64>() {
                            Ok(port) => block.port = Some(port),
                            Err(_) => warnings.push(format!(
                                "línea {}: «{value}» no es un puerto válido",
                                index + 1
                            )),
                        }
                    }
                }
            }
            "identityfile" => {
                if let Some(block) = current.as_mut() {
                    if block.identity_file.is_none() {
                        block.identity_file = Some(value);
                    }
                }
            }
            "include" => warnings.push(format!(
                "línea {}: «Include {value}» no se sigue automáticamente",
                index + 1
            )),
            // El resto de directivas no cambia cómo se conecta CloudTerm.
            _ => {}
        }
    }

    if let Some(block) = current.take() {
        push_block(block, &mut entries);
    }

    (entries, warnings)
}

/// Lee `~/.ssh/config` y devuelve las entradas sin tocar la base de datos.
#[tauri::command]
pub fn ssh_config_preview(app: AppHandle) -> Result<SshConfigPreview, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|err| format!("no se pudo resolver el directorio personal: {err}"))?;
    let path = home.join(".ssh").join("config");
    let display = path.to_string_lossy().to_string();

    if !path.exists() {
        return Ok(SshConfigPreview {
            path: display,
            exists: false,
            entries: Vec::new(),
            warnings: Vec::new(),
        });
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|err| format!("no se pudo leer {display}: {err}"))?;
    let (entries, warnings) = parse(&content);

    Ok(SshConfigPreview {
        path: display,
        exists: true,
        entries,
        warnings,
    })
}

/* -------------------------------------------------------------------------- */
/* Pruebas                                                                    */
/* -------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
# Configuración de ejemplo
Include ~/.ssh/config.d/*.conf

Host *
    ServerAliveInterval 60
    User porDefecto

Host produccion
    HostName prod.example.com
    User deploy
    Port 2222
    IdentityFile ~/.ssh/id_prod

Host nas caja
    HostName 192.168.1.10
    User admin

Host con-igual
    HostName=igual.example.com
    User=root

Host roto
    Port no-es-un-numero
"#;

    #[test]
    fn parses_hosts_and_skips_wildcards() {
        let (entries, _warnings) = parse(SAMPLE);

        // `Host *` se descarta; quedan produccion, nas y con-igual y roto.
        assert_eq!(entries.len(), 4, "entradas: {entries:#?}");

        let prod = &entries[0];
        assert_eq!(prod.name, "produccion");
        assert_eq!(prod.host, "prod.example.com");
        assert_eq!(prod.username, "deploy");
        assert_eq!(prod.port, 2222);
        assert_eq!(prod.private_key_path, "~/.ssh/id_prod");
        assert_eq!(prod.group_name, "~/.ssh/config");
    }

    #[test]
    fn uses_first_alias_and_falls_back_to_it_as_hostname() {
        let (entries, _) = parse(SAMPLE);
        let nas = &entries[1];
        assert_eq!(nas.name, "nas", "se usa el primer alias");
        assert_eq!(nas.host, "192.168.1.10");
        assert_eq!(nas.port, 22, "puerto por defecto");
    }

    #[test]
    fn accepts_equals_syntax() {
        let (entries, _) = parse(SAMPLE);
        let con_igual = &entries[2];
        assert_eq!(con_igual.host, "igual.example.com");
        assert_eq!(con_igual.username, "root");
    }

    #[test]
    fn first_directive_wins_within_a_block() {
        let (entries, _) = parse(
            "Host a\n  User primero\n  User segundo\n  HostName uno\n  HostName dos\n",
        );
        assert_eq!(entries[0].username, "primero");
        assert_eq!(entries[0].host, "uno");
    }

    #[test]
    fn reports_include_and_bad_port() {
        let (_, warnings) = parse(SAMPLE);
        assert!(
            warnings.iter().any(|w| w.contains("Include")),
            "debería avisar del Include: {warnings:?}"
        );
        assert!(
            warnings.iter().any(|w| w.contains("no es un puerto válido")),
            "debería avisar del puerto inválido: {warnings:?}"
        );
    }

    #[test]
    fn ignores_comments_and_directives_outside_a_host_block() {
        let (entries, warnings) = parse("# solo un comentario\nUser global\n\n");
        assert!(entries.is_empty());
        assert!(warnings.is_empty());
    }

    #[test]
    fn unquotes_values() {
        let (entries, _) = parse("Host x\n  HostName \"ejemplo con espacios\"\n");
        assert_eq!(entries[0].host, "ejemplo con espacios");
    }
}
