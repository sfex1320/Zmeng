export enum AppFunction {
	Screenshot = "screenshot",
	ScreenshotFixed = "screenshotFixed",
	ScreenshotOcr = "screenshotOcr",
	/** 延迟 x 秒后截图 */
	ScreenshotDelay = "screenshotDelay",
	/** 截取当前具有焦点的窗口 */
	ScreenshotFocusedWindow = "screenshotFocusedWindow",
	/** 截图全屏 */
	ScreenshotFullScreen = "screenshotFullScreen",
	/** 截图复制到剪贴板 */
	ScreenshotCopy = "screenshotCopy",
	/** 截图翻译 */
	ScreenshotOcrTranslate = "screenshotOcrTranslate",
	Chat = "chat",
	ChatSelectText = "chatSelectText",
	Translation = "translation",
	TranslationSelectText = "translationSelectText",
	FixedContent = "fixedContent",
	VideoRecord = "videoRecord",
	VideoRecordCopy = "videoRecordCopy",
	TopWindow = "topWindow",
	FullScreenDraw = "fullScreenDraw",
	ShowOrHideMainWindow = "showOrHideMainWindow",
	OpenImageSaveFolder = "openImageSaveFolder",
	OpenCaptureHistory = "openCaptureHistory",
	/** ZMENG: 切换剪贴板侧栏 */
	ClipboardSidebar = "clipboardSidebar",
	/** ZMENG: 把当前剪贴板内容以纯文本粘贴到当前应用 */
	PasteAsPlainText = "pasteAsPlainText",
}

export enum AppFunctionGroup {
	Screenshot = "screenshot",
	Translation = "translation",
	Chat = "chat",
	VideoRecord = "videoRecord",
	Other = "other",
}

export type AppFunctionConfig = {
	shortcutKey: string;
	group: AppFunctionGroup;
};

export type AppFunctionComponentConfig = AppFunctionConfig & {
	configKey: AppFunction;
	title: React.ReactNode;
	icon?: React.ReactNode;
	group: AppFunctionGroup;
	onClick: () => Promise<void>;
	onKeyChange: (value: string, prevValue: string) => Promise<boolean>;
};
