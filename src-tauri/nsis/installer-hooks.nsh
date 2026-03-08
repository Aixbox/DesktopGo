Var EverythingDetected
Var EverythingInstallerPath
Var InstallEverythingCheckbox
Var InstallEverythingCheckboxState

Page custom PageEverythingInstall PageLeaveEverythingInstall

Function DetectEverythingInstalled
  StrCpy $EverythingDetected "0"

  ReadRegStr $0 HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Everything" "InstallLocation"
  IfFileExists "$0\Everything.exe" 0 +2
    StrCpy $EverythingDetected "1"

  StrCmp $EverythingDetected "1" detect_done

  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Everything" "InstallLocation"
  IfFileExists "$0\Everything.exe" 0 +2
    StrCpy $EverythingDetected "1"

  StrCmp $EverythingDetected "1" detect_done

  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Everything" "InstallLocation"
  IfFileExists "$0\Everything.exe" 0 +2
    StrCpy $EverythingDetected "1"

  StrCmp $EverythingDetected "1" detect_done

  IfFileExists "$PROGRAMFILES64\Everything\Everything.exe" 0 +2
    StrCpy $EverythingDetected "1"

  StrCmp $EverythingDetected "1" detect_done

  IfFileExists "$PROGRAMFILES32\Everything\Everything.exe" 0 +2
    StrCpy $EverythingDetected "1"

  StrCmp $EverythingDetected "1" detect_done

  IfFileExists "$LOCALAPPDATA\Programs\Everything\Everything.exe" 0 +2
    StrCpy $EverythingDetected "1"

detect_done:
FunctionEnd

Function MaybeInstallEverything
  StrCmp $EverythingDetected "1" done
  StrCmp $InstallEverythingCheckboxState ${BST_CHECKED} 0 done

  StrCpy $EverythingInstallerPath "$INSTDIR\resources\everything-installer\Everything-Setup.exe"
  IfFileExists "$EverythingInstallerPath" 0 installer_missing
  ExecWait '"$EverythingInstallerPath"'
  Goto done

installer_missing:
  MessageBox MB_OK|MB_ICONEXCLAMATION "未找到随 DesktopGo 打包的 Everything 安装程序。$\r$\n搜索功能在安装 Everything 前不可用。"

done:
FunctionEnd

Function PageEverythingInstall
  Call DetectEverythingInstalled

  !insertmacro MUI_HEADER_TEXT "搜索组件" "选择是否安装 Everything"

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "DesktopGo 的文件搜索仅支持安装版 Everything。"
  Pop $0

  ${If} $EverythingDetected == "1"
    ${NSD_CreateLabel} 0 24u 100% 24u "已检测到安装版 Everything，本次安装将自动跳过该步骤。"
    Pop $0

    ${NSD_CreateCheckbox} 0 58u 100% 12u "安装 Everything"
    Pop $InstallEverythingCheckbox
    SendMessage $InstallEverythingCheckbox ${BM_SETCHECK} ${BST_CHECKED} 0
    EnableWindow $InstallEverythingCheckbox 0
    StrCpy $InstallEverythingCheckboxState ${BST_UNCHECKED}
  ${Else}
    ${NSD_CreateLabel} 0 24u 100% 24u "未检测到安装版 Everything。你可以在安装 DesktopGo 时一并安装。"
    Pop $0

    ${NSD_CreateCheckbox} 0 58u 100% 12u "安装 Everything（推荐）"
    Pop $InstallEverythingCheckbox
    SendMessage $InstallEverythingCheckbox ${BM_SETCHECK} ${BST_CHECKED} 0
    StrCpy $InstallEverythingCheckboxState ${BST_CHECKED}

    ${NSD_CreateLabel} 0 80u 100% 24u "如果取消勾选，DesktopGo 安装后搜索功能将不可用。"
    Pop $0
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function PageLeaveEverythingInstall
  ${If} $EverythingDetected == "1"
    StrCpy $InstallEverythingCheckboxState ${BST_UNCHECKED}
    Return
  ${EndIf}

  SendMessage $InstallEverythingCheckbox ${BM_GETCHECK} 0 0 $InstallEverythingCheckboxState
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  Call MaybeInstallEverything
!macroend
