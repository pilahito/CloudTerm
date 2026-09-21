#!/usr/bin/env bash
# Añade firma con keystore.properties al Gradle que genera `tauri android init`.
set -euo pipefail
FILE="src-tauri/gen/android/app/build.gradle.kts"
test -f "$FILE"

if ! grep -q "import java.util.Properties" "$FILE"; then
  sed -i '1i import java.util.Properties\nimport java.io.FileInputStream' "$FILE"
fi

if ! grep -q "keystorePropertiesFile" "$FILE"; then
  python3 - <<'PY'
from pathlib import Path
p = Path("src-tauri/gen/android/app/build.gradle.kts")
text = p.read_text(encoding="utf-8")
block = '''
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

'''
needle = "android {"
if needle in text:
    text = text.replace(needle, block + needle, 1)
    p.write_text(text, encoding="utf-8")
PY
fi

if ! grep -q "signingConfigs" "$FILE"; then
  python3 - <<'PY'
from pathlib import Path
p = Path("src-tauri/gen/android/app/build.gradle.kts")
text = p.read_text(encoding="utf-8")
block = '''
    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["keyPassword"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["storePassword"] as String
        }
    }
'''
needle = "    buildTypes {"
if needle in text:
    text = text.replace(needle, block + needle, 1)
    p.write_text(text, encoding="utf-8")
PY
fi

if ! grep -q 'signingConfig = signingConfigs.getByName("release")' "$FILE"; then
  python3 - <<'PY'
from pathlib import Path
p = Path("src-tauri/gen/android/app/build.gradle.kts")
text = p.read_text(encoding="utf-8")
needle = "            isMinifyEnabled = false"
insert = needle + '\n            signingConfig = signingConfigs.getByName("release")'
if needle in text and "signingConfigs.getByName" not in text:
    text = text.replace(needle, insert, 1)
    p.write_text(text, encoding="utf-8")
PY
fi
