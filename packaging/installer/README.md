# Recursos del instalador

Identidad visual y textos del asistente de instalación de CloudTerm.
El empaquetado real lo hace **Tauri 2** (NSIS en Windows, `.deb` y AppImage en Linux).

```
packaging/
├── installer/                 ← bitmaps, iconos y generador
│   ├── generar_recursos.py
│   ├── installer-sidebar.bmp  164×314  bienvenida / final NSIS
│   ├── installer-header.bmp   150×57   cabecera de páginas
│   ├── icon.ico               16…256 px
│   ├── icon-512.png           Linux
│   └── github-mark.png        marca oficial de GitHub (enlace al repo)
├── nsis/                      ← textos y ganchos del .exe
│   ├── hooks.nsh
│   ├── English.nsh
│   ├── Spanish.nsh
│   └── SimpChinese.nsh
├── linux/
│   ├── cloudterm.desktop      plantilla Handlebars de Tauri
│   └── DEBIAN-control.md      qué acaba en DEBIAN/control
└── inno/CloudTerm.iss         alternativa Inno Setup
```

## Regenerar imágenes

```bash
python packaging/installer/generar_recursos.py
```

Hace falta Python 3 con Pillow (`pip install pillow`). Las fuentes salen de
Windows (`consola.ttf`, `segoeui.ttf`) o DejaVu en Linux.

## Qué cubre el .exe (NSIS)

1. **Bienvenida** — banner lateral, título «Bienvenido al instalador de CloudTerm»
   y lista de características + URL de GitHub.
2. **Directorio** — el usuario elige la carpeta (por usuario o para todos).
3. **Menú Inicio** — acceso directo del grupo CloudTerm.
4. **Final** — agradecimiento, casilla de acceso directo en el escritorio,
   casilla «Iniciar CloudTerm» y enlace clickeable a GitHub.
5. **Desinstalador** — `Uninstall CloudTerm.exe` con el icono de la app;
   quita binario, accesos directos y claves de registro. Opcional: borrar datos.

## Linux

`npm run tauri build` genera `.deb` (amd64/arm64 según el target) y `.AppImage`.
El `.desktop` usa `Categories=Development;Network;TerminalEmulator;` y
`Exec=cloudterm %U`.
