// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "dhat-heap")]
use app_lib::PROFILER;

#[cfg(feature = "dhat-heap")]
#[global_allocator]
static ALLOC: dhat::Alloc = dhat::Alloc;

#[cfg(feature = "dhat-heap")]
#[tokio::main]
async fn main() {
    #[cfg(feature = "dhat-heap")]
    PROFILER.lock().await.replace(dhat::Profiler::new_heap());

    zmeng_lib::run_with_auto_restart();
}

#[cfg(target_os = "windows")]
const DELAY_SECONDS: u64 = 10;

#[cfg(target_os = "macos")]
const DELAY_SECONDS: u64 = 3;

#[cfg(not(feature = "dhat-heap"))]
fn main() {
    let default_panic = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        use std::backtrace::Backtrace;
        use std::io::Write;

        let backtrace = Backtrace::force_capture();
        log::error!("Panic: {info}\n{backtrace}");

        // panic hook 先于 catch_unwind 执行；这里同步写一份崩溃文件（含 backtrace），便于定位。
        // 优先写到 exe 同级（便携版可写），失败则退回系统临时目录。
        let msg = format!("==== ZMENG CRASH ====\n{info}\n{backtrace}\n\n");
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
                let _ = f.write_all(msg.as_bytes());
                let _ = f.flush();
                break;
            }
        }

        default_panic(info);
    }));

    // 检测命令行参数是否包含 --auto_start
    // 如果是自动启动可能会失败，尝试延迟一段时间再启动
    let args: Vec<String> = std::env::args().collect();
    if args.contains(&"--auto_start".to_string()) {
        println!(
            "[main] --auto_start parameter detected, delaying {} seconds before starting",
            DELAY_SECONDS
        );
        std::thread::sleep(std::time::Duration::from_secs(DELAY_SECONDS));
    }

    zmeng_lib::run_with_auto_restart();
}
