!ifndef MOON_SETUP_UI
!define MOON_SETUP_UI
!include nsDialogs.nsh
!include WinMessages.nsh

!macro MoonCreatePage
  nsDialogs::Create 1018
  Pop $MoonPage
  ${If} $MoonPage == "error"
    MessageBox MB_OK|MB_ICONSTOP "Windows no pudo mostrar el asistente. Ciérralo y vuelve a intentarlo."
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

Var MoonPage
Var MoonDpi
Var MoonX
Var MoonY
Var MoonW
Var MoonH
Var MoonTmp
Var MoonTmp2
Var MoonRect
Var MoonFont
Var MoonTitleFont
Var MoonSmallFont
Var MoonStrongFont
Var MoonStage
Var MoonTitle
Var MoonSubtitle
Var MoonStageHandle
Var MoonTitleHandle
Var MoonSubtitleHandle
Var MoonStep
Var MoonControl
Var MoonSidebar
Var MoonBitmap
Var MoonDot
Var MoonAnimation
Var MoonAnimationPath
Var MoonMotion
Var MoonMotionCheck
Var MoonDesktopCheck
Var MoonDesktopState
Var MoonRunCheck
Var MoonRunState
Var MoonStartMenuCheck
Var MoonStartMenuState
Var MoonDetails
Var MoonFooter
Var MoonProgress
Var MoonStatus
Var MoonPercent
Var MoonInstallDone
Var MoonError
Var MoonStep1
Var MoonStep2
Var MoonStep3
Var MoonStep4

; Every coordinate is a 96-DPI design pixel. Control text stays native and accessible.
!macro MoonPlace HWND X Y W H
  IntOp $MoonX ${X} * $MoonDpi
  IntOp $MoonX $MoonX / 96
  IntOp $MoonY ${Y} * $MoonDpi
  IntOp $MoonY $MoonY / 96
  IntOp $MoonW ${W} * $MoonDpi
  IntOp $MoonW $MoonW / 96
  IntOp $MoonH ${H} * $MoonDpi
  IntOp $MoonH $MoonH / 96
  System::Call 'user32::SetWindowPos(p ${HWND}, p0, i $MoonX, i $MoonY, i $MoonW, i $MoonH, i 0x14)'
!macroend

!macro MoonLabel TEXT X Y W H FONT FG BG
  System::Call 'user32::CreateWindowExW(i0, w "STATIC", w "${TEXT}", i ${WS_CHILD}|${WS_VISIBLE}|${SS_NOPREFIX}, i0,i0,i0,i0,p $MoonPage,p0,p0,p0)p.s'
  Pop $MoonControl
  SendMessage $MoonControl ${WM_SETTEXT} 0 "STR:${TEXT}"
  SendMessage $MoonControl ${WM_SETFONT} ${FONT} 0
  SetCtlColors $MoonControl "${FG}" "${BG}"
  !insertmacro MoonPlace $MoonControl ${X} ${Y} ${W} ${H}
!macroend

!macro MoonCheck TEXT X Y W H HANDLE STATE
  System::Call 'user32::CreateWindowExW(i0,w "BUTTON",w "${TEXT}",i ${WS_CHILD}|${WS_VISIBLE}|${WS_TABSTOP}|${BS_AUTOCHECKBOX},i0,i0,i0,i0,p $MoonPage,p0,p0,p0)p.s'
  Pop ${HANDLE}
  SendMessage ${HANDLE} ${WM_SETFONT} $MoonFont 0
  SendMessage ${HANDLE} ${BM_SETCHECK} ${STATE} 0
  SetCtlColors ${HANDLE} "171717" "F7F7F4"
  !insertmacro MoonPlace ${HANDLE} ${X} ${Y} ${W} ${H}
!macroend

; Called inside the upstream maintenance page, after its radio states are set.
; Do not modify R0 (SemverCompare) or R1/R2/R3/R4 (upstream handles).
!macro MoonMaintenanceLayout
  StrCpy $MoonPage $R4
  StrCpy $MoonStep 2
  StrCpy $MoonStage "INSTALACIÓN EXISTENTE"
  StrCpy $MoonTitle "Tu espacio, actualizado."
  StrCpy $MoonSubtitle "Elige cómo continuar con la aplicación que ya tienes en este equipo."
  Call MoonBase
  !insertmacro MoonPlace $R1 270 200 580 80
  SendMessage $R1 ${WM_SETFONT} $MoonFont 0
  SetCtlColors $R1 "575B59" "F7F7F4"
  !insertmacro MoonPlace $R2 280 304 550 40
  !insertmacro MoonPlace $R3 280 366 550 40
  SendMessage $R2 ${WM_SETFONT} $MoonFont 0
  SendMessage $R3 ${WM_SETFONT} $MoonFont 0
  SetCtlColors $R2 "171717" "F7F7F4"
  SetCtlColors $R3 "171717" "F7F7F4"
  GetDlgItem $MoonTmp $HWNDPARENT 1
  SendMessage $MoonTmp ${WM_SETTEXT} 0 "STR:Continuar"
  Call MoonEnter
!macroend
!endif
