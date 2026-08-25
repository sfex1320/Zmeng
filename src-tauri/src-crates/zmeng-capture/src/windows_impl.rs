//! Windows 实现：DXGI Desktop Duplication 主路径 + GDI BitBlt 回退。

use std::time::Instant;
use windows::core::{Interface, Result as WinResult};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter1, IDXGIFactory1, IDXGIOutput, IDXGIOutput1,
    DXGI_OUTPUT_DESC,
};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleDC, CreateCompatibleBitmap, DeleteDC, DeleteObject, GetDC,
    GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    CAPTUREBLT, DIB_RGB_COLORS, SRCCOPY,
};

/// 一台已接入桌面的显示器（虚拟桌面物理像素坐标，副屏可为负）
#[derive(Debug, Clone, serde::Serialize)]
pub struct ZmengMonitor {
    /// DXGI 设备名（\\.\DISPLAY1 之类），用于稳定标识
    pub device_name: String,
    pub min_x: i32,
    pub min_y: i32,
    pub max_x: i32,
    pub max_y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum ZmengCaptureMethod {
    /// DXGI Desktop Duplication
    Dxgi,
    /// GDI BitBlt 回退
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

/// 枚举所有已接入桌面的显示器（按 DXGI 顺序）
pub fn list_monitors() -> Result<Vec<ZmengMonitor>, String> {
    enumerate_outputs()
        .map(|outputs| {
            outputs
                .into_iter()
                .map(|(desc, _)| ZmengMonitor {
                    device_name: device_name_string(&desc),
                    min_x: desc.DesktopCoordinates.left,
                    min_y: desc.DesktopCoordinates.top,
                    max_x: desc.DesktopCoordinates.right,
                    max_y: desc.DesktopCoordinates.bottom,
                })
                .collect()
        })
        .map_err(|e| format!("[zmeng-capture] 枚举显示器失败: {e}"))
}

/// 抓取覆盖指定点的显示器整屏画面，返回 RGBA 图像 + 实际使用的采集方式。
pub async fn capture_monitor_by_rect(
    min_x: i32,
    min_y: i32,
) -> Result<(image::RgbaImage, ZmengCaptureMethod), String> {
    let outputs =
        enumerate_outputs().map_err(|e| format!("[zmeng-capture] 枚举显示器失败: {e}"))?;

    let target = outputs.iter().find(|(desc, _)| {
        let r = desc.DesktopCoordinates;
        min_x >= r.left && min_x < r.right && min_y >= r.top && min_y < r.bottom
    });

    let (desc, output) = match target {
        Some(v) => v,
        None => {
            return Err(format!(
                "[zmeng-capture] 未找到覆盖 ({min_x},{min_y}) 的显示器"
            ))
        }
    };

    match capture_dxgi(output) {
        Ok(image) => Ok((image, ZmengCaptureMethod::Dxgi)),
        Err(dxgi_err) => {
            log::warn!("[zmeng-capture] DXGI 采集失败，回退 GDI: {dxgi_err}");
            let rect = desc.DesktopCoordinates;
            capture_gdi(rect.left, rect.top, rect.right, rect.bottom)
                .map(|image| (image, ZmengCaptureMethod::Gdi))
        }
    }
}

/// 自测：逐屏抓一帧，返回每屏的方式/耗时/校验结果
pub async fn self_test() -> Vec<ZmengSelfTestResult> {
    let mut results = Vec::new();
    let Ok(outputs) = enumerate_outputs() else {
        return results;
    };

    for (desc, output) in outputs {
        let rect = desc.DesktopCoordinates;
        let started = Instant::now();
        let mut result = ZmengSelfTestResult {
            device_name: device_name_string(&desc),
            rect: (rect.left, rect.top, rect.right, rect.bottom),
            method: ZmengCaptureMethod::Dxgi,
            elapsed_ms: 0,
            image_size: (0, 0),
            ok: false,
            error: None,
        };

        match capture_dxgi(&output) {
            Ok(image) => {
                result.method = ZmengCaptureMethod::Dxgi;
                result.image_size = (image.width(), image.height());
                // 校验：抽样非全零（驱动偶发返回空表面）
                let non_zero = image
                    .pixels()
                    .step_by(997)
                    .any(|p| p.0 != [0, 0, 0, 255]);
                result.ok = non_zero;
                if !non_zero {
                    result.error = Some("采样像素全为零".to_string());
                }
            }
            Err(e) => {
                match capture_gdi(rect.left, rect.top, rect.right, rect.bottom) {
                    Ok(image) => {
                        result.method = ZmengCaptureMethod::Gdi;
                        result.image_size = (image.width(), image.height());
                        result.ok = true;
                        result.error = Some(format!("DXGI 失败走 GDI: {e}"));
                    }
                    Err(gdi_err) => {
                        result.error = Some(format!("DXGI: {e}; GDI: {gdi_err}"));
                    }
                }
            }
        }

        result.elapsed_ms = started.elapsed().as_millis();
        results.push(result);
    }

    results
}

// ===================== 内部实现 =====================

/// 确保进程为 Per-Monitor DPI Aware（幂等，主程序已设置时本调用失败并被忽略）。
/// 不声明时 DXGI 桌面坐标与 GDI 抓取都会被 DPI 虚拟化（如 150% 缩放下
/// 物理分辨率 3840x2160 会被报告成 2560x1440），截图尺寸随之错误。
fn ensure_dpi_aware() {
    use windows::Win32::UI::HiDpi::{
        SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
}

/// 枚举 (DXGI_OUTPUT_DESC, IDXGIOutput1)，仅返回 AttachedToDesktop 的输出
fn enumerate_outputs() -> WinResult<Vec<(DXGI_OUTPUT_DESC, IDXGIOutput1)>> {
    ensure_dpi_aware();
    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1()?;
        let mut list = Vec::new();

        let mut adapter_index = 0u32;
        while let Ok(adapter) = factory.EnumAdapters1(adapter_index) {
            let mut output_index = 0u32;
            while let Ok(output) = adapter.EnumOutputs(output_index) {
                let desc = output.GetDesc()?;
                if desc.AttachedToDesktop.as_bool() {
                    let output1: IDXGIOutput1 = output.cast()?;
                    list.push((desc, output1));
                }
                output_index += 1;
            }
            adapter_index += 1;
        }

        Ok(list)
    }
}

fn device_name_string(desc: &DXGI_OUTPUT_DESC) -> String {
    let wide: Vec<u16> = desc
        .DeviceName
        .iter()
        .take_while(|c| **c != 0)
        .copied()
        .collect();
    String::from_utf16_lossy(&wide)
}

/// DXGI Desktop Duplication 抓取整屏
fn capture_dxgi(output: &IDXGIOutput1) -> Result<image::RgbaImage, String> {
    use windows::Win32::Graphics::Dxgi::{
        IDXGIOutputDuplication, IDXGIResource, DXGI_ERROR_WAIT_TIMEOUT, DXGI_OUTDUPL_FRAME_INFO,
    };

    unsafe {
        // DuplicateOutput 需要一个 D3D11 设备（任意 feature level）
        let factory: IDXGIFactory1 =
            CreateDXGIFactory1().map_err(|e| format!("CreateDXGIFactory1: {e}"))?;
        let adapter: IDXGIAdapter1 = factory
            .EnumAdapters1(0)
            .map_err(|e| format!("EnumAdapters1: {e}"))?;
        let mut device: Option<ID3D11Device> = None;
        let mut context: Option<ID3D11DeviceContext> = None;
        D3D11CreateDevice(
            &adapter,
            D3D_DRIVER_TYPE_UNKNOWN,
            windows::Win32::Foundation::HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            7, // SDKVersion，0.61 wrapper 忽略实际值
            Some(&mut device),
            None,
            Some(&mut context),
        )
        .map_err(|e| format!("D3D11CreateDevice: {e}"))?;
        let device = device.ok_or("D3D11CreateDevice 未返回设备")?;
        let context = context.ok_or("D3D11CreateDevice 未返回上下文")?;

        let duplication: IDXGIOutputDuplication = output.DuplicateOutput(&device).map_err(|e| {
            format!("DuplicateOutput: {e}（远程桌面/驱动不支持时失败，将走 GDI 回退）")
        })?;

        let desc = output.GetDesc().map_err(|e| e.to_string())?;
        let rect = desc.DesktopCoordinates;
        let width = (rect.right - rect.left).max(0) as usize;
        let height = (rect.bottom - rect.top).max(0) as usize;
        if width == 0 || height == 0 {
            return Err("输出区域为空".to_string());
        }

        // AcquireNextFrame：桌面无更新时会 WAIT_TIMEOUT，重试若干次
        let mut acquired = false;
        let mut resource: Option<IDXGIResource> = None;
        for _ in 0..3 {
            let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
            let hr = duplication.AcquireNextFrame(50, &mut frame_info, &mut resource);
            match hr {
                Ok(()) => {
                    acquired = true;
                    break;
                }
                Err(e) if e.code() == DXGI_ERROR_WAIT_TIMEOUT => {
                    continue;
                }
                Err(e) => return Err(format!("AcquireNextFrame: {e}")),
            }
        }
        if !acquired {
            return Err("AcquireNextFrame 持续超时".to_string());
        }
        let result = (|| -> Result<image::RgbaImage, String> {
            match duplication.MapDesktopSurface() {
                Ok(mapped) => {
                    let src = std::slice::from_raw_parts(
                        mapped.pBits,
                        mapped.Pitch as usize * height,
                    );
                    bgra_to_rgba(&src, mapped.Pitch as usize, width, height)
                }
                Err(e) => {
                    // 部分驱动/混合显卡不支持 MapDesktopSurface：走标准 staging 纹理拷贝
                    let texture: ID3D11Texture2D = resource
                        .as_ref()
                        .and_then(|r| r.cast::<ID3D11Texture2D>().ok())
                        .ok_or_else(|| {
                            format!("MapDesktopSurface: {e}；且帧资源非 Texture2D")
                        })?;

                    let mut desc = D3D11_TEXTURE2D_DESC::default();
                    texture.GetDesc(&mut desc);

                    let staging_desc = D3D11_TEXTURE2D_DESC {
                        Usage: D3D11_USAGE_STAGING,
                        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                        BindFlags: 0,
                        MiscFlags: 0,
                        ..desc
                    };
                    let mut staging: Option<ID3D11Texture2D> = None;
                    device
                        .CreateTexture2D(&staging_desc, None, Some(&mut staging))
                        .map_err(|e2| format!("CreateTexture2D(staging): {e2}"))?;
                    let staging = staging.ok_or("staging 未创建")?;

                    context.CopySubresourceRegion(
                        &staging,
                        0,
                        0,
                        0,
                        0,
                        &texture,
                        0,
                        None,
                    );

                    let mut mapped = Default::default();
                    context
                        .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                        .map_err(|e2| format!("Map(staging): {e2}"))?;
                    let src = std::slice::from_raw_parts(
                        mapped.pData.cast::<u8>(),
                        mapped.RowPitch as usize * height,
                    );
                    let out = bgra_to_rgba(&src, mapped.RowPitch as usize, width, height);
                    context.Unmap(&staging, 0);
                    out
                }
            }
        })();

        let _ = duplication.ReleaseFrame();

        // 桌面静止/极小变化帧可能返回空（全零）表面：视为失败，交由上层走 GDI
        if let Ok(image) = &result {
            let non_zero = image.pixels().step_by(997).any(|p| p.0[0] != 0 || p.0[1] != 0 || p.0[2] != 0);
            if !non_zero {
                return Err("DXGI 帧内容为空（黑帧）".to_string());
            }
        }
        result
    }
}

/// GDI BitBlt 回退：按虚拟桌面坐标抓指定区域
fn capture_gdi(
    min_x: i32,
    min_y: i32,
    max_x: i32,
    max_y: i32,
) -> Result<image::RgbaImage, String> {
    let width = (max_x - min_x).max(0);
    let height = (max_y - min_y).max(0);
    if width == 0 || height == 0 {
        return Err("GDI 采集区域为空".to_string());
    }

    unsafe {
        let screen_dc = GetDC(None);
        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        let old = SelectObject(mem_dc, bitmap.into());

        // GDI 坐标即虚拟桌面坐标（副屏负坐标合法）
        let blt = BitBlt(
            mem_dc,
            0,
            0,
            width,
            height,
            Some(screen_dc),
            min_x,
            min_y,
            SRCCOPY | CAPTUREBLT,
        );

        let result = if blt.is_err() {
            Err(format!("BitBlt: {}", blt.unwrap_err()))
        } else {
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height, // 自上而下
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };

            let mut buffer = vec![0u8; (width * height * 4) as usize];
            let copied = GetDIBits(
                mem_dc,
                bitmap,
                0,
                height as u32,
                Some(buffer.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS,
            );
            if copied == 0 {
                Err("GetDIBits 返回 0".to_string())
            } else {
                // BGRA → RGBA
                let mut rgba = image::RgbaImage::new(width as u32, height as u32);
                let dst = rgba.as_mut();
                let stride = width as usize * 4;
                for i in 0..(width as usize * height as usize) {
                    dst[i * 4] = buffer[i * 4 + 2];
                    dst[i * 4 + 1] = buffer[i * 4 + 1];
                    dst[i * 4 + 2] = buffer[i * 4];
                    dst[i * 4 + 3] = 255;
                }
                let _ = stride;
                Ok(rgba)
            }
        };

        SelectObject(mem_dc, old);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(mem_dc);
        ReleaseDC(None, screen_dc);
        result
    }
}

/// BGRA（带行距）→ RGBA
fn bgra_to_rgba(
    src: &[u8],
    pitch: usize,
    width: usize,
    height: usize,
) -> Result<image::RgbaImage, String> {
    let mut rgba = image::RgbaImage::new(width as u32, height as u32);
    let dst = rgba.as_mut();
    for y in 0..height {
        let row = &src[y * pitch..];
        let out_row = &mut dst[y * width * 4..(y + 1) * width * 4];
        for x in 0..width {
            out_row[x * 4] = row[x * 4 + 2];
            out_row[x * 4 + 1] = row[x * 4 + 1];
            out_row[x * 4 + 2] = row[x * 4];
            out_row[x * 4 + 3] = 255;
        }
    }
    Ok(rgba)
}

/// 供上层判断某输出是否覆盖指定点（调试用）
#[allow(dead_code)]
fn output_covers(output: &IDXGIOutput, x: i32, y: i32) -> bool {
    unsafe {
        if let Ok(desc) = output.GetDesc() {
            let r = desc.DesktopCoordinates;
            return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
        }
        false
    }
}
