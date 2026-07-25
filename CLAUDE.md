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

## 关键约定 / 注意

- 复用优先：截图用 `executeScreenshot(ScreenshotType.*)`；AI 用 `openai` SDK + `appFetch`（`@/services/tools`）+ `dangerouslyAllowBrowser`；存储继承 `BaseStore`（`@/utils/appStore`）。
- 剪贴板监听用 `tauri-plugin-clipboard-api`（`startListening` + `onSomethingUpdate`），跑在常驻的 `clipboard-sidebar` 窗口。
- 新增 Rust 命令必须在 `lib.rs` 的 `invoke_handler!` 注册；新增剪贴板/插件权限改 `capabilities/default.json`（`cargo build` 时 tauri-build 会校验）。
- 校验顺序：`pnpm build`（前端打包，不查类型）→ `npx tsc --noEmit`（查类型）→ `cargo build`（Rust）。
- 翻译默认走大模型（自包含）；OCR 模型与官方翻译依赖 `snowshot.top`，离线优先用 LLM。
