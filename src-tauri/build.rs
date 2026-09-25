// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

fn main() {
    // Los identificadores de cliente integrados (`clients.rs`) se leen con
    // `option_env!`. Cargo ya sigue esas variables, pero se declaran aquí de
    // forma explícita: así un cambio en el secreto del flujo de compilación
    // fuerza a recompilar el binario en lugar de reutilizar una caché con el
    // valor anterior (el usuario acabaría con un Client ID viejo incrustado).
    for variable in [
        "CLOUDTERM_GOOGLE_CLIENT_ID",
        "CLOUDTERM_GOOGLE_ANDROID_CLIENT_ID",
        "CLOUDTERM_GITHUB_CLIENT_ID",
    ] {
        println!("cargo:rerun-if-env-changed={variable}");
    }

    tauri_build::build()
}
