#!/usr/bin/env bash
# CloudTerm · github.com/pilahito/cloudterm
# © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE
#
# Deja lista la carpeta del instalador de Windows antes de compilarlo.
#
# Hace una sola cosa: bajar el arranque de WebView2, que el instalador ofrece
# como componente opcional. No se versiona en el repositorio porque es de
# Microsoft y no es nuestro; se descarga desde el enlace oficial de Microsoft.
#
# Uso:
#   ./packaging/windows/preparar.sh
#
# En Windows también funciona desde Git Bash o WSL.

set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="$AQUI/MicrosoftEdgeWebview2Setup.exe"

# Enlace oficial de Microsoft para el instalador «evergreen» de WebView2.
URL="https://go.microsoft.com/fwlink/p/?LinkId=2124703"

if [ -f "$DESTINO" ]; then
  echo "  Ya está descargado: $DESTINO"
  exit 0
fi

echo "  Descargando el arranque de WebView2…"
curl --fail --location --silent --show-error --output "$DESTINO" "$URL"

# Un fichero de cero bytes o un HTML de error pasarían por buenos si no se
# mirara el tamaño, y el instalador saldría roto sin decir por qué.
tamano=$(wc -c <"$DESTINO")
if [ "$tamano" -lt 100000 ]; then
  rm -f "$DESTINO"
  echo "✗ La descarga no parece el instalador de WebView2 ($tamano bytes)." >&2
  exit 1
fi

echo "  Listo: $DESTINO ($((tamano / 1024)) KiB)"
