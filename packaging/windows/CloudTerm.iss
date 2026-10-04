; CloudTerm · github.com/pilahito/cloudterm
; © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE
;
; Instalador de Windows para CloudTerm (Inno Setup 6.3 o posterior).
;
; Por qué existe este fichero si `tauri build` ya genera un NSIS: el instalador
; de Tauri sabe pedir la carpeta de instalación, pero no sabe ofrecer
; componentes opcionales. Aquí el usuario puede marcar, además, el complemento
; del Explorador de Windows —el que hace que los enlaces `ssh://` abran
; CloudTerm— y el motor WebView2 si le falta.
;
; Cómo se compila (ver LEEME.md, en esta misma carpeta):
;
;     ISCC.exe CloudTerm.iss
;
; Se puede pasar la versión sin tocar el fichero:
;
;     ISCC.exe /DVersion=1.2.3 CloudTerm.iss
;
; Antes hay que haber compilado la aplicación: `npm run tauri build` deja el
; ejecutable en `src-tauri/target/release/`. Este script NO compila nada.

#ifndef Version
  #define Version "1.0.0"
#endif

; Carpeta donde `tauri build` deja el ejecutable, relativa a este fichero.
#define CarpetaBinarios "..\..\src-tauri\target\release"

; El binario puede llamarse como el producto (`CloudTerm.exe`) o como el
; paquete de Cargo (`cloudterm.exe`), según la versión de la CLI de Tauri que
; haya hecho la compilación. Se admiten las dos en vez de suponer una.
#if FileExists(AddBackslash(SourcePath) + CarpetaBinarios + "\CloudTerm.exe")
  #define NombreBinario "CloudTerm.exe"
#elif FileExists(AddBackslash(SourcePath) + CarpetaBinarios + "\cloudterm.exe")
  #define NombreBinario "cloudterm.exe"
#else
  #error No se encuentra el ejecutable. Compila antes con `npm run tauri build`.
#endif

[Setup]
; El AppId identifica la aplicación entre versiones. NO se cambia nunca: si
; cambia, Windows trata la versión nueva como un programa distinto y deja la
; anterior instalada.
AppId={{AA87E799-15DE-4AB5-B983-55789C112D72}
AppName=CloudTerm
AppVersion={#Version}
AppVerName=CloudTerm {#Version}
AppPublisher=pilahito · comunidad CloudTeam
AppPublisherURL=https://github.com/pilahito/cloudterm
AppSupportURL=https://github.com/pilahito/cloudterm/issues
AppUpdatesURL=https://github.com/pilahito/cloudterm/releases
AppCopyright=© 2026 DavidPilahito7 · GNU AGPL-3.0-or-later
VersionInfoVersion={#Version}
VersionInfoCompany=CloudTeam
VersionInfoDescription=Instalador de CloudTerm {#Version}
VersionInfoProductName=CloudTerm
VersionInfoProductVersion={#Version}

DefaultDirName={autopf}\CloudTerm
DefaultGroupName=CloudTerm
DisableDirPage=no
AllowNoIcons=yes
LicenseFile=..\..\LICENSE

; Windows 10 1809 es el mínimo que exige WebView2. Instalar en `{autopf}`
; (Archivos de programa) necesita permisos de administrador, pero el usuario
; puede elegir una instalación solo para él desde el propio instalador.
MinVersion=10.0.17763
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

OutputDir=..\..\dist-instalador
OutputBaseFilename=CloudTerm-{#Version}-windows-x64-instalador
Compression=lzma2/max
SolidCompression=yes
SetupIconFile=..\..\src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\CloudTerm.exe
UninstallDisplayName=CloudTerm {#Version}
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Languages]
; El primero de la lista es el idioma con el que arranca el instalador.
; El inglés no está en `Languages\` —es el `Default.isl` del compilador—, así
; que se pide por ahí y no como `Languages\English.isl`, que no existe.
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
; Los dos textos que pide el instalador: el saludo de la comunidad y la
; explicación de qué es CloudTerm. Se escribe uno por idioma.
spanish.WelcomeLabel1=Te damos la bienvenida al instalador de [name]
spanish.WelcomeLabel2=Bienvenido a la comunidad CloudTeam.%n%n[name] es un cliente de terminal SSH y SFTP para el escritorio: sesiones en pestañas, transferencia de archivos en dos paneles, claves y contraseñas guardadas en el llavero del sistema y un asistente de inteligencia artificial integrado.%n%nSe va a instalar la versión {#Version}. Conviene cerrar el resto de programas antes de continuar.%n%nPulsa «Siguiente» para elegir dónde instalarlo.
english.WelcomeLabel1=Welcome to the [name] installer
english.WelcomeLabel2=Welcome to the CloudTeam community.%n%n[name] is a desktop SSH and SFTP terminal client: tabbed sessions, dual-pane file transfers, keys and passwords kept in the system keychain, and a built-in AI assistant.%n%nVersion {#Version} will be installed. You may want to close any other running programs first.%n%nPress “Next” to choose where to install it.

[Tasks]
Name: "escritorio"; Description: "{cm:TaskEscritorio}"; GroupDescription: "{cm:GrupoAccesos}"; Flags: unchecked
Name: "explorador"; Description: "{cm:TaskExplorador}"; GroupDescription: "{cm:GrupoComplementos}"
Name: "webview2"; Description: "{cm:TaskWebView2}"; GroupDescription: "{cm:GrupoComplementos}"

[CustomMessages]
; El grupo de complementos: lo que hace que el instalador no sea un simple
; «copiar y ya».
spanish.GrupoAccesos=Accesos directos:
spanish.GrupoComplementos=Complementos:
spanish.TaskEscritorio=Crear un acceso directo en el escritorio
spanish.TaskExplorador=Integración con el Explorador de Windows: abrir los enlaces ssh:// con CloudTerm y añadirlo a «Abrir con»
spanish.TaskWebView2=Instalar el motor WebView2 si falta (CloudTerm dibuja su interfaz con él)
spanish.InstalandoWebView2=Instalando el motor WebView2…
spanish.DescripcionApp=Cliente de terminal SSH y SFTP con transferencia de archivos y asistente de IA
english.GrupoAccesos=Shortcuts:
english.GrupoComplementos=Extras:
english.TaskEscritorio=Create a shortcut on the desktop
english.TaskExplorador=Windows Explorer integration: open ssh:// links with CloudTerm and add it to “Open with”
english.TaskWebView2=Install the WebView2 runtime if missing (CloudTerm draws its interface with it)
english.InstalandoWebView2=Installing the WebView2 runtime…
english.DescripcionApp=SSH and SFTP terminal client with file transfer and an AI assistant

[Files]
; El ejecutable se instala siempre con el mismo nombre, sea cual sea el que
; haya dejado la compilación, para que el Registro y los accesos directos no
; dependan de eso.
Source: "{#CarpetaBinarios}\{#NombreBinario}"; DestDir: "{app}"; DestName: "CloudTerm.exe"; Flags: ignoreversion

; Bibliotecas que la compilación pueda dejar al lado (por ejemplo
; `WebView2Loader.dll` en las compilaciones GNU). Si no hay ninguna, no pasa
; nada: el instalador se compila igual.
Source: "{#CarpetaBinarios}\*.dll"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

; Arranque de WebView2, que no se versiona en el repositorio porque es de
; Microsoft y pesa. Lo descarga `preparar.sh` (o el flujo de trabajo) antes de
; compilar. Si falta, el compilador se queja aquí y no se genera nada a medias.
Source: "MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{group}\CloudTerm"; Filename: "{app}\CloudTerm.exe"; Comment: "{cm:DescripcionApp}"
Name: "{group}\Desinstalar CloudTerm"; Filename: "{uninstallexe}"
Name: "{autodesktop}\CloudTerm"; Filename: "{app}\CloudTerm.exe"; Tasks: escritorio

[Registry]
; --- Complemento del Explorador ------------------------------------------
; Se registran las dos caras de la misma moneda:
;
;   * el esquema `ssh` directamente, para que un enlace funcione en cuanto
;     termina la instalación, sin pasar por los ajustes de Windows;
;   * las «capacidades» de la aplicación, que son las que hacen que CloudTerm
;     aparezca en Configuración → Aplicaciones predeterminadas y el usuario
;     pueda elegirlo (o quitárselo) cuando quiera.
;
; Todo cuelga de `HKA`, que resuelve a HKEY_LOCAL_MACHINE o a HKEY_CURRENT_USER
; según el modo de instalación elegido. Lo que es nuestro se borra al
; desinstalar; la clave `ssh` es compartida, así que de ella solo se quitan los
; valores que escribimos nosotros.

Root: HKA; Subkey: "Software\Classes\ssh"; ValueType: string; ValueName: ""; ValueData: "URL:Protocolo SSH de CloudTerm"; Flags: uninsdeletevalue; Tasks: explorador
Root: HKA; Subkey: "Software\Classes\ssh"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""; Flags: uninsdeletevalue; Tasks: explorador
Root: HKA; Subkey: "Software\Classes\ssh"; ValueType: string; ValueName: "FriendlyTypeName"; ValueData: "Enlace SSH"; Flags: uninsdeletevalue; Tasks: explorador
Root: HKA; Subkey: "Software\Classes\ssh\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\CloudTerm.exe,0"; Flags: uninsdeletekey; Tasks: explorador
Root: HKA; Subkey: "Software\Classes\ssh\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\CloudTerm.exe"" ""%1"""; Flags: uninsdeletekey; Tasks: explorador

Root: HKA; Subkey: "Software\Classes\CloudTerm.ssh"; ValueType: string; ValueName: ""; ValueData: "URL:Protocolo SSH de CloudTerm"; Flags: uninsdeletekey; Tasks: explorador
Root: HKA; Subkey: "Software\Classes\CloudTerm.ssh"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""; Flags: uninsdeletekey; Tasks: explorador
Root: HKA; Subkey: "Software\Classes\CloudTerm.ssh\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\CloudTerm.exe,0"; Flags: uninsdeletekey; Tasks: explorador
Root: HKA; Subkey: "Software\Classes\CloudTerm.ssh\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\CloudTerm.exe"" ""%1"""; Flags: uninsdeletekey; Tasks: explorador

Root: HKA; Subkey: "Software\RegisteredApplications"; ValueType: string; ValueName: "CloudTerm"; ValueData: "Software\CloudTerm\Capabilities"; Flags: uninsdeletevalue; Tasks: explorador
Root: HKA; Subkey: "Software\CloudTerm\Capabilities"; ValueType: string; ValueName: "ApplicationName"; ValueData: "CloudTerm"; Flags: uninsdeletekey; Tasks: explorador
Root: HKA; Subkey: "Software\CloudTerm\Capabilities"; ValueType: string; ValueName: "ApplicationDescription"; ValueData: "Cliente de terminal SSH y SFTP con transferencia de archivos y asistente de IA"; Tasks: explorador
Root: HKA; Subkey: "Software\CloudTerm\Capabilities"; ValueType: string; ValueName: "ApplicationIcon"; ValueData: "{app}\CloudTerm.exe,0"; Tasks: explorador
Root: HKA; Subkey: "Software\CloudTerm\Capabilities\URLAssociations"; ValueType: string; ValueName: "ssh"; ValueData: "CloudTerm.ssh"; Flags: uninsdeletekey; Tasks: explorador

; Aparecer en el menú «Abrir con» y en la lista de programas predeterminados.
Root: HKA; Subkey: "Software\Classes\Applications\CloudTerm.exe"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "CloudTerm"; Flags: uninsdeletekey; Tasks: explorador
Root: HKA; Subkey: "Software\Classes\Applications\CloudTerm.exe\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\CloudTerm.exe"" ""%1"""; Flags: uninsdeletekey; Tasks: explorador
Root: HKA; Subkey: "Software\Classes\Applications\CloudTerm.exe\SupportedTypes"; ValueType: string; ValueName: ".pem"; ValueData: ""; Tasks: explorador
Root: HKA; Subkey: "Software\Classes\Applications\CloudTerm.exe\SupportedTypes"; ValueType: string; ValueName: ".ppk"; ValueData: ""; Tasks: explorador
Root: HKA; Subkey: "Software\Classes\Applications\CloudTerm.exe\SupportedTypes"; ValueType: string; ValueName: ".pub"; ValueData: ""; Tasks: explorador

[Run]
; El motor de WebView2 se instala en silencio, y solo si falta. Va antes de
; arrancar la aplicación, o la primera ejecución se quedaría en blanco.
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "{cm:InstalandoWebView2}"; Flags: runhidden waituntilterminated; Tasks: webview2; Check: NecesitaWebView2

Filename: "{app}\CloudTerm.exe"; Description: "{cm:LaunchProgram,CloudTerm}"; Flags: nowait postinstall skipifsilent

[Code]
; Lo que NO hace este instalador al desinstalarse: borrar los datos del usuario
; (`%APPDATA%\com.pilahito.cloudterm`). Ahí están sus hosts, su historial y sus
; idiomas, y quitar el programa no debería llevarse por delante el trabajo de
; nadie. Del Registro se encargan los `uninsdelete*` de arriba.

/// ¿Hay WebView2 instalado para todos los usuarios o solo para el actual?
///
/// Microsoft publica el motor en el registro de Edge con un identificador
/// fijo; la clave cambia de sitio según la edición de Windows, así que se
/// miran las tres ubicaciones posibles.
function TieneWebView2(): Boolean;
var
  Clave: String;
begin
  Clave := '\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

  Result :=
    RegValueExists(HKEY_LOCAL_MACHINE, 'SOFTWARE\WOW6432Node' + Clave, 'pv') or
    RegValueExists(HKEY_LOCAL_MACHINE, 'SOFTWARE' + Clave, 'pv') or
    RegValueExists(HKEY_CURRENT_USER, 'SOFTWARE' + Clave, 'pv');
end;

/// ¿Hay que instalarlo? Solo si falta y si el arranque viajó con el instalador.
function NecesitaWebView2(): Boolean;
begin
  Result :=
    (not TieneWebView2()) and
    FileExists(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'));
end;
