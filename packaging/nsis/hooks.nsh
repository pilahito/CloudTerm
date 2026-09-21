; CloudTerm · ganchos NSIS
; Se incluye en el instalador de Tauri antes de las páginas MUI.
; Los textos multi-idioma están en English.nsh / Spanish.nsh / SimpChinese.nsh.

!define MUI_WELCOMEPAGE_TITLE "$(welcomePageTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(welcomePageText)"
!define MUI_FINISHPAGE_TITLE "$(finishPageTitle)"
!define MUI_FINISHPAGE_TEXT "$(finishPageText)"
!define MUI_FINISHPAGE_RUN_TEXT "$(launchCloudTerm)"
!define MUI_FINISHPAGE_LINK "github.com/pilahito/cloudterm"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/pilahito/cloudterm"
!define MUI_FINISHPAGE_LINK_COLOR 22D3EE

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; El desinstalador de Tauri se llama uninstall.exe; lo dejamos también
  ; como «Uninstall CloudTerm.exe» para el panel de Programas de Windows.
  IfFileExists "$INSTDIR\uninstall.exe" 0 cloudterm_postinstall_done
    CopyFiles /SILENT "$INSTDIR\uninstall.exe" "$INSTDIR\Uninstall CloudTerm.exe"
    WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\Uninstall CloudTerm.exe$\""
    WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
    WriteRegStr SHCTX "${UNINSTKEY}" "HelpLink" "https://github.com/pilahito/cloudterm"
    WriteRegStr SHCTX "${UNINSTKEY}" "URLInfoAbout" "https://github.com/pilahito/cloudterm"
    WriteRegStr SHCTX "${UNINSTKEY}" "URLUpdateInfo" "https://github.com/pilahito/cloudterm/releases"
  cloudterm_postinstall_done:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\Uninstall CloudTerm.exe"
  Delete "$INSTDIR\uninstall.exe"
!macroend
