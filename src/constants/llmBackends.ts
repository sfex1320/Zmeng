import { CUSTOM_MODEL_PREFIX } from "./components/chat";
import type { ChatApiConfig } from "@/types/appSettings";

/**
 * ZMENG 默认大模型后端：用户自建的 momo 中转站（OpenAI 兼容）。
 * 翻译与剪贴板 AI 默认走 MiniMax-M2（便宜、快）；视觉走本地 Ollama qwen3-vl（见默认用途分配）。
 */
export const MOMO_API_URI = "https://ai.jinpengi.site:8687/v1";
// 出库不含任何密钥：默认 Key 为空，用户在「设置 · 大模型」里填自己的中转站 Key
export const MOMO_API_KEY = "";
export const MOMO_DEFAULT_MODEL = "MiniMax-M2";

export const momoBackendPreset: ChatApiConfig = {
	api_uri: MOMO_API_URI,
	api_key: MOMO_API_KEY,
	api_model: MOMO_DEFAULT_MODEL,
	model_name: "momo 中转站",
	support_thinking: false,
	support_vision: false,
};

/** 一键预设模板（统一设置「大模型」页使用） */
export const llmBackendTemplates: {
	key: string;
	label: string;
	config: ChatApiConfig;
}[] = [
	{
		key: "momo",
		label: "momo 中转站（MiniMax-M2）",
		config: momoBackendPreset,
	},
	{
		key: "ollama",
		label: "Ollama 本地",
		config: {
			api_uri: "http://localhost:11434/v1",
			api_key: "",
			api_model: "",
			model_name: "Ollama 本地",
			support_thinking: false,
			support_vision: false,
		},
	},
	{
		key: "custom",
		label: "自定义（OpenAI 兼容）",
		config: {
			api_uri: "",
			api_key: "",
			api_model: "",
			model_name: "",
			support_thinking: false,
			support_vision: false,
		},
	},
];

/** 判断某个后端是否 momo 中转站（迁移去重用） */
export const isMomoBackend = (config: ChatApiConfig): boolean =>
	config.api_uri.replace(/\/+$/, "") === MOMO_API_URI;

/** 后端对应的模型类型标识（与翻译/视觉模型选择的存储格式一致） */
export const backendModelType = (config: ChatApiConfig): string =>
	`${CUSTOM_MODEL_PREFIX}${config.api_model}`;

export const MOMO_DEFAULT_MODEL_TYPE = `${CUSTOM_MODEL_PREFIX}${MOMO_DEFAULT_MODEL}`;
