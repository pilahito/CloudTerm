# Metadatos del paquete `.deb`

Tauri genera `DEBIAN/control` al empaquetar. Estos son los valores que salen
de `src-tauri/tauri.conf.json` y de `src-tauri/Cargo.toml`:

```
Package: cloudterm
Version: 1.0.0
Architecture: amd64 | arm64
Maintainer: pilahito <57416155+pilahito@users.noreply.github.com>
Section: net
Priority: optional
Homepage: https://github.com/pilahito/cloudterm
Depends: libwebkit2gtk-4.1-0, libgtk-3-0, libsoup-3.0-0, openssl (los resuelve Tauri)
Description: Cliente SSH y SFTP de escritorio con soporte de Pixel Agents
 CloudTerm es un cliente de terminal SSH/SFTP de escritorio con transferencia
 de archivos, Pixel Agents y un asistente IA integrado.
 Repositorio: https://github.com/pilahito/cloudterm
```

No se edita a mano un `DEBIAN/control` en el árbol: cada `npm run tauri build`
lo regenera. Para cambiar versión, descripción o mantenedor, edita
`tauri.conf.json` / `Cargo.toml` y vuelve a empaquetar.
