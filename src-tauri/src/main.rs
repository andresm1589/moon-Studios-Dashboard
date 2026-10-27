// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Toda la configuración (plugins, ventana) vive en lib.rs. Antes este main
// armaba su propia app con solo el actualizador y el proceso, así que nada de
// lo registrado en lib.rs llegaba al ejecutable.
fn main() {
    app_lib::run()
}
