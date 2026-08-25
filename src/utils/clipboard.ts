import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as clipboard from "@tauri-apps/plugin-clipboard-manager";
import extraClipboard from "tauri-plugin-clipboard-api";
import { appWarn } from "./log";

/**
 * 写剪贴板前登记全局自写标记（Rust 侧原子时间戳）。
 * 剪贴板监听据此跳过本应用自己写入的内容——JS 变量只在本窗口生效，
 * 截图窗口/主窗口的写入只有靠这个跨窗口标记才能被侧栏识别。
 */
const markSelfWrite = () => {
	invoke("clipboard_self_write_mark").catch(() => {});
};

export const copyText = (text: string) => {
	const selected = window.getSelection();
	if (selected?.toString().trim()) {
		writeTextToClipboard(selected.toString());
		selected.removeAllRanges();
	} else {
		writeTextToClipboard(text);
	}
};

export const copyTextAndHide = (text: string) => {
	copyText(text);
	getCurrentWindow().hide();
};

const supportClipboardApi = () => {
	if (
		typeof navigator !== "undefined" &&
		navigator.clipboard &&
		window.ClipboardItem
	) {
		return true;
	} else {
		return false;
	}
};

export const writeTextToClipboard = async (text: string) => {
	markSelfWrite();
	let isSuccess = false;
	try {
		await extraClipboard.writeText(text);
		isSuccess = true;
	} catch (error) {
		isSuccess = false;
		appWarn("[clipboard] writeTextToClipboard error", error);
	}

	if (isSuccess) {
		return;
	}

	if (supportClipboardApi()) {
		await navigator.clipboard.write([
			new ClipboardItem({ "text/plain": text }),
		]);
	} else {
		appWarn("[clipboard] Modern Clipboard API not supported, text copy failed");
	}
};

export const writeImageToClipboard = async (
	image: Blob | ArrayBuffer,
	format = "image/png",
) => {
	markSelfWrite();
	let isSuccess = false;
	try {
		await clipboard.writeImage(
			image instanceof Blob ? await image.arrayBuffer() : image,
		);
		isSuccess = true;
	} catch (error) {
		appWarn("[clipboard] writeImageToClipboard error", error);
	}

	if (isSuccess) {
		return;
	}

	if (supportClipboardApi()) {
		await navigator.clipboard.write([
			new ClipboardItem({
				[format]: image instanceof Blob ? image : new Blob([image]),
			}),
		]);
	} else {
		appWarn(
			"[clipboard] Modern Clipboard API not supported, image copy failed",
		);
	}
};

export const writeHtmlToClipboard = async (html: string) => {
	markSelfWrite();
	let isSuccess = false;
	try {
		await clipboard.writeHtml(html);
		isSuccess = true;
	} catch (error) {
		isSuccess = false;
		appWarn("[clipboard] writeHtmlToClipboard error", error);
	}

	if (isSuccess) {
		return;
	}

	if (supportClipboardApi()) {
		await navigator.clipboard.write([new ClipboardItem({ "text/html": html })]);
	} else {
		appWarn("[clipboard] Modern Clipboard API not supported, HTML copy failed");
	}
};

export const writeFilePathToClipboard = async (filePath: string) => {
	markSelfWrite();
	let isSuccess = false;
	try {
		await extraClipboard.writeFiles([filePath]);
		isSuccess = true;
	} catch (error) {
		appWarn("[clipboard] writeFilePathToClipboard error", error);
	}

	if (isSuccess) {
		return;
	}
};
