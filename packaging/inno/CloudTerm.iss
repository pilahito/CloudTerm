; CloudTerm — instalador Inno Setup (alternativa a NSIS/Tauri)
;
; El flujo principal de Windows es el NSIS que genera `npm run tauri build`.
; Este script sirve si quieres un .exe de Inno a partir del binario ya compilado:
;
;   npm run tauri build -- --no-bundle
;   iscc packaging/inno/CloudTerm.iss
;
; Requiere Inno Setup 6.

#define MyAppName      "CloudTerm"
#define MyAppVersion   "1.0.4"
#define MyAppPublisher "pilahito"
#define MyAppURL       "https://github.com/pilahito/cloudterm"
#define MyAppExeName   "cloudterm.exe"
#define MyAppId        "com.pilahito.cloudterm"

[Setup]
AppId={{A7C3E4D1-9B2F-4E18-8C6A-12C0D7E8F901}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
AppCopyright=© pilahito — GNU AGPL-3.0-or-later
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=no
LicenseFile=..\..\LICENSE
OutputDir=..\..\src-tauri\target\release\bundle\inno
OutputBaseFilename=CloudTerm_{#MyAppVersion}_x64-setup
SetupIconFile=..\installer\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName=CloudTerm
WizardStyle=modern
WizardImageFile=..\installer\installer-sidebar.bmp
WizardSmallImageFile=..\installer\installer-header.bmp
WizardImageStretch=yes
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
SetupLogging=yes

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[CustomMessages]
spanish.WelcomeLabel2=Bienvenido al instalador de CloudTerm — Cliente SSH y SFTP de escritorio.%n%n• Terminal SSH%n• Transferencia SFTP%n• Pixel Agents (monitoreo visual de agentes)%n%nRepositorio: https://github.com/pilahito/cloudterm
english.WelcomeLabel2=Welcome to the CloudTerm installer — desktop SSH and SFTP client.%n%n• SSH terminal%n• SFTP transfers%n• Pixel Agents (visual agent monitoring)%n%nRepository: https://github.com/pilahito/cloudterm
spanish.FinishedHeadingLabel=CloudTerm se ha instalado
spanish.FinishedLabelNoIcons=Gracias. CloudTerm se instaló correctamente.
english.FinishedHeadingLabel=CloudTerm is installed
english.FinishedLabelNoIcons=Thank you. CloudTerm was installed successfully.
spanish.Launch=Iniciar CloudTerm
english.Launch=Launch CloudTerm
spanish.CreateDesktopIcon=Crear acceso directo en el escritorio
english.CreateDesktopIcon=Create a desktop shortcut

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\src-tauri\target\release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Cliente SSH y SFTP de escritorio"
Name: "{group}\Uninstall CloudTerm"; Filename: "{uninstallexe}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; Comment: "Cliente SSH y SFTP de escritorio"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:Launch}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\{#MyAppId}"
