export enum CommonKeyEventGroup {
	Translation = "translation",
	FixedContent = "fixedContent",
}

export type CommonKeyEventValue = {
	hotKey: string;
	unique?: boolean;
	group: CommonKeyEventGroup;
};

export type CommonKeyEventComponentValue = CommonKeyEventValue & {
	messageId: string;
};

export enum CommonKeyEventKey {
	CopyAndHide = "copyAndHide",
	Copy = "copy",
	FixedContentEnableDraw = "fixedContentEnableDraw",
	FixedContentSwitchThumbnail = "fixedContentSwitchThumbnail",
	FixedContentAlwaysOnTop = "fixedContentAlwaysOnTop",
	FixedContentCloseWindow = "fixedContentCloseWindow",
	FixedContentCopyToClipboard = "fixedContentCopyToClipboard",
	// FixedContentCopyRawToClipboard = 'fixedContentCopyRawToClipboard',
	FixedContentSaveToFile = "fixedContentSaveToFile",
	FixedContentSelectText = "fixedContentSelectText",
	FixedContentSetOpacity = "fixedContentSetOpacity",
}
