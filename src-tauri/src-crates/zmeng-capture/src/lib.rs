//! ZMENG 自研屏幕采集层（复刻阶段二）。
//!
//! 设计目标：替代上游 fork 的 xcap 采集调用，只依赖 Windows 公开 API：
//! - 显示器枚举：DXGI IDXGIOutput::GetDesc 的 DesktopCoordinates（虚拟桌面物理坐标，原生支持负坐标/多屏）
//! - 单帧采集：IDXGIOutput1::DuplicateOutput + AcquireNextFrame + MapDesktopSurface（BGRA → RGBA）
//! - 回退：DXGI 不可用/持续超时（个别驱动、锁屏、独占全屏）时用 GDI BitBlt(CAPTUREBLT)
//!
//! 本模块为 clean-room 实现：仅依据 Microsoft 官方文档编写，不参考 xcap 源码。

#[cfg(target_os = "windows")]
mod windows_impl;

#[cfg(target_os = "windows")]
pub use windows_impl::{
    capture_monitor_by_rect, list_monitors, self_test, ZmengCaptureMethod, ZmengMonitor,
    ZmengSelfTestResult,
};

#[cfg(not(target_os = "windows"))]
pub use stub::{
    capture_monitor_by_rect, list_monitors, self_test, ZmengCaptureMethod, ZmengMonitor,
    ZmengSelfTestResult,
};

#[cfg(not(target_os = "windows"))]
mod stub {
    use super::*;

    #[derive(Debug, Clone, serde::Serialize)]
    pub struct ZmengMonitor {
        pub device_name: String,
        pub min_x: i32,
        pub min_y: i32,
        pub max_x: i32,
        pub max_y: i32,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
    pub enum ZmengCaptureMethod {
        Dxgi,
        Gdi,
    }

    #[derive(Debug, Clone, serde::Serialize)]
    pub struct ZmengSelfTestResult {
        pub device_name: String,
        pub rect: (i32, i32, i32, i32),
        pub method: ZmengCaptureMethod,
        pub elapsed_ms: u128,
        pub image_size: (u32, u32),
        pub ok: bool,
        pub error: Option<String>,
    }

    pub fn list_monitors() -> Result<Vec<ZmengMonitor>, String> {
        Err("zmeng-capture 仅支持 Windows".to_string())
    }

    pub async fn capture_monitor_by_rect(
        _min_x: i32,
        _min_y: i32,
    ) -> Result<(image::RgbaImage, ZmengCaptureMethod), String> {
        Err("zmeng-capture 仅支持 Windows".to_string())
    }

    pub async fn self_test() -> Vec<ZmengSelfTestResult> {
        Vec::new()
    }
}
