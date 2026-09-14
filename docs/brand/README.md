# Recursos de marca

Logotipo, banners e iconos de CloudTerm. **Todo se genera desde un script**, así
que cambiar la paleta o un texto es editar `generar_brand.py` y volver a lanzarlo;
nada está dibujado a mano ni es binario opaco.

## Archivos

| Archivo | Tamaño | Para qué |
| --- | --- | --- |
| `banner-buymeacoffee.png` | 1500 × 1000 | Imagen de portada de Buy Me a Coffee |
| `banner-readme.png` | 1280 × 400 | Cabecera del README y del repositorio |
| `icon-1024.png` | 1024 × 1024 | Icono maestro de la aplicación |
| `icon-32-preview.png` · `icon-128-preview.png` | — | Comprobación de legibilidad a tamaño pequeño |
| `generar_brand.py` | — | El generador (SVG) |
| `*.svg` | vectorial | Fuentes editables de todo lo anterior |

## Regenerar

```bash
cd docs/brand
python3 generar_brand.py

rsvg-convert -w 1500 -h 1000 -o banner-buymeacoffee.png banner-buymeacoffee.svg
rsvg-convert -w 1280 -h 400  -o banner-readme.png       banner-readme.svg
rsvg-convert -w 1024 -h 1024 -o icon-1024.png           icon.svg

# Set completo de iconos de Tauri (incluye .ico, .icns, Android e iOS)
cd ../.. && npx tauri icon docs/brand/icon-1024.png
```

Dependencias: `python3` (solo biblioteca estándar) y `rsvg-convert`
(`librsvg2-bin` en Debian/Ubuntu, `librsvg` en Arch).

## Decisiones de diseño

- **La paleta sale de `src/styles/themes.css`** (tema `neon`), así que la marca y la
  aplicación no se pueden desincronizar.
- **La geometría isométrica es la misma que la de Pixel Agents**
  (`src/components/PixelAgents/PixelAgents.tsx`): misma proyección, mismas
  proporciones de escritorio y personaje. Los banners enseñan literalmente lo que
  hace el programa.
- **El color de cada personaje se deriva del nombre del host** con un hash, igual
  que en la aplicación: el mismo host siempre sale del mismo color.
- **Fira Code** para el logotipo y los chips — es la fuente real del terminal — y
  **Rubik** para los textos de apoyo.
- **El icono es `❯_`**: el símbolo del prompt, legible a 32 px. Se descartó el
  monograma «CT» porque a tamaños pequeños las dos letras se emborronan.

## Nota sobre los colores en SVG

`rsvg-convert` no soporta `mix-blend-mode` ni filtros CSS, así que todo se
construye con degradados, formas y opacidades. Los colores HSL de los personajes se
convierten a hexadecimal en el propio script para que el resultado sea idéntico en
cualquier renderizador.
