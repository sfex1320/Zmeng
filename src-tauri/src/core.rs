use zmeng_app_shared::{ElementRect, EnigoManager};
use zmeng_global_state::WebViewSharedBufferState;
use zmeng_tauri_commands_core::{
    FullScreenDrawWindowLabels, MonitorsBoundingBox, VideoRecordWindowLabels,
};
use std::{path::PathBuf, sync::Arc};
use tauri::{Manager, PhysicalPosition, PhysicalSize, command, ipc::Response};
use tauri_plugin_autostart::ManagerExt;
use tokio::sync::Mutex;

#[command]
pub async fn exit_app(handle: tauri::AppHandle) {
    #[cfg(feature = "dhat-heap")]
    drop(crate::PROFILER.lock().await.take());

    zmeng_tauri_commands_core::exit_app(handle).await;
}

#[command]
pub async fn get_selected_text() -> String {
    let mut text = zmeng_tauri_commands_core::get_selected_text().await;
    if text.is_empty() {
        tokio::time::sleep(tokio::time::Duration::from_millis(83)).await;
        text = zmeng_tauri_commands_core::get_selected_text().await;
    }

    text
}

#[command]
pub async fn set_enable_proxy(enable: bool, host: String) -> Result<(), ()> {
    zmeng_tauri_commands_core::set_enable_proxy(enable, host).await
}

/// 鼠标滚轮穿透
#[command]
pub async fn scroll_through(
    window: tauri::Window,
    enigo_manager: tauri::State<'_, Mutex<EnigoManager>>,
    length: i32,
) -> Result<(), String> {
    zmeng_tauri_commands_core::scroll_through(window, enigo_manager, length).await
}

/// 鼠标滚轮穿透
#[command]
pub async fn auto_scroll_through(
    enigo_manager: tauri::State<'_, Mutex<EnigoManager>>,
    direction: String,
    length: i32,
) -> Result<(), String> {
    zmeng_tauri_commands_core::auto_scroll_through(enigo_manager, direction, length).await
}

/// 鼠标滚轮穿透
#[command]
pub async fn click_through(window: tauri::Window) -> Result<(), ()> {
    zmeng_tauri_commands_core::click_through(window).await
}

/// 创建内容固定到屏幕的窗口
#[command]
pub async fn create_fixed_content_window(
    app: tauri::AppHandle,
    hot_load_page_service: tauri::State<
        '_,
        Arc<zmeng_app_services::hot_load_page_service::HotLoadPageService>,
    >,
    scroll_screenshot: bool,
) -> Result<(), String> {
    zmeng_tauri_commands_core::create_fixed_content_window(
        app,
        hot_load_page_service,
        scroll_screenshot,
    )
    .await
}

#[command]
pub async fn read_image_from_clipboard(
    handle: tauri::AppHandle,
    #[allow(unused_variables)] webview_shared_buffer_state: tauri::State<
        '_,
        WebViewSharedBufferState,
    >,
    #[allow(unused_variables)] webview: tauri::Webview,
) -> Result<Response, String> {
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_clipboard_manager::ClipboardExt;

        if *webview_shared_buffer_state.enable.read().await {
            let image_data = match handle.clipboard().read_image() {
                Ok(image) => image,
                Err(_) => {
                    return Ok(Response::new(Vec::new()));
                }
            };

            let mut extra_data = vec![0; 8];
            unsafe {
                let image_width = image_data.width();
                let image_height = image_data.height();
                std::ptr::copy_nonoverlapping(
                    image_width.to_le_bytes().as_ptr(),
                    extra_data.as_mut_ptr(),
                    4,
                );
                std::ptr::copy_nonoverlapping(
                    image_height.to_le_bytes().as_ptr(),
                    extra_data.as_mut_ptr().add(4),
                    4,
                );
            }

            zmeng_webview::create_shared_buffer(
                webview,
                image_data.rgba(),
                &extra_data,
                "read_image_from_clipboard".to_string(),
            )
            .await?;

            return Ok(Response::new(vec![1]));
        }
    }

    let clipboard = handle.state::<tauri_plugin_clipboard::Clipboard>();
    let image_data = match tauri_plugin_clipboard::Clipboard::read_image_binary(&clipboard) {
        Ok(image_data) => image_data,
        Err(_) => return Ok(Response::new(Vec::new())),
    };

    return Ok(Response::new(image_data));
}

/// 创建全屏绘制窗口
#[command]
pub async fn create_full_screen_draw_window(
    app: tauri::AppHandle,
    full_screen_draw_window_labels: tauri::State<'_, Mutex<Option<FullScreenDrawWindowLabels>>>,
    hot_load_page_service: tauri::State<
        '_,
        Arc<zmeng_app_services::hot_load_page_service::HotLoadPageService>,
    >,
) -> Result<(), String> {
    zmeng_tauri_commands_core::create_full_screen_draw_window(
        app,
        full_screen_draw_window_labels,
        hot_load_page_service,
    )
    .await
}

#[command]
pub async fn close_full_screen_draw_window(
    app: tauri::AppHandle,
    full_screen_draw_window_labels: tauri::State<'_, Mutex<Option<FullScreenDrawWindowLabels>>>,
) -> Result<(), String> {
    zmeng_tauri_commands_core::close_full_screen_draw_window(
        app,
        full_screen_draw_window_labels,
    )
    .await
}

#[command]
pub async fn get_current_monitor_info() -> Result<zmeng_tauri_commands_core::MonitorInfo, String>
{
    zmeng_tauri_commands_core::get_current_monitor_info().await
}

#[command]
pub async fn get_monitors_bounding_box(
    app: tauri::AppHandle,
    region: Option<ElementRect>,
    enable_multiple_monitor: bool,
) -> Result<MonitorsBoundingBox, String> {
    zmeng_tauri_commands_core::get_monitors_bounding_box(&app, region, enable_multiple_monitor)
        .await
}

#[command]
pub async fn send_new_version_notification(title: String, body: String) {
    zmeng_tauri_commands_core::send_new_version_notification(title, body).await;
}

/// 创建屏幕录制窗口
#[command]
pub async fn create_video_record_window(
    app: tauri::AppHandle,
    video_record_window_label: tauri::State<'_, Mutex<Option<VideoRecordWindowLabels>>>,
    hot_load_page_service: tauri::State<
        '_,
        Arc<zmeng_app_services::hot_load_page_service::HotLoadPageService>,
    >,
    select_rect_min_x: i32,
    select_rect_min_y: i32,
    select_rect_max_x: i32,
    select_rect_max_y: i32,
) -> Result<(), String> {
    zmeng_tauri_commands_core::create_video_record_window(
        app,
        video_record_window_label,
        hot_load_page_service,
        select_rect_min_x,
        select_rect_min_y,
        select_rect_max_x,
        select_rect_max_y,
    )
    .await;
    Ok(())
}

#[command]
pub async fn close_video_record_window(
    app: tauri::AppHandle,
    video_record_window_label: tauri::State<'_, Mutex<Option<VideoRecordWindowLabels>>>,
) -> Result<(), String> {
    zmeng_tauri_commands_core::close_video_record_window(app, video_record_window_label).await
}

#[command]
pub async fn has_video_record_window(
    video_record_window_labels: tauri::State<'_, Mutex<Option<VideoRecordWindowLabels>>>,
) -> Result<bool, String> {
    zmeng_tauri_commands_core::has_video_record_window(video_record_window_labels).await
}

#[command]
pub async fn start_free_drag(
    window: tauri::Window,
    free_drag_window_service: tauri::State<
        '_,
        Mutex<zmeng_app_services::free_drag_window_service::FreeDragWindowService>,
    >,
) -> Result<(), String> {
    zmeng_tauri_commands_core::start_free_drag(window, free_drag_window_service).await
}

#[command]
pub async fn start_resize_window(
    window: tauri::Window,
    resize_window_service: tauri::State<
        '_,
        Mutex<zmeng_app_services::resize_window_service::ResizeWindowService>,
    >,
    side: zmeng_app_services::resize_window_service::ResizeWindowSide,
    spect_ratio: f64,
    min_width: f64,
    max_width: f64,
) -> Result<(), String> {
    zmeng_tauri_commands_core::start_resize_window(
        window,
        resize_window_service,
        side,
        spect_ratio,
        min_width,
        max_width,
    )
    .await
}

#[command]
pub async fn set_current_window_always_on_top(
    window: tauri::WebviewWindow,
    allow_input_method_overlay: bool,
) -> Result<(), String> {
    zmeng_tauri_commands_core::set_current_window_always_on_top(
        window,
        allow_input_method_overlay,
    )
    .await
}

#[command]
pub async fn close_window_after_delay(window: tauri::Window, delay: u64) {
    zmeng_tauri_commands_core::close_window_after_delay(window, delay).await
}

#[command]
pub async fn auto_start_enable(app: tauri::AppHandle) -> Result<(), String> {
    let autostart_manager = app.autolaunch();

    #[cfg(not(target_os = "windows"))]
    {
        return match autostart_manager.enable() {
            Ok(_) => Ok(()),
            Err(e) => Err(format!(
                "[auto_start_enable] Failed to enable autostart: {}",
                e,
            )),
        };
    }

    #[cfg(target_os = "windows")]
    {
        // 判断是否是管理员模式
        let is_admin = match zmeng_tauri_commands_core::is_admin().await {
            Ok(is_admin) => is_admin,
            Err(_) => return Err(String::from("[auto_start_enable] Failed to check if admin")),
        };

        // 如果是管理员模式，则禁用普通的自启动方式，使用 Windows 的任务计划程序实现自启动
        if !is_admin {
            match autostart_manager.enable() {
                Ok(_) => (),
                Err(e) => {
                    return Err(format!(
                        "[auto_start_enable] Failed to enable autostart: {}",
                        e,
                    ));
                }
            }

            return Ok(());
        }

        // 禁用普通自启动方式
        match autostart_manager.disable() {
            Ok(_) => (),
            Err(e) => {
                // 如果 autostart_manager 不是设置了的状态，则可能报错
                // 所以不提前退出
                log::warn!("[auto_start_enable] Failed to disable autostart: {}", e);
            }
        }

        // 创建管理员自启动任务
        match zmeng_tauri_commands_core::create_admin_auto_start_task().await {
            Ok(_) => (),
            Err(e) => {
                return Err(format!(
                    "[auto_start_enable] Failed to create admin auto start task: {}",
                    e,
                ));
            }
        }

        Ok(())
    }
}

#[command]
pub async fn auto_start_disable(app: tauri::AppHandle) -> Result<(), String> {
    let autostart_manager = app.autolaunch();

    // 先禁用普通自启动方式
    match autostart_manager.disable() {
        Ok(_) => (),
        Err(e) => {
            log::warn!("[auto_start_disable] Failed to disable autostart: {}", e);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        // 判断是否是管理员模式
        let is_admin = match zmeng_tauri_commands_core::is_admin().await {
            Ok(is_admin) => is_admin,
            Err(_) => {
                return Err(String::from(
                    "[auto_start_disable] Failed to check if admin",
                ));
            }
        };

        if !is_admin {
            return Ok(());
        }

        // 删除管理员自启动任务
        match zmeng_tauri_commands_core::delete_admin_auto_start_task().await {
            Ok(_) => (),
            Err(e) => {
                return Err(format!(
                    "[auto_start_disable] Failed to delete admin auto start task: {}",
                    e,
                ));
            }
        }

        Ok(())
    }
}

#[command]
pub async fn restart_with_admin() -> Result<(), String> {
    zmeng_tauri_commands_core::restart_with_admin().await
}

#[command]
pub async fn write_bitmap_image_to_clipboard(
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    zmeng_tauri_commands_core::write_bitmap_image_to_clipboard(request).await
}

#[cfg(target_os = "windows")]
#[command]
pub async fn write_bitmap_image_to_clipboard_with_shared_buffer(
    shared_buffer_service: tauri::State<'_, Arc<zmeng_webview::SharedBufferService>>,
    channel_id: String,
) -> Result<(), String> {
    zmeng_app_utils::write_bitmap_image_to_clipboard_with_shared_buffer(
        shared_buffer_service,
        channel_id,
    )
    .await
}

#[command]
pub async fn retain_dir_files(dir_path: PathBuf, file_names: Vec<String>) -> Result<(), String> {
    zmeng_tauri_commands_core::retain_dir_files(dir_path, file_names).await
}

#[command]
pub async fn is_admin() -> Result<bool, String> {
    zmeng_tauri_commands_core::is_admin().await
}

#[command]
pub async fn set_run_log(
    enable_run_log: tauri::State<'_, std::sync::Arc<std::sync::atomic::AtomicBool>>,
    enable: bool,
) -> Result<(), String> {
    enable_run_log.store(enable, std::sync::atomic::Ordering::Relaxed);

    Ok(())
}

#[command]
pub async fn set_exclude_from_capture(window: tauri::Window, enable: bool) -> Result<(), String> {
    zmeng_app_utils::set_exclude_from_capture(&window, enable).await
}

#[cfg(target_os = "windows")]
#[command]
pub async fn write_image_pixels_to_clipboard_with_shared_buffer(
    app: tauri::AppHandle,
    shared_buffer_service: tauri::State<'_, Arc<zmeng_webview::SharedBufferService>>,
    channel_id: String,
) -> Result<(), String> {
    zmeng_tauri_commands_core::write_image_pixels_to_clipboard_with_shared_buffer(
        app,
        shared_buffer_service,
        channel_id,
    )
    .await
}

#[command]
pub async fn has_focused_full_screen_window() -> Result<bool, String> {
    zmeng_tauri_commands_core::has_focused_full_screen_window().await
}

#[command]
pub async fn show_main_window(app: tauri::AppHandle, auto_hide: bool) -> Result<(), String> {
    zmeng_tauri_commands_core::show_main_window(app, auto_hide).await
}

#[command]
pub async fn set_window_rect(
    window: tauri::Window,
    min_x: i32,
    min_y: i32,
    max_x: i32,
    max_y: i32,
) -> Result<(), String> {
    match window.set_size(PhysicalSize::new(max_x - min_x, max_y - min_y)) {
        Ok(_) => (),
        Err(e) => {
            return Err(format!(
                "[set_window_rect] Failed to set window size: {}",
                e
            ));
        }
    }
    match window.set_position(PhysicalPosition::new(min_x, min_y)) {
        Ok(_) => (),
        Err(e) => {
            return Err(format!(
                "[set_window_rect] Failed to set window position: {}",
                e
            ));
        }
    }

    Ok(())
}

// ===================== ZMENG 剪贴板侧栏：前台窗口 / 直接粘贴 =====================

/// 记录唤起剪贴板侧栏前的前台窗口句柄，用于「点选历史记录 -> 直接粘贴到当前应用」。
pub struct ForegroundWindowHandle(pub std::sync::Mutex<i64>);

impl ForegroundWindowHandle {
    pub fn new() -> Self {
        Self(std::sync::Mutex::new(0))
    }
}

impl Default for ForegroundWindowHandle {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(serde::Serialize)]
pub struct ActiveWindowInfo {
    pub handle: i64,
    pub title: String,
}

/// 获取当前前台窗口信息（句柄 + 标题），剪贴板监听时用于标记内容「来源」。
#[command]
pub async fn get_active_window_info() -> Result<ActiveWindowInfo, String> {
    #[cfg(target_os = "windows")]
    {
        let handle = zmeng_app_os::utils::get_foreground_window_handle();
        let title = zmeng_app_os::utils::get_window_title(handle);
        Ok(ActiveWindowInfo {
            handle: handle as i64,
            title,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(ActiveWindowInfo {
            handle: 0,
            title: String::new(),
        })
    }
}

/// 记录当前前台窗口（应在显示侧栏窗口之前调用）。
#[command]
pub async fn capture_foreground_window(
    #[allow(unused_variables)] foreground_window_handle: tauri::State<'_, ForegroundWindowHandle>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let handle = zmeng_app_os::utils::get_foreground_window_handle();
        // 跳过 ZMENG 自身窗口，避免把自己记成粘贴目标（#11）
        let pid = zmeng_app_os::utils::get_window_pid(handle);
        if handle != 0 && pid != 0 && pid != std::process::id() {
            if let Ok(mut guard) = foreground_window_handle.0.lock() {
                *guard = handle as i64;
            }
        }
    }

    Ok(())
}

/// 恢复记录的前台窗口焦点并模拟 Ctrl+V 粘贴。
#[command]
pub async fn paste_to_active_window(
    #[allow(unused_variables)] foreground_window_handle: tauri::State<'_, ForegroundWindowHandle>,
    enigo_manager: tauri::State<'_, Mutex<EnigoManager>>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let handle = foreground_window_handle
            .0
            .lock()
            .map(|guard| *guard)
            .unwrap_or(0);

        if handle != 0 {
            // 目标为管理员/高完整性窗口且本进程非管理员：注入会被 UIPI 丢弃，
            // 交回前端走「已复制，可手动 Ctrl+V」（手动按键不受 UIPI 限制）（#5）
            if zmeng_app_os::utils::is_window_paste_blocked(handle as isize) {
                return Err("paste_blocked_elevated".to_string());
            }
            // 前台切换失败则不要盲目注入，避免粘到错误窗口（#4）
            if !zmeng_app_os::utils::set_foreground_window(handle as isize) {
                return Err("paste_foreground_failed".to_string());
            }
            // 轮询确认目标窗口已真正处于前台（最长 500ms）再粘贴。
            // 此前固定等待 80ms，慢速窗口激活时焦点尚未切换完成，Ctrl+V 会落到别的窗口
            let mut foreground_ok = false;
            for _ in 0..25 {
                if zmeng_app_os::utils::get_foreground_window_handle() as i64 == handle {
                    foreground_ok = true;
                    break;
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(20)).await;
            }
            if !foreground_ok {
                return Err("paste_foreground_failed".to_string());
            }
            // 焦点就绪后再留一小段缓冲，等目标应用输入队列就绪
            tokio::time::sleep(tokio::time::Duration::from_millis(60)).await;
        }
    }

    let mut enigo = enigo_manager.lock().await;
    enigo.paste()?;

    Ok(())
}

// ===================== ZMENG 剪贴板自写标记（跨窗口去重） =====================

/// 前端在写剪贴板前调用：登记自写时间戳，剪贴板监听侧据此跳过自己写入的内容。
#[command]
pub fn clipboard_self_write_mark() {
    zmeng_app_shared::mark_clipboard_self_write();
}

/// 剪贴板监听侧调用：最近一次自写是否在有效窗口内（1500ms）。
#[command]
pub fn clipboard_self_write_recent() -> bool {
    zmeng_app_shared::is_clipboard_self_write_recent()
}

// ===================== ZMENG AI：本地/直连 HTTP 请求 =====================

#[derive(serde::Serialize)]
pub struct AiHttpResponse {
    pub status: u16,
    pub body: String,
}

/// ZMENG：用 reqwest 直连发起一次 AI HTTP 请求（GET / POST），专供本地后端（如本地 Ollama）。
///
/// 解决两件事：
/// 1) `.no_proxy()` —— 绕过 Windows 系统代理（Clash），否则 localhost 会被代理成 502；
/// 2) 不附带 `Origin` 头 —— 打包版 webview 来源是 `http://tauri.localhost`，会被 Ollama 的 CORS
///    以非白名单来源拒绝（403）；reqwest 默认不加 Origin，故可直连放行（dev 下来源是 localhost:端口
///    被放行，所以 dev 正常、打包异常，正是此处差异）。
#[command]
pub async fn ai_local_request(
    method: String,
    url: String,
    api_key: String,
    body: Option<String>,
) -> Result<AiHttpResponse, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| format!("[ai_local_request] build client failed: {}", e))?;

    let mut req = if method.eq_ignore_ascii_case("POST") {
        client.post(&url)
    } else {
        client.get(&url)
    };

    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }
    if let Some(b) = body {
        req = req.header("Content-Type", "application/json").body(b);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("[ai_local_request] request failed: {}", e))?;
    let status = resp.status().as_u16();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("[ai_local_request] read body failed: {}", e))?;

    Ok(AiHttpResponse { status, body: text })
}

// ===================== ZMENG：原生系统级拖放（CF_HDROP 真实文件） =====================
// 网页 HTML5 拖拽无法向原生应用投递「系统文件」，拖图片只会把 base64 data-URL 当文本丢出去
// （正是上一版「拖入设计软件变成一长串源代码并崩溃」的根因）。这里把要拖的内容统一落成
// 「磁盘上的真实文件」，再由 tauri-plugin-drag 发起 OLE 拖放，目标软件收到的是真实文件，
// 设计软件/聊天软件都能正常接收，不再产生乱码。

/// 拖放用临时目录（图片落盘 + 通用拖拽图标）
fn zmeng_drag_dir() -> std::io::Result<PathBuf> {
    let dir = std::env::temp_dir().join("zmeng-drag");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// 路径是否为图片扩展名
fn is_image_ext(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    [
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico", ".tif", ".tiff", ".avif",
        ".svg",
    ]
    .iter()
    .any(|ext| lower.ends_with(ext))
}

/// 通用文件拖拽图标：把内置 app 图标写入临时目录（仅写一次），返回路径。
/// tauri-plugin-drag 要求必须提供拖拽预览图，非图片文件用它兜底。
fn ensure_generic_drag_icon() -> Result<String, String> {
    let dir = zmeng_drag_dir().map_err(|e| e.to_string())?;
    let path = dir.join("zmeng-file-icon.png");
    if !path.exists() {
        const ICON: &[u8] = include_bytes!("../icons/icon.png");
        std::fs::write(&path, ICON).map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[derive(serde::Serialize)]
pub struct DragPayload {
    /// 要拖出的真实文件路径
    pub files: Vec<String>,
    /// 拖拽时跟随光标的预览图标路径
    pub icon: String,
}

/// ZMENG：把「剪贴板图片 / 截图」的 base64 PNG 落成真实文件，供系统级拖放。
/// 以内容散列命名，重复拖拽复用同一文件，避免临时目录膨胀；图标即图片本身（真实预览）。
#[command]
pub async fn prepare_drag_image(image_base64: String) -> Result<DragPayload, String> {
    use base64::prelude::*;
    let raw = match image_base64.find(',') {
        Some(idx) => &image_base64[idx + 1..],
        None => image_base64.as_str(),
    };
    let bytes = BASE64_STANDARD
        .decode(raw.trim())
        .map_err(|e| format!("[prepare_drag_image] base64 decode failed: {}", e))?;
    if bytes.is_empty() {
        return Err("[prepare_drag_image] empty image".into());
    }
    let dir = zmeng_drag_dir().map_err(|e| e.to_string())?;
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    bytes.len().hash(&mut hasher);
    bytes[..bytes.len().min(4096)].hash(&mut hasher);
    bytes[bytes.len().saturating_sub(4096)..].hash(&mut hasher);
    let name = format!("img-{:016x}.png", hasher.finish());
    let path = dir.join(name);
    if !path.exists() {
        std::fs::write(&path, &bytes)
            .map_err(|e| format!("[prepare_drag_image] write failed: {}", e))?;
    }
    let p = path.to_string_lossy().to_string();
    Ok(DragPayload {
        files: vec![p.clone()],
        icon: p,
    })
}

/// ZMENG：为「文件类」剪贴板项准备系统级拖放载荷。
/// 直接用文件真实路径；图标取第一张图片文件（给真实预览），否则用通用图标兜底。
#[command]
pub async fn prepare_drag_files(files: Vec<String>) -> Result<DragPayload, String> {
    let valid: Vec<String> = files
        .into_iter()
        .filter(|f| std::path::Path::new(f).exists())
        .collect();
    if valid.is_empty() {
        return Err("[prepare_drag_files] no existing files".into());
    }
    let icon = match valid.iter().find(|f| is_image_ext(f)) {
        Some(img) => img.clone(),
        None => ensure_generic_drag_icon()?,
    };
    Ok(DragPayload { files: valid, icon })
}

/// ZMENG：从一组文件中挑出第一张「图片且 ≤ max_bytes」的文件路径，供列表缩略图预览。
#[command]
pub async fn pick_image_preview(files: Vec<String>, max_bytes: u64) -> Option<String> {
    for f in files {
        if !is_image_ext(&f) {
            continue;
        }
        if let Ok(meta) = std::fs::metadata(&f) {
            if meta.is_file() && meta.len() <= max_bytes {
                return Some(f);
            }
        }
    }
    None
}
