import { trim } from "es-toolkit";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { CUSTOM_MODEL_PREFIX } from "@/constants/components/chat";
import { defaultTranslationPrompt } from "@/constants/components/translation";
import { AntdContext } from "@/contexts/antdContext";
import { AppSettingsActionContext } from "@/contexts/appSettingsActionContext";
import { useAppSettingsLoad } from "@/hooks/useAppSettingsLoad";
import { useStateRef } from "@/hooks/useStateRef";
import {
	convertLanguageCodeToDeepLSourceLanguageCode,
	convertLanguageCodeToDeepLTargetLanguageCode,
} from "@/pages/settings/functionSettings/extra";
import { getTranslationPrompt } from "@/pages/tools/translation/extra";
import { appFetch, qwenThinkingDisableParams } from "@/services/tools";
import { translateTextDeepL } from "@/services/tools/translation";
import {
	type AppSettingsData,
	AppSettingsGroup,
	type ChatApiConfig,
	type TranslationApiConfig,
	TranslationApiType,
} from "@/types/appSettings";
import {
	type DeepLTranslateResult,
	TranslationDomain,
	TranslationType,
	type TranslationTypeOption,
} from "@/types/servies/translation";
import { appError } from "@/utils/log";
import { createThinkFilter } from "@/utils/thinkFilter";

export type TranslationServiceConfig = (
	| TranslationTypeOption
	| {
			name: string;
			type: string;
			apiConfig: ChatApiConfig;
	  }
	| {
			name: string;
			type: TranslationApiType;
			translationApiConfig: TranslationApiConfig;
	  }
) & {
	isOfficial: boolean;
};

export const useTranslationRequest = (options?: {
	/// 配置从 Cache 中加载
	enableCacheConfig?: boolean;
	onComplete?: (result: { content: string }[], requestId?: number) => void;
	onDeltaContent?: (deltaContent: string) => void;
	/// 懒加载
	lazyLoad?: boolean;
}) => {
	const intl = useIntl();
	const { message } = useContext(AntdContext);

	// 翻译领域
	const [translationDomain, setTranslationDomain, translationDomainRef] =
		useStateRef<TranslationDomain>(TranslationDomain.General);
	// 翻译类型
	const [translationType, setTranslationType, translationTypeRef] = useStateRef<
		TranslationType | string
	>(TranslationType.Youdao);
	// 源语言
	const [sourceLanguage, setSourceLanguage, sourceLanguageRef] =
		useStateRef<string>("auto");
	// 目标语言
	const [targetLanguage, setTargetLanguage, targetLanguageRef] =
		useStateRef<string>("zh-CHS");

	// 用户自定义的 AI 对话配置
	const [chatApiConfigList, setChatApiConfigList] = useState<
		ChatApiConfig[] | undefined
	>(undefined);
	/// 用户自定义的翻译 API 配置
	const [translationApiConfigList, setTranslationApiConfigList] = useState<
		TranslationApiConfig[] | undefined
	>(undefined);
	const [chatConfig, setChatConfig] =
		useState<AppSettingsData[AppSettingsGroup.SystemChat]>();
	const [translationConfig, setTranslationConfig] =
		useState<AppSettingsData[AppSettingsGroup.FunctionTranslation]>();
	// 「大模型」页配置的默认翻译模型（`CUSTOM_MODEL_PREFIX + api_model`）
	const [defaultTranslateModel, setDefaultTranslateModel] = useState("");

	useAppSettingsLoad(
		useCallback(
			(settings: AppSettingsData) => {
				if (options?.enableCacheConfig) {
					setTranslationDomain(
						settings[AppSettingsGroup.FunctionTranslationCache]
							.cacheTranslationDomain,
					);
					setTranslationType(
						settings[AppSettingsGroup.FunctionTranslationCache]
							.cacheTranslationType,
					);
					setSourceLanguage(
						settings[AppSettingsGroup.FunctionTranslationCache]
							.cacheSourceLanguage,
					);
					setTargetLanguage(
						settings[AppSettingsGroup.FunctionTranslationCache]
							.cacheTargetLanguage,
					);
				} else {
					setTranslationDomain(
						settings[AppSettingsGroup.FunctionTranslation].translationDomain,
					);
					setTranslationType(
						settings[AppSettingsGroup.FunctionTranslation].translationType,
					);
					setSourceLanguage(
						settings[AppSettingsGroup.FunctionTranslation].sourceLanguage,
					);
					setTargetLanguage(
						settings[AppSettingsGroup.FunctionTranslation].targetLanguage,
					);
				}

				setChatApiConfigList(
					settings[AppSettingsGroup.FunctionChat].chatApiConfigList,
				);
				setTranslationApiConfigList(
					settings[AppSettingsGroup.FunctionTranslation]
						.translationApiConfigList,
				);
				setDefaultTranslateModel(
					settings[AppSettingsGroup.FunctionChat].defaultTranslateModel ?? "",
				);

				setChatConfig(settings[AppSettingsGroup.SystemChat]);
				setTranslationConfig(settings[AppSettingsGroup.FunctionTranslation]);
			},
			[
				setSourceLanguage,
				setTargetLanguage,
				setTranslationDomain,
				setTranslationType,
				options?.enableCacheConfig,
			],
		),
		true,
	);
	const { updateAppSettings } = useContext(AppSettingsActionContext);

	const [
		supportedTranslationTypes,
		setSupportedTranslationTypes,
		supportedTranslationTypesRef,
	] = useStateRef<TranslationServiceConfig[]>([]);

	const getTranslationApiConfigTypeName = useCallback(
		(apiConfigType: TranslationApiType) => {
			switch (apiConfigType) {
				case TranslationApiType.DeepL:
					return intl.formatMessage({ id: "tools.translation.type.deepl" });
				default:
					return apiConfigType;
			}
		},
		[intl],
	);

	const [
		supportedTranslationTypesLoading,
		setSupportedTranslationTypesLoading,
	] = useState(false);
	useEffect(() => {
		setSupportedTranslationTypesLoading(true);
		// 官方（snowshot.top）翻译/模型接口已停用，仅保留用户自定义 LLM 与自定义翻译 API（DeepL）
		setSupportedTranslationTypes([
			...(chatApiConfigList?.map((item): TranslationServiceConfig => {
				return {
					type: `${CUSTOM_MODEL_PREFIX}${item.api_model}`,
					name: item.model_name,
					apiConfig: {
						...item,
						support_thinking: false,
					},
					isOfficial: false,
				};
			}) ?? []),
			...(translationApiConfigList?.map((item): TranslationServiceConfig => {
				return {
					type: item.api_type,
					name: getTranslationApiConfigTypeName(item.api_type),
					translationApiConfig: item,
					isOfficial: false,
				};
			}) ?? []),
		]);
		setSupportedTranslationTypesLoading(false);
	}, [
		chatApiConfigList,
		setSupportedTranslationTypes,
		translationApiConfigList,
		getTranslationApiConfigTypeName,
	]);

	// 请求翻译的加载
	const [startTranslateLoading, setStartTranslateLoading] = useState(false);
	// 翻译内容的加载
	const [deltaTranslateLoading, setDeltaTranslateLoading] = useState(false);
	const [translatedContent, setTranslatedContent, translatedContentRef] =
		useStateRef<string>("");

	const updateTranslationType = useCallback(
		(translationType: TranslationType | string) => {
			if (options?.enableCacheConfig) {
				updateAppSettings(
					AppSettingsGroup.FunctionTranslationCache,
					{ cacheTranslationType: translationType },
					true,
					true,
					false,
					true,
					false,
				);
			} else {
				updateAppSettings(
					AppSettingsGroup.FunctionTranslation,
					{ translationType },
					true,
					true,
					true,
					true,
					false,
				);
			}
		},
		[updateAppSettings, options?.enableCacheConfig],
	);

	const customTranslation = useCallback(
		async (params: {
			sourceContent: string[];
			sourceLanguage: string;
			targetLanguage: string;
			translationType: string;
			translationDomain: TranslationDomain;
			requestId?: number;
		}): Promise<{
			success: boolean;
			errorMessage?: string;
			result?: {
				content: string;
			}[];
		}> => {
			const config = supportedTranslationTypesRef.current.find(
				(item) => item.type === params.translationType,
			);

			if (!config || typeof config.type !== "string") {
				return {
					success: false,
					errorMessage: "未找到可用的翻译模型，请在「设置 · 大模型」中配置",
				};
			}

			if ("translationApiConfig" in config) {
				if (config.type === TranslationApiType.DeepL) {
					setStartTranslateLoading(true);

					let result: DeepLTranslateResult | undefined;
					try {
						result = await translateTextDeepL(
							config.translationApiConfig.api_uri,
							config.translationApiConfig.api_key,
							params.sourceContent,
							convertLanguageCodeToDeepLSourceLanguageCode(
								params.sourceLanguage,
							),
							convertLanguageCodeToDeepLTargetLanguageCode(
								params.targetLanguage,
							),
							config.translationApiConfig.deepl_prefer_quality_optimized ??
								false,
						);
					} catch (error) {
						appError("[customTranslation] translateTextDeepL error", error);
					}

					setStartTranslateLoading(false);

					if (!result) {
						return {
							success: false,
							errorMessage: "DeepL 请求失败，请检查网络与 API Key",
						};
					}

					options?.onComplete?.(
						result.translations.map((item) => ({
							content: item.text,
						})),
						params.requestId,
					);

					return {
						success: true,
						result: result.translations.map((item) => ({
							content: item.text,
						})),
					};
				}
			}

			if (!("apiConfig" in config)) {
				return {
					success: false,
					errorMessage: "该翻译服务配置不完整",
				};
			}

			const client = new OpenAI({
				apiKey: config.apiConfig.api_key,
				baseURL: config.apiConfig.api_uri,
				dangerouslyAllowBrowser: true,
				fetch: appFetch,
			});

			setStartTranslateLoading(true);

			let responseContent: string = "";
			let failReason: string | undefined;
			// 思考型模型（如 MiniMax-M2）把 <think> 推理过程混在 content 流里，逐段过滤只留正文
			const thinkFilter = createThinkFilter();
			try {
				const streamResponse = await client.chat.completions.create({
					model: config.apiConfig.api_model.replace(CUSTOM_MODEL_PREFIX, ""),
					messages: [
						{
							role: "system",
							content: getTranslationPrompt(
								translationConfig?.translationSystemPrompt ??
									defaultTranslationPrompt,
								params.sourceLanguage,
								params.targetLanguage,
								params.translationDomain,
							),
						},
						{
							role: "user",
							content: params.sourceContent.join("%%"),
						},
					],
					max_completion_tokens: chatConfig?.maxTokens ?? 4096,
					temperature: chatConfig?.temperature ?? 1,
					stream: true,
					// DashScope 系端点默认开思考模式，翻译不需要且首字前无输出：关闭可提速约 3 倍
					...qwenThinkingDisableParams(config.apiConfig.api_uri),
				} as ChatCompletionCreateParamsStreaming & {
					enable_thinking?: boolean;
				});

				setDeltaTranslateLoading(true);
				try {
					setTranslatedContent("");
					for await (const event of streamResponse) {
						if (event.choices.length > 0 && event.choices[0].delta.content) {
							const visible = thinkFilter.push(
								event.choices[0].delta.content,
							);
							if (visible) {
								setTranslatedContent((prevContent) => `${prevContent}${visible}`);
								responseContent += visible;
								options?.onDeltaContent?.(visible);
							}
						}
					}
					const tail = thinkFilter.flush();
					if (tail) {
						setTranslatedContent((prevContent) => `${prevContent}${tail}`);
						responseContent += tail;
						options?.onDeltaContent?.(tail);
					}
				} catch (error) {
					failReason = `模型输出中断：${String(
						(error as Error | undefined)?.message ?? error,
					)}`;
					appError("[customTranslation] streamResponse error", error);
				}
				setDeltaTranslateLoading(false);
			} catch (error) {
				failReason = String((error as Error | undefined)?.message ?? error);
				appError("[customTranslation] error", error);
			} finally {
				setStartTranslateLoading(false);
			}

			// 请求出错、或正文为空（如思考型模型把 token 全耗在思考上、后端不可用）
			// 都视为失败：不再静默回退官方接口，直接把原因报给用户
			if (failReason || responseContent.trim() === "") {
				return {
					success: false,
					errorMessage:
						failReason ??
						"模型返回内容为空（可尝试关闭思考模式或更换模型）",
				};
			}

			const result =
				params.sourceContent.length > 1
					? responseContent.split("%%").map((item) => ({ content: trim(item) }))
					: [{ content: responseContent }];

			options?.onComplete?.(result, params.requestId);

			return {
				success: true,
				result: [{ content: responseContent }],
			};
		},
		[
			translationConfig?.translationSystemPrompt,
			supportedTranslationTypesRef,
			chatConfig?.maxTokens,
			chatConfig?.temperature,
			options,
			setTranslatedContent,
		],
	);

	const requestTranslate = useCallback(
		async (sourceContent: string[], requestId?: number) => {
			const translationDomain = translationDomainRef.current;
			const sourceLanguage = sourceLanguageRef.current;
			const targetLanguage = targetLanguageRef.current;

			// 保存的翻译类型可能已失效（官方类型已停用 / 删除了自定义配置），
			// 自动回退到「大模型」页配置的默认翻译模型，并修正保存的配置
			let translationType: TranslationType | string =
				translationTypeRef.current;
			const supportedTypes = supportedTranslationTypesRef.current;
			if (
				supportedTypes.length > 0 &&
				!supportedTypes.some((item) => item.type === translationType)
			) {
				const fallback =
					// 优先「大模型」页配置的默认翻译模型
					supportedTypes.find(
						(item) => "apiConfig" in item && item.type === defaultTranslateModel,
					) ??
					// 其次第一个自定义模型（如本地 Ollama）
					supportedTypes.find((item) => "apiConfig" in item) ??
					// 最后自定义翻译 API（DeepL）
					supportedTypes.find((item) => "translationApiConfig" in item);
				if (fallback) {
					translationType = fallback.type;
					updateTranslationType(translationType);
				}
			}

			if (typeof translationType === "string") {
				const result = await customTranslation({
					sourceContent: sourceContent,
					sourceLanguage: sourceLanguage,
					targetLanguage: targetLanguage,
					translationDomain: translationDomain,
					translationType: translationType,
					requestId: requestId,
				});
				if (result.success) {
					return;
				}

				// 官方翻译接口已停用，自定义模型失败直接报错，不再静默回退
				message.error(`翻译失败：${result.errorMessage ?? "未知错误"}`);
				return;
			}

			message.error(
				"官方翻译接口已停用，请在「设置 · 大模型」中配置翻译模型",
			);
		},
		[
			customTranslation,
			sourceLanguageRef,
			message,
			targetLanguageRef,
			translationDomainRef,
			translationTypeRef,
			supportedTranslationTypesRef,
			defaultTranslateModel,
			updateTranslationType,
		],
	);

	const updateTranslationDomain = useCallback(
		(translationDomain: TranslationDomain) => {
			if (options?.enableCacheConfig) {
				updateAppSettings(
					AppSettingsGroup.FunctionTranslationCache,
					{ cacheTranslationDomain: translationDomain },
					true,
					true,
					false,
					true,
					false,
				);
			} else {
				updateAppSettings(
					AppSettingsGroup.FunctionTranslation,
					{ translationDomain },
					true,
					true,
					true,
					true,
					false,
				);
			}
		},
		[updateAppSettings, options?.enableCacheConfig],
	);

	const updateSourceLanguage = useCallback(
		(sourceLanguage: string) => {
			if (options?.enableCacheConfig) {
				updateAppSettings(
					AppSettingsGroup.FunctionTranslationCache,
					{ cacheSourceLanguage: sourceLanguage },
					true,
					true,
					false,
					true,
					false,
				);
			} else {
				updateAppSettings(
					AppSettingsGroup.FunctionTranslation,
					{ sourceLanguage },
					true,
					true,
					true,
					true,
					false,
				);
			}
		},
		[updateAppSettings, options?.enableCacheConfig],
	);

	const updateTargetLanguage = useCallback(
		(targetLanguage: string) => {
			if (options?.enableCacheConfig) {
				updateAppSettings(
					AppSettingsGroup.FunctionTranslationCache,
					{ cacheTargetLanguage: targetLanguage },
					true,
					true,
					false,
					true,
					false,
				);
			} else {
				updateAppSettings(
					AppSettingsGroup.FunctionTranslation,
					{ targetLanguage },
					true,
					true,
					true,
					true,
					false,
				);
			}
		},
		[updateAppSettings, options?.enableCacheConfig],
	);

	const getTranslatedContent = useCallback(() => {
		return translatedContentRef.current;
	}, [translatedContentRef]);

	return {
		updateTranslationDomain,
		updateTranslationType,
		updateSourceLanguage,
		updateTargetLanguage,
		requestTranslate,
		startTranslateLoading,
		deltaTranslateLoading,
		translatedContent,
		translationType,
		translationDomain,
		sourceLanguage,
		targetLanguage,
		supportedTranslationTypes,
		supportedTranslationTypesLoading,
		getTranslatedContent,
	};
};
