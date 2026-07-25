import { invoke } from "@tauri-apps/api/core";

/** 当前前台窗口信息（句柄 + 标题），用于标记剪贴板内容来源 */
export type ActiveWindowInfo = {
	handle: number;
	title: string;
};

/** 获取当前前台窗口信息 */
export const getActiveWindowInfo = async (): Promise<ActiveWindowInfo> => {
	return await invoke<ActiveWindowInfo>("get_active_window_info");
};

/** 记录当前前台窗口（在显示侧栏窗口之前调用），用于稍后直接粘贴 */
export const captureForegroundWindow = async (): Promise<void> => {
	return await invoke<void>("capture_foreground_window");
};

/** 恢复之前记录的前台窗口焦点并模拟 Ctrl+V 粘贴 */
export const pasteToActiveWindow = async (): Promise<void> => {
	return await invoke<void>("paste_to_active_window");
};

/** 原生拖放载荷：要拖出的真实文件 + 拖拽预览图标路径 */
export type DragPayload = {
	files: string[];
	icon: string;
};

/** 把剪贴板图片/截图的 base64 落成真实 PNG 文件，供系统级拖放（返回文件路径 + 预览图标） */
export const prepareDragImage = async (
	imageBase64: string,
): Promise<DragPayload> => {
	return await invoke<DragPayload>("prepare_drag_image", { imageBase64 });
};

/** 为「文件类」剪贴板项准备系统级拖放载荷（直接用真实路径 + 图标） */
export const prepareDragFiles = async (
	files: string[],
): Promise<DragPayload> => {
	return await invoke<DragPayload>("prepare_drag_files", { files });
};

/** 从一组文件中挑出第一张「图片且 ≤ maxBytes」的路径，用于列表缩略图预览 */
export const pickImagePreview = async (
	files: string[],
	maxBytes: number,
): Promise<string | null> => {
	return await invoke<string | null>("pick_image_preview", {
		files,
		maxBytes,
	});
};
