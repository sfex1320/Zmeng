import {
	getCurrentWindow,
	PhysicalPosition,
	PhysicalSize,
	type Window as TauriWindow,
} from "@tauri-apps/api/window";
import type { ElementRect } from "@/types/commands/screenshot";
import { getPlatform } from "./platform";

export const showWindow = async (ignoreFocus = false) => {
	const appWindow = getCurrentWindow();
	await Promise.all([await appWindow.unminimize(), appWindow.show()]);
	if (!ignoreFocus) {
		await appWindow.setFocus();
	}
};

export const closeWindowComplete = async () => {
	const appWindow = getCurrentWindow();
	await appWindow.hide();
	await new Promise((resolve) => {
		setTimeout(resolve, 256);
	});
	await appWindow.close();
};

export const setWindowRect = async (
	appWindow: TauriWindow,
	rect: ElementRect,
) => {
	// 设置两次位置，防止窗口缩放变化
	const windowPosition = new PhysicalPosition(rect.min_x, rect.min_y);
	const windowSize = new PhysicalSize(
		rect.max_x - rect.min_x,
		rect.max_y - rect.min_y,
	);

	if (getPlatform() === "macos") {
		// macOS 的情况有些特殊，特殊处理下

		// 初始窗口位置
		await appWindow.setPosition(windowPosition);
		// 设置位置后，需要再设置一次，确保不受 scale factor 影响
		await appWindow.setPosition(windowPosition);
		await appWindow.setSize(windowSize);
		// 窗口可能发生变化了，需要再设置一次
		appWindow.setPosition(windowPosition);
	} else {
		// windows 也设置两次，防止窗口位置引起了窗口缩放变化
		// 两次设置必须顺序执行并等待完成：此前第二次未 await，
		// 与截图取屏并发时窗口尺寸仍处于中间状态，会造成画面抖动/错位
		await Promise.all([
			appWindow.setPosition(windowPosition),
			appWindow.setSize(windowSize),
		]);
		await Promise.all([
			appWindow.setPosition(windowPosition),
			appWindow.setSize(windowSize),
		]);
	}
};
