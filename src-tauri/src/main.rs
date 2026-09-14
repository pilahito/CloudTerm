// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// ¿La sesión gráfica es Wayland?
///
/// Se miran las dos señales habituales porque no todos los lanzadores definen
/// `XDG_SESSION_TYPE`: al abrir desde un gestor de archivos o un servicio suele
/// faltar, pero `WAYLAND_DISPLAY` sí está.
fn en_wayland() -> bool {
    if let Ok(kind) = std::env::var("XDG_SESSION_TYPE") {
        if kind.eq_ignore_ascii_case("wayland") {
            return true;
        }
    }
    std::env::var_os("WAYLAND_DISPLAY").is_some()
}

/// Evita que la ventana se cierre nada más abrirse en Wayland.
///
/// WebKitGTK intenta usar su *renderer* DMABUF y, en varias combinaciones de
/// compositor y driver (Hyprland, NVIDIA, ciertos Mesa), GDK aborta con
///
/// ```text
/// Gdk-Message: Error 71 (Error de protocolo) dispatching to Wayland display.
/// ```
///
/// y el proceso muere antes de dibujar nada: la aplicación «no abre». Desactivar
/// esa ruta es la solución conocida y solo afecta al modo de render.
///
/// Si el usuario ya fijó un valor para la variable, se respeta su elección.
fn ajustar_entorno_grafico() {
    const VAR: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";

    if std::env::var_os(VAR).is_some() || !en_wayland() {
        return;
    }

    std::env::set_var(VAR, "1");
}

fn main() {
    ajustar_entorno_grafico();
    cloudterm_lib::run()
}
