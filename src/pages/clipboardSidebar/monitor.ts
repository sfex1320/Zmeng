import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
	onSomethingUpdate,
	readFiles,
	readHtml,
	readImageBase64,
	readText,
	startListening,
	stopMonitor,
} from "tauri-plugin-clipboard-api";
import {
	getActiveWindowInfo,
	pickImagePreview,
} from "@/commands/clipboardZmeng";
import type { ClipboardHistoryItem, ClipboardItemType } from "./types";

/** 图片文件预览体积上限：≤20MB 的图片文件都生成缩略图（用户明确要求） */
const FILE_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

const COLOR_RE =
	/^(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([^)]*\)|hsla?\([^)]*\))$/;

/**
 * 自写抑制：侧栏自身写剪贴板（仅复制 / 粘贴 / 复制 AI 结果）也会触发 onSomethingUpdate，
 * 调用本函数登记一个短时间窗口，期间监听到的剪贴板更新会被跳过，
 * 避免「点仅复制却自动收起 / 重复入库」。
 */
let suppressUntil = 0;
export function suppressClipboardCapture(ms = 700): void {
	suppressUntil = Date.now() + ms;
}

/** 为一条记录计算稳定去重键（图片只取长度+首尾片段，避免每次重建整段 base64） */
export function buildDedupKey(item: ClipboardHistoryItem): string {
	if (item.type === "image" && item.image) {
		const b = item.image;
		return `image:${b.length}:${b.slice(0, 48)}:${b.slice(-48)}`;
	}
	if (item.type === "files") {
		return `files:${(item.files ?? []).join("|")}`;
	}
	return `${item.type}:${item.content ?? item.html ?? ""}`;
}

function looksLikeCode(text: string): boolean {
	const t = text.trim();
	if (/\n/.test(t) && /[;{}<>]/.test(t)) {
		return true;
	}
	if (
		/^\s*(function |const |let |var |import |export |class |def |public |private |#include|<\?php|SELECT |INSERT |<!DOCTYPE|<html|package |fn |impl |use )/m.test(
			t,
		)
	) {
		return true;
	}
	return false;
}

function classifyText(text: string): ClipboardItemType {
	const t = text.trim();
	if (COLOR_RE.test(t)) {
		return "color";
	}
	if (looksLikeCode(t)) {
		return "code";
	}
	return "text";
}

/**
 * 启动剪贴板监听。每次复制只产生一条记录（按 文件 > 图片 > 文本/HTML 优先级）。
 * @param onItem 新记录回调
 * @returns 停止监听函数
 */
export async function startClipboardMonitor(
	onItem: (item: ClipboardHistoryItem) => void,
): Promise<() => void> {
	let stopListen: (() => Promise<void>) | undefined;
	let unSomething: (() => void) | undefined;

	try {
		stopListen = await startListening();
	} catch {
		// 监听可能已在运行，忽略
	}

	unSomething = await onSomethingUpdate(async (types) => {
		// 自写抑制（本窗口）：跳过由侧栏自身写剪贴板触发的更新
		if (Date.now() < suppressUntil) {
			return;
		}
		// 自写抑制（跨窗口）：截图窗口/Rust 侧写入前会在全局登记标记，
		// 避免一次截图因 CF_DIB + PNG 两次写入产生两条内容不同的重复记录
		try {
			if (await invoke<boolean>("clipboard_self_write_recent")) {
				return;
			}
		} catch {
			// 命令不可用时按原逻辑继续
		}
		try {
			const src = await getActiveWindowInfo().catch(() => ({
				handle: 0,
				title: "",
			}));
			const id = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
			const base = {
				id,
				createdAt: Date.now(),
				sourceTitle: src.title || undefined,
			};
			// 统一出口：补上去重键再回调
			const emit = (item: ClipboardHistoryItem) =>
				onItem({ ...item, dedupKey: buildDedupKey(item) });

			if (types.files) {
				const files = await readFiles().catch(() => [] as string[]);
				if (files?.length) {
					// 复制的图片文件（≤20MB）也要有缩略图：挑出第一张图片文件，转成可在 webview 显示的 URL
					const previewPath = await pickImagePreview(
						files,
						FILE_PREVIEW_MAX_BYTES,
					).catch(() => null);
					emit({
						...base,
						type: "files",
						files,
						filePreview: previewPath ? convertFileSrc(previewPath) : undefined,
					});
				}
				return;
			}

			if (types.image) {
				const b64 = await readImageBase64().catch(() => "");
				if (b64) {
					emit({
						...base,
						type: "image",
						image: `data:image/png;base64,${b64}`,
					});
					return;
				}
				// 读图失败时不早退，继续往下尝试 文件/HTML/文本 兜底入库，避免这次复制被静默丢弃
			}

			if (types.html || types.text) {
				const text = await readText().catch(() => "");
				const html = types.html ? await readHtml().catch(() => "") : undefined;
				if (text?.trim()) {
					emit({
						...base,
						type: classifyText(text),
						content: text,
						html: html || undefined,
						size: text.length,
					});
				} else if (html) {
					emit({
						...base,
						type: "html",
						html,
						content: html,
						size: html.length,
					});
				}
			}
		} catch {
			// 单次读取失败不影响后续监听
		}
	});

	return () => {
		try {
			unSomething?.();
		} catch {
			// ignore
		}
		try {
			// startListening 失败（如已在运行）时拿不到它返回的停止句柄：
			// 兜底直接停止 OS 级监视线程，确保监听随页面销毁彻底回收
			if (stopListen) {
				stopListen();
			} else {
				stopMonitor();
			}
		} catch {
			// ignore
		}
	};
}
