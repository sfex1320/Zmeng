use std::path::PathBuf;

use tokio::sync::Mutex;

use tauri::command;

use zmeng_app_services::video_record_service::VideoFormat;
use zmeng_app_services::video_record_service::VideoRecordService;

#[command]
pub async fn video_record_init(
    video_service: tauri::State<'_, Mutex<VideoRecordService>>,
    ffmpeg_plugin_dir: PathBuf,
) -> Result<(), String> {
    let mut service = video_service.lock().await;
    service.init(&ffmpeg_plugin_dir);
    Ok(())
}

/// 开始视频录制
#[command]
pub async fn video_record_start(
    video_service: tauri::State<'_, Mutex<VideoRecordService>>,
    min_x: i32,
    min_y: i32,
    max_x: i32,
    max_y: i32,
    output_file: String,
    format: VideoFormat,
    frame_rate: u32,
    enable_microphone: bool,
    enable_system_audio: bool,
    microphone_device_name: String,
    hwaccel: bool,
    encoder: String,
    encoder_preset: String,
    video_max_width: i32,
    video_max_height: i32,
) -> Result<(), String> {
    println!(
        "Starting video recording: area=({},{}) to ({},{}), output={}",
        min_x, min_y, max_x, max_y, output_file
    );

    let mut service = video_service.lock().await;

    match service.start(
        min_x,
        min_y,
        max_x,
        max_y,
        output_file,
        format,
        frame_rate,
        enable_microphone,
        enable_system_audio,
        microphone_device_name,
        hwaccel,
        encoder,
        encoder_preset,
        video_max_width,
        video_max_height,
    ) {
        Ok(_) => {
            println!("Video recording started successfully");
            Ok(())
        }
        Err(e) => {
            println!("Video recording start failed: {}", e);
            Err(format!("Start recording failed: {}", e))
        }
    }
}

/// 停止视频录制
#[command]
pub async fn video_record_stop(
    video_service: tauri::State<'_, Mutex<VideoRecordService>>,
    convert_to_gif: bool,
    gif_format: String,
    gif_frame_rate: u32,
    gif_max_width: i32,
    gif_max_height: i32,
) -> Result<Option<String>, String> {
    println!("Stopping video recording...");

    let mut service = video_service.lock().await;

    match service.stop(
        convert_to_gif,
        &gif_format,
        gif_frame_rate,
        gif_max_width,
        gif_max_height,
    ) {
        Ok(final_filename) => {
            println!("Video recording stopped successfully");
            Ok(final_filename)
        }
        Err(e) => {
            println!("Video recording stop failed: {}", e);
            Err(format!("Stop recording failed: {}", e))
        }
    }
}

/// 暂停视频录制
#[command]
pub async fn video_record_pause(
    video_service: tauri::State<'_, Mutex<VideoRecordService>>,
) -> Result<(), String> {
    let mut service = video_service.lock().await;

    match service.pause() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Pause recording failed: {}", e)),
    }
}

/// 恢复视频录制
#[command]
pub async fn video_record_resume(
    video_service: tauri::State<'_, Mutex<VideoRecordService>>,
) -> Result<(), String> {
    let mut service = video_service.lock().await;

    match service.resume() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Resume recording failed: {}", e)),
    }
}

#[command]
pub async fn video_record_get_microphone_device_names(
    video_service: tauri::State<'_, Mutex<VideoRecordService>>,
) -> Result<Vec<String>, String> {
    // 短暂持锁仅取 ffmpeg 路径；-list_devices 可能在故障音频设备上长时间阻塞，
    // 必须在锁外执行，否则会卡死整个录屏服务（关闭/暂停等全部无响应）
    let ffmpeg_path = {
        let service = video_service.lock().await;
        service.resolve_ffmpeg_path()
    };
    match ffmpeg_path {
        Some(path) => tokio::task::spawn_blocking(move || {
            VideoRecordService::list_microphone_devices_outside_lock(&path)
        })
        .await
        .map_err(|e| e.to_string()),
        None => Ok(Vec::new()),
    }
}

#[command]
pub async fn video_record_kill(
    video_service: tauri::State<'_, Mutex<VideoRecordService>>,
) -> Result<(), String> {
    let mut service = video_service.lock().await;
    match service.kill() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Kill recording failed: {}", e)),
    }
}
