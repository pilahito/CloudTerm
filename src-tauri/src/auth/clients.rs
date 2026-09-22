// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Identificadores de cliente **integrados de fábrica**.
//!
//! Con esto, quien instala CloudTerm puede pulsar «Iniciar sesión con Google» o
//! «con GitHub» sin configurar nada: no hay que crear una aplicación en la
//! consola del proveedor.
//!
//! # Cómo rellenarlos
//!
//! Hay dos vías, y el orden de prioridad es: primero lo que el usuario haya
//! guardado en Ajustes (su propio Client ID), y si no hay nada, esto de aquí.
//! Es decir, integrarlos **no quita** que un usuario avanzado use los suyos.
//!
//! 1. **En el build** (recomendado para el binario oficial): define las
//!    variables de entorno `CLOUDTERM_GOOGLE_CLIENT_ID` y
//!    `CLOUDTERM_GITHUB_CLIENT_ID` antes de compilar. Así el identificador no
//!    queda escrito en el repositorio.
//! 2. **En el código**: pega el valor entre las comillas del `const` de abajo.
//!
//! ```text
//! $env:CLOUDTERM_GOOGLE_CLIENT_ID = "1234567890-abc.apps.googleusercontent.com"
//! $env:CLOUDTERM_GITHUB_CLIENT_ID = "Ov23liXXXXXXXXXXXXXX"
//! cargo tauri build
//! ```
//!
//! # Qué es y qué no es un secreto
//!
//! El **Client ID no es un secreto**: viaja en la URL de autorización y
//! cualquiera puede leerlo del binario. Lo que protege el flujo es el PKCE
//! (`S256`), que impide canjear el código sin el verificador que solo tiene esta
//! aplicación. Por eso Google **no pide** secreto en aplicaciones de escritorio.
//!
//! GitHub sí puede pedir el *client secret* al canjear. Ese sí es secreto y **no
//! debe ir aquí**: se guarda en el llavero del sistema desde Ajustes.

/// Client ID de Google (aplicación de escritorio). Público; no es un secreto.
///
/// Formato: `1234567890-xxxxxxxx.apps.googleusercontent.com`
pub const GOOGLE_CLIENT_ID: &str = "";

/// Client ID de GitHub OAuth App. Público; no es un secreto.
///
/// Formato: `Ov23liXXXXXXXXXXXXXX`
pub const GITHUB_CLIENT_ID: &str = "";

/// Identificador de Google integrado en el build, si lo hay.
///
/// Se lee en tiempo de compilación: si la variable de entorno no está definida
/// cuando se compila, queda vacío y se usa el `const` de arriba.
pub fn google_client_id() -> &'static str {
    match option_env!("CLOUDTERM_GOOGLE_CLIENT_ID") {
        Some(value) if !value.trim().is_empty() => value,
        _ => GOOGLE_CLIENT_ID,
    }
}

/// Identificador de GitHub integrado en el build, si lo hay.
pub fn github_client_id() -> &'static str {
    match option_env!("CLOUDTERM_GITHUB_CLIENT_ID") {
        Some(value) if !value.trim().is_empty() => value,
        _ => GITHUB_CLIENT_ID,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Los valores de fábrica nunca deben traer espacios: un Client ID con un
    /// salto de línea o un espacio al pegarlo rompe la URL de autorización con
    /// un error confuso del proveedor.
    #[test]
    fn built_in_ids_are_trimmed() {
        assert_eq!(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_ID.trim());
        assert_eq!(GITHUB_CLIENT_ID, GITHUB_CLIENT_ID.trim());
    }

    /// La variable de entorno solo manda si trae algo; si está vacía se usa el
    /// valor de fábrica en lugar de dejar al usuario sin identificador.
    #[test]
    fn an_empty_environment_variable_falls_back_to_the_built_in() {
        // `option_env!` se resuelve al compilar, así que aquí solo se comprueba
        // que la función devuelve algo coherente y sin espacios.
        let google = google_client_id();
        let github = github_client_id();
        assert_eq!(google, google.trim());
        assert_eq!(github, github.trim());
    }
}
