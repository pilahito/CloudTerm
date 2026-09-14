#!/usr/bin/env bash
#
# Instala CloudTerm como aplicación de escritorio en Arch Linux (y en general
# en cualquier Linux con XDG), **sin necesidad de root**.
#
#   ./scripts/instalar.sh            # instala
#   ./scripts/instalar.sh --quitar   # desinstala
#
# Deja el binario en ~/.local/bin, los iconos en el tema hicolor y una entrada
# de menú, así que aparece en el lanzador de aplicaciones como cualquier otro
# programa.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARIO_FUENTE="$RAIZ/src-tauri/target/release/cloudterm"
ICONO_MAESTRO="$RAIZ/docs/brand/icon-1024.png"
ICONO_VECTORIAL="$RAIZ/docs/brand/icon.svg"

BIN_DESTINO="$HOME/.local/bin"
APPS_DESTINO="$HOME/.local/share/applications"
ICONOS_RAIZ="$HOME/.local/share/icons/hicolor"
ENTRADA="$APPS_DESTINO/cloudterm.desktop"

# El nombre tiene que coincidir con el de los ficheros de icono.
ICONO_NOMBRE="cloudterm"
TAMANOS=(32 64 128 256 512)

azul()  { printf '\033[38;2;34;211;238m%s\033[0m\n' "$*"; }
verde() { printf '\033[38;2;40;200;120m%s\033[0m\n' "$*"; }
rojo()  { printf '\033[38;2;248;81;73m%s\033[0m\n' "$*" >&2; }

quitar() {
  azul "→ Quitando CloudTerm…"
  rm -f "$BIN_DESTINO/cloudterm"
  rm -f "$ENTRADA"
  for tamano in "${TAMANOS[@]}"; do
    rm -f "$ICONOS_RAIZ/${tamano}x${tamano}/apps/$ICONO_NOMBRE.png"
  done
  rm -f "$ICONOS_RAIZ/scalable/apps/$ICONO_NOMBRE.svg"

  update-desktop-database "$APPS_DESTINO" 2>/dev/null || true
  gtk-update-icon-cache -f -t "$ICONOS_RAIZ" 2>/dev/null || true

  verde "✓ CloudTerm desinstalado."
  echo "  Los datos (hosts, ajustes, known_hosts) siguen en ~/.local/share y ~/.config."
  echo "  Bórralos a mano si quieres empezar de cero:"
  echo "    rm -rf ~/.local/share/com.pilahito.cloudterm ~/.config/com.pilahito.cloudterm"
  exit 0
}

if [[ "${1:-}" == "--quitar" || "${1:-}" == "--uninstall" ]]; then
  quitar
fi

# --------------------------------------------------------------------------
# Comprobaciones
# --------------------------------------------------------------------------

if [[ ! -x "$BINARIO_FUENTE" ]]; then
  rojo "No encuentro el binario compilado:"
  rojo "  $BINARIO_FUENTE"
  echo
  echo "Compílalo antes con:"
  echo "  npm run tauri build -- --no-bundle"
  exit 1
fi

if ! command -v magick >/dev/null 2>&1 && ! command -v convert >/dev/null 2>&1; then
  rojo "Hace falta ImageMagick para generar los iconos (paquete «imagemagick»)."
  exit 1
fi

# --------------------------------------------------------------------------
# Instalación
# --------------------------------------------------------------------------

azul "→ Instalando CloudTerm…"

# 1. Binario
install -Dm755 "$BINARIO_FUENTE" "$BIN_DESTINO/cloudterm"
echo "  binario   → $BIN_DESTINO/cloudterm"

# 2. Iconos en todos los tamaños del tema hicolor
for tamano in "${TAMANOS[@]}"; do
  install -d "$ICONOS_RAIZ/${tamano}x${tamano}/apps"
  if command -v magick >/dev/null 2>&1; then
    magick "$ICONO_MAESTRO" -resize "${tamano}x${tamano}" \
      "$ICONOS_RAIZ/${tamano}x${tamano}/apps/$ICONO_NOMBRE.png"
  else
    convert "$ICONO_MAESTRO" -resize "${tamano}x${tamano}" \
      "$ICONOS_RAIZ/${tamano}x${tamano}/apps/$ICONO_NOMBRE.png"
  fi
done
install -Dm644 "$ICONO_VECTORIAL" "$ICONOS_RAIZ/scalable/apps/$ICONO_NOMBRE.svg"
echo "  iconos    → $ICONOS_RAIZ/{${TAMANOS[*]}}x/apps, scalable"

# 3. Entrada de escritorio
install -d "$APPS_DESTINO"
cat > "$ENTRADA" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=CloudTerm
GenericName=Terminal SSH/SFTP
Comment=Cliente SSH y SFTP de escritorio con Pixel Agents
Exec=$BIN_DESTINO/cloudterm %U
Icon=$ICONO_NOMBRE
Terminal=false
Categories=Network;RemoteAccess;
Keywords=ssh;sftp;terminal;shell;remote;servidor;
StartupNotify=true
StartupWMClass=cloudterm
EOF
echo "  entrada   → $ENTRADA"

# 4. Refrescar las cachés del escritorio
update-desktop-database "$APPS_DESTINO" 2>/dev/null || true
gtk-update-icon-cache -f -t "$ICONOS_RAIZ" 2>/dev/null || true

# 5. Validar la entrada, si hay con qué
if command -v desktop-file-validate >/dev/null 2>&1; then
  if desktop-file-validate "$ENTRADA"; then
    echo "  entrada validada correctamente"
  else
    rojo "  aviso: la entrada no pasó la validación"
  fi
fi

# 6. PATH para poder lanzarlo desde la terminal
if [[ ":$PATH:" != *":$BIN_DESTINO:"* ]]; then
  echo
  azul "→ $BIN_DESTINO no está en el PATH"
  for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    [[ -f "$rc" ]] || continue
    if ! grep -q 'CloudTerm: binarios locales' "$rc" 2>/dev/null; then
      {
        echo ""
        echo "# CloudTerm: binarios locales en el PATH"
        echo 'export PATH="$HOME/.local/bin:$PATH"'
      } >> "$rc"
      echo "  añadido a $rc"
    fi
  done
  echo "  Abre una terminal nueva (o ejecuta: source ~/.bashrc)"
fi

echo
verde "✓ CloudTerm instalado."
echo
echo "  Lánzalo desde el menú de aplicaciones, o con:"
echo "    cloudterm"
echo
echo "  Para desinstalarlo:"
echo "    $RAIZ/scripts/instalar.sh --quitar"
