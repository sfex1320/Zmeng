import { emit } from "@tauri-apps/api/event";
import { message } from "antd";
import { readText, writeText } from "tauri-plugin-clipboard-api";
import {
	captureForegroundWindow,
	pasteToActiveWindow,
} from "@/commands/clipboardZmeng";
import { appError } from "@/utils/log";

/**
 * 切换剪贴板侧栏显示。
 * 先记录当前前台窗口（用于稍后直接粘贴），再通知侧栏窗口切换显隐。
 */
export const toggleClipboardSidebar = async () => {
	try {
		await captureForegroundWindow();
	} catch (error) {
		appError("[clipboardSidebar] captureForegroundWindow failed", error);
	}
	await emit("zmeng://toggle-sidebar");
};

/**
 * 把当前剪贴板内容以「纯文本」粘贴到当前前台应用（全局快捷键）。
 * 读出纯文本 → 仅写回纯文本（清掉 HTML/RTF 格式）→ 模拟 Ctrl+V。
 */
export const pasteAsPlainText = async () => {
	try {
		await captureForegroundWindow();
	} catch (error) {
		appError("[pasteAsPlainText] captureForegroundWindow failed", error);
	}
	let text = "";
	try {
		text = (await readText()) ?? "";
	} catch {
		text = "";
	}
	if (!text) {
		// 剪贴板当前无纯文本（如图片/文件）：给出反馈，避免按键毫无反应
		message.info("剪贴板没有可粘贴的纯文本");
		return;
	}
	try {
		await writeText(text);
	} catch (error) {
		appError("[pasteAsPlainText] writeText failed", error);
	}
	// 等待剪贴板写入对目标进程可见，避免抢在写入前粘到旧内容
	await new Promise((r) => setTimeout(r, 40));
	try {
		await pasteToActiveWindow();
	} catch (error) {
		appError("[pasteAsPlainText] paste failed", error);
	}
};
