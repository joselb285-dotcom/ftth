[Setup]
AppName=FTTH GIS Editor
AppVersion=1.0
DefaultDirName={sd}\FTTH
DefaultGroupName=FTTH GIS Editor
PrivilegesRequired=lowest
OutputDir=output
OutputBaseFilename=FTTH-GIS-Editor-Setup
Compression=lzma2/fast
SolidCompression=yes
DisableProgramGroupPage=yes
UninstallDisplayName=FTTH GIS Editor

[Files]
Source: "build\stage\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "iniciar.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\FTTH GIS Editor"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\iniciar.ps1"""; WorkingDir: "{app}"
Name: "{group}\FTTH GIS Editor"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\iniciar.ps1"""; WorkingDir: "{app}"

[Code]
var Page: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  Page := CreateInputQueryPage(wpSelectDir, 'Administrador', 'Cuenta inicial del sistema', 'Estas credenciales sirven para el primer ingreso.');
  Page.Add('Email:', False);
  Page.Add('Contraseña:', True);
  Page.Values[0] := 'admin@ftth.local';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var jwt: string; i: Integer;
begin
  if CurStep = ssPostInstall then begin
    for i := 1 to 6 do jwt := jwt + IntToStr(Random(2147483647)) + GetDateTimeString('hhnnsszzz', #0, #0);
    SaveStringToFile(ExpandConstant('{app}\config.env'),
      'JWT_SECRET=' + jwt + #13#10 + 'TENANT_SLUG=ftth' + #13#10 + 'PORT=8080' + #13#10 +
      'SEED_ADMIN_EMAIL=' + Page.Values[0] + #13#10 + 'SEED_ADMIN_PASSWORD=' + Page.Values[1] + #13#10, False);
  end;
end;

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\iniciar.ps1"""; Description: "Iniciar FTTH GIS Editor ahora"; Flags: postinstall nowait skipifsilent
