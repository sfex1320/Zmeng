/* eslint-disable @typescript-eslint/no-explicit-any */

import { fetch } from "@tauri-apps/plugin-http";
import { appError } from "@/utils/log";

// biome-ignore lint/suspicious/noExplicitAny: 方便实现
export const getUrl = (url: string, params?: Record<string, any>) => {
	let baseUrl: string;
	if (process.env.NODE_ENV === "development") {
		// baseUrl = "http://127.0.0.1:5101/";
		baseUrl = "https://snowshot.top/";
		// baseUrl = 'http://120.79.232.67/';
	} else {
		baseUrl = "https://snowshot.top/";
		// baseUrl = 'http://120.79.232.67/';
	}

	const urlObj = new URL(url, baseUrl);

	if (params) {
		Object.entries(params).forEach(([key, value]) => {
			urlObj.searchParams.set(key, value);
		});
	}

	return urlObj.toString();
};

export interface ResponseData<T> {
	code: number;
	success: boolean;
	message: string;
	data: T;
}

export class ServiceResponse<T> {
	public readonly response: Response | undefined;
	public readonly code: number | undefined;
	public readonly message: string | undefined;
	public readonly data: T | undefined;

	private constructor(
		response: Response | undefined,
		code?: number,
		message?: string,
		data?: T,
	) {
		this.response = response;
		this.code = code;
		this.message = message;
		this.data = data;
	}

	static requestError(error: Error): ServiceResponse<undefined> {
		return new ServiceResponse(undefined, -1, error.message, undefined);
	}

	static httpError(response: Response): ServiceResponse<undefined> {
		return new ServiceResponse(response, -1, response.statusText, undefined);
	}

	static serviceError(
		response: Response,
		code: number,
		message: string,
	): ServiceResponse<undefined> {
		return new ServiceResponse(response, code, message, undefined);
	}

	static success<T>(
		response: Response,
		message: string,
		data: T,
	): ServiceResponse<T> {
		return new ServiceResponse(response, 0, message, data);
	}

	public success(ignoreEvent?: boolean): T | undefined {
		if (!this.response) {
			if (!ignoreEvent) {
				try {
					window.__APP_HANDLE_REQUEST_ERROR__?.(this);
				} catch (error) {
					appError("[ServiceResponse] success error", error);
				}
			}
			return undefined;
		}

		if (this.response.status !== 200) {
			if (!ignoreEvent) {
				try {
					window.__APP_HANDLE_HTTP_ERROR__?.(this);
				} catch (error) {
					appError("[ServiceResponse] httpError error", error);
				}
			}
			return undefined;
		}

		if (this.code !== 0) {
			if (!ignoreEvent) {
				try {
					window.__APP_HANDLE_SERVICE_ERROR__?.(this);
				} catch (error) {
					appError("[ServiceResponse] serviceError error", error);
				}
			}
			return undefined;
		}

		return this.data;
	}
}

export const serviceBaseFetch = async (
	url: string,
	options: {
		method: "POST" | "GET";
		// biome-ignore lint/suspicious/noExplicitAny: 方便实现
		params?: any | Record<string, any>;
		// biome-ignore lint/suspicious/noExplicitAny: 方便实现
		data?: any | Record<string, any>;
		headers?: Record<string, string>;
	},
): Promise<Response | ServiceResponse<undefined>> => {
	let response: Response;
	const fullUrl = getUrl(url, options.params);
	const directProxy = directProxyFor(fullUrl);
	try {
		response = await fetch(fullUrl, {
			method: options.method,
			...(directProxy ? { proxy: directProxy } : {}),
			headers: {
				"Content-Type": "application/json",
				"Accept-Language": window.__APP_ACCEPT_LANGUAGE__,
				...options.headers,
			},
			body: JSON.stringify(options.data),
		});
	} catch (e) {
		if (e instanceof Error) {
			return ServiceResponse.requestError(e);
		} else if (typeof e === "string") {
			return ServiceResponse.requestError(new Error(e));
		}

		return ServiceResponse.requestError(new Error(`Unknown error: ${e}`));
	}

	if (response.status !== 200) {
		return ServiceResponse.httpError(response);
	}

	return response;
};

export const serviceFetch = async <R>(
	url: string,
	options: {
		method: "POST" | "GET";
		// biome-ignore lint/suspicious/noExplicitAny: 方便实现
		params?: any | Record<string, any>;
		// biome-ignore lint/suspicious/noExplicitAny: 方便实现
		data?: any | Record<string, any>;
		headers?: Record<string, string>;
	},
): Promise<ServiceResponse<R | undefined>> => {
	const response = await serviceBaseFetch(url, options);

	if (response instanceof ServiceResponse) {
		return response;
	}

	const data = (await response.json()) as ResponseData<R>;

	if (data.code !== 0) {
		return ServiceResponse.serviceError(response, data.code, data.message);
	}

	return ServiceResponse.success(response, data.message, data.data);
};

/**
 * 让本地/官方主机的请求「直连、绕过系统代理」。
 *
 * 背景：tauri-plugin-http 用 reqwest 默认构建，reqwest 0.12 会自动读取 Windows 系统代理
 * （如 Clash 127.0.0.1:7890）。结果：
 *   - 本地 Ollama（localhost:11434）被代理 → 502，模型拉取/对话全部失败；
 *   - 在线官方接口（snowshot.top）经代理时大图视觉请求易「Connection error」。
 * 给目标主机设置 noProxy 即让该请求直连；同时调用 .proxy() 会关闭 reqwest 的系统代理自动探测。
 * 仅对 本地地址 与 snowshot.top 生效，其它主机维持原有（走系统代理）行为，避免影响需代理的云端 API。
 */
function directProxyFor(
	target: unknown,
): { all: { url: string; noProxy: string } } | undefined {
	let host = "";
	try {
		const raw =
			typeof target === "string"
				? target
				: target instanceof URL
					? target.toString()
					: (target as Request | undefined)?.url;
		if (raw) {
			host = new URL(raw).hostname;
		}
	} catch {
		return undefined;
	}
	if (!host) {
		return undefined;
	}
	const h = host.toLowerCase();
	const isLocal =
		h === "localhost" ||
		h === "0.0.0.0" ||
		h === "::1" ||
		h === "[::1]" || // URL.hostname 对 IPv6 会带方括号
		h.startsWith("127.") ||
		h.startsWith("192.168.") ||
		h.startsWith("10.") ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(h); // RFC1918 仅 172.16~172.31
	const isSnowshot = h === "snowshot.top" || h.endsWith(".snowshot.top");
	if (isLocal || isSnowshot) {
		// url 仅占位，noProxy 命中目标主机后不会真正连接此代理 → 直连
		return { all: { url: "http://localhost:1", noProxy: h } };
	}
	return undefined;
}

/**
 * DashScope/qwen 系端点（snowshot.top 官方、阿里百炼、硅基流动等）默认启用「思考」模式：
 * 首字之前会先输出一段 reasoning_content，翻译/快捷 AI 动作这类简单任务不需要，
 * 且期间界面无任何输出、体感延迟成倍增加。对这些端点附加 enable_thinking:false 可提速约 3 倍；
 * 其他端点（OpenAI 等会严格校验未知参数）不发送，避免 400。
 */
export const qwenThinkingDisableParams = (
	apiUri: string,
): { enable_thinking?: boolean } => {
	try {
		const h = new URL(apiUri).hostname.toLowerCase();
		const isDashLike =
			h.includes("snowshot.top") ||
			h.includes("dashscope") ||
			h.includes("aliyuncs") ||
			h.includes("siliconflow");
		return isDashLike ? { enable_thinking: false } : {};
	} catch {
		return {};
	}
};

export const appFetch = (async (...params: Parameters<typeof fetch>) => {
	try {
		const directProxy = directProxyFor(params[0]);
		const response = await fetch(params[0], {
			...params[1],
			...(directProxy ? { proxy: directProxy } : {}),
			headers: {
				"Accept-Language": window.__APP_ACCEPT_LANGUAGE__,
				...params[1]?.headers,
			},
		});

		if (response.status !== 200) {
			const data = (await response.json()) as {
				error: {
					message: string;
				};
			};

			if ("error" in data && typeof data.error === "object") {
				ServiceResponse.serviceError(
					{ status: 200, statusText: response.statusText } as Response,
					response.status,
					data.error.message ? data.error.message : response.statusText,
				).success();
			}
		}
		return response;
	} catch (error) {
		appError("[appFetch] fetch error", error);
		throw error;
	}
}) as typeof fetch;

export type StreamFetchEventOptions<R> = {
	isInvalid?: () => boolean;
	onStart?: () => void;
	onData: (chunk: ServiceResponse<R | undefined>) => void;
	onComplete?: () => void;
};

export const streamFetch = async <R>(
	url: string,
	options: {
		method: "POST" | "GET";
		// biome-ignore lint/suspicious/noExplicitAny: 方便实现
		params?: Record<string, any>;
		// biome-ignore lint/suspicious/noExplicitAny: 方便实现
		data?: any;
		headers?: Record<string, string>;
	} & StreamFetchEventOptions<R>,
) => {
	try {
		const fullUrl = getUrl(url, options.params);
		const directProxy = directProxyFor(fullUrl);
		const response = await fetch(fullUrl, {
			method: options.method,
			...(directProxy ? { proxy: directProxy } : {}),
			headers: {
				"Content-Type": "application/json",
				"Accept-Language": window.__APP_ACCEPT_LANGUAGE__,
				...options.headers,
			},
			body: options.data ? JSON.stringify(options.data) : undefined,
		});

		if (response.status !== 200) {
			ServiceResponse.httpError(response).success();
			return;
		}

		const reader = response.body?.getReader();
		if (!reader) {
			ServiceResponse.requestError(
				new Error("Failed to get response body reader"),
			).success();
			return;
		}

		if (!options.isInvalid?.()) {
			options.onStart?.();
		}

		const decoder = new TextDecoder();
		let buffer = "";
		const lineBreakRegex = /\r\n|\n|\r/gm;

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;

			if (options.isInvalid?.()) {
				break;
			}

			const chunksText = decoder.decode(value, { stream: true });
			buffer += chunksText;

			let startIndex = 0;
			let result: RegExpExecArray | null = null;

			while (true) {
				result = lineBreakRegex.exec(buffer);
				if (!result) {
					break;
				}

				const line = buffer.substring(startIndex, result.index);
				startIndex = lineBreakRegex.lastIndex;

				if (line.trim() === "") continue;

				try {
					if (line.startsWith("data: ")) {
						const data = JSON.parse(line.substring(6)) as ResponseData<R>;
						options.onData(
							ServiceResponse.success(response, data.message, data.data),
						);
					} else if (line.includes("{") && line.includes("}")) {
						// 尝试将整行解析为JSON
						const errorData = JSON.parse(line) as ResponseData<R>;
						options.onData(
							ServiceResponse.serviceError(
								response,
								errorData.code,
								errorData.message,
							),
						);
					}
				} catch {
					options.onData(
						ServiceResponse.requestError(
							new Error(`Failed to parse line: ${line}`),
						),
					);
				}
			}

			// 保留未处理完的数据到下一个循环
			buffer = buffer.substring(startIndex);
		}

		// 处理缓冲区中剩余的最后一行（如果有）
		if (buffer.trim() !== "") {
			try {
				if (buffer.startsWith("data: ")) {
					const data = JSON.parse(buffer.substring(6)) as ResponseData<R>;
					options.onData(
						ServiceResponse.success(response, data.message, data.data),
					);
				} else if (buffer.includes("{") && buffer.includes("}")) {
					const errorData = JSON.parse(buffer) as ResponseData<R>;
					options.onData(
						ServiceResponse.serviceError(
							response,
							errorData.code,
							errorData.message,
						),
					);
				}
			} catch {
				options.onData(
					ServiceResponse.requestError(
						new Error("Failed to parse response data"),
					),
				);
			}
		}

		if (!options.isInvalid?.()) {
			options.onComplete?.();
		}

		return;
	} catch {
		ServiceResponse.requestError(new Error("Stream request error")).success();
		return;
	}
};
