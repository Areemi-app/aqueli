; Crochets de l'installateur d'Aqueli, inclus par le modèle de Tauri avant les pages.
; Fichier en UTF-8 avec BOM. Les textes de chaque langue sont dans langues\*.nsh.

; Pages d'accueil et de fin, dans la langue choisie (textes aqWelcome…, aqFinish… de langues\*.nsh).
!define MUI_WELCOMEPAGE_TITLE "$(aqWelcomeTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(aqWelcomeText)"
!define MUI_FINISHPAGE_TITLE "$(aqFinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(aqFinishText)"
!define MUI_FINISHPAGE_RUN_TEXT "$(aqFinishRun)"

; Couleurs d'Aqueli : fond nacré des pages d'accueil et de fin et de l'en-tête (accordé aux images
; cote.bmp et entete.bmp, dessinées dans cote.svg et entete.svg), encre du thème Aqua.
!define MUI_BGCOLOR "F3F9FF"
!define MUI_TEXTCOLOR "10243A"

; Choix de la langue au lancement : les 17 langues d'Aqueli, toujours toutes proposées ; la
; langue de Windows est choisie d'avance si Aqueli la parle.
!define MUI_LANGDLL_WINDOWTITLE "Aqueli"
!define MUI_LANGDLL_INFO "Choisissez une langue · Choose a language"
!define MUI_LANGDLL_ALLLANGUAGES

; Désinstallation : Tauri efface la position de la fenêtre et les données de WebView2
; quand la case « Supprimer aussi tous les comptes et toutes les données » est cochée. Les comptes
; (bases chiffrées, en-têtes, préférences) sont dans %APPDATA%\Aqueli : ils partent avec, jamais
; lors d'une mise à jour.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ; Nom et icône d'Aqueli pour les notifications de Windows.
    DeleteRegKey HKCU "Software\Classes\AppUserModelId\fr.aqueli.desktop"
  ${EndIf}
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    SetShellVarContext current
    RmDir /r "$APPDATA\Aqueli"
    DeleteRegKey HKCU "Software\Aqueli"
  ${EndIf}
!macroend

; Installation : Aqueli se lance discrètement au démarrage de Windows (pour les rappels),
; sauf si la personne l'a désactivé dans Paramètres › Rappels (choix retenu en « 0 »).
!macro NSIS_HOOK_POSTINSTALL
  ; Langue choisie au lancement de l'installateur : Aqueli s'ouvre dans cette langue tant
  ; qu'aucune n'est choisie dans l'application (lang::system, cœur).
  WriteRegDWORD HKCU "Software\Aqueli" "LangueInstallation" $LANGUAGE
  ReadRegStr $0 HKCU "Software\Aqueli" "DemarrageAuto"
  ${If} $0 != "0"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Aqueli" '"$INSTDIR\${MAINBINARYNAME}.exe" --arriere-plan'
  ${EndIf}
!macroend
