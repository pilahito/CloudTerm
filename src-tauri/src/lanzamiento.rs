// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Con qué se arrancó CloudTerm.
//!
//! El instalador de Windows deja a CloudTerm registrado como gestor de los
//! enlaces `ssh://`. Cuando alguien pulsa uno —desde el navegador, desde el
//! Explorador o desde un chat— el sistema arranca el programa con esa dirección
//! como argumento. Aquí se interpreta y se traduce a algo que la interfaz ya
//! sabe usar: el formulario de conexión, relleno.
//!
//! Este módulo no toca la red ni el disco; solo mira `argv`. Por eso se puede
//! probar entero sin arrancar la aplicación.

use serde::Serialize;
use url::Url;

/// Puerto que se usa cuando la dirección no dice ninguno.
pub const PUERTO_SSH: u16 = 22;

/// A dónde apunta un arranque pedido por el sistema operativo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Destino {
    /// Nombre o dirección de la máquina.
    pub host: String,
    /// Puerto TCP ya resuelto (nunca cero).
    pub puerto: u16,
    /// Usuario, si el enlace lo trae; si no, cadena vacía.
    pub usuario: String,
    /// Ruta remota, si el enlace la trae; si no, cadena vacía.
    pub ruta: String,
}

impl Destino {
    /// Arma un destino a partir de sus piezas, aplicando los valores por defecto.
    fn nuevo(host: &str, puerto: Option<u16>, usuario: &str, ruta: &str) -> Option<Self> {
        let host = host.trim().trim_matches(['[', ']']);
        if host.is_empty() {
            return None;
        }

        Some(Self {
            host: host.to_string(),
            // El puerto 0 no es válido en TCP: se trata como «no lo dijo».
            puerto: puerto.filter(|valor| *valor != 0).unwrap_or(PUERTO_SSH),
            usuario: usuario.trim().to_string(),
            ruta: ruta.trim().to_string(),
        })
    }
}

/// Interpreta una lista de argumentos, incluido `argv[0]`.
///
/// Se acepta la forma que registra el instalador (`ssh://…`) y una explícita
/// (`--ssh host` / `--ssh=host`) para poder invocarlo a mano desde una consola.
pub fn interpretar(args: &[String]) -> Option<Destino> {
    let mut resto = args.iter().skip(1);

    while let Some(argumento) = resto.next() {
        // Todo lo que va detrás de `--` es del usuario, no nuestro.
        if argumento == "--" {
            break;
        }

        if argumento == "--ssh" || argumento == "-ssh" {
            return resto.next().and_then(|valor| desde_valor(valor));
        }

        if let Some(valor) = argumento
            .strip_prefix("--ssh=")
            .or_else(|| argumento.strip_prefix("-ssh="))
        {
            return desde_valor(valor);
        }

        if let Some(destino) = desde_enlace(argumento) {
            return Some(destino);
        }
    }

    None
}

/// Destino con el que arrancó este proceso, leído de `argv`.
///
/// Se usa `args_os` y se convierte con pérdida a propósito: en Windows una ruta
/// puede no ser UTF-8 válido y `std::env::args()` abortaría el programa entero
/// por un argumento que ni siquiera nos interesa.
pub fn leer_entorno() -> Option<Destino> {
    let args: Vec<String> = std::env::args_os()
        .map(|valor| valor.to_string_lossy().into_owned())
        .collect();

    interpretar(&args)
}

/// Acepta tanto un enlace `ssh://…` como un `host[:puerto]` suelto.
fn desde_valor(valor: &str) -> Option<Destino> {
    desde_enlace(valor).or_else(|| desde_host_suelto(valor))
}

/// `usuario@host:2222` o `host`, sin esquema.
fn desde_host_suelto(valor: &str) -> Option<Destino> {
    let texto = limpiar(valor);
    if texto.is_empty() || texto.contains('/') {
        return None;
    }

    let (usuario, resto) = match texto.rsplit_once('@') {
        Some((usuario, resto)) => (usuario, resto),
        None => ("", texto.as_str()),
    };

    let (host, puerto) = separar_puerto(resto);

    Destino::nuevo(host, puerto, usuario, "")
}

/// Parte `host:puerto` sin romper una dirección IPv6 escrita sin corchetes.
fn separar_puerto(resto: &str) -> (&str, Option<u16>) {
    // `[::1]:2222` — aquí los dos puntos del puerto son el único de fuera.
    if let Some(resto) = resto.strip_prefix('[') {
        return match resto.split_once("]:") {
            Some((host, puerto)) => (host, puerto.parse().ok()),
            None => (resto.trim_end_matches(']'), None),
        };
    }

    match resto.rsplit_once(':') {
        // Dos o más `:` sin corchetes son una IPv6, no un puerto.
        Some((host, puerto)) if !host.contains(':') => (host, puerto.parse().ok()),
        _ => (resto, None),
    }
}

/// `ssh://usuario@host:2222/ruta`.
fn desde_enlace(valor: &str) -> Option<Destino> {
    let texto = limpiar(valor);
    if !texto
        .get(..6)
        .is_some_and(|inicio| inicio.eq_ignore_ascii_case("ssh://"))
    {
        return None;
    }

    let url = Url::parse(&texto).ok()?;
    let host = url.host_str()?;

    let usuario = desescapar(url.username());
    let ruta = desescapar(url.path());

    Destino::nuevo(host, url.port(), &usuario, &ruta)
}

/// Quita espacios y las comillas que algunos lanzadores dejan puestas.
fn limpiar(valor: &str) -> String {
    valor
        .trim()
        .trim_matches(|caracter| caracter == '"' || caracter == '\'')
        .trim()
        .to_string()
}

/// Deshace los escapes `%XX` de una URL.
fn desescapar(texto: &str) -> String {
    let bytes = texto.as_bytes();
    let mut salida: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut indice = 0;

    while indice < bytes.len() {
        if bytes[indice] == b'%' && indice + 2 < bytes.len() {
            let alto = (bytes[indice + 1] as char).to_digit(16);
            let bajo = (bytes[indice + 2] as char).to_digit(16);

            if let (Some(alto), Some(bajo)) = (alto, bajo) {
                salida.push((alto * 16 + bajo) as u8);
                indice += 3;
                continue;
            }
        }

        salida.push(bytes[indice]);
        indice += 1;
    }

    String::from_utf8_lossy(&salida).into_owned()
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn args(valores: &[&str]) -> Vec<String> {
        valores.iter().map(|valor| valor.to_string()).collect()
    }

    #[test]
    fn sin_argumentos_no_hay_destino() {
        assert_eq!(interpretar(&args(&["cloudterm"])), None);
    }

    #[test]
    fn un_enlace_completo_se_entiende() {
        let destino = interpretar(&args(&["cloudterm", "ssh://demo@192.0.2.10:2222/home/demo"]))
            .expect("debería haber destino");

        assert_eq!(
            destino,
            Destino {
                host: "192.0.2.10".to_string(),
                puerto: 2222,
                usuario: "demo".to_string(),
                ruta: "/home/demo".to_string(),
            }
        );
    }

    #[test]
    fn sin_puerto_se_usa_el_de_serie() {
        let destino = interpretar(&args(&["cloudterm", "ssh://demo@example.com"])).expect("destino");
        assert_eq!(destino.puerto, PUERTO_SSH);
        assert_eq!(destino.usuario, "demo");
        assert_eq!(destino.ruta, "");
    }

    #[test]
    fn un_host_suelto_tambien_vale() {
        let destino = interpretar(&args(&["cloudterm", "--ssh", "demo@example.com:2200"]))
            .expect("destino");

        assert_eq!(destino.host, "example.com");
        assert_eq!(destino.puerto, 2200);
        assert_eq!(destino.usuario, "demo");
    }

    #[test]
    fn la_forma_con_igual_funciona() {
        let destino =
            interpretar(&args(&["cloudterm", "--ssh=example.com"])).expect("destino");

        assert_eq!(destino.host, "example.com");
        assert_eq!(destino.puerto, PUERTO_SSH);
        assert_eq!(destino.usuario, "");
    }

    #[test]
    fn se_admiten_mayusculas_y_espacios() {
        let destino =
            interpretar(&args(&["cloudterm", "  SSH://Demo@Example.COM:2222/ "])).expect("destino");

        assert_eq!(destino.host, "Example.COM");
        assert_eq!(destino.usuario, "Demo");
        assert_eq!(destino.puerto, 2222);
        assert_eq!(destino.ruta, "/");
    }

    #[test]
    fn se_quitan_las_comillas_que_deja_el_lanzador() {
        let destino =
            interpretar(&args(&["cloudterm", "\"ssh://demo@example.com\""])).expect("destino");

        assert_eq!(destino.host, "example.com");
    }

    #[test]
    fn el_usuario_y_la_ruta_se_desescapan() {
        let destino = interpretar(&args(&[
            "cloudterm",
            "ssh://david%20p%C3%A9rez@example.com/mi%20carpeta",
        ]))
        .expect("destino");

        assert_eq!(destino.usuario, "david pérez");
        assert_eq!(destino.ruta, "/mi carpeta");
    }

    #[test]
    fn una_direccion_ipv6_conserva_sus_dos_puntos() {
        let destino = interpretar(&args(&["cloudterm", "ssh://demo@[::1]:2222/"])).expect("destino");

        assert_eq!(destino.host, "::1");
        assert_eq!(destino.puerto, 2222);
    }

    #[test]
    fn una_ipv6_sin_puerto_no_inventa_puerto() {
        let destino = interpretar(&args(&["cloudterm", "--ssh", "ssh://demo@[::1]"])).expect("destino");

        assert_eq!(destino.host, "::1");
        assert_eq!(destino.puerto, PUERTO_SSH);
    }

    #[test]
    fn una_ipv6_suelta_conserva_sus_dos_puntos() {
        let destino = interpretar(&args(&["cloudterm", "--ssh", "demo@::1"])).expect("destino");

        assert_eq!(destino.host, "::1");
        assert_eq!(destino.puerto, PUERTO_SSH);
    }

    #[test]
    fn el_puerto_cero_se_ignora() {
        let destino = interpretar(&args(&["cloudterm", "ssh://example.com:0"])).expect("destino");
        assert_eq!(destino.puerto, PUERTO_SSH);
    }

    #[test]
    fn un_enlace_vacio_no_es_un_destino() {
        assert_eq!(interpretar(&args(&["cloudterm", "ssh://"])), None);
        assert_eq!(interpretar(&args(&["cloudterm", "ssh:///"])), None);
    }

    #[test]
    fn un_enlace_sin_usuario_se_queda_sin_usuario() {
        let destino = interpretar(&args(&["cloudterm", "ssh://@example.com"])).expect("destino");

        assert_eq!(destino.host, "example.com");
        assert_eq!(destino.usuario, "");
    }

    #[test]
    fn otros_esquemas_se_ignoran() {
        assert_eq!(interpretar(&args(&["cloudterm", "https://example.com"])), None);
        assert_eq!(interpretar(&args(&["cloudterm", "--verbose"])), None);
    }

    #[test]
    fn lo_que_va_tras_el_separador_no_cuenta() {
        assert_eq!(
            interpretar(&args(&["cloudterm", "--", "ssh://demo@example.com"])),
            None
        );
    }

    #[test]
    fn gana_el_primer_destino_de_la_lista() {
        let destino = interpretar(&args(&[
            "cloudterm",
            "ssh://primero@example.com",
            "ssh://segundo@example.net",
        ]))
        .expect("destino");

        assert_eq!(destino.host, "example.com");
    }
}
