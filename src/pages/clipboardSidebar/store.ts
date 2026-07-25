import { BaseStore } from "@/utils/appStore";
import type { ClipboardHistoryItem } from "./types";

/** 剪贴板历史存储（每条记录一个 key，value 为记录本体） */
export class ClipboardHistoryStore extends BaseStore<ClipboardHistoryItem> {
	constructor() {
		super("zmeng-clipboard-history", 1000);
	}

	async listAll(): Promise<ClipboardHistoryItem[]> {
		const entries = await this.entries();
		return entries
			.map(([, value]) => value)
			.sort((a, b) => b.createdAt - a.createdAt);
	}
}

export type TranslateEngine = "llm" | "official";

/**
 * 剪贴板侧栏自身的行为/外观配置。
 * 注意：AI 模型后端已统一到设置体系的 FunctionChat.chatApiConfigList，
 * 这里不再单独保存 AI 后端，避免「每个功能各配一遍」。
 */
export type ZmengSettings = {
	/** 翻译引擎：大模型（自包含） / 官方在线 */
	translateEngine: TranslateEngine;
	/** 翻译目标语言（大模型翻译时使用） */
	translateTargetLang: string;
	/** 侧栏停靠侧 */
	dockSide: "left" | "right";
	/** 点选历史时直接粘贴到当前应用 */
	pasteOnSelect: boolean;
	/** 历史最大条数（超出后淘汰最旧的非收藏项） */
	maxItems: number;
	/** 侧栏宽度（像素） */
	sidebarWidth: number;
	/** 侧栏不透明度（0~1） */
	sidebarOpacity: number;
	/** 复制到新内容后自动收起侧栏 */
	autoHideOnCopy: boolean;
};

export const defaultZmengSettings: ZmengSettings = {
	translateEngine: "llm",
	translateTargetLang: "中文",
	dockSide: "right",
	pasteOnSelect: true,
	maxItems: 200,
	sidebarWidth: 460,
	sidebarOpacity: 1,
	autoHideOnCopy: false,
};

/** ZMENG 剪贴板侧栏配置存储 */
export class ZmengSettingsStore extends BaseStore<ZmengSettings> {
	constructor() {
		super("zmeng-settings", 500);
	}

	async loadSettings(): Promise<ZmengSettings> {
		const s = await this.get("settings");
		return {
			...defaultZmengSettings,
			...(s ?? {}),
		};
	}

	async storeSettings(settings: ZmengSettings): Promise<void> {
		await this.set("settings", settings);
		await this.save();
	}
}
