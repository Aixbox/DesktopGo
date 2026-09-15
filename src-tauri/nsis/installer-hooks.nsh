Var EverythingDetected
Var EverythingInstallerPath
Var InstallEverythingCheckbox
Var InstallEverythingCheckboxState
Var PassiveInstallLanguage
Var UnattendedArg
Var AutoStartCheckbox
Var AutoStartCheckboxState
Var AutoStartCheckboxCreated

; DesktopGo 开机自启：
; - 复选框位于安装完成页（MUI2 finish page），与“运行应用”“创建桌面快捷方式”
;   并列，由 NSIS_HOOK_FINISH_PAGE 宏挂载（模板在 MUI_PAGE_FINISH 前插入调用点）；
; - Run 键值名固定为 ${PRODUCTNAME}，与模板卸载段的清理逻辑保持一致；
; - 用户在完成页的选择记录在 ${MANUPRODUCTKEY} 的 AutoStartDisabled 偏好里，
;   静默/被动/更新等无人值守流程沿用该偏好，从未设置过时默认开启。
!define AUTORUNKEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define AUTOSTART_DISABLED_VALUE "AutoStartDisabled"

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

; MUI2 defaults to FitControl, which can stretch branding bitmaps independently on each axis.
; Preserve the source aspect ratio at every Windows DPI setting instead.
!define MUI_HEADERIMAGE_BITMAP_STRETCH AspectFitHeight
!define MUI_HEADERIMAGE_UNBITMAP_STRETCH AspectFitHeight
!define MUI_WELCOMEFINISHPAGE_BITMAP_STRETCH AspectFitHeight

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

  ; 开机自启默认状态：读用户偏好（AutoStartDisabled=1 表示曾明确关闭），否则默认开启。
  ; 此宏在 .onInit 内展开，位于模板 Var/define 之后，可安全使用 ${MANUPRODUCTKEY}；
  ; 完成页的 FinishPageShow/FinishPageLeave 函数体经 NSIS_HOOK_FINISH_PAGE 宏延迟到
  ; 模板内展开编译，同样可安全引用模板 define。
  ClearErrors
  ReadRegDWORD $AutoStartCheckboxState HKCU "${MANUPRODUCTKEY}" "${AUTOSTART_DISABLED_VALUE}"
  ${If} ${Errors}
  ${OrIf} $AutoStartCheckboxState != 1
    StrCpy $AutoStartCheckboxState ${BST_CHECKED}
  ${Else}
    StrCpy $AutoStartCheckboxState ${BST_UNCHECKED}
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

!macro NSIS_HOOK_FINISH_PAGE
  ; 为 MUI2 完成页追加“开机自启”复选框：SHOW 回调在 MUI2 创建完自身控件之后、
  ; nsDialogs::Show 之前执行；LEAVE 回调在用户点击“完成”时执行。
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW FinishPageShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE FinishPageLeave

  ; 下面的函数体在此宏展开点（模板 MUI_PAGE_FINISH 之前）才编译，因此可以引用
  ; 模板 Var/define 与 MUI2/nsDialogs 宏；而本文件顶层的函数（如 Everything 页）
  ; 在模板 include 本文件时即编译，做不到这一点。
  Function FinishPageShow
    ; 重启分支（RebootFlag）下完成页显示的是重启单选钮而非复选框，跳过创建；
    ; 此时自启状态沿用 NSIS_HOOK_POSTINSTALL 按偏好写入的结果。
    ${IfNot} ${RebootFlag}
      ; MUI2 完成页布局：运行复选框 90u、桌面快捷方式复选框 110u（间距 20u、
      ; 尺寸 195u x 10u），本复选框再向下 20u，与两者保持一致的节奏。
      ${NSD_CreateCheckbox} 120u 130u 195u 10u "$(autoStartCheckbox)"
      Pop $AutoStartCheckbox
      ; 与 MUI2 自带复选框保持一致：显式套用页面文字/背景色。nsDialogs 创建的
      ; 按钮控件默认用灰色画刷，缺这行会在白色完成页上显示为灰色底块。
      SetCtlColors $AutoStartCheckbox "${MUI_TEXTCOLOR}" "${MUI_BGCOLOR}"
      SendMessage $AutoStartCheckbox ${BM_SETCHECK} $AutoStartCheckboxState 0
      StrCpy $AutoStartCheckboxCreated 1
    ${EndIf}
  FunctionEnd

  Function FinishPageLeave
    ${If} $AutoStartCheckboxCreated = 1
      SendMessage $AutoStartCheckbox ${BM_GETCHECK} 0 0 $AutoStartCheckboxState
      ; 落库规则与 NSIS_HOOK_POSTINSTALL 一致：勾选写 Run 键并清除偏好，取消则
      ; 删 Run 键并记录偏好；交互安装以完成页的最终勾选为准（覆盖安装段先写的结果）。
      ${If} $AutoStartCheckboxState = ${BST_CHECKED}
        DeleteRegValue HKCU "${MANUPRODUCTKEY}" "${AUTOSTART_DISABLED_VALUE}"
        WriteRegStr HKCU "${AUTORUNKEY}" "${PRODUCTNAME}" '"$INSTDIR\${MAINBINARYNAME}.exe"'
      ${Else}
        WriteRegDWORD HKCU "${MANUPRODUCTKEY}" "${AUTOSTART_DISABLED_VALUE}" 1
        DeleteRegValue HKCU "${AUTORUNKEY}" "${PRODUCTNAME}"
      ${EndIf}
    ${EndIf}
  FunctionEnd
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Call MaybeInstallEverything
  WriteRegStr HKCU "${MANUPRODUCTKEY}" "Installer Language" $LANGUAGE
  FileOpen $1 "$INSTDIR\.install_language" w
  FileWrite $1 "$(installLanguageCode)"
  FileClose $1
  ; 写入标记文件，让应用启动后自动显示启动台窗口
  FileOpen $0 "$INSTDIR\.show_on_launch" w
  FileClose $0

  ; 开机自启（HKCU Run 键，值名 ${PRODUCTNAME}，由模板卸载段负责删除）：
  ; - 此处按当前状态先落一次结果，是无人值守流程（静默/被动/更新）的最终值——
  ;   沿用偏好，从未设置过时默认开启；更新时重写 Run 键修正安装路径漂移；
  ; - 交互安装的最终结果由完成页复选框（FinishPageLeave）在此之上覆盖。
  ${If} $AutoStartCheckboxState == ""
    ClearErrors
    ReadRegDWORD $0 HKCU "${MANUPRODUCTKEY}" "${AUTOSTART_DISABLED_VALUE}"
    ${If} ${Errors}
      StrCpy $AutoStartCheckboxState ${BST_CHECKED}
    ${ElseIf} $0 != 1
      StrCpy $AutoStartCheckboxState ${BST_CHECKED}
    ${Else}
      StrCpy $AutoStartCheckboxState ${BST_UNCHECKED}
    ${EndIf}
  ${EndIf}

  ${If} $AutoStartCheckboxState = ${BST_CHECKED}
    DeleteRegValue HKCU "${MANUPRODUCTKEY}" "${AUTOSTART_DISABLED_VALUE}"
    WriteRegStr HKCU "${AUTORUNKEY}" "${PRODUCTNAME}" '"$INSTDIR\${MAINBINARYNAME}.exe"'
  ${Else}
    WriteRegDWORD HKCU "${MANUPRODUCTKEY}" "${AUTOSTART_DISABLED_VALUE}" 1
    DeleteRegValue HKCU "${AUTORUNKEY}" "${PRODUCTNAME}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; 清除自启关闭偏好：卸载后重新安装时恢复默认开启。
  ; （HKCU Run 下的自启值由模板卸载段删除；用户勾选“删除应用数据”时
  ; 整个 ${MANUPRODUCTKEY} 已被模板清掉，这里的删除是无害的空操作。）
  DeleteRegValue HKCU "${MANUPRODUCTKEY}" "${AUTOSTART_DISABLED_VALUE}"
!macroend
