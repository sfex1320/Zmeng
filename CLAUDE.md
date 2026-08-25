# CLAUDE.md — ZMENG 工程指引

> 本文件供 Claude Code 每次会话自动加载，提供工程速览与关键约定。
> 详细内容见 [PROJECT.md](PROJECT.md)（产品/架构）与 [CONTEXT.md](CONTEXT.md)（复用对照/数据流/决策）。

## 这是什么

**ZMENG** —— 截图 · 剪贴板 · OCR · 翻译 · AI 一体化 Windows 桌面工具。
在开源项目 **snow-shot**（Tauri 2 + React 19 + Rust）基础上**原地扩展**：复用其截图/标注/OCR/翻译/AI 对话底座，新增「剪贴板历史侧栏」与「AI 处理（本地 Ollama / 云端 API）」。

## 目录结构

**项目根 `g:/Project/Zmeng/` 就是应用本体**（snow-shot 已原地扩展并上移到根，不再有 snow-shot-main 子目录）。

```
g:/Project/Zmeng/                 ← 在这里跑所有命令
├── CLAUDE.md / PROJECT.md / CONTEXT.md   ← 文档
├── package.json / tsconfig.json / ...    ← 应用配置
├── src/                ← React 前端（@ 别名指向 src）
├── src-tauri/          ← Rust 后端（Cargo workspace；EXE 产物在 target/release/）
└── excalidraw/         ← @mg-chao/excalidraw 定制分支（标注硬依赖，已构建；package.json 用 file:./excalidraw 引用）
```

## 构建 / 运行（直接在项目根 g:/Project/Zmeng 下）

```bash
pnpm i              # excalidraw 已在 ./excalidraw 构建好
pnpm tauri dev      # 调试（前端 dev 端口 8083）
pnpm tauri build    # 出 EXE：target/release/zmeng.exe + bundle/nsis 安装包
```
- **前端内嵌进 EXE：改前端后必须 `pnpm tauri build` 重建 EXE 才生效。**
- Release 下主窗口默认隐藏，应用驻留**托盘**；剪贴板侧栏快捷键 `Shift+Ctrl+V`。

## 环境前置（本机已就绪，重装时需重做）

1. **Excalidraw 分支**：`git clone -b custom/master https://github.com/mg-chao/excalidraw` 到项目根下的 `./excalidraw`（package.json 用 `file:./excalidraw/packages/excalidraw` 引用）；`yarn config set ignore-engines true`（兼容 Node 24）→ 进 `excalidraw` 执行 `yarn install` → `yarn build:packages`。
2. **ONNX 静态库**：`onnxruntime.lib`（onnxruntime-build v1.22.1 win-x64）放 `src-tauri/lib/`。
3. **OCR 模型**：首次使用经插件机制从 `snowshot.top` 自动下载（需联网/代理）。
4. **`qr-scanner-wechat`**：上游漏声明，已 `pnpm add`；缺失会导致前端打包失败。
5. Git/网络走 Clash 代理 `127.0.0.1:7890`（自定义 git Cargo 依赖需联网）。

## ZMENG 新增代码位置

- **Rust**：`src-tauri/src/core.rs`（`get_active_window_info` / `capture_foreground_window` / `paste_to_active_window` + `ForegroundWindowHandle` 状态）；`app-shared/src/lib.rs`（`EnigoManager::paste()`）；`app-os/src/utils/windows.rs`（前台窗口句柄/标题/SetForeground）；命令在 `src-tauri/src/lib.rs` 注册。
- **前端**：`src/pages/clipboardSidebar/`（page/AiPanel/SettingsPanel/store/ai/monitor/types）；`src/commands/clipboardZmeng.ts`；`src/functions/clipboardSidebar.ts`；路由 `src/routes/_noLayout/clipboardSidebar.lazy.tsx`。
- **接线**：`AppFunction.ClipboardSidebar`（`types/components/appFunction.ts` + `constants/appFunction.ts`）；`components/globalShortcut/index.tsx`（switch case）；`components/trayIconLoader.tsx`（托盘项）；`messages/zhHans/home.ts`。
- **配置**：`src-tauri/tauri.conf.json`（品牌 + `clipboard-sidebar` 窗口）；`tauri.windows.conf.json`（identifier `com.zmeng.app`，已关 updater 工件）；`capabilities/default.json`（剪贴板监听权限）。

## 打包 / 发布规范（APP 目录 = 对外交付）

- **产物目录 `APP/`**，绿色版"三件套"缺一不可：
  1. `zmeng.exe` —— 主程序
  2. `app-icons/` —— **托盘图标资源，必须随行**。缺失会导致托盘无图标、应用隐形驻留后台
  3. `__portable` —— 空标记文件，便携版识别。作用：① 首次启动自动检测桌面 `ZMENG.lnk`，**没有则创建（指向当前 exe），已有则跳过**（Rust 侧 `create_desktop_shortcut_if_portable`，lib.rs setup 调用，属既定产品行为，勿移除）；② 跳过安装包自动更新
- **拷贝流程**：`pnpm tauri build` 后，从 `src-tauri/target/release/` 拷 `zmeng.exe` 与 `app-icons/` 到 `APP/`；`__portable` 保留不覆盖；安装包 `bundle/nsis/*.exe` 一并更新；同步维护 `APP/构建说明.md`
- **重建前必须退出运行中的实例**（`taskkill /IM zmeng.exe /F`），否则链接器无法写入被占用的 exe
- 数据目录优先级：`__custom_config_dir`（当前 D:\剪贴板数据）> `__portable` > `%APPDATA%`；便携标记不影响用户已有数据

## 关键约定 / 注意

- 复用优先：截图用 `executeScreenshot(ScreenshotType.*)`；AI 用 `openai` SDK + `appFetch`（`@/services/tools`）+ `dangerouslyAllowBrowser`；存储继承 `BaseStore`（`@/utils/appStore`）。
- 剪贴板监听用 `tauri-plugin-clipboard-api`（`startListening` + `onSomethingUpdate`），跑在常驻的 `clipboard-sidebar` 窗口。
- 新增 Rust 命令必须在 `lib.rs` 的 `invoke_handler!` 注册；新增剪贴板/插件权限改 `capabilities/default.json`（`cargo build` 时 tauri-build 会校验）。
- 校验顺序：`pnpm build`（前端打包，不查类型）→ `npx tsc --noEmit`（查类型）→ `cargo build`（Rust）。
- 翻译默认走大模型（自包含）；OCR 模型与官方翻译依赖 `snowshot.top`，离线优先用 LLM。
