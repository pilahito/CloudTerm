# Instalador de Windows

CloudTerm se empaqueta con **Inno Setup**, además del instalador que ya genera
`tauri build`. Los dos instalan lo mismo; este añade dos cosas que el de Tauri no
sabe hacer:

* una página donde **elegir la carpeta** de instalación, con la opción de
  instalar solo para el usuario actual (sin permisos de administrador);
* una casilla para **componentes opcionales** — el complemento del Explorador de
  Windows y el motor WebView2.

| Fichero | Qué es |
| --- | --- |
| `CloudTerm.iss` | El guion del instalador. |
| `preparar.sh` | Descarga el arranque de WebView2 antes de compilar. |
| `MicrosoftEdgeWebview2Setup.exe` | Ese arranque. No se versiona: lo baja `preparar.sh`. |

## El complemento del Explorador

La casilla **«Integración con el Explorador de Windows»** hace que un enlace
`ssh://` abra CloudTerm con el formulario de conexión ya relleno:

```
ssh://demo@192.0.2.10:2222/home/demo
     └usuario ┘└── host ──┘└puerto┘└── ruta ──┘
```

Al pulsarlo, Windows arranca `CloudTerm.exe "ssh://…"`; el backend lee ese
argumento (`src-tauri/src/lanzamiento.rs`) y la interfaz abre «Nueva conexión»
con el host, el puerto y el usuario puestos. Guardar la conexión sigue siendo
decisión del usuario: un enlace no escribe nada por su cuenta.

También registra la aplicación en **Configuración → Aplicaciones →
Aplicaciones predeterminadas**, para poder elegirla —o quitársela— sin
desinstalar, y la añade a la lista de «Abrir con».

Todo va a `HKEY_CURRENT_USER` o a `HKEY_LOCAL_MACHINE` según el modo de
instalación, y el desinstalador lo retira.

## Compilarlo

### En Windows

1. Instala [Inno Setup](https://jrsoftware.org/isdl.php) 6.3 o posterior. Hace
   falta esa versión como mínimo: el guion usa `x64compatible`, que no existe
   antes de la 6.3.
2. Compila la aplicación:

   ```powershell
   npm ci
   npm run tauri build -- --no-bundle
   ```

   `--no-bundle` evita que Tauri genere además su NSIS y su MSI: aquí solo se
   aprovecha el ejecutable, que queda en `src-tauri\target\release\`.
3. Baja el arranque de WebView2 y compila el instalador:

   ```powershell
   bash packaging/windows/preparar.sh
   & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" packaging\windows\CloudTerm.iss
   ```

   El resultado es `dist-instalador/CloudTerm-<versión>-windows-x64-instalador.exe`.

Para compilar otra versión sin tocar el guion:

```powershell
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /DVersion=1.2.3 packaging\windows\CloudTerm.iss
```

### Desde Linux, con Wine

No hace falta para publicar —de eso se encarga GitHub Actions— pero sirve para
comprobar que el guion compila sin arrancar una máquina virtual:

```bash
# 1. Inno Setup dentro de Wine (una sola vez)
wine is.exe        # instalador gráfico; instala en la unidad C: de Wine

# 2. La aplicación tiene que existir: el guion NO compila nada, solo empaqueta.
#    O compilas el .exe para Windows con la cadena de herramientas de MinGW, o
#    copias un CloudTerm.exe ya compilado a src-tauri/target/release/.
./packaging/windows/preparar.sh

# 3. Compilar
wine "$HOME/.wine/drive_c/Program Files (x86)/Inno Setup 6/ISCC.exe" \
     packaging/windows/CloudTerm.iss
```

Dos avisos sobre Wine:

* `wine is.exe` es el instalador **gráfico**; abre una ventana y hay que
  pulsar. No es un comando que termine solo.
* El guion comprueba que el ejecutable existe antes de nada y se detiene con un
  error claro si no está. Un `ISCC` desde Linux sin el `.exe` no produce nada.

### En cada etiqueta

`.github/workflows/instalador-windows.yml` compila y publica el instalador
cuando se empuja una etiqueta `v*`, y lo adjunta a la publicación de la misma
forma que el APK de Android. En una ejecución manual solo compila y deja el
fichero como artefacto descargable.

## Qué hace el instalador, paso a paso

1. **Bienvenida** — «Bienvenido a la comunidad CloudTeam» y qué es CloudTerm.
2. **Licencia** — la AGPL-3.0, tal y como exige la propia licencia.
3. **Carpeta de instalación** — por defecto `Archivos de programa\CloudTerm`,
   con la opción de instalarlo solo para el usuario actual.
4. **Carpeta del menú Inicio**.
5. **Tareas adicionales** — aquí están las casillas:
   * acceso directo en el escritorio (sin marcar);
   * complemento del Explorador (marcado);
   * motor WebView2 (marcado).
6. **Instalar**, y al terminar la casilla para abrir CloudTerm.

Al desinstalar **no se borran los datos del usuario**
(`%APPDATA%\com.pilahito.cloudterm`): ahí están sus hosts, su historial y sus
idiomas. El Registro sí se limpia del todo.
