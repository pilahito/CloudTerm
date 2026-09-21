// CloudTerm · OAuth2 escritorio
// IDs oficiales inyectados en el build. Vacíos hasta que el autor los registre.

/// Client ID de Google (aplicación de escritorio). Público; no es un secreto.
pub fn google_client_id() -> &'static str {
    option_env!("CLOUDTERM_GOOGLE_CLIENT_ID").unwrap_or("")
}

/// Client ID de GitHub OAuth App. Público; no es un secreto.
pub fn github_client_id() -> &'static str {
    option_env!("CLOUDTERM_GITHUB_CLIENT_ID").unwrap_or("")
}
