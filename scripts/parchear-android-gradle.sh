#!/usr/bin/env bash
# CloudTerm · github.com/pilahito/cloudterm
# © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE
#
# Añade la firma con `keystore.properties` al Gradle que genera
# `tauri android init`, para que el APK/AAB de publicación salga firmado.
#
# Hay que ejecutarlo SIEMPRE después de `tauri android init` y antes de
# `tauri android build`, porque `init` regenera `app/build.gradle.kts`.
#
# Este script es idempotente: si ya está aplicado, no duplica nada.
#
# ── Por qué no se usa `sed`/`python3` ────────────────────────────────────────
# La versión anterior insertaba la firma justo después de la primera línea
# `isMinifyEnabled = false`, que en la plantilla actual de Tauri pertenece al
# bloque *debug*. El resultado era:
#
#   * el APK de depuración se firmaba con la clave de publicación, y
#   * el APK/AAB de publicación quedaba SIN FIRMAR (y `apksigner verify` del
#     flujo de trabajo fallaba).
#
# Ahora se localiza el bloque `getByName("release")` contando llaves, que es
# independiente del formato y del orden de las líneas.
set -euo pipefail

FILE="src-tauri/gen/android/app/build.gradle.kts"

if [ ! -f "$FILE" ]; then
  echo "  error: no existe $FILE; ejecuta antes 'tauri android init'" >&2
  exit 1
fi

# ── 1. Imports de Properties y FileInputStream ───────────────────────────────
#
# En el DSL de Kotlin, escribir `java.util.Properties` NO funciona: dentro de un
# script de Gradle `java` resuelve a la extensión `java` del proyecto, no al
# paquete, y la compilación falla con:
#
#     Unresolved reference: util
#     Unresolved reference: io
#
# Por eso se importan las clases y se usan por su nombre simple.
for clase in "java.util.Properties" "java.io.FileInputStream"; do
  if ! grep -q "^import $clase\$" "$FILE"; then
    printf 'import %s\n%s' "$clase" "$(cat "$FILE")" > "$FILE.tmp"
    mv "$FILE.tmp" "$FILE"
    echo "  · añadido el import de $clase"
  fi
done

# ── 2. Lectura de keystore.properties a nivel de proyecto ────────────────────
if ! grep -q 'keystorePropertiesFile' "$FILE"; then
  BLOCK=$(cat <<'KTS'

// CloudTerm: credenciales de firma. El fichero lo escribe el flujo de trabajo
// (o lo pones tú) en la raíz del proyecto Android y está fuera del control de
// versiones. Si no existe, las compilaciones de depuración siguen funcionando.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}
KTS
)
  awk -v block="$BLOCK" '
    !done && /^android \{/ { print block; done=1 }
    { print }
  ' "$FILE" > "$FILE.tmp"
  mv "$FILE.tmp" "$FILE"
  echo "  · añadida la lectura de keystore.properties"
fi

# ── 3. signingConfigs dentro de android { } ─────────────────────────────────
if ! grep -q 'signingConfigs' "$FILE"; then
  BLOCK=$(cat <<'KTS'

    // CloudTerm: configuración de firma de publicación. Solo se registra si
    // hay keystore, para no romper `assembleDebug` en un clon recién bajado.
    if (keystorePropertiesFile.exists()) {
        signingConfigs {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storePassword = keystoreProperties.getProperty("storePassword")
                storeFile = file(keystoreProperties.getProperty("storeFile"))
            }
        }
    }
KTS
)
  awk -v block="$BLOCK" '
    !done && /^android \{/ { print; print block; done=1; next }
    { print }
  ' "$FILE" > "$FILE.tmp"
  mv "$FILE.tmp" "$FILE"
  echo "  · añadido el bloque signingConfigs"
fi

# ── 4. La firma va al bloque RELEASE, no al debug ───────────────────────────
# Se busca `getByName("release") {` y se inserta como primera línea de su
# cuerpo, contando llaves para no depender del contenido del bloque.
if ! grep -q 'signingConfig = signingConfigs.getByName("release")' "$FILE"; then
  awk '
    {
      print
      if (!done && $0 ~ /getByName\("release"\)[[:space:]]*\{/) {
        print "            // CloudTerm: firma de publicación."
        print "            if (keystorePropertiesFile.exists()) {"
        print "                signingConfig = signingConfigs.getByName(\"release\")"
        print "            }"
        done = 1
      }
    }
  ' "$FILE" > "$FILE.tmp"
  mv "$FILE.tmp" "$FILE"
  echo "  · aplicada la firma al bloque release"
fi

echo "  ✓ Gradle preparado para firmar la publicación"
