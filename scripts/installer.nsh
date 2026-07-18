;; Kill running BongoCat + EasyTier processes before (re)install
!macro preInit
  nsExec::ExecToLog 'taskkill /f /im bongo-cat.exe'
  nsExec::ExecToLog 'taskkill /f /im easytier-core.exe'
  Sleep 1000
!macroend

;; Clean up scheduled task on uninstall
!macro customUninstall
  nsExec::ExecToLog 'schtasks /delete /tn BongoCatAutoStart /f'
!macroend
