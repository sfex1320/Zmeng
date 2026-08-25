pub mod core;
pub mod file;
pub mod global_state;
pub mod hot_load_page;
pub mod http_services;
pub mod listen_key;
pub mod ocr;
pub mod plugin;
pub mod screenshot;
pub mod scroll_screenshot;
pub mod video_record;
pub mod webview;

use snow_shot_app_services::listen_mouse_service;
use snow_shot_tauri_commands_core::{FullScreenDrawWindowLabels, VideoRecordWindowLabels};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;

use tauri::Manager;

use snow_shot_app_os::ui_automation::UIElements;
use snow_shot_app_scroll_screenshot_service::scroll_screenshot_capture_service;
use snow_shot_app_scroll_screenshot_service::scroll_screenshot_image_service;
use snow_shot_app_scroll_screenshot_service::scroll_screenshot_service;
use snow_shot_app_services::file_cache_service;
use snow_shot_app_services::free_drag_window_service;
use snow_shot_app_services::hot_load_page_service;
use snow_shot_app_services::listen_key_service;
use snow_shot_app_services::ocr_service::OcrService;
use snow_shot_app_services::resize_window_service;
use snow_shot_app_services::video_record_service;
use snow_shot_app_shared::EnigoManager;
use snow_shot_global_state::{CaptureState, ReadClipboardState, WebViewSharedBufferState};
use snow_shot_plugin_service::plugin_service;

#[cfg(feature = "dhat-heap")]
pub static PROFILER: std::sync::LazyLock<Mutex<Option<dhat::Profiler>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run_with_auto_restart() {
    let mut attempt: u32 = 0;
    // 滑动窗口：记录最近各次崩溃时刻，retain 窗口内的，用于判断"密集风暴"
    let mut crash_times: Vec<std::time::Instant> = Vec::new();

    loop {
        attempt += 1;
        let is_first_attempt = attempt == 1;

        // 第二防线：兜住 .run() 之外的 panic（setup 回调 / IPC handler / builder 构造）。
        // 第一防线是 tao 自身 catch_unwind 把事件循环 re-entrancy panic 转成 .run() 的 Err
        // （见 build_and_run_app 末尾）。原 release panic="abort" 让两道防线都失效，故改为 unwind。
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            build_and_run_app(is_first_attempt)
        })) {
            Ok(AppRunOutcome::CleanExit) => return,
            Ok(AppRunOutcome::Panicked { info }) => {
                log::warn!(
                    "[auto-restart] event loop panicked (attempt {}): {}",
                    attempt, info
                );
            }
            Err(payload) => {
                let msg = payload
                    .downcast_ref::<&'static str>()
                    .copied()
                    .or_else(|| payload.downcast_ref::<String>().map(|s| s.as_str()))
                    .unwrap_or("<non-string panic>");
                log::warn!(
                    "[auto-restart] catch_unwind caught panic (attempt {}): {}",
                    attempt, msg
                );
            }
        }

        // 防崩溃风暴（双闸）：
        //  (1) 滑动窗口：最近 RESTORE_WINDOW_SECS 内崩溃 > MAX_RESTARTS 次 → 密集风暴，放弃。
        //  (2) 绝对上限：总崩溃次数 > ABSOLUTE_MAX_RESTARTS → 慢崩溃长期累计也放弃。
        // 双闸避免"单一窗口 + 命中重置"导致的慢崩溃(间隔≥60s)永不放弃死循环。
        let now = std::time::Instant::now();
        crash_times.push(now);
        crash_times
            .retain(|t| now.duration_since(*t) < std::time::Duration::from_secs(RESTORE_WINDOW_SECS));
        if crash_times.len() > MAX_RESTARTS || attempt > ABSOLUTE_MAX_RESTARTS {
            append_final_crash_notice(attempt);
            return;
        }

        let backoff_ms = BASE_BACKOFF_MS * 2u64.pow((attempt - 1).min(6));
        log::info!("[auto-restart] restart #{} after {}ms", attempt, backoff_ms);
        std::thread::sleep(std::time::Duration::from_millis(backoff_ms));
    }
}

/// 超过重启上限时，写一条"放弃自愈"通知到崩溃日志（exe 同级 + temp 回退）。
fn append_final_crash_notice(attempt: u32) {
    use std::io::Write;
    let notice = format!(
        "==== ZMENG AUTO-RESTART GAVE UP ====\n重启 {} 次仍在 {}s 内崩溃，放弃自愈。\n\n",
        attempt, RESTORE_WINDOW_SECS
    );
    let mut targets: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            targets.push(dir.join("zmeng-crash.log"));
        }
    }
    targets.push(std::env::temp_dir().join("zmeng-crash.log"));
    for p in targets {
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&p)
        {
            let _ = f.write_all(notice.as_bytes());
            let _ = f.flush();
            break;
        }
    }
}

const MAX_RESTARTS: usize = 5;
const ABSOLUTE_MAX_RESTARTS: u32 = 20;
const RESTORE_WINDOW_SECS: u64 = 300;
const BASE_BACKOFF_MS: u64 = 500;

enum AppRunOutcome {
    CleanExit,
    Panicked { info: String },
}

/// 构建并运行一次 Tauri 应用。.run() 正常返回（用户 exit_app）→ CleanExit；
/// .run() 返回 Err（tao 把事件循环 re-entrancy panic 转成 Err）→ Panicked。
fn build_and_run_app(is_first_attempt: bool) -> AppRunOutcome {
    // 尽早设置进程 Per-Monitor-V2 DPI 感知：高分屏(4K)+ 系统缩放下，若进程未 DPI 感知会被系统
    // 虚拟化，导致全屏截图只截到缩小后的低分辨率（如 4K→1280）且模糊。必须在创建窗口前调用。
    #[cfg(target_os = "windows")]
    snow_shot_app_os::utils::set_process_per_monitor_dpi_aware();

    let ocr_instance = Mutex::new(OcrService::new());
    let video_record_service = Mutex::new(video_record_service::VideoRecordService::new());
    let hot_load_page_service = Arc::new(hot_load_page_service::HotLoadPageService::new());
    let enigo_instance = Mutex::new(EnigoManager::new());

    let ui_elements = Mutex::new(UIElements::new());

    let scroll_screenshot_service =
        Mutex::new(scroll_screenshot_service::ScrollScreenshotService::new());
    let scroll_screenshot_image_service =
        Mutex::new(scroll_screenshot_image_service::ScrollScreenshotImageService::new());
    let scroll_screenshot_capture_service =
        Mutex::new(scroll_screenshot_capture_service::ScrollScreenshotCaptureService::new());
    #[cfg(target_os = "windows")]
    let shared_buffer_service = Arc::new(snow_shot_webview::SharedBufferService::new());

    let free_drag_window_service =
        Mutex::new(free_drag_window_service::FreeDragWindowService::new());
    let resize_window_service = Mutex::new(resize_window_service::ResizeWindowService::new());

    let listen_key_service = Mutex::new(listen_key_service::ListenKeyService::new());
    let listen_mouse_service = Mutex::new(listen_mouse_service::ListenMouseService::new());

    let file_cache_service = Arc::new(file_cache_service::FileCacheService::new());

    let enable_run_log = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let enable_run_log_clone = enable_run_log.clone();

    let plugin_service = Arc::new(plugin_service::PluginService::new());

    let capture_state = Mutex::new(CaptureState { capturing: false });

    let full_screen_draw_window_labels = Mutex::new(Option::<FullScreenDrawWindowLabels>::None);
    let video_record_window_label = Mutex::new(Option::<VideoRecordWindowLabels>::None);

    let webview_shared_buffer_state = WebViewSharedBufferState::new(false);

    let read_clipboard_state = Mutex::new(ReadClipboardState { reading: false });

    // ZMENG: 记录唤起剪贴板侧栏前的前台窗口，用于直接粘贴
    let foreground_window_handle = core::ForegroundWindowHandle::new();

    use tauri_plugin_log::{Target, TargetKind};

    // let current_date = chrono::Local::now().format("%Y-%m-%d").to_string();

    // log 文件可能因为某些异常情况不断输出，造成日志文件过大
    // 先在 release 下屏蔽日志输出
    // 注意不要移除 log 插件的初始化,避免前端调用 log 时保存再次报错,持续循环报错
    let log_targets: Vec<Target> = if cfg!(debug_assertions) {
        vec![
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir { file_name: None }),
            Target::new(TargetKind::Webview),
        ]
    } else {
        vec![Target::new(TargetKind::LogDir { file_name: None })]
    };
    let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    #[allow(unused_mut)]
    let mut app_builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION,
                )
                .with_filter(|label| label == "main")
                .build(),
        )
        .plugin(tauri_plugin_os::init());
    // 单例锁只在首次迭代注册：catch_unwind 不释放进程级 mutex，同进程重启时重复 init
    // 会发现 mutex 已存在 → 回调里 expect("no main window") 二次 panic 或 process::exit。
    // 重启窗口内对外部新实例的拦截短暂失效（可接受，重启仅几秒）。
    if is_first_attempt {
        app_builder = app_builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            // 容错：重启迭代期间若上一轮残留的隐藏窗口收到外部实例的 WM_COPYDATA，
            // main 窗口引用可能已失效。用 if let + 忽略错误，避免 expect/unwrap 在
            // extern "system" 窗口过程回调里 panic（越过 FFI 边界一律 abort，catch_unwind 抓不到）。
            if let Some(app_window) = app.get_webview_window("main") {
                let _ = app_window.show();
                let _ = app_window.unminimize();
                let _ = app_window.set_focus();
            }
        }));
    }
    app_builder = app_builder
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // ZMENG：原生系统级拖放（把剪贴板图片/截图/文件作为真实文件拖入其它应用）
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--auto_start"]),
        ))
        .plugin(tauri_plugin_clipboard::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .targets(log_targets)
                .level(log_level)
                .filter(move |_| {
                    #[cfg(debug_assertions)]
                    {
                        return true;
                    }

                    #[cfg(not(debug_assertions))]
                    {
                        return enable_run_log.load(std::sync::atomic::Ordering::Relaxed);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // ZMENG: 便携版首次启动自动在桌面创建快捷方式（已存在则跳过）。COM 已由 Tauri 初始化。
            #[cfg(target_os = "windows")]
            snow_shot_app_os::utils::create_desktop_shortcut_if_portable();

            let main_window = app
                .get_webview_window("main")
                .expect("[lib::setup] no main window");

            #[cfg(target_os = "windows")]
            {
                match main_window.set_decorations(false) {
                    Ok(_) => (),
                    Err(_) => {
                        log::error!("[init_main_window] Failed to set decorations");
                    }
                }
            }

            #[cfg(target_os = "macos")]
            {
                // macOS 下不在 dock 显示
                app.set_activation_policy(tauri::ActivationPolicy::Prohibited);
            }

            // 监听窗口关闭事件，拦截关闭按钮
            let window_clone = main_window.clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();

                    #[cfg(target_os = "windows")]
                    {
                        if let Err(e) = window_clone.hide() {
                            log::error!("[setup] hide window error: {:?}", e);
                        }
                    }

                    #[cfg(target_os = "macos")]
                    {
                        if let Err(e) = window_clone.hide() {
                            log::error!("[setup] hide window error: {:?}", e);
                        }
                    }

                    window_clone.emit("on-hide-main-window", ()).unwrap();
                }
            });

            // 如果是调试模式，则显示窗口
            #[cfg(debug_assertions)]
            {
                main_window.show().unwrap();
            }

            Ok(())
        })
        .manage(ui_elements)
        .manage(ocr_instance)
        .manage(enigo_instance)
        .manage(scroll_screenshot_service)
        .manage(scroll_screenshot_image_service)
        .manage(scroll_screenshot_capture_service)
        .manage(video_record_service)
        .manage(free_drag_window_service)
        .manage(resize_window_service)
        .manage(listen_key_service)
        .manage(listen_mouse_service)
        .manage(file_cache_service)
        .manage(enable_run_log_clone)
        .manage(plugin_service)
        .manage(full_screen_draw_window_labels)
        .manage(webview_shared_buffer_state)
        .manage(hot_load_page_service)
        .manage(video_record_window_label)
        .manage(capture_state)
        .manage(read_clipboard_state)
        .manage(foreground_window_handle)
        .invoke_handler(tauri::generate_handler![
            screenshot::capture_current_monitor,
            screenshot::capture_all_monitors,
            screenshot::capture_focused_window,
            screenshot::get_window_elements,
            screenshot::init_ui_elements,
            screenshot::get_element_from_position,
            screenshot::init_ui_elements_cache,
            screenshot::get_mouse_position,
            screenshot::create_draw_window,
            screenshot::switch_always_on_top,
            screenshot::set_draw_window_style,
            screenshot::capture_full_screen,
            file::save_file,
            file::write_file,
            file::copy_file,
            file::remove_file,
            file::create_dir,
            file::remove_dir,
            file::get_app_config_dir,
            file::get_app_config_base_dir,
            file::create_local_config_dir,
            ocr::ocr_detect,
            #[cfg(target_os = "windows")]
            ocr::ocr_detect_with_shared_buffer,
            ocr::ocr_init,
            ocr::ocr_release,
            core::exit_app,
            core::start_free_drag,
            core::start_resize_window,
            core::close_window_after_delay,
            core::get_selected_text,
            core::set_enable_proxy,
            core::scroll_through,
            core::auto_scroll_through,
            core::click_through,
            core::create_fixed_content_window,
            core::read_image_from_clipboard,
            core::create_full_screen_draw_window,
            core::close_full_screen_draw_window,
            core::get_current_monitor_info,
            core::get_monitors_bounding_box,
            core::send_new_version_notification,
            core::create_video_record_window,
            core::close_video_record_window,
            core::has_video_record_window,
            core::has_focused_full_screen_window,
            core::set_current_window_always_on_top,
            core::auto_start_enable,
            core::auto_start_disable,
            core::restart_with_admin,
            core::write_bitmap_image_to_clipboard,
            #[cfg(target_os = "windows")]
            core::write_bitmap_image_to_clipboard_with_shared_buffer,
            core::retain_dir_files,
            core::is_admin,
            core::set_run_log,
            core::set_exclude_from_capture,
            core::show_main_window,
            core::set_window_rect,
            core::get_active_window_info,
            core::capture_foreground_window,
            core::paste_to_active_window,
            core::clipboard_self_write_mark,
            core::clipboard_self_write_recent,
            core::ai_local_request,
            core::prepare_drag_image,
            core::prepare_drag_files,
            core::pick_image_preview,
            scroll_screenshot::scroll_screenshot_get_image_data,
            scroll_screenshot::scroll_screenshot_init,
            scroll_screenshot::scroll_screenshot_capture,
            scroll_screenshot::scroll_screenshot_handle_image,
            scroll_screenshot::scroll_screenshot_save_to_file,
            scroll_screenshot::scroll_screenshot_save_to_clipboard,
            scroll_screenshot::scroll_screenshot_get_size,
            scroll_screenshot::scroll_screenshot_clear,
            video_record::video_record_start,
            video_record::video_record_stop,
            video_record::video_record_pause,
            video_record::video_record_resume,
            video_record::video_record_kill,
            video_record::video_record_get_microphone_device_names,
            video_record::video_record_init,
            listen_key::listen_key_start,
            listen_key::listen_key_stop,
            listen_key::listen_key_stop_by_window_label,
            listen_key::listen_mouse_start,
            listen_key::listen_mouse_stop,
            listen_key::listen_mouse_stop_by_window_label,
            file::text_file_read,
            file::text_file_write,
            file::text_file_clear,
            file::is_portable_app,
            plugin::plugin_init,
            plugin::plugin_get_plugins_status,
            plugin::plugin_register_plugin,
            plugin::plugin_install_plugin,
            plugin::plugin_uninstall_plugin,
            webview::create_webview_shared_buffer,
            webview::set_support_webview_shared_buffer,
            #[cfg(target_os = "windows")]
            webview::create_webview_shared_buffer_channel,
            #[cfg(target_os = "windows")]
            core::write_image_pixels_to_clipboard_with_shared_buffer,
            http_services::upload_to_s3,
            hot_load_page::hot_load_page_init,
            hot_load_page::hot_load_page_add_page,
            global_state::set_capture_state,
            global_state::get_capture_state,
            global_state::set_read_clipboard_state,
            global_state::get_read_clipboard_state,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let window_label = window.label().to_owned();

                // 用 tokio 异步进程实现清除有异步所有权问题，通知前端清理，简单处理
                match window
                    .app_handle()
                    .emit("listen-key-service:stop", window_label.clone())
                {
                    Ok(_) => (),
                    Err(e) => {
                        log::error!("[listen_key_service:stop] Failed to emit event: {}", e);
                    }
                }
                match window
                    .app_handle()
                    .emit("listen-mouse-service:stop", window_label.clone())
                {
                    Ok(_) => (),
                    Err(e) => {
                        log::error!("[listen_mouse_service:stop] Failed to emit event: {}", e);
                    }
                }
            }
        });

    #[cfg(target_os = "windows")]
    {
        app_builder = app_builder.manage(shared_buffer_service);
    }

    match app_builder.run(tauri::generate_context!()) {
        Ok(()) => AppRunOutcome::CleanExit,
        Err(e) => AppRunOutcome::Panicked {
            info: e.to_string(),
        },
    }
}
