use tauri::{
  menu::{Menu, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Manager,
};

/// Argumento con el que Windows abre la app al iniciar sesión: arranca oculta en la bandeja.
const ARG_OCULTA: &str = "--oculta";

fn mostrar_ventana(app: &tauri::AppHandle) {
  if let Some(ventana) = app.get_webview_window("main") {
    let _ = ventana.unminimize();
    let _ = ventana.show();
    let _ = ventana.set_focus();
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // La app solo se compila para escritorio (Windows), así que el plugin va
  // sin condición: con #[cfg(desktop)] quedaba fuera del ejecutable.
  tauri::Builder::default()
    // Una sola ventana: si la app ya está abierta, abrirla de nuevo enfoca la
    // existente en vez de crear otra (dos instancias se peleaban la sesión).
    // Tiene que ser el primer plugin.
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| mostrar_ventana(app)))
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    // Enlaces externos y mailto: en el navegador / cliente de correo del sistema.
    .plugin(tauri_plugin_opener::init())
    // Notificaciones nativas de Windows (ajuste "Notificaciones de escritorio").
    .plugin(tauri_plugin_notification::init())
    // Recuerda tamaño, posición y si estaba maximizada entre aperturas.
    .plugin(tauri_plugin_window_state::Builder::default().build())
    // Inicio con Windows (se activa desde Configuración → Notificaciones).
    .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![ARG_OCULTA])))
    .setup(|app| {
      // Bandeja del sistema: al cerrar la ventana la app sigue activa y avisando.
      let abrir = MenuItem::with_id(app, "abrir", "Abrir moon Studios", true, None::<&str>)?;
      let separador = PredefinedMenuItem::separator(app)?;
      let salir = MenuItem::with_id(app, "salir", "Salir por completo", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&abrir, &separador, &salir])?;
      let mut bandeja = TrayIconBuilder::with_id("moon")
        .tooltip("moon Studios: te avisa aunque cierres la ventana")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, evento| match evento.id.as_ref() {
          "abrir" => mostrar_ventana(app),
          "salir" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|bandeja, evento| {
          if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
            mostrar_ventana(bandeja.app_handle());
          }
        });
      if let Some(icono) = app.default_window_icon() {
        bandeja = bandeja.icon(icono.clone());
      }
      bandeja.build(app)?;

      // Abierta por Windows al iniciar sesión: queda en la bandeja, sin ventana.
      if std::env::args().any(|a| a == ARG_OCULTA) {
        if let Some(ventana) = app.get_webview_window("main") {
          let _ = ventana.hide();
        }
      }

      // La sala de conferencias necesita micrófono y cámara: WebView2 los niega
      // si nadie responde su pedido de permiso (wry solo autoriza el portapapeles).
      #[cfg(windows)]
      if let Some(ventana) = app.get_webview_window("main") {
        permitir_microfono_y_camara(&ventana);
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

/// Autoriza micrófono y cámara dentro de la app (la sala de video de Conferencias).
/// La app solo carga su propio contenido: los enlaces externos se abren en el navegador.
#[cfg(windows)]
fn permitir_microfono_y_camara(ventana: &tauri::WebviewWindow) {
  use webview2_com::{Microsoft::Web::WebView2::Win32::*, PermissionRequestedEventHandler};
  let _ = ventana.with_webview(|webview| unsafe {
    let Ok(core) = webview.controller().CoreWebView2() else { return };
    let mut token: i64 = 0;
    let _ = core.add_PermissionRequested(
      &PermissionRequestedEventHandler::create(Box::new(|_, args| {
        let Some(args) = args else { return Ok(()) };
        let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
        args.PermissionKind(&mut kind)?;
        if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE || kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA {
          args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
        }
        Ok(())
      })),
      &mut token,
    );
  });
}
