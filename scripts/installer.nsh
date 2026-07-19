;; Clean up leftover EasyTier files from previous installation before installing.
;; When updating by running the new installer (uninstall-then-install mode),
;; the old uninstaller doesn't know about EasyTier components and leaves them behind.
;; This causes CreateDirectory/File to fail because the resources/ directory
;; still contains locked files from the old installation.
!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog 'taskkill /f /im bongo-cat.exe'
  nsExec::ExecToLog 'taskkill /f /im easytier-core.exe'
  Sleep 2000

  ReadRegStr $0 SHCTX "${MANUPRODUCTKEY}" ""
  ${If} $0 != ""
    Delete "$0\resources\easytier-core.exe"
    Delete "$0\resources\easytier-cli.exe"
    Delete "$0\resources\packet.dll"
    Delete "$0\resources\wintun.dll"
    Delete "$0\resources\wpcap.dll"
    RMDir "$0\resources"
  ${EndIf}
!macroend

;; Clean up scheduled task and kill EasyTier on uninstall
!macro customUninstall
  nsExec::ExecToLog 'taskkill /f /im easytier-core.exe'
  Sleep 1000
  nsExec::ExecToLog 'schtasks /delete /tn BongoCatAutoStart /f'
  ;; Also delete EasyTier component files so RMDir can clean up resources/ and INSTDIR
  Delete "$INSTDIR\resources\easytier-core.exe"
  Delete "$INSTDIR\resources\easytier-cli.exe"
  Delete "$INSTDIR\resources\packet.dll"
  Delete "$INSTDIR\resources\wintun.dll"
  Delete "$INSTDIR\resources\wpcap.dll"
!macroend
