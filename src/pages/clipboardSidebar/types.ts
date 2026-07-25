export type ClipboardItemType =
	| "text"
	| "code"
	| "color"
	| "image"
	| "html"
	| "files";

export type ClipboardHistoryItem = {
	id: string;
	type: ClipboardItemType;
	/** 文本类内容（text / code / color 的纯文本，html 的纯文本回退） */
	content?: string;
	/** html 富文本 */
	html?: string;
	/** image：base64 data URL（data:image/png;base64,...） */
	image?: string;
	/** files：文件路径数组 */
	files?: string[];
	/** files 类型里第一张「图片且 ≤20MB」文件的预览源（convertFileSrc URL），用于列表缩略图 */
	filePreview?: string;
	/** 来源应用窗口标题 */
	sourceTitle?: string;
	/** 字符数（文本类用于展示） */
	size?: number;
	/** 去重键：入库时算一次，避免每次对图片重建整段 base64 比较 */
	dedupKey?: string;
	createdAt: number;
	favorite?: boolean;
};
