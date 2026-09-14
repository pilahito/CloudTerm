# Idiomas

CloudTerm habla **español**, **inglés** y **chino simplificado**. Añadir otro
idioma no requiere tocar código: es dejar un fichero y registrarlo.

---

## Cómo funciona

Cada idioma es un fichero JSON plano en `src/i18n/locales/`:

```
src/i18n/locales/es.json   ← referencia
src/i18n/locales/en.json
src/i18n/locales/zh.json
```

Las claves llevan puntos y describen dónde se usan:

```json
{
  "common.cancel": "Cancelar",
  "sftp.upload": "Subir",
  "settings.language": "Idioma",
  "hosts.timeoutHint": "Súbelo si el servidor tarda en enviar su banner SSH."
}
```

Los textos con partes variables usan marcadores entre llaves:

```json
{
  "common.confirmWord": "Escribe {word} para confirmar"
}
```

```tsx
t("common.confirmWord", { word: "CONFIRMAR" })
```

**El español es la referencia.** Si a un idioma le falta una clave se usa la
española, y si tampoco existe se muestra la propia clave (`sftp.upload`), para
que el hueco se vea en vez de esconderse.

---

## Añadir un idioma nuevo

1. **Copia** `src/i18n/locales/en.json` al fichero de tu idioma, con el código
   como nombre: `pt-BR.json`, `de.json`, `ja.json`…

   Usa el código de dos letras (`de`) o el regional (`pt-BR`, `zh-TW`).

2. **Traduce los valores.** No cambies las claves.

3. **Regístralo** en `src/i18n/index.ts`, en dos sitios:

   ```ts
   import de from "./locales/de.json";

   export type Language = "es" | "en" | "zh" | "de";

   const DICCIONARIOS: Record<Language, Diccionario> = {
     es: es as Diccionario,
     en: en as Diccionario,
     zh: zh as Diccionario,
     de: de as Diccionario,
   };

   export const LANGUAGES: LanguageInfo[] = [
     // …
     { id: "de", label: "Alemán", nativeLabel: "Deutsch" },
   ];
   ```

   `label` va en español (es el nombre del idioma visto desde la interfaz en
   español); `nativeLabel` va **en tu idioma**, que es como lo busca quien lo
   habla.

4. **Comprueba** que todo cuadra:

   ```bash
   node scripts/validar-idiomas.mjs
   ```

5. Abre una propuesta de cambio. La plantilla de traducción te recuerda lo
   importante.

No hace falta instalar nada para traducir: el validador solo usa Node.

---

## Reglas al traducir

- **Traduce todo.** Si algo no debe traducirse, no lo dejes en español por
  descuido: los nombres propios y técnicos se quedan igual en todos los idiomas.
- **Conserva los marcadores.** Si el español dice `{word}`, tu traducción también,
  aunque el orden cambie. El validador lo comprueba y falla si falta.
- **No traduzcas**: `ssh`, `sftp`, `ftp`, los nombres de programas
  (`Visual Studio Code`), las claves de configuración, las rutas, los códigos de
  color y los nombres de temas.
- **Sí traduce** las frases que lee el usuario, aunque parezcan técnicas.
- **Usa la puntuación de tu idioma**: en chino `，。：？`; en francés un espacio
  fino antes de `:` y `?`; en alemán los sustantivos van en mayúscula.
- **Nada de traducción literal.** «Subir un nivel» en una ruta se dice de forma
  distinta en cada idioma; el objetivo es que suene natural.
- **Cuida la longitud.** Es una interfaz con paneles estrechos: si tu traducción
  es mucho más larga que la española, dilo en la propuesta y se ajusta el diseño.

---

## Qué comprueba el validador

`scripts/validar-idiomas.mjs` revisa, para cada idioma:

1. Que tenga **exactamente** las mismas claves que el español: ni una de menos ni
   una de más.
2. Que no haya valores vacíos ni espacios sobrantes en los extremos.
3. Que los **marcadores coincidan** con los del español.
4. Que el JSON sea válido y sea un objeto de clave → texto.

Se ejecuta solo al proponer cambios en los ficheros de idioma
(`.github/workflows/idiomas.yml`), así que no hay que acordarse de nada.

Para lanzarlo a mano:

```bash
node scripts/validar-idiomas.mjs
```

---

## Estado de las traducciones

| Idioma | Código | Estado | Mantenido por |
| --- | --- | --- | --- |
| Español | `es` | Completo (referencia) | el proyecto |
| Inglés | `en` | Completo | el proyecto |
| Chino simplificado | `zh` | Completo | el proyecto |

Añade tu fila cuando propongas un idioma.

---

## Lo que todavía no se traduce

Conviene saberlo para no llevarse sorpresas:

- **Los mensajes del backend.** El núcleo en Rust devuelve errores en español.
  Los más habituales se traducen en `src/lib/ssh.ts` (función `describeSshError`),
  que es donde se convierten en frases para el usuario, pero un error poco
  frecuente puede llegar en español.
- **El registro de conexiones** (`conexiones.log`) es para diagnóstico y está en
  español a propósito: así es más fácil buscar en él.
- **Los nombres de los personajes** de Pixel Agents son nombres propios.
