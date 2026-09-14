// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Piezas del flujo PKCE (RFC 7636) y generación de valores aleatorios.
//!
//! PKCE permite que una aplicación de escritorio inicie el flujo de código de
//! autorización **sin guardar ningún secreto de cliente**: demuestra que quien
//! canjea el código es quien lo pidió, porque solo él conoce el verificador.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};

/// Longitud en bytes del verificador. 32 bytes dan 43 caracteres en base64url,
/// dentro del rango que exige la RFC (43–128).
const VERIFIER_BYTES: usize = 32;

/// Cadena aleatoria en base64url, sin relleno.
pub fn random_token(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buffer);
    URL_SAFE_NO_PAD.encode(&buffer)
}

/// Verificador PKCE: el secreto que se guarda hasta canjear el código.
pub fn verifier() -> String {
    random_token(VERIFIER_BYTES)
}

/// Reto PKCE: `BASE64URL(SHA256(verificador))`, el valor que viaja en la URL.
pub fn challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

/// Valor `state`, para comprobar que la respuesta corresponde a esta petición.
pub fn state() -> String {
    random_token(24)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifier_has_the_required_shape() {
        let value = verifier();
        // 32 bytes en base64url sin relleno son 43 caracteres.
        assert_eq!(value.len(), 43, "{value}");
        assert!(
            value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
            "solo puede tener caracteres base64url: {value}"
        );
    }

    #[test]
    fn verifiers_do_not_repeat() {
        let a = verifier();
        let b = verifier();
        assert_ne!(a, b);
    }

    /// Valor comprobado a mano: `echo -n "abc" | sha256sum` en base64url.
    #[test]
    fn challenge_matches_the_known_sha256() {
        assert_eq!(
            challenge("abc"),
            "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0"
        );
    }

    #[test]
    fn challenge_is_deterministic_and_short() {
        let v = verifier();
        assert_eq!(challenge(&v), challenge(&v));
        // SHA-256 en base64url sin relleno son 43 caracteres.
        assert_eq!(challenge(&v).len(), 43);
    }

    #[test]
    fn state_is_random_and_url_safe() {
        let a = state();
        let b = state();
        assert_ne!(a, b);
        assert_eq!(a.len(), 32); // 24 bytes → 32 caracteres
    }
}
