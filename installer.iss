; =====================================================================
; Droply - Inno Setup 6 Windows Installer Script
; Creates modern, non-admin (per-user) Windows Setup executable
; Integrates with Start Menu, Windows Search, Desktop, and Windows Settings
; =====================================================================

#define MyAppName "Droply"
#ifndef MyAppVersion
#define MyAppVersion "1.4.1"
#endif
#define MyAppPublisher "Amlan Sarkar"
#define MyAppURL "https://github.com/Amlan-Sarkar/Droply"
#define MyAppExeName "Droply.exe"

[Setup]
; Unique GUID for Droply to manage clean updates and upgrades
AppId={{E6F74D28-941A-4835-A8F2-721248BC78DE}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases

; Per-User Installation: Installs to %LOCALAPPDATA%\Programs without Administrator/UAC prompt
DefaultDirName={localappdata}\Programs\{#MyAppName}
DisableProgramGroupPage=yes
DisableStartupPrompt=yes
PrivilegesRequired=lowest

; Output file name and destination
OutputDir=dist
OutputBaseFilename=Droply-Setup
SetupIconFile=Droply.ico

; Compression settings (optimal for fast extraction and small download size)
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

; Uninstaller configuration for Windows Settings (Add or Remove Programs)
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startmenuicon"; Description: "Create Start Menu shortcut"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Copy all compiled files and folders from dist\Droply
Source: "dist\Droply\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "Droply.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\Droply.ico"; Tasks: startmenuicon
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\Droply.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
