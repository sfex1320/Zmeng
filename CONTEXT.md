# ZMENG 开发上下文（活文档）

> 给开发者/AI 的工程上下文：snow-shot 复用对照、关键文件索引、数据流、存储 schema、i18n、构建前置状态、决策与风险。随开发持续更新。
>
> ⚠️ **目录已扁平化**：应用已从 `snow-shot-main/` 上移到项目根 `g:/Project/Zmeng/`。下文中凡是写 `snow-shot-main/xxx` 的路径，现在一律位于根目录（即去掉 `snow-shot-main/` 前缀，如 `snow-shot-main/src/...` → `src/...`）。`excalidraw/` 现为根下子目录，`package.json` 以 `file:./excalidraw/packages/excalidraw` 引用。命令一律在项目根执行（不再 `cd snow-shot-main`）。

---

## 0. 决策记录（已与用户确认）

| 项 | 决策 | 影响 |
|---|---|---|
| 架构 | 在 `snow-shot-main` 原地扩展为 ZMENG | 复用最大化，构建较重 |
| AI 后端 | Ollama + 云端 API 双支持、可切换 | 复用 `chatApiConfigList`，新增 Ollama 预设 |
| 翻译 | 默认大模型；保留官方/自定义(DeepL)可切 | 复用 `core/translations` 三层逻辑 |
| 粘贴 | 点选历史 = 写回剪贴板 + 模拟 Ctrl+V | 新增 Rust 粘贴命令 + 焦点恢复 |
| 命名 | 产品名/项目名 = **ZMENG** | 改 `productName`/`identifier`/标题/托盘 |

---

## 1. 复用对照表（哪些直接用、哪些扩展、哪些新建）

### ✅ 直接复用（基本不改）
- **截图捕获**：`snow-shot-main/src/functions/screenshot.ts`（`executeScreenshot`）→ Rust `src-tauri/src-crates/tauri-commands/screenshot/src/lib.rs`（`capture_current_monitor` / `capture_all_monitors` / `capture_focused_window`）。前端封装 `src/commands/screenshot.ts`。
- **OCR**：前端 `src/commands/ocr.ts`（`ocrInit(orcPluginPath,...)` / `ocrDetect(data,scaleFactor,detectAngle)`）→ Rust `src-tauri/src-crates/tauri-commands/ocr/src/lib.rs` + `src-tauri/src-crates/app-services/src/ocr_service.rs`（`init_models` 按 `OcrModel::RapidOcrV4/V5` 拼接 `.onnx` 路径）。
- **AI 对话**：`src/pages/tools/chat/page.tsx`——`OpenAI` 客户端、`XRequest`、`useXChat`/`useXAgent`、`transformMessage`（同时兼容 OpenAI delta 与 Claude content_block_delta 流式）、`MarkdownContent`（react-markdown + remark-gfm/math + rehype-katex + react-syntax-highlighter `CodeCard`）。
- **设置存储**：`src/utils/appStore.ts`（`BaseStore` 封装 `@tauri-apps/plugin-store`，`autoSave`），`src/utils/appSettings.ts` 体系 + `AppSettingsPublisher`/`useAppSettingsLoad`/`updateAppSettings`。
- **多窗口/窗口池**：`src-tauri/src-crates/app-services/src/hot_load_page_service.rs`（预创建 10 个隐藏窗口，`pop_page()` 复用，`emit("hot-load-page-route-push", {label,url})` 改路由）。
- **快捷键**：`src/components/globalShortcut/index.tsx`（`@tauri-apps/plugin-global-shortcut` 的 register/unregister）。
- **托盘**：`src/components/trayIconLoader.tsx`（`Menu.new` + `TrayIcon.new`）。
- **滑动动画**：`src/utils/tweenAnimation.ts`（`TweenAnimation`，基于 `@tweenjs/tween.js`，用于窗口位移/尺寸缓动）。
- **剪贴板读写**：`src/utils/clipboard.ts`（`tauri-plugin-clipboard-api` 的 `writeText/readText/readHtml/readFilesURIs`；图片走 `@tauri-apps/plugin-clipboard-manager`）；Rust `src-tauri/src/core.rs`（`read_image_from_clipboard` / `write_bitmap_image_to_clipboard`）。
- **键鼠模拟**：`src-tauri/src-crates/tauri-commands/core/src/lib.rs` 的 `EnigoManager`（State<Mutex<EnigoManager>>，已用于滚动/点击）。
- **前台窗口**：`src-tauri/src-crates/app-os/src/utils/windows.rs` 的 `get_focused_window() -> HWND`（`GetForegroundWindow`）。

### 🔧 扩展（小改）
- **翻译引擎选择**：`src/core/translations/index.tsx` 已含三层（自定义 API → snowshot.top → 大模型回退）。新增设置项把**默认引擎**切到大模型；侧栏与翻译窗口共用。相关：`src/services/tools/translation.ts`、`src/services/tools/index.ts`（`baseUrl=https://snowshot.top/`）。
- **AI 后端含 Ollama**：复用 `ChatApiConfig`（`api_uri/api_key/api_model/model_name/support_thinking/support_vision`）与 `chatApiConfigList`（`AppSettingsGroup.FunctionChat`，定义于 `src/types/appSettings.ts`）。新增「Ollama 预设 + 自动拉取本地模型（GET /api/tags）+ 默认后端选择器」。OpenAI 客户端实例化参照 `src/pages/settings/functionSettings/components/testChat.tsx`。
- **设置页**：`src/pages/settings/functionSettings/page.tsx`（`ProFormList` 管理 `chatApiConfigList`）新增 AI 后端区、翻译引擎、剪贴板侧栏选项。
- **枚举/默认**：`src/constants/appFunction.ts` + `src/types/components/appFunction.ts`（新 `AppFunction.ClipboardSidebar`）；`src/constants/appSettings.ts` + `src/types/appSettings.ts`（新设置组/默认值）。
- **EnigoManager 粘贴**：在 `tauri-commands/core/src/lib.rs` 增组合键 `Ctrl+V` 模拟。

### 🆕 新建
- **剪贴板监听服务（Rust）**：监听系统剪贴板变更（`tauri-plugin-clipboard` 已在 `src-tauri/src/lib.rs` 以 `tauri_plugin_clipboard::init()` 注册，支持 `start_monitor` 并发出 `plugin:clipboard://clipboard-monitor/update` 事件）。新增命令：`get_active_window_info`（标题/exe）、`paste_to_active_window`、历史读写。
- **剪贴板历史存储**：`ClipboardHistoryStore extends BaseStore`（文本入 store，图片落盘 `appConfigDir/clipboard/`，元数据：类型/来源/时间/收藏/缩略图）。
- **剪贴板侧栏（前端）**：路由 `src/routes/_noLayout/clipboardSidebar.lazy.tsx` + 页面 `src/pages/clipboardSidebar/`（搜索/筛选胶囊/日期分组/卡片「左类型·右内容」/AI 动作菜单/底部工具条）。
- **AI 动作前端封装**：`src/commands/clipboard.ts`；AI 动作预设复用 `ChatWorkflowConfig`/`ChatWorkflowConfigStore`（`src/utils/appStore.ts`），内置 总结/简释/解释/优化/简写/转JSON/翻译。

---

## 2. 核心数据流

### 2.1 剪贴板历史
```
系统剪贴板变更
  → tauri-plugin-clipboard 监听事件（main 窗口常驻订阅）
  → 读取内容 + get_active_window_info(来源) + 时间戳 + 分类(text/code/color/image/file/html)
  → 去重(连续相同跳过) → ClipboardHistoryStore(文本) / 落盘(图片+缩略图)
  → emit 历史更新事件 → 侧栏窗口实时刷新列表
```

### 2.2 直接粘贴
```
唤出侧栏前：Rust 记录当前前台窗口 HWND
  → 用户点选某条记录
  → 隐藏侧栏窗口 → 恢复前台窗口焦点(SetForegroundWindow)
  → 写回系统剪贴板(对应类型) → paste_to_active_window(EnigoManager 模拟 Ctrl+V)
```

### 2.3 AI 处理
```
选中剪贴板内容 + 选 AI 动作(预设提示词，{{INPUT}} 注入)
  → 取「默认 AI 后端」(Ollama 或 云端) 的 ChatApiConfig
  → new OpenAI({baseURL:api_uri, apiKey:api_key, fetch:appFetch, dangerouslyAllowBrowser:true})
  → 流式 transformMessage → MarkdownContent 渲染到结果面板
  → 操作：复制 / 复制并替换原项 / 存为新剪贴板项 / 直接粘贴
```

### 2.4 翻译
```
内容 → 选引擎(默认大模型) → core/translations 调用
  大模型: OpenAI 客户端按系统提示词翻译
  官方:   POST https://snowshot.top/api/v2/translation/translate
  自定义: 用户配置的 DeepL/HTTP/OpenAI 兼容端点
```

### 2.5 OCR
```
截图/剪贴板图片 → ocrInit(本地模型目录) → ocrDetect(图像bytes, scaleFactor, detectAngle)
  → OcrDetectResult(文本块+坐标) → 覆盖层展示 / 提取纯文本 → 入历史 or 交给 AI
模型目录: 插件机制下载到 {configDir}/plugins/rapid_ocr/（首次联网，snowshot.top）
```

---

## 3. 存储 / 类型 schema 摘要

- `ChatApiConfig`（`src/types/appSettings.ts`）：`{ api_uri, api_key, api_model, model_name, support_thinking, support_vision? }`。
- `AppSettingsGroup.FunctionChat`：`{ autoCreateNewSession, autoCreateNewSessionOnCloseWindow, chatApiConfigList: ChatApiConfig[] }`。
- `ChatWorkflowConfig`（`src/utils/appStore.ts`）：`{ id, name, description?, flow_list: ChatWorkflowFlow[] }`；`ChatWorkflowFlow = { variable_name?, ignore_context, message }`。→ 复用为「AI 动作」。
- **新增** `ClipboardHistoryItem`（拟）：`{ id, type:'text'|'code'|'color'|'image'|'file'|'html', content|filePath|thumbPath, sourceApp, sourceTitle, createdAt, favorite }`。
- **新增** `AppSettingsGroup.ClipboardSidebar`（拟）：`{ dockSide:'left'|'right', maxItems, pasteOnSelect:boolean, monitorEnabled }`。
- **新增** AI 后端相关：复用 `chatApiConfigList`，另存「默认后端 id / 翻译引擎」于缓存设置组。

存储落点：`{appConfigDir}/stores/<name>.json`（`BaseStore.init`），图片：`{appConfigDir}/clipboard/`。

---

## 4. i18n

- 入口 `src/messages/map.ts`：`{ 'zh-Hans': zhHans, 'zh-Hant': {...zhHans,...zhHant}, en: {...zhHans,...en} }`（zhHans 为基底）。
- 文件：`src/messages/zhHans/{index,tools,settings}.ts`、`src/messages/en.ts`、`src/messages/zhHant.ts`。
- 新增字符串前缀建议：`clipboard.*`（侧栏）、`settings.functionSettings.aiBackend.*`、`settings.functionSettings.translateEngine.*`、`tools.ai.action.*`。

---

## 5. 构建前置（本机状态）

| 前置 | 状态 | 备注 |
|---|---|---|
| node / pnpm / rust / cargo / git | ✅ 24.14 / 10.33 / 1.95 / 1.95 / 2.53 | git 走 Clash 代理 127.0.0.1:7890 |
| yarn (classic) | ✅ 1.22.22 | `yarn config set ignore-engines true`（兼容 node24） |
| excalidraw 分支 | ✅ clone(`custom/master`)+install+`build:packages` | dist: dev/prod/types 就绪 |
| onnxruntime.lib | ✅ 已放 `src-tauri/lib/onnxruntime.lib` | onnxruntime-build v1.22.1 win-x64 静态库；`.cargo/config.toml` `ORT_LIB_LOCATION=./lib` |
| OCR 模型 | ⏳ 运行时下载 | snowshot.top/plugins/20251005/windows_x64/rapid_ocr.zip 可达；zip 用 zstd 压缩，标准工具无法预解，交由 app 内 Rust 解压 |
| 自定义 git Cargo 依赖 | ⏳ 首次 cargo build 拉取 | xcap/scap/device_query 的 mg-chao fork，需代理 |
| FFmpeg（录屏） | ⛔ 暂不需要 | 本期不涉及视频 |
| `snow-shot-main` 前端依赖 | ✅ `pnpm i` 完成 | 另补装上游漏声明的 `qr-scanner-wechat`（draw 工具栏二维码扫描动态 import 需要，否则前端打包失败） |

---

## 5.1 已完成实现（v0.1）

**构建验证**：前端 `pnpm build` 通过（exit 0）；`tsc --noEmit` 全项目 0 错误；Rust `cargo build` 通过（exit 0）。

**新增/修改文件**
- Rust：`app-shared/src/lib.rs`（`EnigoManager::paste()`）、`app-os/src/utils/windows.rs`（`get_foreground_window_handle`/`set_foreground_window`/`get_window_title`）、`src/core.rs`（`ForegroundWindowHandle` + `get_active_window_info`/`capture_foreground_window`/`paste_to_active_window`）、`src/lib.rs`（manage + 注册）。
- 前端新增：`commands/clipboardZmeng.ts`、`functions/clipboardSidebar.ts`、`pages/clipboardSidebar/{types,store,ai,monitor,page,AiPanel,SettingsPanel}.tsx`、`routes/_noLayout/clipboardSidebar.lazy.tsx`。
- 前端修改：`utils/appStore.ts`（导出 `BaseStore`）、`types/components/appFunction.ts` + `constants/appFunction.ts`（`ClipboardSidebar` + 默认快捷键 `Shift+Ctrl+V`）、`components/globalShortcut/index.tsx`（switch case + import）、`components/trayIconLoader.tsx`（托盘项 + import）、`messages/zhHans/home.ts`（`home.clipboardSidebar`）。
- 配置：`tauri.conf.json`（品牌 ZMENG + `clipboard-sidebar` 窗口）、`capabilities/default.json`（剪贴板监听/读写权限）。

**已实现功能**
- 剪贴板历史：监听（文件>图片>文本/HTML 单条去重）、来源窗口标题、分类（文字/代码/颜色/图片/富文本/文件）、持久化、容量淘汰（收藏不淘汰）。
- 侧栏 UI：边缘滑出（默认右，可切左）、搜索、分类筛选、按日期分组、卡片「左类型·右内容」、收藏/删除/复制、底部工具条（截图/OCR/翻译）。
- 直接粘贴：写回剪贴板 + 恢复前台窗口 + 模拟 Ctrl+V（`pasteOnSelect` 可关）。
- AI 处理：Ollama+云端可切换、预设动作（总结/解释/简释/优化/简写/转 JSON/翻译）、流式 Markdown 结果、复制/粘贴；Ollama 模型自动检测（`/api/tags`）。
- 翻译：剪贴板项「翻译」用大模型（默认目标语言中文，可改）；截图翻译用 snow-shot 原管线（`ScreenshotType.OcrTranslate`）。
- OCR：截图 OCR 复用 `ScreenshotType.OcrDetect`（模型首次运行自动下载）。

**已知后续项（非阻塞）**
- 设置里的「官方 snowshot 翻译」开关目前仅存储，剪贴板项翻译固定走大模型（截图翻译走官方/自定义按 snow-shot 设置）。
- 针对剪贴板「图片项」的一键 OCR（图片→文本）未做，当前 OCR 经截图区域选择路径。
- 大图历史以 base64 存 store，靠条数上限约束，后续可改为落盘缩略图。

---

## 6. 风险与注意

1. **自动粘贴受 UIPI 限制**：以管理员权限运行的目标窗口，非提权进程无法注入模拟按键。
2. **图片历史体积**：需容量上限 + 大小限制 + 淘汰策略（收藏不淘汰）。
3. **联网依赖**：自定义 Cargo git 依赖、OCR 首次模型下载、(可选)官方翻译均需代理；翻译默认大模型以降风险。
4. **改前端须重建 EXE**：前端内嵌进 EXE，改前端后需 `pnpm build && pnpm tauri build`。
5. **monitor 启动点**：剪贴板监听应在常驻的 `main` 窗口上下文启动，避免侧栏关闭即停。
6. **命令注册**：所有新 Rust 命令需在 `src-tauri/src/lib.rs` 的 `invoke_handler!` 注册，并按需在 `capabilities/` 放行权限。
