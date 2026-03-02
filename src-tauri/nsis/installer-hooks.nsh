!macro NSIS_HOOK_POSTINSTALL
  ; Optional: offer to install system Everything if installer is bundled.
  IfFileExists "$INSTDIR\resources\everything\Everything-Setup.exe" 0 done
    MessageBox MB_YESNO|MB_ICONQUESTION "Install system Everything now? (Recommended)" IDNO done
    ExecWait '"$INSTDIR\resources\everything\Everything-Setup.exe" /S'
  done:
!macroend
