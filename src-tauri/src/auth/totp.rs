// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Segundo factor por aplicación de autenticación (TOTP, RFC 6238).
//!
//! Es el código de seis dígitos que enseñan Google Authenticator, Microsoft
//! Authenticator, Authy, 1Password y compañía. Se calcula a partir de un secreto
//! compartido y del reloj, sin conexión y sin servidor: por eso funciona igual
//! con cualquier aplicación.
//!
//! Se implementa aquí en vez de añadir una biblioteca porque son treinta líneas
//! bien definidas por una RFC, y así queda cubierto por pruebas con los vectores
//! oficiales.

use base64::engine::general_purpose::STANDARD_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use sha1::Sha1;

/// Cada cuántos segundos cambia el código.
const PASO: u64 = 30;

/// Cuántos dígitos tiene el código.
const DIGITOS: u32 = 6;

/// Alfabeto base32 de la RFC 4648, que es el que usan las aplicaciones.
const ALFABETO: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// Bytes de entropía del secreto. 20 bytes (160 bits) es lo que recomienda la
/// RFC 4226 y lo que usan Google y GitHub.
const BYTES_SECRETO: usize = 20;

/// Cuántos pasos de reloj se toleran hacia cada lado.
///
/// Los relojes no van perfectos y pedir sincronía exacta haría fallar códigos
/// válidos. Un paso son 30 s: se acepta el anterior y el siguiente.
const TOLERANCIA: i64 = 1;

/* -------------------------------------------------------------------------- */
/* Base32                                                                     */
/* -------------------------------------------------------------------------- */

/// Codifica en base32 sin relleno, que es como viaja el secreto.
pub fn base32_codificar(datos: &[u8]) -> String {
    let mut salida = String::new();
    let mut buffer: u32 = 0;
    let mut bits = 0u32;

    for byte in datos {
        buffer = (buffer << 8) | u32::from(*byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            let indice = ((buffer >> bits) & 0x1f) as usize;
            salida.push(ALFABETO[indice] as char);
        }
    }

    // Los bits sobrantes se rellenan con ceros.
    if bits > 0 {
        let indice = ((buffer << (5 - bits)) & 0x1f) as usize;
        salida.push(ALFABETO[indice] as char);
    }

    salida
}

/// Decodifica base32, aceptando minúsculas, espacios y relleno `=`.
pub fn base32_decodificar(texto: &str) -> Result<Vec<u8>, String> {
    let limpio: Vec<u8> = texto
        .bytes()
        .filter(|b| !b.is_ascii_whitespace() && *b != b'=')
        .map(|b| b.to_ascii_uppercase())
        .collect();

    let mut salida = Vec::with_capacity(limpio.len() * 5 / 8);
    let mut buffer: u32 = 0;
    let mut bits = 0u32;

    for byte in limpio {
        let valor = ALFABETO
            .iter()
            .position(|c| *c == byte)
            .ok_or_else(|| format!("«{}» no es un carácter base32 válido", byte as char))?
            as u32;

        buffer = (buffer << 5) | valor;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            salida.push(((buffer >> bits) & 0xff) as u8);
        }
    }

    Ok(salida)
}

/* -------------------------------------------------------------------------- */
/* Secreto y códigos                                                          */
/* -------------------------------------------------------------------------- */

/// Secreto nuevo, listo para enseñar como código QR.
pub fn generar_secreto() -> String {
    use rand::RngCore;
    let mut bytes = vec![0u8; BYTES_SECRETO];
    rand::thread_rng().fill_bytes(&mut bytes);
    base32_codificar(&bytes)
}

/// Código válido en un instante concreto (segundos desde la época).
pub fn codigo_en(secreto: &str, instante: u64) -> Result<String, String> {
    let clave = base32_decodificar(secreto)?;
    if clave.is_empty() {
        return Err("el secreto está vacío".to_string());
    }

    let contador = instante / PASO;

    let mut mac = <Hmac<Sha1> as Mac>::new_from_slice(&clave)
        .map_err(|err| format!("no se pudo preparar el HMAC: {err}"))?;
    mac.update(&contador.to_be_bytes());
    let resumen = mac.finalize().into_bytes();

    // Truncamiento dinámico de la RFC 4226: los cuatro bits bajos del último
    // byte dicen en qué posición empezar a leer.
    let desfase = (resumen[19] & 0x0f) as usize;
    let binario = (u32::from(resumen[desfase] & 0x7f) << 24)
        | (u32::from(resumen[desfase + 1]) << 16)
        | (u32::from(resumen[desfase + 2]) << 8)
        | u32::from(resumen[desfase + 3]);

    let modulo = 10u32.pow(DIGITOS);
    Ok(format!("{:0ancho$}", binario % modulo, ancho = DIGITOS as usize))
}
/// Comprueba un código contra el reloj actual.
pub fn verificar(secreto: &str, codigo: &str, instante: u64) -> bool {
    let limpio: String = codigo.chars().filter(|c| c.is_ascii_digit()).collect();
    if limpio.len() != DIGITOS as usize {
        return false;
    }

    for desplazamiento in -TOLERANCIA..=TOLERANCIA {
        let momento = instante as i64 + desplazamiento * PASO as i64;
        if momento < 0 {
            continue;
        }
        if let Ok(esperado) = codigo_en(secreto, momento as u64) {
            if esperado == limpio {
                return true;
            }
        }
    }

    false
}

/// Instante actual en segundos desde la época.
pub fn ahora() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/* -------------------------------------------------------------------------- */
/* Enlace para el código QR                                                   */
/* -------------------------------------------------------------------------- */

/// URI `otpauth://` que se codifica en el QR.
///
/// El nombre de la cuenta va como `Emisor:usuario`, que es lo que hace que la
/// aplicación muestre «CloudTerm (ana)» en su lista.
pub fn uri_otpauth(emisor: &str, cuenta: &str, secreto: &str) -> String {
    let etiqueta = url::form_urlencoded::byte_serialize(format!("{emisor}:{cuenta}").as_bytes())
        .collect::<String>();
    let parametros = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("secret", secreto)
        .append_pair("issuer", emisor)
        .append_pair("algorithm", "SHA1")
        .append_pair("digits", &DIGITOS.to_string())
        .append_pair("period", &PASO.to_string())
        .finish();

    format!("otpauth://totp/{etiqueta}?{parametros}")
}

/// Código QR del enlace, como SVG.
///
/// Se devuelve SVG y no PNG porque escala sin pixelarse y no hay que codificar
/// imágenes: la interfaz lo inserta tal cual.
pub fn qr_svg(contenido: &str) -> Result<String, String> {
    use qrcode::QrCode;
    use qrcode::render::svg;

    let codigo = QrCode::new(contenido.as_bytes())
        .map_err(|err| format!("no se pudo generar el código QR: {err}"))?;

    Ok(codigo
        .render()
        .min_dimensions(200, 200)
        .dark_color(svg::Color("#e8eaf0"))
        .light_color(svg::Color("#0d0f14"))
        .build())
}

/* -------------------------------------------------------------------------- */
/* Códigos de recuperación                                                    */
/* -------------------------------------------------------------------------- */

/// Genera códigos de recuperación legibles.
///
/// Se agrupan en bloques de cuatro para poder copiarlos sin equivocarse, y se
/// evitan los caracteres que se confunden al leerlos en voz alta (0/O, 1/I/L).
pub fn generar_recuperacion(cantidad: usize) -> Vec<String> {
    use rand::Rng;
    const ALFABETO: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();

    (0..cantidad)
        .map(|_| {
            let bloque: String = (0..8)
                .map(|_| ALFABETO[rng.gen_range(0..ALFABETO.len())] as char)
                .collect();
            format!("{}-{}", &bloque[..4], &bloque[4..])
        })
        .collect()
}

/// Normaliza un código de recuperación escrito por el usuario.
pub fn normalizar_recuperacion(codigo: &str) -> String {
    codigo
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

/// Hash de un código de recuperación, para no guardarlo en claro.
pub fn hash_recuperacion(codigo: &str) -> String {
    use sha2::{Digest, Sha256};
    let normalizado = normalizar_recuperacion(codigo);
    // El código ya es aleatorio y largo, así que un SHA-256 directo basta: no
    // hay una contraseña memorizable que proteger de la fuerza bruta.
    let digest = Sha256::digest(normalizado.as_bytes());
    STANDARD_NO_PAD.encode(digest)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Vectores oficiales de la RFC 6238 para SHA-1.
    ///
    /// El secreto es la cadena ASCII `12345678901234567890`, que en base32 es
    /// `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`. La RFC da códigos de 8 dígitos; aquí
    /// se usan 6, así que se comparan los seis últimos.
    const SECRETO_RFC: &str = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    #[test]
    fn matches_the_rfc_6238_vectors() {
        for (instante, esperado) in [
            (59u64, "287082"),
            (1_111_111_109, "081804"),
            (1_111_111_111, "050471"),
            (1_234_567_890, "005924"),
            (2_000_000_000, "279037"),
        ] {
            let obtenido = codigo_en(SECRETO_RFC, instante).expect("código");
            assert_eq!(
                obtenido, esperado,
                "en T={instante} la RFC espera {esperado} y salió {obtenido}"
            );
        }
    }

    #[test]
    fn base32_round_trips() {
        for datos in [
            vec![0u8],
            vec![1, 2, 3, 4, 5],
            (0..20).collect::<Vec<u8>>(),
            vec![255; 32],
        ] {
            let texto = base32_codificar(&datos);
            assert_eq!(base32_decodificar(&texto).expect("decodificar"), datos);
        }
    }

    /// El secreto de la RFC, decodificado, tiene que dar la cadena que dice.
    #[test]
    fn base32_decodes_the_rfc_secret() {
        assert_eq!(
            base32_decodificar(SECRETO_RFC).expect("decodificar"),
            b"12345678901234567890".to_vec()
        );
    }

    /// Se acepta lo que la gente escribe a mano: minúsculas, espacios y `=`.
    #[test]
    fn base32_tolerates_sloppy_input() {
        let limpio = base32_decodificar(SECRETO_RFC).expect("limpio");
        for variante in [
            SECRETO_RFC.to_lowercase(),
            SECRETO_RFC.chars().collect::<Vec<_>>().chunks(4).map(|c| c.iter().collect::<String>()).collect::<Vec<_>>().join(" "),
            format!("{SECRETO_RFC}======"),
        ] {
            assert_eq!(base32_decodificar(&variante).expect("variante"), limpio);
        }
    }

    #[test]
    fn base32_rejects_invalid_characters() {
        assert!(base32_decodificar("ABC1DEF").is_err());
    }

    #[test]
    fn a_generated_secret_is_valid_and_long_enough() {
        let secreto = generar_secreto();
        // 20 bytes en base32 son 32 caracteres.
        assert_eq!(secreto.len(), 32, "{secreto}");
        assert!(secreto.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
        // Y tiene que poder usarse para calcular un código.
        assert_eq!(codigo_en(&secreto, 0).expect("código").len(), 6);
    }

    #[test]
    fn secrets_do_not_repeat() {
        assert_ne!(generar_secreto(), generar_secreto());
    }

    #[test]
    fn a_code_is_accepted_around_the_current_step() {
        let secreto = generar_secreto();
        let instante = 1_700_000_000u64;
        let codigo = codigo_en(&secreto, instante).expect("código");

        // El mismo código vale en el paso actual y en los vecinos, para tolerar
        // relojes desajustados.
        assert!(verificar(&secreto, &codigo, instante));
        assert!(verificar(&secreto, &codigo, instante + PASO));
        assert!(verificar(&secreto, &codigo, instante - PASO));
    }

    #[test]
    fn a_code_is_rejected_outside_the_tolerance_window() {
        let secreto = generar_secreto();
        let instante = 1_700_000_000u64;
        let codigo = codigo_en(&secreto, instante).expect("código");

        assert!(!verificar(&secreto, &codigo, instante + PASO * 3));
        assert!(!verificar(&secreto, &codigo, instante - PASO * 3));
    }

    #[test]
    fn a_code_from_another_secret_is_rejected() {
        let instante = 1_700_000_000u64;
        let codigo = codigo_en(&generar_secreto(), instante).expect("código");
        assert!(!verificar(&generar_secreto(), &codigo, instante));
    }

    #[test]
    fn malformed_codes_are_rejected_without_panicking() {
        let secreto = generar_secreto();
        for basura in ["", "12345", "1234567", "abcdef", "12 34 56", "--"] {
            assert!(!verificar(&secreto, basura, 1_700_000_000), "«{basura}»");
        }
    }

    /// Espacios alrededor sí se aceptan: mucha gente los pega con el código.
    #[test]
    fn a_code_with_spaces_is_still_read() {
        let secreto = generar_secreto();
        let instante = 1_700_000_000u64;
        let codigo = codigo_en(&secreto, instante).expect("código");
        assert!(verificar(&secreto, &format!("  {codigo}  "), instante));
    }

    #[test]
    fn the_uri_carries_everything_the_app_needs() {
        let uri = uri_otpauth("CloudTerm", "ana", "ABCDEFGHIJKLMNOP");
        assert!(uri.starts_with("otpauth://totp/CloudTerm%3Aana?"), "{uri}");
        assert!(uri.contains("secret=ABCDEFGHIJKLMNOP"), "{uri}");
        assert!(uri.contains("issuer=CloudTerm"), "{uri}");
        assert!(uri.contains("digits=6"), "{uri}");
        assert!(uri.contains("period=30"), "{uri}");
    }

    #[test]
    fn the_qr_is_svg() {
        let uri = uri_otpauth("CloudTerm", "ana", &generar_secreto());
        let svg = qr_svg(&uri).expect("QR");
        assert!(svg.contains("<svg"), "{svg}");
        assert!(svg.len() > 500, "un QR vacío no sirve");
    }

    #[test]
    fn recovery_codes_are_readable_and_unique() {
        let codigos = generar_recuperacion(8);
        assert_eq!(codigos.len(), 8);

        let unicos: std::collections::HashSet<_> = codigos.iter().collect();
        assert_eq!(unicos.len(), 8, "no deberían repetirse");

        for codigo in &codigos {
            assert_eq!(codigo.len(), 9, "{codigo}");
            assert_eq!(codigo.chars().nth(4), Some('-'), "{codigo}");
            // Sin caracteres que se confunden al leerlos.
            assert!(!codigo.contains('0'), "{codigo}");
            assert!(!codigo.contains('O'), "{codigo}");
            assert!(!codigo.contains('1'), "{codigo}");
            assert!(!codigo.contains('I'), "{codigo}");
        }
    }

    #[test]
    fn recovery_codes_hash_the_same_despite_formatting() {
        let codigo = "ABCD-EFGH";
        assert_eq!(
            hash_recuperacion(codigo),
            hash_recuperacion("abcd efgh"),
            "guiones, espacios y mayúsculas no deben cambiar el hash"
        );
        assert_ne!(hash_recuperacion(codigo), hash_recuperacion("ABCD-EFGI"));
    }
}
