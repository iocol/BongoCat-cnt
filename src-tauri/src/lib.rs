mod core;
mod utils;

use core::{
    autostart::{disable_autostart, enable_autostart, is_autostart_enabled},
    buddy::{
        BuddyState, get_buddy_status, push_stats, remove_buddy_peer, start_buddy, stop_buddy,
    },
    device::start_device_listening,
    gamepad::{start_gamepad_listing, stop_gamepad_listing},
    prevent_default, setup,
};
use tauri::{Manager, WindowEvent, generate_handler};
#[cfg(target_os = "macos")]
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_custom_window::{
    MAIN_WINDOW_LABEL, PREFERENCE_WINDOW_LABEL, show_preference_window,
};
use utils::fs_extra::copy_dir;
use tauri::Emitter;

const APP_EXITING_EVENT: &str = "app:exiting";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(BuddyState::new())
        .setup(|app| {
            let app_handle = app.handle();

            let main_window = app.get_webview_window(MAIN_WINDOW_LABEL).unwrap();

            let preference_window = app.get_webview_window(PREFERENCE_WINDOW_LABEL).unwrap();

            setup::default(&app_handle, main_window.clone(), preference_window.clone());

            Ok(())
        })
        .invoke_handler(generate_handler![
            copy_dir,
            start_device_listening,
            start_gamepad_listing,
            stop_gamepad_listing,
            start_buddy,
            stop_buddy,
            push_stats,
            get_buddy_status,
            remove_buddy_peer,
            is_autostart_enabled,
            enable_autostart,
            disable_autostart,
        ])
        .plugin(tauri_plugin_admin_status::init())
        .plugin(tauri_plugin_custom_window::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_pinia::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(prevent_default::init())
        .plugin(tauri_plugin_single_instance::init(
            |app_handle, _argv, _cwd| {
                show_preference_window(app_handle);
            },
        ))
        .plugin(
            tauri_plugin_log::Builder::new()
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .filter(|metadata| !metadata.target().contains("gilrs"))
                .build(),
        );

    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        Some(vec!["--auto-launch"]),
    ));

    let app = builder
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_locale::init())
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                let _ = window.emit(APP_EXITING_EVENT, ());
                let _ = window.hide();

                api.prevent_close();
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| match event {
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            show_preference_window(app_handle);
        }
        _ => {
            let _ = app_handle;
        }
    });
}
