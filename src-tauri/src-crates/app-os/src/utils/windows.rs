use std::env;
use std::ffi::c_void;

use windows::Win32::Foundation::HANDLE;
use windows::Win32::Foundation::{CloseHandle, HWND, VARIANT_BOOL};
use windows::Win32::Security::{GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
    IPersistFile,
};
use windows::Win32::System::TaskScheduler::{
    self, IAction, IActionCollection, IExecAction, ILogonTrigger, IPrincipal, IRegisteredTask,
    IRegistrationInfo, ITaskDefinition, ITaskFolder, ITaskService, ITaskSettings, ITrigger,
    ITriggerCollection, TASK_ACTION_EXEC, TASK_LOGON_GROUP, TASK_TRIGGER_LOGON,
};
use windows::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Shell::{
    IShellLinkW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW, ShellExecuteExW, ShellLink,
};
use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
use windows::Win32::UI::WindowsAndMessaging::{
    GWL_EXSTYLE, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW, HWND_NOTOPMOST,
    HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SetForegroundWindow, SetWindowPos, WS_EX_TOPMOST,
};
use windows::Win32::UI::HiDpi::{
    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext,
};
use windows::core::Interface;
use windows::core::PCWSTR;

/// 设置进程为 Per-Monitor-V2 DPI 感知。
/// 截图工具必须 DPI 感知，否则在高分屏(4K)+ 系统缩放下进程会被「DPI 虚拟化」，
/// 抓到的是被系统缩小后的低分辨率画面（例如 4K 只截到 1280 宽）且模糊。
/// 必须在创建窗口/WebView 之前尽早调用。
pub fn set_process_per_monitor_dpi_aware() {
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
}

/// 便携版首次启动时在桌面创建快捷方式（ZMENG.lnk → 本 exe）。
/// 判定便携版：exe 同级存在 `__portable` 标记文件（与 FileCacheService::is_portable_app 一致）。
/// 桌面已存在 ZMENG.lnk 则跳过（用户手动删除后下次启动才重建）。安装版（无 __portable）不处理。
/// COM 由 Tauri 在 setup 前已初始化（STA），这里直接用 IShellLinkW + IPersistFile。
pub fn create_desktop_shortcut_if_portable() {
    use std::path::PathBuf;

    let exe = match std::env::current_exe() {
        Ok(e) => e,
        Err(_) => return,
    };
    let exe_dir = match exe.parent() {
        Some(d) => d.to_path_buf(),
        None => return,
    };
    if !exe_dir.join("__portable").exists() {
        return;
    }
    // 桌面路径：%USERPROFILE%\Desktop（OneDrive 重定向的桌面用标准路径，用户仍可见）
    let desktop = match std::env::var_os("USERPROFILE") {
        Some(p) => PathBuf::from(p).join("Desktop"),
        None => return,
    };
    let lnk_path = desktop.join("ZMENG.lnk");
    if lnk_path.exists() {
        return;
    }

    unsafe {
        let shell_link: IShellLinkW = match CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("[desktop_shortcut] CoCreateInstance failed: {}", e);
                return;
            }
        };
        let exe_w: Vec<u16> = exe
            .to_string_lossy()
            .encode_utf16()
            .chain(Some(0u16))
            .collect();
        let dir_w: Vec<u16> = exe_dir
            .to_string_lossy()
            .encode_utf16()
            .chain(Some(0u16))
            .collect();
        let lnk_w: Vec<u16> = lnk_path
            .to_string_lossy()
            .encode_utf16()
            .chain(Some(0u16))
            .collect();

        if let Err(e) = shell_link.SetPath(PCWSTR(exe_w.as_ptr())) {
            log::warn!("[desktop_shortcut] SetPath failed: {}", e);
            return;
        }
        let _ = shell_link.SetWorkingDirectory(PCWSTR(dir_w.as_ptr()));
        // 图标：IShellLink 默认从 target exe 取图标资源（exe 已含 ZMENG 图标），无需额外 SetIconLocation。

        let persist: IPersistFile = match shell_link.cast() {
            Ok(p) => p,
            Err(e) => {
                log::warn!("[desktop_shortcut] cast IPersistFile failed: {}", e);
                return;
            }
        };
        if let Err(e) = persist.Save(PCWSTR(lnk_w.as_ptr()), true) {
            log::warn!("[desktop_shortcut] Save failed: {}", e);
            return;
        }
        log::info!("[desktop_shortcut] created: {}", lnk_path.display());
    }
}

pub fn switch_always_on_top(hwnd: *mut c_void) -> bool {
    let hwnd = HWND(hwnd);

    // 获取窗口的扩展样式
    let ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };

    // 检查窗口是否已经置顶
    let is_topmost = (ex_style & WS_EX_TOPMOST.0 as isize) != 0;

    // 根据当前状态切换置顶
    let result = unsafe {
        SetWindowPos(
            hwnd,
            if is_topmost {
                Some(HWND_NOTOPMOST)
            } else {
                Some(HWND_TOPMOST)
            },
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE,
        )
    };

    result.is_ok()
}

pub fn set_draw_window_style(#[allow(unused_variables)] window: tauri::Window) {
    // 暂时不处理，保留下函数占位

    // let window_hwnd = window.hwnd();

    // if let Ok(hwnd) = window_hwnd {
    //     // 设置窗口样式为0x96000000
    //     let new_style = -1778384896;
    //     unsafe { SetWindowLongW(hwnd, GWL_STYLE, new_style) };
    // }
}

pub fn get_focused_window() -> HWND {
    unsafe { GetForegroundWindow() }
}

/// 获取当前前台窗口句柄（以 isize 返回，便于跨 IPC 传递）
pub fn get_foreground_window_handle() -> isize {
    let hwnd = unsafe { GetForegroundWindow() };
    hwnd.0 as isize
}

/// 将指定句柄的窗口设置为前台窗口（用于粘贴前恢复目标窗口焦点）
pub fn set_foreground_window(handle: isize) -> bool {
    if handle == 0 {
        return false;
    }
    let hwnd = HWND(handle as *mut c_void);
    unsafe { SetForegroundWindow(hwnd).as_bool() }
}

/// 获取指定句柄窗口所属进程 PID（0 表示失败）
pub fn get_window_pid(handle: isize) -> u32 {
    if handle == 0 {
        return 0;
    }
    unsafe {
        let hwnd = HWND(handle as *mut c_void);
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        pid
    }
}

/// 判断指定进程是否以管理员（高完整性）权限运行
unsafe fn is_process_elevated(process: HANDLE) -> bool {
    unsafe {
        let mut token: HANDLE = HANDLE::default();
        if OpenProcessToken(process, TOKEN_QUERY, &mut token).is_err() {
            return false;
        }

        let mut elevation: TOKEN_ELEVATION = std::mem::zeroed();
        let mut return_length = 0u32;
        let result = GetTokenInformation(
            token,
            windows::Win32::Security::TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut return_length,
        );
        let _ = CloseHandle(token);

        result.is_ok() && elevation.TokenIsElevated != 0
    }
}

/// 目标窗口所属进程是管理员（高完整性）而当前进程不是 → 模拟 Ctrl+V 会被 UIPI 静默丢弃。
/// 任何不确定情况都返回 false（即放行粘贴），确保不误伤正常粘贴。
pub fn is_window_paste_blocked(handle: isize) -> bool {
    if handle == 0 {
        return false;
    }
    // 自身已是管理员，可向任意窗口注入
    if is_admin() {
        return false;
    }
    unsafe {
        let pid = get_window_pid(handle);
        if pid == 0 {
            return false;
        }
        let process = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(h) => h,
            Err(_) => return false,
        };
        let elevated = is_process_elevated(process);
        let _ = CloseHandle(process);
        elevated
    }
}

/// 获取指定句柄窗口的标题（用于剪贴板记录的「来源」标签）
pub fn get_window_title(handle: isize) -> String {
    if handle == 0 {
        return String::new();
    }
    let hwnd = HWND(handle as *mut c_void);
    unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return String::new();
        }
        let mut buf = vec![0u16; (len as usize) + 1];
        let read = GetWindowTextW(hwnd, &mut buf);
        if read <= 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..read as usize])
    }
}

const TASK_NAME: &str = "SnowShot Admin Auto Start";

struct ComGuard;
impl Drop for ComGuard {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

/**
 * 在 Windows 下创建使用管理员权限自动启动任务
 *
 */
pub fn create_admin_auto_start_task() -> Result<(), String> {
    // 获取当前可执行文件的路径
    let current_exe = match env::current_exe() {
        Ok(current_exe) => current_exe,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] env::current_exe failed: {:?}",
                e
            ));
        }
    };
    let exe_path = current_exe.to_string_lossy();

    let _com_guard = ComGuard {};

    // 初始化 COM
    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        if hr.is_err() {
            return Err(format!(
                "[create_admin_auto_start_task] CoInitializeEx failed: {:?}",
                hr
            ));
        }
    }

    // 创建 Task Service 实例
    let p_service: ITaskService = match unsafe {
        CoCreateInstance(&TaskScheduler::TaskScheduler, None, CLSCTX_INPROC_SERVER)
    } {
        Ok(p_service) => p_service,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] CoCreateInstance failed: {:?}",
                e
            ));
        }
    };

    // 连接到 Task Service
    unsafe {
        let hr = p_service.Connect(
            &VARIANT::default(),
            &VARIANT::default(),
            &VARIANT::default(),
            &VARIANT::default(),
        );
        if hr.is_err() {
            return Err("[create_admin_auto_start_task] Connect failed".into());
        }
    }

    // 获取根任务文件夹
    let p_root_folder: ITaskFolder =
        match unsafe { p_service.GetFolder(&windows::core::BSTR::from("\\")) } {
            Ok(p_root_folder) => p_root_folder,
            Err(e) => {
                return Err(format!(
                    "[create_admin_auto_start_task] GetFolder failed: {:?}",
                    e
                ));
            }
        };

    // 删除已存在的同名任务
    let _ = unsafe { p_root_folder.DeleteTask(&windows::core::BSTR::from(TASK_NAME), 0) };

    // 创建任务定义
    let p_task: ITaskDefinition = match unsafe { p_service.NewTask(0) } {
        Ok(p_task) => p_task,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] NewTask failed: {:?}",
                e
            ));
        }
    };

    let p_principal: IPrincipal = match unsafe { p_task.Principal() } {
        Ok(p_principal) => p_principal,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] Principal failed: {:?}",
                e
            ));
        }
    };

    // 使用最高权限运行
    unsafe {
        let hr = p_principal.SetRunLevel(TaskScheduler::TASK_RUNLEVEL_HIGHEST);
        if hr.is_err() {
            return Err("[create_admin_auto_start_task] SetRunLevel failed".into());
        }
    }

    // 设置任务注册信息
    let p_reg_info: IRegistrationInfo = match unsafe { p_task.RegistrationInfo() } {
        Ok(p_reg_info) => p_reg_info,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] RegistrationInfo failed: {:?}",
                e
            ));
        }
    };
    unsafe {
        let hr = p_reg_info.SetAuthor(&windows::core::BSTR::from("SnowShot"));
        if hr.is_err() {
            return Err(format!(
                "[create_admin_auto_start_task] SetAuthor failed: {:?}",
                hr
            ));
        }
    }
    unsafe {
        let hr =
            p_reg_info.SetDescription(&windows::core::BSTR::from("Auto start with administrator"));
        if hr.is_err() {
            return Err(format!(
                "[create_admin_auto_start_task] SetDescription failed: {:?}",
                hr
            ));
        }
    }

    // 设置任务设置
    let p_settings: ITaskSettings = match unsafe { p_task.Settings() } {
        Ok(p_settings) => p_settings,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] Settings failed: {:?}",
                e
            ));
        }
    };
    unsafe {
        let hr = p_settings.SetStartWhenAvailable(VARIANT_BOOL::from(true));
        if hr.is_err() {
            return Err("[create_admin_auto_start_task] SetStartWhenAvailable failed".into());
        }
    }

    // 设置任务可以在用户未登录时运行（支持管理员权限）
    // 注意：某些 Windows 版本可能不支持此设置，管理员权限主要通过 SID 指定

    // 获取触发器集合并创建登录触发器
    let p_trigger_collection: ITriggerCollection = match unsafe { p_task.Triggers() } {
        Ok(p_trigger_collection) => p_trigger_collection,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] Triggers failed: {:?}",
                e
            ));
        }
    };
    let p_trigger: ITrigger = match unsafe { p_trigger_collection.Create(TASK_TRIGGER_LOGON) } {
        Ok(p_trigger) => p_trigger,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] Create failed: {:?}",
                e
            ));
        }
    };

    // 将 ITrigger 转换为 ILogonTrigger
    let p_logon_trigger: ILogonTrigger = match p_trigger.cast() {
        Ok(p_logon_trigger) => p_logon_trigger,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] cast failed: {:?}",
                e
            ));
        }
    };
    unsafe {
        let hr = p_logon_trigger.SetId(&windows::core::BSTR::from("LogonTrigger"));
        if hr.is_err() {
            return Err(format!(
                "[create_admin_auto_start_task] SetId failed: {:?}",
                hr
            ));
        }
    }

    // 获取动作集合并创建执行动作
    let p_action_collection: IActionCollection = match unsafe { p_task.Actions() } {
        Ok(p_action_collection) => p_action_collection,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] Actions failed: {:?}",
                e
            ));
        }
    };
    let p_action: IAction = match unsafe { p_action_collection.Create(TASK_ACTION_EXEC) } {
        Ok(p_action) => p_action,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] Create failed: {:?}",
                e
            ));
        }
    };

    // 将 IAction 转换为 IExecAction
    let p_exec_action: IExecAction = match p_action.cast() {
        Ok(p_exec_action) => p_exec_action,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] cast failed: {:?}",
                e
            ));
        }
    };
    unsafe {
        let hr = p_exec_action.SetPath(&windows::core::BSTR::from(&*exe_path));
        if hr.is_err() {
            return Err(format!(
                "[create_admin_auto_start_task] SetPath failed: {:?}",
                hr
            ));
        }
    }

    // 设置参数
    unsafe {
        let hr = p_exec_action.SetArguments(&windows::core::BSTR::from("--auto_start"));
        if hr.is_err() {
            return Err(format!(
                "[create_admin_auto_start_task] SetArguments failed: {:?}",
                hr
            ));
        }
    }

    // 设置任务为以管理员权限运行
    // S-1-5-32-544 是管理员组的 SID
    let admin_sid = windows::core::BSTR::from("S-1-5-32-544");

    // 注册任务
    let _p_registered_task: IRegisteredTask = match unsafe {
        p_root_folder.RegisterTaskDefinition(
            &windows::core::BSTR::from(TASK_NAME),
            &p_task,
            TaskScheduler::TASK_CREATE_OR_UPDATE.0,
            &VARIANT::from(admin_sid), // 使用管理员组 SID
            &VARIANT::default(),
            TASK_LOGON_GROUP,
            &VARIANT::from(""),
        )
    } {
        Ok(p_registered_task) => p_registered_task,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] RegisterTaskDefinition failed: {:?}",
                e
            ));
        }
    };

    Ok(())
}

pub fn delete_admin_auto_start_task() -> Result<(), String> {
    let _com_guard = ComGuard {};

    // 初始化 COM
    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        if hr.is_err() {
            return Err(format!(
                "[create_admin_auto_start_task] CoInitializeEx failed: {:?}",
                hr
            ));
        }
    }

    // 创建 Task Service 实例
    let p_service: ITaskService = match unsafe {
        CoCreateInstance(&TaskScheduler::TaskScheduler, None, CLSCTX_INPROC_SERVER)
    } {
        Ok(p_service) => p_service,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] CoCreateInstance failed: {:?}",
                e
            ));
        }
    };

    // 连接到 Task Service
    unsafe {
        let hr = p_service.Connect(
            &VARIANT::default(),
            &VARIANT::default(),
            &VARIANT::default(),
            &VARIANT::default(),
        );
        if hr.is_err() {
            return Err("[create_admin_auto_start_task] Connect failed".into());
        }
    }

    // 获取根任务文件夹
    let p_root_folder: ITaskFolder =
        match unsafe { p_service.GetFolder(&windows::core::BSTR::from("\\")) } {
            Ok(p_root_folder) => p_root_folder,
            Err(e) => {
                return Err(format!(
                    "[create_admin_auto_start_task] GetFolder failed: {:?}",
                    e
                ));
            }
        };

    // 删除已存在的同名任务
    let _ = unsafe { p_root_folder.DeleteTask(&windows::core::BSTR::from(TASK_NAME), 0) };

    Ok(())
}

pub fn is_admin_auto_start_task_enabled() -> Result<bool, String> {
    let _com_guard = ComGuard {};

    // 初始化 COM
    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        if hr.is_err() {
            return Err(format!(
                "[create_admin_auto_start_task] CoInitializeEx failed: {:?}",
                hr
            ));
        }
    }

    // 创建 Task Service 实例
    let p_service: ITaskService = match unsafe {
        CoCreateInstance(&TaskScheduler::TaskScheduler, None, CLSCTX_INPROC_SERVER)
    } {
        Ok(p_service) => p_service,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] CoCreateInstance failed: {:?}",
                e
            ));
        }
    };

    // 连接到 Task Service
    unsafe {
        let hr = p_service.Connect(
            &VARIANT::default(),
            &VARIANT::default(),
            &VARIANT::default(),
            &VARIANT::default(),
        );
        if hr.is_err() {
            return Err("[create_admin_auto_start_task] Connect failed".into());
        }
    }

    // 获取根任务文件夹
    let p_root_folder: ITaskFolder =
        match unsafe { p_service.GetFolder(&windows::core::BSTR::from("\\")) } {
            Ok(p_root_folder) => p_root_folder,
            Err(e) => {
                return Err(format!(
                    "[create_admin_auto_start_task] GetFolder failed: {:?}",
                    e
                ));
            }
        };

    // 删除已存在的同名任务
    let task = match unsafe { p_root_folder.GetTask(&windows::core::BSTR::from(TASK_NAME)) } {
        Ok(task) => task,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] GetTask failed: {:?}",
                e
            ));
        }
    };

    let enabled = match unsafe { task.Enabled() } {
        Ok(enabled) => enabled,
        Err(e) => {
            return Err(format!(
                "[create_admin_auto_start_task] Enabled failed: {:?}",
                e
            ));
        }
    };

    Ok(enabled.as_bool())
}

/// 检查当前进程是否具有管理员权限
pub fn is_admin() -> bool {
    unsafe {
        let mut token: HANDLE = HANDLE::default();
        let process = GetCurrentProcess();

        // 获取进程令牌
        if OpenProcessToken(process, TOKEN_QUERY, &mut token).is_err() {
            return false;
        }

        // 检查令牌权限
        let mut elevation: TOKEN_ELEVATION = std::mem::zeroed();
        let mut return_length = 0u32;

        let result = GetTokenInformation(
            token,
            windows::Win32::Security::TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut return_length,
        );

        result.is_ok() && elevation.TokenIsElevated != 0
    }
}

/// 使用ShellExecuteEx请求UAC提权启动当前进程的新实例
pub fn restart_with_admin() -> Result<(), String> {
    // 先检查是否已经具有管理员权限
    if is_admin() {
        return Ok(());
    }

    // 获取当前可执行文件的路径
    let current_exe = match env::current_exe() {
        Ok(current_exe) => current_exe,
        Err(e) => {
            return Err(format!(
                "[restart_with_admin] env::current_exe failed: {:?}",
                e
            ));
        }
    };
    let exe_path = current_exe.to_string_lossy();

    unsafe {
        let mut sei: SHELLEXECUTEINFOW = std::mem::zeroed();
        sei.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        sei.fMask = SEE_MASK_NOCLOSEPROCESS;
        let verb = "runas\0".encode_utf16().collect::<Vec<u16>>();
        let file = exe_path.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
        sei.lpVerb = PCWSTR::from_raw(verb.as_ptr());
        sei.lpFile = PCWSTR::from_raw(file.as_ptr());
        sei.nShow = windows::Win32::UI::WindowsAndMessaging::SW_SHOW.0 as i32;

        let result = ShellExecuteExW(&mut sei);
        if result.is_err() {
            return Err("[restart_with_admin] ShellExecuteExW failed".into());
        }

        // 检查是否成功提权
        if sei.hProcess.is_invalid() {
            return Err("[restart_with_admin] ShellExecuteExW failed".into());
        }

        // 如果提权成功，新进程启动后，当前进程可以退出
        std::process::exit(0);
    }
}
