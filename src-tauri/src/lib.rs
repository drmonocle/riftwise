use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_opener::OpenerExt;

mod update;

#[tauri::command]
fn start_window_drag(window: tauri::WebviewWindow) {
    let _ = window.start_dragging();
}

#[tauri::command]
fn show_ticker(app: tauri::AppHandle) {
    // The HUD is a passive overlay: showing it (also at Windows sign-in) must not take the keyboard
    // away from whatever the user is doing.
    if let Some(w) = app.get_webview_window("ticker") {
        #[cfg(target_os = "windows")]
        if let Ok(hwnd) = w.hwnd() {
            extern "system" {
                fn ShowWindow(hwnd: *mut std::ffi::c_void, cmd: i32) -> i32;
            }
            const SW_SHOWNOACTIVATE: i32 = 4;
            unsafe { ShowWindow(hwnd.0 as *mut std::ffi::c_void, SW_SHOWNOACTIVATE) };
            return;
        }
        let _ = w.show();
    }
}

#[tauri::command]
fn hide_ticker(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("ticker") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn set_ticker_topmost(app: tauri::AppHandle, topmost: bool) {
    if let Some(w) = app.get_webview_window("ticker") {
        let _ = w.set_always_on_top(topmost);
    }
}

#[tauri::command]
fn show_main(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn hide_main(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn set_compact_mode(app: tauri::AppHandle, compact: bool) {
    if let Some(w) = app.get_webview_window("main") {
        if compact {
            let _ = w.set_size(tauri::Size::Logical(tauri::LogicalSize { width: 780.0, height: 500.0 }));
        } else {
            let _ = w.set_size(tauri::Size::Logical(tauri::LogicalSize { width: 1000.0, height: 720.0 }));
        }
    }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Where a window was last left (main window and floating HUD), so it reopens in the same spot.
fn window_place_file(app: &tauri::AppHandle, label: &str) -> Option<std::path::PathBuf> {
    app.path().app_local_data_dir().ok().map(|d| d.join(format!("{label}_window_pos.txt")))
}

fn save_window_place(window: &tauri::Window, x: i32, y: i32) {
    // Minimized windows report a far-off position; don't remember that
    if window.is_minimized().unwrap_or(false) || x <= -30000 || y <= -30000 {
        return;
    }
    if let Some(f) = window_place_file(window.app_handle(), window.label()) {
        if let Some(dir) = f.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(f, format!("{x},{y}"));
    }
}

/// Puts a window back where it was, but only if that spot is on a screen that is still connected
/// (a monitor that was unplugged would otherwise leave the window out of sight).
fn restore_window_place(app: &tauri::AppHandle, label: &str) {
    let (Some(w), Some(f)) = (app.get_webview_window(label), window_place_file(app, label)) else { return };
    let Ok(text) = std::fs::read_to_string(&f) else { return };
    let n: Vec<i32> = text.trim().split(',').filter_map(|s| s.trim().parse().ok()).collect();
    if n.len() != 2 {
        return;
    }
    let (x, y) = (n[0], n[1]);
    let on_screen = w.available_monitors().unwrap_or_default().iter().any(|m| {
        let (p, s) = (m.position(), m.size());
        x + 40 >= p.x && y + 10 >= p.y && x + 40 < p.x + s.width as i32 && y + 10 < p.y + s.height as i32
    });
    if on_screen {
        let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

/// The first time the X button hides RiftWatch to the tray, say so: otherwise it looks like it quit.
/// Remembered with a marker file so it is only said once.
fn tell_once_about_tray(app: &tauri::AppHandle) {
    use tauri_plugin_notification::NotificationExt;
    let Ok(dir) = app.path().app_local_data_dir() else { return };
    let marker = dir.join("tray_hint_shown");
    if marker.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&marker, b"1");
    let _ = app
        .notification()
        .builder()
        .title("RiftWatch is still running")
        .body("It's in the system tray (bottom-right, near the clock) so match alerts keep working. Right-click the icon to quit, or change this in Settings.")
        .show();
}

/// Shows a native desktop notification (used for kickoff / pre-match / banger alerts).
#[tauri::command]
fn send_notification(app: tauri::AppHandle, title: String, body: String) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Adds or removes RiftWatch from the current user's Windows startup list (no admin needed).
#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

        let mut cmd = std::process::Command::new("reg");
        if enabled {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let value = format!("\"{}\" --minimized", exe.display());
            cmd.args(["add", RUN_KEY, "/v", "RiftWatch", "/t", "REG_SZ", "/d", &value, "/f"]);
        } else {
            cmd.args(["delete", RUN_KEY, "/v", "RiftWatch", "/f"]);
        }
        let status = cmd
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| e.to_string())?;
        // Deleting a value that isn't there reports failure; that's fine.
        if enabled && !status.success() {
            return Err("Could not add RiftWatch to Windows startup".into());
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
    }
    Ok(())
}

/// Whether closing the main window hides it to the tray (true) or quits the app (false).
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

#[tauri::command]
fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

/// Opens a web link in the user's default browser. Only plain http/https links are allowed.
fn open_url_checked(app: &tauri::AppHandle, url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return false;
    }
    app.opener().open_url(url.trim(), None::<&str>).is_ok()
}

#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if open_url_checked(&app, &url) {
        Ok(())
    } else {
        Err("Blocked: only http/https links can be opened".into())
    }
}

#[tauri::command]
fn apply_app_update(app: tauri::AppHandle, download_url: String, checksum_url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;

        // Security: only exact official release-asset URLs, and the binary must match its published SHA-256.
        if !update::is_official_release_asset(&download_url) || !update::is_official_release_asset(&checksum_url) {
            return Err("Invalid update source URL. Only official GitHub release assets are allowed.".into());
        }

        let current_exe = std::env::current_exe().map_err(|e| format!("Failed to locate current executable: {}", e))?;

        let temp_dir = std::env::temp_dir();
        let new_exe = temp_dir.join("RiftWatch_update.exe");
        let sum_file = temp_dir.join("RiftWatch_update.sha256");

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // Download via Windows native curl.exe: https only (including redirects), size- and time-limited.
        let download = |url: &str, dest: &std::path::Path, max_bytes: u64| -> Result<(), String> {
            let status = Command::new("curl.exe")
                .args([
                    "-L", "-s", "-S", "-f",
                    "--proto", "=https", "--proto-redir", "=https",
                    "--max-filesize", &max_bytes.to_string(),
                    "--max-time", "180",
                    "-o", &dest.to_string_lossy(),
                    url,
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .status()
                .map_err(|e| format!("Failed to run download helper: {}", e))?;
            if status.success() {
                Ok(())
            } else {
                Err("Failed to download update. Check your network connection.".to_string())
            }
        };

        let cleanup = || {
            let _ = std::fs::remove_file(&new_exe);
            let _ = std::fs::remove_file(&sum_file);
        };

        download(&checksum_url, &sum_file, 4096).map_err(|e| { cleanup(); e })?;
        let expected = std::fs::read_to_string(&sum_file)
            .ok()
            .and_then(|t| update::parse_sha256(&t))
            .ok_or_else(|| { cleanup(); "Update checksum file is missing or malformed.".to_string() })?;

        download(&download_url, &new_exe, update::MAX_UPDATE_BYTES).map_err(|e| { cleanup(); e })?;

        let bytes = std::fs::read(&new_exe).map_err(|_| { cleanup(); "Downloaded update file not found on disk.".to_string() })?;
        if bytes.len() < 500_000 {
            cleanup();
            return Err("Downloaded update file is invalid or truncated.".into());
        }
        if update::sha256_hex(&bytes) != expected {
            cleanup();
            return Err("Update failed integrity check (SHA-256 mismatch). Install was aborted.".into());
        }
        drop(bytes);
        let _ = std::fs::remove_file(&sum_file);

        // Swap in place, without a helper script: Windows lets a running .exe be renamed (not
        // overwritten), so move ourselves aside, copy the verified update into our path, start it,
        // and exit. No PowerShell means nothing for script policies or antivirus to block, and a
        // folder we can't write to is reported here instead of the app just closing.
        let old_exe = update::old_exe_path(&current_exe);
        let _ = std::fs::remove_file(&old_exe); // leftover from an earlier update
        if let Err(e) = std::fs::rename(&current_exe, &old_exe) {
            cleanup();
            return Err(format!(
                "Couldn't replace RiftWatch in {} ({}). Move RiftWatch.exe to a folder you can write to (for example Documents) or download the update from GitHub.",
                current_exe.parent().map(|d| d.display().to_string()).unwrap_or_default(),
                e
            ));
        }
        if let Err(e) = std::fs::copy(&new_exe, &current_exe) {
            let _ = std::fs::rename(&old_exe, &current_exe); // put the working version back
            cleanup();
            return Err(format!("Couldn't install the update ({}). Nothing was changed.", e));
        }
        let _ = std::fs::remove_file(&new_exe);

        // The new version is started by a helper once this process has fully exited (see run()).
        if let Ok(mut slot) = RELAUNCH_AFTER_EXIT.lock() {
            *slot = Some((old_exe.clone(), current_exe.clone()));
        }
        app.exit(0);
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Auto-update is currently supported on Windows only.".into())
    }
}

#[cfg(target_os = "windows")]
fn is_another_instance_running() -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    extern "system" {
        fn CreateMutexW(
            lpMutexAttributes: *mut std::ffi::c_void,
            bInitialOwner: i32,
            lpName: *const u16,
        ) -> *mut std::ffi::c_void;
        fn GetLastError() -> u32;
        fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
        fn FindWindowW(lpClassName: *const u16, lpWindowName: *const u16) -> *mut std::ffi::c_void;
        fn ShowWindow(hWnd: *mut std::ffi::c_void, nCmdShow: i32) -> i32;
        fn SetForegroundWindow(hWnd: *mut std::ffi::c_void) -> i32;
    }
    const ERROR_ALREADY_EXISTS: u32 = 183;
    const SW_RESTORE: i32 = 9;

    let mutex_name: Vec<u16> = OsStr::new("Local\\RiftWatchSingleInstance")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let is_updated = std::env::args().any(|a| a == "--updated");
    let max_attempts = if is_updated { 40 } else { 4 };

    for attempt in 0..max_attempts {
        let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 0, mutex_name.as_ptr()) };
        if handle.is_null() {
            return false;
        }

        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS && is_updated {
            // Started by the updater: the old copy is still closing. Wait for it (up to ~12 s),
            // never hand over to its window, then start normally.
            unsafe { CloseHandle(handle); }
            std::thread::sleep(std::time::Duration::from_millis(300));
            continue;
        }

        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            let win_title: Vec<u16> = OsStr::new("RiftWatch")
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let mut hwnd = unsafe { FindWindowW(std::ptr::null(), win_title.as_ptr()) };
            if hwnd.is_null() {
                let win_title2: Vec<u16> = OsStr::new("RiftWatch - LoL Esports Companion")
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                hwnd = unsafe { FindWindowW(std::ptr::null(), win_title2.as_ptr()) };
            }
            if !hwnd.is_null() {
                unsafe {
                    ShowWindow(hwnd, SW_RESTORE);
                    SetForegroundWindow(hwnd);
                    CloseHandle(handle);
                }
                return true;
            }

            // Window is null: previous instance is still shutting down
            unsafe { CloseHandle(handle); }
            if attempt + 1 < max_attempts {
                std::thread::sleep(std::time::Duration::from_millis(300));
                continue;
            }
            return true;
        }

        // Successfully acquired primary instance mutex
        return false;
    }

    false
}

#[cfg(target_os = "windows")]
fn spawn_global_hotkey_listener(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use std::os::raw::c_int;
        extern "system" {
            fn RegisterHotKey(hWnd: *mut std::ffi::c_void, id: c_int, fsModifiers: u32, vk: u32) -> i32;
            fn UnregisterHotKey(hWnd: *mut std::ffi::c_void, id: c_int) -> i32;
            fn GetMessageW(lpMsg: *mut Msg, hWnd: *mut std::ffi::c_void, wMsgFilterMin: u32, wMsgFilterMax: u32) -> i32;
        }

        #[repr(C)]
        struct Point {
            x: i32,
            y: i32,
        }

        #[repr(C)]
        struct Msg {
            hwnd: *mut std::ffi::c_void,
            message: u32,
            wparam: usize,
            lparam: isize,
            time: u32,
            pt: Point,
        }

        const MOD_ALT: u32 = 0x0001;
        const MOD_SHIFT: u32 = 0x0004;
        const MOD_NOREPEAT: u32 = 0x4000;
        const VK_L: u32 = 0x4C;
        const WM_HOTKEY: u32 = 0x0312;
        const HOTKEY_ID: c_int = 0x71F7; // 'RIFT'

        // Register Alt+Shift+L
        let res = unsafe { RegisterHotKey(std::ptr::null_mut(), HOTKEY_ID, MOD_ALT | MOD_SHIFT | MOD_NOREPEAT, VK_L) };
        if res == 0 {
            unsafe { RegisterHotKey(std::ptr::null_mut(), HOTKEY_ID, MOD_ALT | MOD_SHIFT, VK_L); }
        }

        let mut msg: Msg = unsafe { std::mem::zeroed() };
        while unsafe { GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) } > 0 {
            if msg.message == WM_HOTKEY && msg.wparam == HOTKEY_ID as usize {
                if let Some(w) = app.get_webview_window("main") {
                    let is_vis = w.is_visible().unwrap_or(false);
                    let is_foc = w.is_focused().unwrap_or(false);
                    if is_vis && is_foc {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
            }
        }

        unsafe { UnregisterHotKey(std::ptr::null_mut(), HOTKEY_ID); }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    {
        let args: Vec<String> = std::env::args().collect();
        if let Some(i) = args.iter().position(|a| a == "--relaunch-after") {
            relaunch_helper(&args[i + 1..]);
            return;
        }
    }

    #[cfg(target_os = "windows")]
    if is_another_instance_running() {
        return;
    }

    // Remove the previous version left beside us by the last update (it may still be closing).
    if let Ok(exe) = std::env::current_exe() {
        let old = update::old_exe_path(&exe);
        if old.exists() {
            std::thread::spawn(move || {
                for _ in 0..20 {
                    if std::fs::remove_file(&old).is_ok() || !old.exists() {
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            });
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            show_ticker,
            hide_ticker,
            set_ticker_topmost,
            start_window_drag,
            show_main,
            hide_main,
            set_compact_mode,
            quit_app,
            open_external_url,
            set_close_to_tray,
            send_notification,
            set_autostart,
            apply_app_update
        ])
        .setup(|app| {
            #[cfg(target_os = "windows")]
            spawn_global_hotkey_listener(app.handle().clone());

            // Launched by "Start with Windows": stay quietly in the tray
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            restore_window_place(app.handle(), "main");
            restore_window_place(app.handle(), "ticker");
            // Restarted by the updater: come back in front, where the old window was
            if std::env::args().any(|a| a == "--updated") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            } else if !std::env::args().any(|a| a == "--minimized") {
                // A normal launch: the main window gets the keyboard, not the hidden HUD window
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_focus();
                }
            }
            let show_i = MenuItem::with_id(app, "show", "Open RiftWatch", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Hide to Tray", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;

            let nav_live = MenuItem::with_id(app, "nav_live", "🔴 Live Matches", true, None::<&str>)?;
            let nav_schedule = MenuItem::with_id(app, "nav_schedule", "📅 Schedule & Results", true, None::<&str>)?;
            let nav_stats = MenuItem::with_id(app, "nav_stats", "📊 Pro Stats", true, None::<&str>)?;
            let nav_stream = MenuItem::with_id(app, "nav_stream", "📺 24/7 Stream Marathon", true, None::<&str>)?;
            let nav_watchlist = MenuItem::with_id(app, "nav_watchlist", "⭐ Watchlist & Teams", true, None::<&str>)?;
            let nav_news = MenuItem::with_id(app, "nav_news", "📰 News & Intel", true, None::<&str>)?;
            let nav_settings = MenuItem::with_id(app, "nav_settings", "⚙ Settings", true, None::<&str>)?;
            let sep2 = PredefinedMenuItem::separator(app)?;

            let toggle_hud = MenuItem::with_id(app, "toggle_hud", "📌 Toggle Desktop HUD", true, None::<&str>)?;
            let sep3 = PredefinedMenuItem::separator(app)?;

            let stream_twitch = MenuItem::with_id(app, "stream_twitch", "▶ Watch 24/7 on Twitch", true, None::<&str>)?;
            let stream_youtube = MenuItem::with_id(app, "stream_youtube", "▶ Watch 24/7 on YouTube", true, None::<&str>)?;
            let stream_sched = MenuItem::with_id(app, "stream_sched", "🌐 Full Schedule (lolworlds.com)", true, None::<&str>)?;
            let kofi_support = MenuItem::with_id(app, "kofi_support", "☕ Support on Ko-fi", true, None::<&str>)?;
            let sep4 = PredefinedMenuItem::separator(app)?;

            let quit_i = MenuItem::with_id(app, "quit", "Quit RiftWatch", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &show_i,
                    &hide_i,
                    &sep1,
                    &nav_live,
                    &nav_schedule,
                    &nav_stats,
                    &nav_stream,
                    &nav_watchlist,
                    &nav_news,
                    &nav_settings,
                    &sep2,
                    &toggle_hud,
                    &sep3,
                    &stream_twitch,
                    &stream_youtube,
                    &stream_sched,
                    &kofi_support,
                    &sep4,
                    &quit_i,
                ],
            )?;

            let tray_icon = match tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")) {
                Ok(img) => Some(img),
                Err(_) => app.default_window_icon().cloned(),
            };

            let mut builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("RiftWatch - LoL Esports Companion")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                        "nav_live" | "nav_schedule" | "nav_stats" | "nav_stream" | "nav_watchlist" | "nav_news" | "nav_settings" => {
                            let tab = match event.id.as_ref() {
                                "nav_live" => "live",
                                "nav_schedule" => "schedule",
                                "nav_stats" => "stats",
                                "nav_stream" => "stream",
                                "nav_watchlist" => "watchlist",
                                "nav_news" => "news",
                                "nav_settings" => "settings",
                                _ => "live",
                            };
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                                let _ = w.emit("navigate_tab", tab);
                            }
                        }
                        "toggle_hud" => {
                            // Let the main window flip the setting so the toggle and Settings stay in sync.
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.emit("toggle_hud", ());
                            } else if let Some(w) = app.get_webview_window("ticker") {
                                if w.is_visible().unwrap_or(false) {
                                    let _ = w.hide();
                                } else {
                                    let _ = w.show();
                                }
                            }
                        }
                        "stream_twitch" => {
                            open_url_checked(app, "https://www.twitch.tv/LoLWorldChampionship");
                        }
                        "stream_youtube" => {
                            open_url_checked(app, "https://www.youtube.com/@LoLWorldChampionships/live");
                        }
                        "stream_sched" => {
                            open_url_checked(app, "https://lolworlds.com");
                        }
                        "kofi_support" => {
                            open_url_checked(app, "https://ko-fi.com/monocle");
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                    }
                });

            if let Some(icon) = tray_icon {
                builder = builder.icon(icon);
            }

            let _ = builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Moved(pos) = event {
                if window.label() == "main" || window.label() == "ticker" {
                    save_window_place(window, pos.x, pos.y);
                }
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                        api.prevent_close();
                        let _ = window.hide();
                        tell_once_about_tray(window.app_handle());
                    } else {
                        window.app_handle().exit(0);
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // After an update, start the new version only once every window is gone. Versions
            // 0.3.12 and earlier hand over to any open "RiftWatch" window and quit, so starting
            // it any earlier leaves nothing running.
            if let tauri::RunEvent::Exit = event {
                if let Some((helper, target)) = RELAUNCH_AFTER_EXIT.lock().ok().and_then(|mut p| p.take()) {
                    // Our old binary (moved aside to *.old) waits for this process to be fully
                    // gone, then starts the new version. See relaunch_helper().
                    let _ = std::process::Command::new(helper)
                        .arg("--relaunch-after")
                        .arg(std::process::id().to_string())
                        .arg(target)
                        .spawn();
                }
            }
        });
}

/// Set by the updater: (helper exe, freshly installed exe) to run when this process exits.
static RELAUNCH_AFTER_EXIT: std::sync::Mutex<Option<(std::path::PathBuf, std::path::PathBuf)>> =
    std::sync::Mutex::new(None);

/// `RiftWatch.exe.old --relaunch-after <pid> <new exe>`: wait (up to 30 s) for the updating
/// process to exit, then start the new version. Runs before any window or single-instance check.
#[cfg(target_os = "windows")]
fn relaunch_helper(args: &[String]) {
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut std::ffi::c_void;
        fn WaitForSingleObject(handle: *mut std::ffi::c_void, ms: u32) -> u32;
        fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
    }
    const SYNCHRONIZE: u32 = 0x0010_0000;
    let (Some(pid), Some(target)) = (args.first().and_then(|p| p.parse::<u32>().ok()), args.get(1)) else {
        return;
    };
    unsafe {
        let h = OpenProcess(SYNCHRONIZE, 0, pid);
        if !h.is_null() {
            WaitForSingleObject(h, 30_000);
            CloseHandle(h);
        }
    }
    std::thread::sleep(std::time::Duration::from_millis(300));
    let _ = std::process::Command::new(target).arg("--updated").spawn();
}
