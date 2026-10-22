// Pas de fenêtre de console noire derrière Aqueli dans la version installée.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    aqueli_lib::run()
}
