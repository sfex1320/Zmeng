# ZMENG —— 截图 · 剪贴板 · OCR · 翻译 · AI 一体化工具

> 一款 Windows 桌面效率工具：把**截图标注、剪贴板历史、OCR 文字识别、翻译**与**本地/云端大模型 AI 处理**整合到一个应用里。基于成熟开源项目 [snow-shot](https://github.com/mg-chao/snow-shot) 原地扩展而来。

---

## 1. 产品愿景

让“复制 → 处理 → 粘贴”这条高频链路一步到位：

- **复制**任何内容（文字/图片/代码/颜色/文件），自动进入**剪贴板历史侧栏**（从屏幕边缘滑出，卡片为「左类型 / 右内容」布局）。
- **处理**：对任意一条记录一键调用 AI——**总结、简释、解释、优化、简写、转 JSON、翻译**，可接**本地 Ollama**或**云端 OpenAI 兼容 API**，自由切换。
- **粘贴**：点选历史记录后**直接粘贴回当前应用**（写回剪贴板 + 模拟 Ctrl+V）。
- 同时保留 snow-shot 全部能力：**截图 + 标注**、**本地 OCR**、**翻译**。

## 2. 功能清单

| 模块 | 说明 | 来源 |
|---|---|---|
| 截图 + 标注 | 区域/窗口/全屏/滚动截图，矩形/箭头/文字/马赛克等标注 | 复用 snow-shot |
| OCR | 本地 Paddle ONNX 文字识别，离线可用 | 复用 snow-shot |
| 翻译 | 默认大模型翻译（自包含），可切官方 snowshot / 自定义(DeepL) | 复用 + 扩展 |
| AI 对话 | OpenAI SDK + ant-design/x，流式、Markdown、推理模式 | 复用 snow-shot |
| **剪贴板历史侧栏** | 边缘滑出面板，监听/分类/搜索/筛选/收藏/按日期分组/直接粘贴 | **新增** |
| **AI 处理动作** | 对剪贴板内容跑预设提示词，Ollama/云端可切换，结果可复制/替换/插入 | **新增** |

## 3. 技术栈

- **GUI**：Tauri 2（Rust 后端 + WebView 前端）
- **前端**：React 19 · Ant Design 5 · @ant-design/x · TanStack Router · rsbuild（非 Vite/Next）· styled-jsx
- **状态/存储**：@tauri-apps/plugin-store（JSON 持久化）
- **AI**：`openai` SDK（baseURL 可配置 → 兼容 Ollama `localhost:11434/v1`）
- **后端 crate**：Rust workspace（OCR/screenshot/scroll-screenshot/http-service/app-os/app-services…）
- **OCR**：`paddle-ocr-rs` + ONNX Runtime（静态链接）
- **标注**：`@mg-chao/excalidraw` 自定义分支（ESM 包，`file:` 依赖）
- **键鼠模拟/窗口**：`enigo`、Windows API（前台窗口、焦点恢复）
- **剪贴板**：`tauri-plugin-clipboard`（变更监听）+ `tauri-plugin-clipboard-manager`

## 4. 架构与目录

**项目根 `g:/Project/Zmeng/` 即应用本体**（snow-shot 已原地扩展并上移到根，无 snow-shot-main 子目录）。

```
g:/Project/Zmeng/                  ← 应用根，所有命令在此执行
├── PROJECT.md / CONTEXT.md / CLAUDE.md   ← 文档
├── package.json                   ← 含 file:./excalidraw 依赖
├── src/                  ← React 前端
│   ├── pages/clipboardSidebar/    ← 【新增】剪贴板侧栏页面
│   ├── pages/tools/chat/          ← 复用：AI 对话（流式/Markdown）
│   ├── core/translations/         ← 复用+扩展：翻译（大模型默认）
│   ├── commands/                  ← Tauri 命令前端封装（含【新增】clipboardZmeng.ts）
│   ├── components/globalShortcut, trayIconLoader ← 快捷键/托盘（接入新功能）
│   ├── utils/appStore.ts          ← Store 基类 + 预设/历史存储
│   └── messages/                  ← i18n（zhHans/en/zhHant）
├── src-tauri/            ← Rust 后端（EXE 产物在 target/release/）
│   ├── src/core.rs, lib.rs        ← 命令注册（含【新增】剪贴板/粘贴命令）
│   ├── lib/onnxruntime.lib        ← 【已放置】OCR 静态库
│   └── src-crates/                ← 业务 crate（ocr/screenshot/app-os…）
└── excalidraw/           ← @mg-chao/excalidraw 自定义分支（标注依赖，已 clone+build）
```

## 5. 关键设计取舍（已与用户确认）

1. **原地扩展 snow-shot**（而非新建）：最大化复用截图/OCR/翻译/AI，功能最全。
2. **AI 后端双支持**：Ollama 与云端 API 都可在设置中配置多条，运行时切换。
3. **翻译默认大模型**：不强依赖 snowshot.top，离线/自主；官方与自定义(DeepL)作为可选。
4. **点选历史 = 直接粘贴**：写回剪贴板并模拟 Ctrl+V 到原聚焦窗口。
5. **OCR 模型**：首次使用经 snow-shot 插件机制从 snowshot.top 自动下载（已验证可达）。

## 6. 构建与运行

### 6.1 一次性前置（已在本机完成）
- `yarn`（classic）已装；`yarn config set ignore-engines true`（兼容 Node 24）。
- `excalidraw/` 自定义分支已 clone（`custom/master`）、`yarn install`、`yarn build:packages`。
- `snow-shot-main/src-tauri/lib/onnxruntime.lib` 已放置（来自 onnxruntime-build v1.22.1 静态库）。
- OCR 模型首次运行时自动下载（snowshot.top 经 Clash 代理可达）。

### 6.2 开发调试（在项目根 g:/Project/Zmeng）
```bash
pnpm i            # excalidraw 已在 ./excalidraw 构建好
pnpm tauri dev    # 前端 dev 端口 8083，启动 Tauri 调试窗口
```

### 6.3 打包出 EXE（在项目根）
```bash
pnpm build
pnpm tauri build  # 产物：target/release/zmeng.exe + bundle/nsis 安装包
```
> 注意：前端被内嵌进 EXE，**改前端后必须重建 EXE 才生效**。

### 6.4 使用 AI（Ollama）
```bash
ollama pull qwen2.5    # 或任意本地模型
# 设置 → 功能设置 → AI 后端：新增一条 Ollama（api_uri=http://localhost:11434/v1，key 留空）
```

## 7. 路线图

- v0.1：剪贴板侧栏（监听/分类/搜索/筛选/收藏/直接粘贴）+ AI 处理（Ollama+云端）+ 大模型翻译 + 截图/OCR 接线 + ZMENG 品牌化。
- 后续：剪贴板内容置顶/标签、AI 动作自定义编排、滚动截图增强、跨设备同步等。

详细的代码级映射、数据流与决策记录见 [CONTEXT.md](./CONTEXT.md)。
