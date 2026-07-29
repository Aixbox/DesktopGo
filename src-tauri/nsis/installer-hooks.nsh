Var EverythingDetected
Var EverythingInstallerPath
Var InstallEverythingCheckbox
Var InstallEverythingCheckboxState
Var PassiveInstallLanguage
Var UnattendedArg

!define MUI_UNICON "${__FILEDIR__}\..\icons\icon.ico"

; 语言选择对话框由 tauri.conf.json 的 displayLanguageSelector 在 .onInit 中最先弹出。
; 使用 LangString 让提示文案跟随系统语言，并强制列出安装包内置的全部语言，
; 避免系统缺少某个 ANSI 代码页时隐藏对应选项（安装器本身是 Unicode 程序）。
; ALWAYSSHOW 让每次交互运行安装包都重新选择语言，而不是复用注册表里的选择；
; 自定义模板通过 NSIS_HOOK_SELECT_INSTALLER_LANGUAGE 区分被动更新，复用上次的
; 安装语言但不显示对话框。静默安装由 MUI 自身跳过对话框；卸载器也直接读注册表。
!define MUI_LANGDLL_ALWAYSSHOW
!define MUI_LANGDLL_ALLLANGUAGES
!define MUI_LANGDLL_WINDOWTITLE "$(languageSelectorTitle)"
!define MUI_LANGDLL_INFO "$(languageSelectorText)"

; Override the default NSIS welcome copy so it doesn't tell users to close all apps.
!define MUI_WELCOMEPAGE_TEXT "$(muiWelcomePageText)"

!macro NSIS_HOOK_SELECT_INSTALLER_LANGUAGE
  ${If} $PassiveMode = 1
    ReadRegStr $PassiveInstallLanguage "${MUI_LANGDLL_REGISTRY_ROOT}" "${MUI_LANGDLL_REGISTRY_KEY}" "${MUI_LANGDLL_REGISTRY_VALUENAME}"
    ${If} $PassiveInstallLanguage != ""
      StrCpy $LANGUAGE $PassiveInstallLanguage
    ${EndIf}
  ${Else}
    !insertmacro MUI_LANGDLL_DISPLAY
  ${EndIf}
!macroend

!macro NSIS_HOOK_INSTALLER_PAGES
  Page custom PageEverythingInstall PageLeaveEverythingInstall
!macroend

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
  ; 无人值守安装不显示该页面：静默模式（/S）本身不渲染任何页面，
  ; 被动模式（/P）必须在这里显式跳过，否则安装会停在这一页等待用户点击。
  ${If} ${Silent}
    Abort
  ${EndIf}
  ${GetOptions} $CMDLINE "/P" $UnattendedArg
  ${IfNot} ${Errors}
    Abort
  ${EndIf}

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
