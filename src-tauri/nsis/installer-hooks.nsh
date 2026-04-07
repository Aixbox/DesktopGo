Var EverythingDetected
Var EverythingInstallerPath
Var InstallEverythingCheckbox
Var InstallEverythingCheckboxState

!define MUI_UNICON "${__FILEDIR__}\..\icons\icon.ico"

; Override the default NSIS welcome copy so it doesn't tell users to close all apps.
!define MUI_WELCOMEPAGE_TEXT "$(muiWelcomePageText)"
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
  MessageBox MB_OK|MB_ICONEXCLAMATION "$(everythingInstallerMissing)"

done:
FunctionEnd

Function PageEverythingInstall
  Call DetectEverythingInstalled

  !insertmacro MUI_HEADER_TEXT "$(everythingPageTitle)" "$(everythingPageSubtitle)"

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "$(everythingPageDescription)"
  Pop $0

  ${If} $EverythingDetected == "1"
    ${NSD_CreateLabel} 0 24u 100% 24u "$(everythingDetectedDescription)"
    Pop $0

    ${NSD_CreateCheckbox} 0 58u 100% 12u "$(everythingInstallCheckbox)"
    Pop $InstallEverythingCheckbox
    SendMessage $InstallEverythingCheckbox ${BM_SETCHECK} ${BST_CHECKED} 0
    EnableWindow $InstallEverythingCheckbox 0
    StrCpy $InstallEverythingCheckboxState ${BST_UNCHECKED}
  ${Else}
    ${NSD_CreateLabel} 0 24u 100% 24u "$(everythingNotDetectedDescription)"
    Pop $0

    ${NSD_CreateCheckbox} 0 58u 100% 12u "$(everythingInstallRecommendedCheckbox)"
    Pop $InstallEverythingCheckbox
    SendMessage $InstallEverythingCheckbox ${BM_SETCHECK} ${BST_CHECKED} 0
    StrCpy $InstallEverythingCheckboxState ${BST_CHECKED}

    ${NSD_CreateLabel} 0 80u 100% 24u "$(everythingSearchUnavailableNotice)"
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
  WriteRegStr HKCU "${MANUPRODUCTKEY}" "Installer Language" $LANGUAGE
  FileOpen $1 "$INSTDIR\.install_language" w
  FileWrite $1 "$(installLanguageCode)"
  FileClose $1
  ; 写入标记文件，让应用启动后自动显示启动台窗口
  FileOpen $0 "$INSTDIR\.show_on_launch" w
  FileClose $0
!macroend
