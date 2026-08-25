# AGENTS.md — ZCode / AI 会话工程规范入口

> 本项目的完整工程规范、目录结构、构建约定见 **[CLAUDE.md](./CLAUDE.md)**（每次会话必读）。
> 对外交付的打包规范见 **[APP/构建说明.md](./APP/构建说明.md)**。

## 最高优先级约定（摘录）

1. 所有命令在项目根 `G:\Project\Zmeng` 执行；前端内嵌进 EXE，**改前端后必须 `pnpm tauri build` 重建**
2. **便携版三件套**：交付到 `APP/` 时 `zmeng.exe` + `app-icons/`（托盘图标资源）+ `__portable`（空标记，激活首启自动创建桌面快捷方式、跳过自动更新）缺一不可
3. 新增 Rust 命令必须在 `src-tauri/src/lib.rs` 的 `invoke_handler!` 注册
4. 校验顺序：`pnpm build` → `npx tsc --noEmit` → `cargo build`
5. 翻译默认大模型自包含；官方 snowshot.top 依赖（模型/翻译/OCR下载）随时可能失效，代码需自带回退
