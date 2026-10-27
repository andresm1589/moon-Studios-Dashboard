; Shared native shell for installation and removal. No networking, registry writes,
; app termination or file installation is performed by these presentation helpers.
!macro MoonSharedFunctions PREFIX
Function ${PREFIX}MoonGuiInit
  ${NSD_InitCommonControlsEx} 0x80
  Push $0
  Push $1
  Push $2
  Push $3
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT)i.s'
  Pop $MoonDpi
  ${If} $MoonDpi < 96
    StrCpy $MoonDpi 96
  ${EndIf}
  CreateFont $MoonFont "Segoe UI" 11 400
  CreateFont $MoonTitleFont "Segoe UI" 27 600
  CreateFont $MoonSmallFont "Segoe UI" 9 400
  CreateFont $MoonStrongFont "Segoe UI" 11 600
  StrCpy $MoonDesktopState 1
  StrCpy $MoonRunState 1
  StrCpy $MoonStartMenuState 1
  ${If} $NoShortcutMode == 1
    StrCpy $MoonDesktopState 0
    StrCpy $MoonStartMenuState 0
  ${EndIf}
  StrCpy $MoonBitmap 0
  StrCpy $MoonMotion 1
  System::Call 'user32::SystemParametersInfoW(i0x1042,i0,*i.s,i0)'
  Pop $MoonMotion
  InitPluginsDir
  File "/oname=$PLUGINSDIR\moon-sidebar.bmp" "${MOON_INSTALLER_ROOT}\assets\sidebar.bmp"
  StrCpy $MoonAnimationPath "$PLUGINSDIR\moon-orbit.avi"
  ${If} $MoonDpi == 96
    File "/oname=$PLUGINSDIR\moon-orbit.avi" "${MOON_INSTALLER_ROOT}\assets\orbital.avi"
  ${ElseIf} $MoonDpi == 120
    File "/oname=$PLUGINSDIR\moon-orbit.avi" "${MOON_INSTALLER_ROOT}\assets\orbital-120.avi"
  ${ElseIf} $MoonDpi == 144
    File "/oname=$PLUGINSDIR\moon-orbit.avi" "${MOON_INSTALLER_ROOT}\assets\orbital-144.avi"
  ${ElseIf} $MoonDpi == 168
    File "/oname=$PLUGINSDIR\moon-orbit.avi" "${MOON_INSTALLER_ROOT}\assets\orbital-168.avi"
  ${ElseIf} $MoonDpi == 192
    File "/oname=$PLUGINSDIR\moon-orbit.avi" "${MOON_INSTALLER_ROOT}\assets\orbital-192.avi"
  ${Else}
    ; Unknown custom scales retain the complete static artwork and transitions.
    StrCpy $MoonAnimationPath ""
  ${EndIf}
  IntOp $MoonW 900 * $MoonDpi
  IntOp $MoonW $MoonW / 96
  IntOp $MoonH 580 * $MoonDpi
  IntOp $MoonH $MoonH / 96
  System::Call '*(i0,i0,i $MoonW,i $MoonH)p.s'
  Pop $MoonRect
  System::Call 'user32::GetWindowLongW(p $HWNDPARENT,i-16)i.s'
  Pop $MoonTmp
  System::Call 'user32::GetWindowLongW(p $HWNDPARENT,i-20)i.s'
  Pop $MoonTmp2
  System::Call 'user32::AdjustWindowRectEx(p $MoonRect,i $MoonTmp,i0,i $MoonTmp2)'
  System::Call '*$MoonRect(i.r0,i.r1,i.r2,i.r3)'
  IntOp $MoonW $2 - $0
  IntOp $MoonH $3 - $1
  System::Free $MoonRect
  System::Call 'user32::GetSystemMetrics(i0)i.s'
  Pop $MoonTmp
  IntOp $MoonX $MoonTmp - $MoonW
  IntOp $MoonX $MoonX / 2
  System::Call 'user32::GetSystemMetrics(i1)i.s'
  Pop $MoonTmp
  IntOp $MoonY $MoonTmp - $MoonH
  IntOp $MoonY $MoonY / 2
  System::Call 'user32::SetWindowPos(p $HWNDPARENT,p0,i $MoonX,i $MoonY,i $MoonW,i $MoonH,i0x14)'
  SetCtlColors $HWNDPARENT "171717" "F7F7F4"
  ; Hide the small legacy header, dividers and branding. Navigation stays native.
  !insertmacro MoonHideOuter 1037
  !insertmacro MoonHideOuter 1038
  !insertmacro MoonHideOuter 1039
  !insertmacro MoonHideOuter 1044
  !insertmacro MoonHideOuter 1045
  !insertmacro MoonHideOuter 1028
  !insertmacro MoonHideOuter 1256
  ShowWindow $mui.Header.Text ${SW_HIDE}
  ShowWindow $mui.Header.SubText ${SW_HIDE}
  ShowWindow $mui.Header.Background ${SW_HIDE}
  ShowWindow $mui.Header.Image ${SW_HIDE}
  ShowWindow $mui.Branding.Text ${SW_HIDE}
  ShowWindow $mui.Branding.Background ${SW_HIDE}
  ShowWindow $mui.Line.Standard ${SW_HIDE}
  ShowWindow $mui.Line.FullWindow ${SW_HIDE}
  GetDlgItem $MoonTmp $HWNDPARENT 1
  SendMessage $MoonTmp ${WM_SETFONT} $MoonStrongFont 0
  System::Call 'uxtheme::SetWindowTheme(p $MoonTmp,w "DarkMode_Explorer",p0)'
  !insertmacro MoonPlace $MoonTmp 722 522 150 42
  GetDlgItem $MoonTmp $HWNDPARENT 3
  SendMessage $MoonTmp ${WM_SETFONT} $MoonFont 0
  !insertmacro MoonPlace $MoonTmp 592 522 114 42
  GetDlgItem $MoonTmp $HWNDPARENT 2
  SendMessage $MoonTmp ${WM_SETFONT} $MoonSmallFont 0
  !insertmacro MoonPlace $MoonTmp 270 522 110 42
  StrCpy $MoonPage $HWNDPARENT
  !insertmacro MoonLabel "MOON STUDIOS  /  ${VERSION}" 28 535 228 20 $MoonSmallFont "727773" "F7F7F4"
  StrCpy $MoonFooter $MoonControl
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Function ${PREFIX}MoonGuiEnd
  ${If} $MoonBitmap != 0
    System::Call 'gdi32::DeleteObject(p $MoonBitmap)'
  ${EndIf}
  System::Call 'gdi32::DeleteObject(p $MoonFont)'
  System::Call 'gdi32::DeleteObject(p $MoonTitleFont)'
  System::Call 'gdi32::DeleteObject(p $MoonSmallFont)'
  System::Call 'gdi32::DeleteObject(p $MoonStrongFont)'
FunctionEnd

Function ${PREFIX}MoonAbort
  ${If} $MoonInstallDone == 1
  ${OrIf} $MoonError == 1
    Return
  ${EndIf}
  !if "${PREFIX}" == ""
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "¿Cerrar el asistente? La instalación todavía no ha terminado." IDYES moon_close_${PREFIX}
  !else
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "¿Cerrar el asistente sin quitar Moon Studios?" IDYES moon_close_${PREFIX}
  !endif
  Abort
  moon_close_${PREFIX}:
FunctionEnd

Function ${PREFIX}MoonBase
  ${If} $MoonBitmap != 0
    System::Call 'gdi32::DeleteObject(p $MoonBitmap)'
    StrCpy $MoonBitmap 0
  ${EndIf}
  !insertmacro MoonPlace $MoonPage 0 0 900 500
  !insertmacro MoonHideOuter 1036
  ShowWindow $mui.Header.Text ${SW_HIDE}
  ShowWindow $mui.Header.SubText ${SW_HIDE}
  ShowWindow $mui.Header.Background ${SW_HIDE}
  ShowWindow $mui.Header.Image ${SW_HIDE}
  ShowWindow $mui.Line.Standard ${SW_HIDE}
  ShowWindow $mui.Line.FullWindow ${SW_HIDE}
  SetCtlColors $MoonPage "171717" "F7F7F4"
  System::Call 'user32::CreateWindowExW(i0,w "STATIC",w "",i ${WS_CHILD}|${WS_VISIBLE}|${SS_BITMAP},i0,i0,i0,i0,p $MoonPage,p0,p0,p0)p.s'
  Pop $MoonSidebar
  !insertmacro MoonPlace $MoonSidebar 0 0 230 500
  System::Call 'user32::LoadImageW(p0,w "$PLUGINSDIR\moon-sidebar.bmp",i0,i $MoonW,i $MoonH,i0x10)p.s'
  Pop $MoonBitmap
  SendMessage $MoonSidebar ${STM_SETIMAGE} ${IMAGE_BITMAP} $MoonBitmap
  !insertmacro MoonLabel "●" 176 359 18 20 $MoonStrongFont "F7F7F4" "111111"
  StrCpy $MoonDot $MoonControl
  ; SysAnimate32 owns its timer and decoding. It keeps moving during native MUI
  ; pages and worker-thread installation without reentering the NSIS interpreter.
  System::Call 'user32::CreateWindowExW(i0,w "SysAnimate32",w "",i ${WS_CHILD}|${WS_VISIBLE}|9,i0,i0,i0,i0,p $MoonPage,p0,p0,p0)p.s'
  Pop $MoonAnimation
  !insertmacro MoonPlace $MoonAnimation 0 250 230 230
  SetCtlColors $MoonAnimation "111111" "111111"
  StrCpy $MoonTmp 0
  ${If} $MoonAnimationPath != ""
    SendMessage $MoonAnimation 0x467 0 "STR:$MoonAnimationPath" $MoonTmp
  ${EndIf}
  ${If} $MoonTmp != 0
    ShowWindow $MoonDot ${SW_HIDE}
    ${If} $MoonMotion == 1
      SendMessage $MoonAnimation 0x465 -1 0xFFFF0000
    ${Else}
      SendMessage $MoonAnimation 0x465 1 0
    ${EndIf}
  ${Else}
    ShowWindow $MoonAnimation ${SW_HIDE}
  ${EndIf}
  !insertmacro MoonLabel "01  Inicio" 270 30 130 28 $MoonSmallFont "797F7B" "F7F7F4"
  StrCpy $MoonStep1 $MoonControl
  !insertmacro MoonLabel "02  Opciones" 416 30 130 28 $MoonSmallFont "797F7B" "F7F7F4"
  StrCpy $MoonStep2 $MoonControl
  !insertmacro MoonLabel "03  Instalar" 562 30 130 28 $MoonSmallFont "797F7B" "F7F7F4"
  StrCpy $MoonStep3 $MoonControl
  !insertmacro MoonLabel "04  Listo" 708 30 130 28 $MoonSmallFont "797F7B" "F7F7F4"
  StrCpy $MoonStep4 $MoonControl
  ${If} $MoonStep == 1
    SetCtlColors $MoonStep1 "171717" "F7F7F4"
    SendMessage $MoonStep1 ${WM_SETFONT} $MoonStrongFont 0
  ${ElseIf} $MoonStep == 2
    SetCtlColors $MoonStep2 "171717" "F7F7F4"
    SendMessage $MoonStep2 ${WM_SETFONT} $MoonStrongFont 0
  ${ElseIf} $MoonStep == 3
    SetCtlColors $MoonStep3 "171717" "F7F7F4"
    SendMessage $MoonStep3 ${WM_SETFONT} $MoonStrongFont 0
  ${Else}
    SetCtlColors $MoonStep4 "171717" "F7F7F4"
    SendMessage $MoonStep4 ${WM_SETFONT} $MoonStrongFont 0
  ${EndIf}
  !insertmacro MoonLabel "$MoonStage" 270 89 590 22 $MoonSmallFont "727773" "F7F7F4"
  StrCpy $MoonStageHandle $MoonControl
  !insertmacro MoonLabel "$MoonTitle" 267 116 600 49 $MoonTitleFont "171717" "F7F7F4"
  StrCpy $MoonTitleHandle $MoonControl
  !insertmacro MoonLabel "$MoonSubtitle" 270 177 585 53 $MoonFont "626863" "F7F7F4"
  StrCpy $MoonSubtitleHandle $MoonControl
  ; Native controls keep keyboard focus, screen-reader names and standard actions.
  GetDlgItem $MoonTmp $HWNDPARENT 3
  SendMessage $MoonTmp ${WM_SETTEXT} 0 "STR:Atrás"
  GetDlgItem $MoonTmp $HWNDPARENT 2
  SendMessage $MoonTmp ${WM_SETTEXT} 0 "STR:Cancelar"
FunctionEnd

Function ${PREFIX}MoonFailure
  StrCpy $MoonError 1
  StrCpy $MoonInstallDone 0
  SendMessage $MoonStageHandle ${WM_SETTEXT} 0 "STR:EL PROCESO NO SE COMPLETÓ"
  SendMessage $MoonTitleHandle ${WM_SETTEXT} 0 "STR:Necesitamos otro intento."
  SendMessage $MoonSubtitleHandle ${WM_SETTEXT} 0 "STR:Consulta los detalles que aparecen abajo. Después, cierra el asistente y vuelve a intentarlo."
  SendMessage $MoonAnimation 0x466 0 0
  GetDlgItem $MoonTmp $HWNDPARENT 2
  SendMessage $MoonTmp ${WM_SETTEXT} 0 "STR:Cerrar"
FunctionEnd

Function ${PREFIX}MoonEnter
  !ifdef MOON_PREVIEW
    SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:Moon Studios · Vista de prueba del instalador"
  !else
    SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:Moon Studios · Asistente de instalación"
  !endif
  ${If} $MoonMotion == 1
    ; Short entrance, once per page; never stalls the install worker or loops fades.
    System::Call 'user32::ShowWindow(p $MoonPage,i0)'
    System::Call 'user32::AnimateWindow(p $MoonPage,i150,i0x40004)'
  ${EndIf}
FunctionEnd

!macroend

!macro MoonHideOuter ID
  GetDlgItem $MoonTmp $HWNDPARENT ${ID}
  ShowWindow $MoonTmp ${SW_HIDE}
!macroend

!insertmacro MoonSharedFunctions ""
!insertmacro MoonSharedFunctions "un."

Function MoonWelcome
  Call SkipIfPassive
  !insertmacro MoonCreatePage
  StrCpy $MoonStep 1
  StrCpy $MoonStage "BIENVENIDO A TU ESPACIO DE TRABAJO"
  StrCpy $MoonTitle "Tu equipo empieza aquí."
  StrCpy $MoonSubtitle "Instala Moon Studios y reúne tus proyectos, tu equipo y tus herramientas en un mismo lugar."
  Call MoonBase
  !insertmacro MoonLabel "" 270 250 580 140 $MoonFont "171717" "FFFFFF"
  !insertmacro MoonLabel "UN ESPACIO. TODO TU EQUIPO." 290 265 530 24 $MoonStrongFont "171717" "FFFFFF"
  !insertmacro MoonLabel "Proyectos y tareas     ·     Calendario y conversaciones$\r$\nTrámites, documentos y herramientas de tu área." 290 307 530 65 $MoonFont "626863" "FFFFFF"
  !insertmacro MoonLabel "Windows de 64 bits  /  Versión ${VERSION}" 270 410 580 24 $MoonSmallFont "727773" "F7F7F4"
  !insertmacro MoonLabel "El asistente te mostrará las opciones antes de instalar." 270 447 580 24 $MoonSmallFont "727773" "F7F7F4"
  GetDlgItem $MoonTmp $HWNDPARENT 1
  SendMessage $MoonTmp ${WM_SETTEXT} 0 "STR:Empezar"
  Call MoonEnter
  nsDialogs::Show
FunctionEnd

Function MoonPageLeave
FunctionEnd

Function MoonDirectoryShow
  StrCpy $MoonPage $mui.DirectoryPage
  StrCpy $MoonStep 2
  StrCpy $MoonStage "CONFIGURA TU INSTALACIÓN"
  StrCpy $MoonTitle "Hazlo a tu manera."
  StrCpy $MoonSubtitle "Elige la ubicación y los accesos que quieres tener a mano."
  ; Keep NSIS' real directory edit/browse/space validation and its callbacks.
  ShowWindow $mui.DirectoryPage.Text ${SW_HIDE}
  ShowWindow $mui.DirectoryPage.DirectoryBox ${SW_HIDE}
  Call MoonBase
  !insertmacro MoonLabel "UBICACIÓN DE LA APLICACIÓN" 270 249 580 22 $MoonStrongFont "171717" "F7F7F4"
  !insertmacro MoonPlace $mui.DirectoryPage.Directory 270 283 450 39
  !insertmacro MoonPlace $mui.DirectoryPage.BrowseButton 734 283 118 39
  SendMessage $mui.DirectoryPage.Directory ${WM_SETFONT} $MoonFont 0
  SendMessage $mui.DirectoryPage.BrowseButton ${WM_SETTEXT} 0 "STR:Cambiar…"
  SendMessage $mui.DirectoryPage.BrowseButton ${WM_SETFONT} $MoonSmallFont 0
  !insertmacro MoonPlace $mui.DirectoryPage.SpaceRequired 270 333 280 22
  !insertmacro MoonPlace $mui.DirectoryPage.SpaceAvailable 570 333 280 22
  SendMessage $mui.DirectoryPage.SpaceRequired ${WM_SETFONT} $MoonSmallFont 0
  SendMessage $mui.DirectoryPage.SpaceAvailable ${WM_SETFONT} $MoonSmallFont 0
  SetCtlColors $mui.DirectoryPage.SpaceRequired "727773" "F7F7F4"
  SetCtlColors $mui.DirectoryPage.SpaceAvailable "727773" "F7F7F4"
  !insertmacro MoonCheck "Crear acceso en el escritorio" 270 380 580 27 $MoonDesktopCheck $MoonDesktopState
  !insertmacro MoonCheck "Añadir al menú Inicio" 270 416 300 27 $MoonStartMenuCheck $MoonStartMenuState
  ${If} $NoShortcutMode == 1
    EnableWindow $MoonDesktopCheck 0
    EnableWindow $MoonStartMenuCheck 0
  ${EndIf}
  IntOp $MoonTmp 1 - $MoonMotion
  !insertmacro MoonCheck "Reducir movimiento" 600 416 250 27 $MoonMotionCheck $MoonTmp
  !insertmacro MoonLabel "Se instalará solo para tu usuario de Windows." 270 466 580 22 $MoonSmallFont "727773" "F7F7F4"
  GetDlgItem $MoonTmp $HWNDPARENT 1
  SendMessage $MoonTmp ${WM_SETTEXT} 0 "STR:Revisar"
  Call MoonEnter
FunctionEnd

Function MoonDirectoryLeave
  SendMessage $MoonDesktopCheck ${BM_GETCHECK} 0 0 $MoonDesktopState
  SendMessage $MoonStartMenuCheck ${BM_GETCHECK} 0 0 $MoonStartMenuState
  SendMessage $MoonMotionCheck ${BM_GETCHECK} 0 0 $MoonTmp
  IntOp $MoonMotion 1 - $MoonTmp
  ${If} $MoonStartMenuState == 1
    StrCpy $AppStartMenuFolder "${STARTMENUFOLDER}"
  ${Else}
    StrCpy $AppStartMenuFolder ">"
  ${EndIf}
FunctionEnd

Function MoonReview
  Call SkipIfPassive
  !insertmacro MoonCreatePage
  StrCpy $MoonStep 2
  StrCpy $MoonStage "REVISA Y CONFIRMA"
  StrCpy $MoonTitle "Todo a tu medida."
  StrCpy $MoonSubtitle "Estas son tus opciones. Puedes volver atrás para cambiarlas antes de continuar."
  Call MoonBase
  !insertmacro MoonLabel "MOON STUDIOS ${VERSION}  /  WINDOWS 64 BITS" 270 250 580 26 $MoonStrongFont "171717" "F7F7F4"
  !insertmacro MoonLabel "Carpeta de instalación" 270 297 580 22 $MoonSmallFont "727773" "F7F7F4"
  !insertmacro MoonLabel "$INSTDIR" 270 326 580 49 $MoonFont "171717" "F7F7F4"
  ${If} $MoonDesktopState == 1
    StrCpy $MoonTmp "Escritorio: sí"
  ${Else}
    StrCpy $MoonTmp "Escritorio: no"
  ${EndIf}
  ${If} $MoonStartMenuState == 1
    StrCpy $MoonTmp2 "Menú Inicio: sí"
  ${Else}
    StrCpy $MoonTmp2 "Menú Inicio: no"
  ${EndIf}
  !insertmacro MoonLabel "$MoonTmp     ·     $MoonTmp2" 270 388 580 28 $MoonFont "171717" "F7F7F4"
  !insertmacro MoonLabel "Si falta Microsoft WebView2, el asistente lo descargará$\r$\nautomáticamente. Puede necesitar conexión a internet." 270 442 580 44 $MoonSmallFont "727773" "F7F7F4"
  GetDlgItem $MoonTmp $HWNDPARENT 1
  SendMessage $MoonTmp ${WM_SETTEXT} 0 "STR:Instalar"
  Call MoonEnter
  nsDialogs::Show
FunctionEnd

!macro MoonInstallFunctions PREFIX
Function ${PREFIX}MoonInstallShow
  StrCpy $MoonInstallDone 0
  StrCpy $MoonError 0
  StrCpy $MoonPage $mui.InstFilesPage
  StrCpy $MoonStep 3
  StrCpy $MoonStage "PREPARANDO TU ESPACIO"
  !if "${PREFIX}" == ""
    StrCpy $MoonTitle "Estamos preparando todo."
    StrCpy $MoonSubtitle "Espera mientras instalamos la aplicación y comprobamos los componentes necesarios."
  !else
    StrCpy $MoonTitle "Hasta la próxima."
    StrCpy $MoonSubtitle "Estamos quitando la aplicación de este equipo. Tus datos en la nube se conservan."
  !endif
  Call ${PREFIX}MoonBase
  !insertmacro MoonPlace $mui.InstFilesPage.Text 270 249 580 44
  !insertmacro MoonPlace $mui.InstFilesPage.ProgressBar 270 306 580 12
  !insertmacro MoonPlace $mui.InstFilesPage.ShowLogButton 270 347 150 31
  !insertmacro MoonPlace $mui.InstFilesPage.Log 270 388 580 95
  SendMessage $mui.InstFilesPage.Text ${WM_SETFONT} $MoonFont 0
  SendMessage $mui.InstFilesPage.ShowLogButton ${WM_SETTEXT} 0 "STR:Ver detalles"
  SendMessage $mui.InstFilesPage.ShowLogButton ${WM_SETFONT} $MoonSmallFont 0
  SendMessage $mui.InstFilesPage.Log ${WM_SETFONT} $MoonSmallFont 0
  SetCtlColors $mui.InstFilesPage.Text "171717" "F7F7F4"
  SetCtlColors $mui.InstFilesPage.Log "626863" "FFFFFF"
  System::Call 'uxtheme::SetWindowTheme(p $mui.InstFilesPage.ProgressBar,w "",w "")'
  SendMessage $mui.InstFilesPage.ProgressBar 0x409 0 0x171717
  SendMessage $mui.InstFilesPage.ProgressBar 0x2001 0 0xE5E7E2
  ; The displayed bar is NSIS' actual file progress, never a fabricated percentage.
  Call ${PREFIX}MoonEnter
FunctionEnd

Function ${PREFIX}MoonInstallLeave
  IfAbort moon_failed_${PREFIX}
  StrCpy $MoonInstallDone 1
  StrCpy $MoonError 0
  Return
  moon_failed_${PREFIX}:
  StrCpy $MoonInstallDone 0
  StrCpy $MoonError 1
  Call ${PREFIX}MoonFailure
FunctionEnd
!macroend
!insertmacro MoonInstallFunctions ""
!insertmacro MoonInstallFunctions "un."

Function MoonFinish
  Call SkipIfPassive
  ${If} $MoonInstallDone != 1
    StrCpy $MoonError 1
  ${EndIf}
  !insertmacro MoonCreatePage
  StrCpy $MoonStep 4
  StrCpy $MoonStage "INSTALACIÓN COMPLETADA"
  StrCpy $MoonTitle "Todo listo para crear."
  StrCpy $MoonSubtitle "Moon Studios ya está en tu equipo. Entra con tu cuenta corporativa para continuar."
  ${If} $MoonError == 1
    StrCpy $MoonStage "LA INSTALACIÓN NO SE COMPLETÓ"
    StrCpy $MoonTitle "Intentémoslo de nuevo."
    StrCpy $MoonSubtitle "Revisa los detalles de la instalación y vuelve a ejecutar el asistente."
  ${EndIf}
  Call MoonBase
  ${If} $MoonError == 1
    !insertmacro MoonLabel "REVISA EL REGISTRO ANTES DE VOLVER A INTENTARLO" 270 259 580 28 $MoonStrongFont "171717" "F7F7F4"
  ${Else}
    !insertmacro MoonLabel "TU ESPACIO DE TRABAJO ESTÁ LISTO" 270 259 580 28 $MoonStrongFont "171717" "F7F7F4"
  ${EndIf}
  !insertmacro MoonLabel "Versión ${VERSION}   ·   Windows 64 bits" 270 300 580 26 $MoonFont "626863" "F7F7F4"
  ${If} $MoonError != 1
    !insertmacro MoonCheck "Abrir Moon Studios al terminar" 270 357 580 35 $MoonRunCheck $MoonRunState
    !insertmacro MoonLabel "Encuentra tus herramientas al iniciar sesión.$\r$\nLas próximas versiones estarán disponibles desde la aplicación." 270 427 580 46 $MoonSmallFont "727773" "F7F7F4"
  ${EndIf}
  GetDlgItem $MoonTmp $HWNDPARENT 1
  SendMessage $MoonTmp ${WM_SETTEXT} 0 "STR:Finalizar"
  GetDlgItem $MoonTmp $HWNDPARENT 2
  ShowWindow $MoonTmp ${SW_HIDE}
  Call MoonEnter
  nsDialogs::Show
FunctionEnd

Function MoonFinishLeave
  ${If} $MoonError != 1
  ${AndIf} $MoonInstallDone == 1
    SendMessage $MoonRunCheck ${BM_GETCHECK} 0 0 $MoonRunState
    ${If} $MoonDesktopState == 1
    ${AndIf} $NoShortcutMode != 1
      Call CreateOrUpdateDesktopShortcut
    ${EndIf}
    ${If} $MoonRunState == 1
      Call RunMainBinary
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.MoonConfirm
  Call un.SkipIfPassive
  !insertmacro MoonCreatePage
  StrCpy $MoonStep 2
  StrCpy $MoonStage "DESINSTALAR MOON STUDIOS"
  StrCpy $MoonTitle "Tú decides qué conservar."
  StrCpy $MoonSubtitle "Quitaremos la aplicación de este equipo. Tus tareas, proyectos y documentos en la nube seguirán guardados."
  Call un.MoonBase
  !insertmacro MoonLabel "CARPETA DE LA APLICACIÓN" 270 260 580 24 $MoonStrongFont "171717" "F7F7F4"
  !insertmacro MoonLabel "$INSTDIR" 270 302 580 50 $MoonFont "626863" "F7F7F4"
  !insertmacro MoonCheck "Borrar también la sesión y las preferencias de este equipo" 270 378 580 38 $DeleteAppDataCheckbox $DeleteAppDataCheckboxState
  !insertmacro MoonLabel "Esta opción solo afecta a los datos locales de la aplicación." 270 443 580 25 $MoonSmallFont "727773" "F7F7F4"
  GetDlgItem $MoonTmp $HWNDPARENT 1
  SendMessage $MoonTmp ${WM_SETTEXT} 0 "STR:Desinstalar"
  Call un.MoonEnter
  nsDialogs::Show
FunctionEnd

Function un.MoonConfirmLeave
  SendMessage $DeleteAppDataCheckbox ${BM_GETCHECK} 0 0 $DeleteAppDataCheckboxState
FunctionEnd

Function un.MoonFinish
  Call un.SkipIfPassive
  ${If} $UpdateMode == 1
    Abort
  ${EndIf}
  ${If} $MoonInstallDone != 1
    StrCpy $MoonError 1
  ${EndIf}
  !insertmacro MoonCreatePage
  StrCpy $MoonStep 4
  StrCpy $MoonStage "DESINSTALACIÓN COMPLETADA"
  StrCpy $MoonTitle "Nos vemos pronto."
  StrCpy $MoonSubtitle "Moon Studios se ha quitado de este equipo. Puedes volver a instalarlo cuando quieras."
  ${If} $MoonError == 1
    StrCpy $MoonStage "LA DESINSTALACIÓN NO SE COMPLETÓ"
    StrCpy $MoonTitle "Revisa los detalles."
    StrCpy $MoonSubtitle "No se pudieron quitar todos los archivos. Cierra la aplicación y vuelve a intentarlo."
  ${EndIf}
  Call un.MoonBase
  !insertmacro MoonLabel "TUS DATOS EN LA NUBE SIGUEN CONTIGO" 270 265 580 28 $MoonStrongFont "171717" "F7F7F4"
  !insertmacro MoonLabel "Tu cuenta y el trabajo de tu equipo se conservan.$\r$\nTambién puedes acceder desde la web de Moon Studios." 270 313 580 65 $MoonFont "626863" "F7F7F4"
  GetDlgItem $MoonTmp $HWNDPARENT 1
  SendMessage $MoonTmp ${WM_SETTEXT} 0 "STR:Cerrar"
  Call un.MoonEnter
  nsDialogs::Show
FunctionEnd
