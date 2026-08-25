import { invoke } from "@tauri-apps/api/core";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { appFetch, qwenThinkingDisableParams } from "@/services/tools";
import { appError } from "@/utils/log";
import { createThinkFilter, stripThink } from "@/utils/thinkFilter";
import type { ChatApiConfig } from "@/types/appSettings";

/** AI 动作预设：对剪贴板内容跑预设提示词，{{INPUT}} 会被替换为内容 */
export type AiActionPreset = {
	id: string;
	name: string;
	prompt: string;
};

/** 图片视觉动作预设：把图片交给「支持视觉的模型」分析（内容/文字/组成/风格/提示词等） */
export const defaultImageAiActions: AiActionPreset[] = [
	{
		id: "img-describe",
		name: "分析内容",
		prompt:
			"请详细分析这张图片：主要内容、场景、包含的对象与元素、它在表达什么，用条理清晰的中文描述。",
	},
	{
		id: "img-ocr",
		name: "提取文字",
		prompt:
			"请准确提取图片中出现的所有文字，按从上到下、从左到右的阅读顺序原样输出，不要翻译、不要解释。如果图片中没有文字，请回答“图中无文字”。",
	},
	{
		id: "img-parts",
		name: "识别组成",
		prompt:
			"请分析这张图片的构成：主体、前景、背景、关键元素、布局与配色，用要点列表逐项说明。",
	},
	{
		id: "img-style",
		name: "风格分析",
		prompt:
			"请分析这张图片的艺术风格、色调、光影、构图、材质质感与整体氛围，用中文描述。",
	},
	{
		id: "img-prompt",
		name: "反推提示词",
		prompt:
			"请根据这张图片，反推一段可直接用于 AI 绘画（Midjourney / Stable Diffusion）的英文提示词（prompt），尽量细致地描述主体、风格、光影、构图、镜头、画质等，只输出提示词本身，不要额外说明。",
	},
	{
		id: "img-json",
		name: "JSON 提示词",
		prompt:
			"请根据这张图片输出一个结构化的 JSON 提示词，至少包含 subject、style、composition、lighting、color、mood、details、negative_prompt 字段，只输出 JSON 代码块，不要额外说明。",
	},
];

export const defaultAiActions: AiActionPreset[] = [
	{
		id: "summarize",
		name: "总结",
		prompt:
			"请用简洁的语言总结以下内容的核心要点，使用条理清晰的中文：\n\n{{INPUT}}",
	},
	{
		id: "explain",
		name: "解释",
		prompt: "请详细解释以下内容的含义和背景，使用通俗的中文：\n\n{{INPUT}}",
	},
	{
		id: "simplify",
		name: "简释",
		prompt: "请用一两句通俗易懂的中文，简要说明以下内容是什么：\n\n{{INPUT}}",
	},
	{
		id: "polish",
		name: "优化",
		prompt:
			"请优化以下文本，使其更通顺、专业、地道，保持原意，只输出优化后的文本：\n\n{{INPUT}}",
	},
	{
		id: "shorten",
		name: "简写",
		prompt:
			"请在保留关键信息的前提下，将以下内容精简改写得更短，只输出结果：\n\n{{INPUT}}",
	},
	{
		id: "to-json",
		name: "转 JSON",
		prompt:
			"请将以下内容转换为结构化的 JSON，只输出 JSON 代码块，不要任何额外说明：\n\n{{INPUT}}",
	},
];

/** 创建一个指向给定后端的 OpenAI 兼容客户端 */
function createClient(backend: ChatApiConfig): OpenAI {
	return new OpenAI({
		apiKey: backend.api_key || "ollama",
		baseURL: backend.api_uri,
		dangerouslyAllowBrowser: true,
		fetch: appFetch,
	});
}

/** 是否为本地后端（本地 Ollama / 内网）——这类请求走 Rust 直连，绕过系统代理且不带 Origin */
export function isLocalBackend(apiUri: string): boolean {
	try {
		const h = new URL(apiUri).hostname.toLowerCase();
		return (
			h === "localhost" ||
			h === "0.0.0.0" ||
			h === "::1" ||
			h === "[::1]" ||
			h.startsWith("127.") ||
			h.startsWith("192.168.") ||
			h.startsWith("10.") ||
			/^172\.(1[6-9]|2\d|3[01])\./.test(h)
		);
	} catch {
		return false;
	}
}

type AiHttpResponse = { status: number; body: string };

/**
 * 经 Rust 直连发起一次 AI HTTP 请求。
 * 关键：reqwest `.no_proxy()` 直连 + 不带 Origin —— 修复打包版本地 Ollama 被系统代理(502)
 * 和被 Ollama CORS 以 tauri.localhost 来源拒绝(403)两个问题。
 */
async function aiLocalRequest(
	method: "GET" | "POST",
	url: string,
	apiKey: string,
	body?: unknown,
): Promise<AiHttpResponse> {
	return await invoke<AiHttpResponse>("ai_local_request", {
		method,
		url,
		apiKey: apiKey ?? "",
		body: body !== undefined ? JSON.stringify(body) : null,
	});
}

/** 本地后端的一次对话补全（非流式）：拿到完整结果后一次性回调 */
async function runLocalChat(
	backend: ChatApiConfig,
	messages: unknown[],
	onDelta: (chunk: string) => void,
	signal?: AbortSignal,
): Promise<void> {
	const url = `${backend.api_uri.replace(/\/$/, "")}/chat/completions`;
	const res = await aiLocalRequest("POST", url, backend.api_key, {
		model: backend.api_model,
		messages,
		stream: false,
	});
	if (res.status !== 200) {
		throw new Error(
			`本地模型返回 HTTP ${res.status}：${res.body.slice(0, 300)}`,
		);
	}
	let text = "";
	try {
		text = JSON.parse(res.body)?.choices?.[0]?.message?.content ?? "";
	} catch {
		throw new Error(`解析本地模型响应失败：${res.body.slice(0, 200)}`);
	}
	if (signal?.aborted) {
		return;
	}
	onDelta(stripThink(text));
}

/**
 * 运行一次 AI 动作（流式）。
 * @param backend 选用的 AI 后端（统一的 ChatApiConfig）
 * @param prompt 含 {{INPUT}} 占位符的提示词
 * @param input 剪贴板内容
 * @param onDelta 每收到一段增量文本回调
 * @param signal 取消信号
 */
export async function runAiAction(
	backend: ChatApiConfig,
	prompt: string,
	input: string,
	onDelta: (chunk: string) => void,
	signal?: AbortSignal,
): Promise<void> {
	if (!backend.api_model) {
		throw new Error(
			"未设置模型名称，请在「设置 · 大模型」中为该后端填写模型（如 qwen2.5、gpt-4o-mini）",
		);
	}

	const content = prompt.includes("{{INPUT}}")
		? prompt.replace("{{INPUT}}", input)
		: `${prompt}\n\n${input}`;

	// 本地后端（Ollama）走 Rust 直连，避免系统代理 502 / Origin 被拒 403
	if (isLocalBackend(backend.api_uri)) {
		await runLocalChat(backend, [{ role: "user", content }], onDelta, signal);
		return;
	}

	const client = createClient(backend);
	const stream = await client.chat.completions.create(
		{
			model: backend.api_model,
			messages: [{ role: "user", content }],
			stream: true,
			// DashScope 系端点默认开思考模式：快捷动作要的是快，关掉避免首字前长时间无输出
			...qwenThinkingDisableParams(backend.api_uri),
		} as ChatCompletionCreateParamsStreaming & {
			enable_thinking?: boolean;
		},
		{ signal },
	);

	// 思考型模型（如 MiniMax-M2）的 <think> 推理内容混在正文流里，过滤只留结果
	const thinkFilter = createThinkFilter();
	for await (const event of stream) {
		const delta = event.choices?.[0]?.delta?.content;
		if (delta) {
			const visible = thinkFilter.push(delta);
			if (visible) {
				onDelta(visible);
			}
		}
	}
	const tail = thinkFilter.flush();
	if (tail) {
		onDelta(tail);
	}
}

/**
 * 运行一次「图片视觉」动作（流式）。
 * 把图片（base64 data URL）连同提示词发给支持视觉的模型，分析内容/文字/风格/提示词等。
 * @param backend 选用的 AI 后端（需为支持视觉的模型，如官方「通义千问 VL Flash」或自配 gpt-4o / llava）
 * @param prompt 文本指令
 * @param imageDataUrl 图片 base64 data URL（data:image/png;base64,...）
 * @param onDelta 每收到一段增量文本回调
 * @param signal 取消信号
 */
export async function runAiVisionAction(
	backend: ChatApiConfig,
	prompt: string,
	imageDataUrl: string,
	onDelta: (chunk: string) => void,
	signal?: AbortSignal,
): Promise<void> {
	if (!backend.api_model) {
		throw new Error(
			"未设置模型名称，请在「设置 · 大模型」中为该后端填写模型（需支持视觉，如 qwen3-vl、gpt-4o）",
		);
	}

	// 本地视觉后端（如 Ollama qwen3-vl）走 Rust 直连，避免系统代理 502 / Origin 被拒 403
	if (isLocalBackend(backend.api_uri)) {
		await runLocalChat(
			backend,
			[
				{
					role: "user",
					content: [
						{ type: "image_url", image_url: { url: imageDataUrl } },
						{ type: "text", text: prompt },
					],
				},
			],
			onDelta,
			signal,
		);
		return;
	}

	const client = createClient(backend);
	const stream = await client.chat.completions.create(
		{
			model: backend.api_model,
			messages: [
				{
					role: "user",
					content: [
						{ type: "image_url", image_url: { url: imageDataUrl } },
						{ type: "text", text: prompt },
					],
				},
			],
			stream: true,
			// 同 runAiAction：视觉快捷分析关闭思考模式提速
			...qwenThinkingDisableParams(backend.api_uri),
		} as ChatCompletionCreateParamsStreaming & {
			enable_thinking?: boolean;
		},
		{ signal },
	);

	// 同 runAiAction：过滤思考型模型的 <think> 内容
	const thinkFilter = createThinkFilter();
	for await (const event of stream) {
		const delta = event.choices?.[0]?.delta?.content;
		if (delta) {
			const visible = thinkFilter.push(delta);
			if (visible) {
				onDelta(visible);
			}
		}
	}
	const tail = thinkFilter.flush();
	if (tail) {
		onDelta(tail);
	}
}

/** 大模型翻译：把内容翻译为目标语言（流式） */
export async function runTranslate(
	backend: ChatApiConfig,
	input: string,
	targetLang: string,
	onDelta: (chunk: string) => void,
	signal?: AbortSignal,
): Promise<void> {
	const prompt = `你是专业翻译。请将以下内容翻译为${targetLang}，只输出译文，不要解释、不要附加任何内容：\n\n{{INPUT}}`;
	return runAiAction(backend, prompt, input, onDelta, signal);
}

/** 拉取本地 Ollama 模型列表（GET /api/tags）—— 走 Rust 直连，避免代理/Origin 问题 */
export async function listOllamaModels(apiUri: string): Promise<string[]> {
	try {
		const base = apiUri.replace(/\/v1\/?$/, "");
		const res = await aiLocalRequest("GET", `${base}/api/tags`, "");
		if (res.status !== 200) {
			return [];
		}
		const data = JSON.parse(res.body) as { models?: { name: string }[] };
		return (data.models ?? []).map((m) => m.name);
	} catch {
		return [];
	}
}

/** 拉取云端 OpenAI 兼容模型列表（GET /models） */
export async function listCloudModels(
	apiUri: string,
	apiKey: string,
): Promise<string[]> {
	try {
		const base = apiUri.replace(/\/$/, "");
		// 本地 OpenAI 兼容服务也走 Rust 直连，避免代理/Origin 问题
		if (isLocalBackend(apiUri)) {
			const res = await aiLocalRequest("GET", `${base}/models`, apiKey);
			if (res.status !== 200) {
				return [];
			}
			const data = JSON.parse(res.body) as { data?: { id: string }[] };
			return (data.data ?? []).map((m) => m.id).filter(Boolean);
		}
		const res = await appFetch(`${base}/models`, {
			headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
		});
		if (!res.ok) {
			appError(
				`[listCloudModels] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
			);
			return [];
		}
		const data = (await res.json()) as { data?: { id: string }[] };
		return (data.data ?? []).map((m) => m.id).filter(Boolean);
	} catch (error) {
		// 记录真实原因（URL 权限 / 网络 / 代理），不再静默吞掉
		appError("[listCloudModels] fetch error", error);
		return [];
	}
}

/** 测试连接：发一句最短补全，成功返回 true */
export async function testBackend(backend: ChatApiConfig): Promise<boolean> {
	if (!backend.api_model) {
		return false;
	}
	try {
		// 本地后端走 Rust 直连测试
		if (isLocalBackend(backend.api_uri)) {
			const url = `${backend.api_uri.replace(/\/$/, "")}/chat/completions`;
			const res = await aiLocalRequest("POST", url, backend.api_key, {
				model: backend.api_model,
				messages: [{ role: "user", content: "Hi" }],
				stream: false,
				max_tokens: 8,
			});
			return res.status === 200;
		}
		const client = createClient(backend);
		const res = await client.chat.completions.create({
			model: backend.api_model,
			messages: [{ role: "user", content: "Hi" }],
			max_completion_tokens: 8,
		});
		return Array.isArray(res.choices) && res.choices.length > 0;
	} catch (error) {
		// 记录真实原因（URL 权限 / 网络 / 代理 / 模型名），不再静默吞掉
		appError("[testBackend] error", error);
		return false;
	}
}
