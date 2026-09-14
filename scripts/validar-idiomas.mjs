#!/usr/bin/env node
// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Comprueba que todas las traducciones están completas y son coherentes.
 *
 * Se ejecuta en cada propuesta de cambio (ver `.github/workflows/idiomas.yml`),
 * para que una traducción a medias no llegue a `main`.
 *
 * Qué se comprueba:
 *   1. Que cada idioma tenga exactamente las mismas claves que el de referencia.
 *   2. Que no haya valores vacíos.
 *   3. Que los marcadores (`{nombre}`) coincidan con los del idioma de referencia:
 *      si el español dice `{word}`, el chino no puede perderlo.
 *
 * No se comprueba si quedan espacios en los extremos: cuando una frase se parte
 * alrededor de un enlace o de un resaltado, ese espacio es necesario para que el
 * texto se lea bien al unirlo.
 *
 * Uso:
 *   node scripts/validar-idiomas.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = join(RAIZ, "src", "i18n", "locales");

/** Idioma cuyas claves son la referencia. */
const REFERENCIA = "es";

/** Marcadores `{nombre}` que aparecen en un texto. */
function marcadores(texto) {
  return [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

/** Lee todos los diccionarios de `locales/`. */
function leerDiccionarios() {
  const ficheros = readdirSync(LOCALES).filter((f) => f.endsWith(".json"));
  const diccionarios = new Map();

  for (const fichero of ficheros) {
    const idioma = fichero.replace(/\.json$/, "");
    const ruta = join(LOCALES, fichero);
    let datos;
    try {
      datos = JSON.parse(readFileSync(ruta, "utf8"));
    } catch (error) {
      console.error(`✗ ${fichero}: no es JSON válido — ${error.message}`);
      process.exit(1);
    }
    if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
      console.error(`✗ ${fichero}: debe ser un objeto de clave → texto`);
      process.exit(1);
    }
    diccionarios.set(idioma, { fichero, datos });
  }

  return diccionarios;
}

function main() {
  const diccionarios = leerDiccionarios();

  if (!diccionarios.has(REFERENCIA)) {
    console.error(`✗ falta el idioma de referencia: ${REFERENCIA}.json`);
    process.exit(1);
  }

  const referencia = diccionarios.get(REFERENCIA);
  const clavesRef = Object.keys(referencia.datos).sort();
  const problemas = [];

  // --- 1 y 2: claves y valores vacíos, en todos los idiomas -----------------
  for (const [idioma, { fichero, datos }] of diccionarios) {
    const claves = Object.keys(datos).sort();

    const faltan = clavesRef.filter((k) => !(k in datos));
    const sobran = claves.filter((k) => !(k in referencia.datos));

    if (faltan.length > 0) {
      problemas.push(
        `${fichero}: faltan ${faltan.length} clave(s):\n` +
          faltan.map((k) => `      - ${k}`).join("\n"),
      );
    }
    if (sobran.length > 0) {
      problemas.push(
        `${fichero}: tiene ${sobran.length} clave(s) que no están en ${REFERENCIA}.json:\n` +
          sobran.map((k) => `      - ${k}`).join("\n"),
      );
    }

    for (const [clave, valor] of Object.entries(datos)) {
      if (typeof valor !== "string") {
        problemas.push(`${fichero}: «${clave}» no es texto (${typeof valor})`);
        continue;
      }
      if (valor.trim() === "") {
        problemas.push(`${fichero}: «${clave}» está vacío`);
      }
      // Los espacios en los extremos son legítimos cuando la frase se parte
      // alrededor de un enlace, así que no se comprueban.
    }
  }

  // --- 3: los marcadores deben coincidir con la referencia ------------------
  for (const [idioma, { fichero, datos }] of diccionarios) {
    if (idioma === REFERENCIA) continue;

    for (const clave of clavesRef) {
      const esperado = referencia.datos[clave];
      const obtenido = datos[clave];
      if (typeof esperado !== "string" || typeof obtenido !== "string") continue;

      const a = marcadores(esperado).join(",");
      const b = marcadores(obtenido).join(",");
      if (a !== b) {
        problemas.push(
          `${fichero}: «${clave}» usa los marcadores [${b || "ninguno"}] ` +
            `pero ${REFERENCIA} usa [${a || "ninguno"}]`,
        );
      }
    }
  }

  // --- Informe --------------------------------------------------------------
  if (problemas.length > 0) {
    console.error(`\n✗ Traducciones incompletas (${problemas.length} problema(s)):\n`);
    for (const problema of problemas) console.error(`  ${problema}\n`);
    console.error(
      "  Recuerda: todas las claves deben existir en todos los idiomas y los\n" +
        "  marcadores `{asi}` deben conservarse.\n",
    );
    process.exit(1);
  }

  console.log(
    `✅ ${diccionarios.size} idioma(s) correctos, ${clavesRef.length} claves cada uno.`,
  );
}

main();
