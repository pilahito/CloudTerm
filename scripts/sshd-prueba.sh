#!/usr/bin/env bash
# CloudTerm · github.com/pilahito/cloudterm
# © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE
#
# Levanta un sshd de usar y tirar para las pruebas de integración de SSH.
#
# Las pruebas de `ssh::client` se saltan solas si no hay un servidor en el 2222,
# y eso está bien para que `cargo test` funcione en cualquier equipo. El problema
# es que un salto silencioso parece una prueba superada. Este script es la otra
# mitad: levanta el servidor para que la prueba se ejecute de verdad.
#
#   ./scripts/sshd-prueba.sh          # levanta y se queda en primer plano
#   ./scripts/sshd-prueba.sh --parar  # lo para
#
# Con el servidor en marcha, en otra terminal:
#   cargo test --manifest-path src-tauri/Cargo.toml --lib ssh::

set -euo pipefail

PUERTO="${CLOUDTERM_TEST_PORT:-2222}"
CARPETA="${CLOUDTERM_TEST_DIR:-${TMPDIR:-/tmp}/cloudterm-sshd-test}"
CONFIG="$CARPETA/sshd_config"

parar() {
  if [ -f "$CARPETA/sshd.pid" ]; then
    kill "$(cat "$CARPETA/sshd.pid")" 2>/dev/null || true
    rm -f "$CARPETA/sshd.pid"
    echo "  sshd de pruebas parado"
  else
    echo "  no había ninguno en marcha"
  fi
}

if [ "${1:-}" = "--parar" ]; then
  parar
  exit 0
fi

# --- Fixtures ---------------------------------------------------------------
mkdir -p "$CARPETA"
chmod 700 "$CARPETA"

if [ ! -f "$CARPETA/host_ed25519" ]; then
  echo "  generando claves de prueba…"
  ssh-keygen -t ed25519 -N "" -f "$CARPETA/host_ed25519" -q
  ssh-keygen -t ed25519 -N "" -f "$CARPETA/client_ed25519" -q
fi
cp -f "$CARPETA/client_ed25519.pub" "$CARPETA/authorized_keys"
chmod 600 "$CARPETA"/*_ed25519 "$CARPETA/authorized_keys"

# --- Configuración ----------------------------------------------------------
# Se escribe cada vez y con rutas absolutas reales: así el fichero no lleva
# clavada la carpeta personal de nadie.
cat > "$CONFIG" <<EOF
Port $PUERTO
ListenAddress 127.0.0.1
HostKey $CARPETA/host_ed25519
PidFile $CARPETA/sshd.pid
AuthorizedKeysFile $CARPETA/authorized_keys
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes no
LogLevel VERBOSE
Subsystem sftp internal-sftp
EOF

# --- Arranque ---------------------------------------------------------------
# Un sshd sin privilegios solo puede atender al mismo usuario que lo lanza, que
# es justo lo que necesita la prueba.
if [ -f "$CARPETA/sshd.pid" ] && kill -0 "$(cat "$CARPETA/sshd.pid")" 2>/dev/null; then
  echo "  ya estaba en marcha en el puerto $PUERTO"
  exit 0
fi

echo "  arrancando sshd en 127.0.0.1:$PUERTO"
echo "  pruebas: cargo test --manifest-path src-tauri/Cargo.toml --lib ssh::"
echo "  parar:   $0 --parar"

exec "$(command -v sshd)" -D -e -f "$CONFIG"
