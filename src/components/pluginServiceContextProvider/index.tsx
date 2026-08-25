import { isDeepEqualReact } from "@ant-design/pro-components";
import * as path from "@tauri-apps/api/path";
import { throttle } from "es-toolkit";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	pluginGetPluginsStatus,
	pluginInit,
	pluginInstallPlugin,
	pluginRegisterPlugin,
} from "@/commands/plugin";
import {
	PLUGIN_ID_FFMPEG,
	PLUGIN_ID_RAPID_OCR,
	PLUGIN_ID_TRANSLATE,
} from "@/constants/pluginService";
import { PluginServiceContext } from "@/contexts/pluginServiceContext";
import { useStateRef } from "@/hooks/useStateRef";
import { PluginStatus, type PluginStatusResult } from "@/types/commands/plugin";
import {
	PluginConfig,
	type PluginItem,
	type PluginStatusRecord,
} from "@/types/components/pluginService";
import { getAppConfigBaseDirWithCache } from "@/utils/environment";
import { getPlatform } from "@/utils/platform";
import { appError } from "@/utils/log";

export const PluginServiceContextProvider: React.FC<{
	children: React.ReactNode;
	autoInit: boolean;
}> = ({ children, autoInit }) => {
	const pluginList = useMemo<PluginItem[]>(() => {
		return [
			{
				id: PLUGIN_ID_RAPID_OCR,
				file_list: [
					"ch_ppocr_mobile_v2.0_cls_infer.onnx",
					"ch_PP-OCRv4_det_infer.onnx",
					"ch_PP-OCRv4_rec_infer.onnx",
					"ch_PP-OCRv5_rec_mobile_infer.onnx",
				],
			},
			{
				id: PLUGIN_ID_FFMPEG,
				file_list: getPlatform() === "windows" ? ["ffmpeg.exe"] : ["ffmpeg"],
			},
			{
				id: PLUGIN_ID_TRANSLATE,
				file_list: [],
			},
		];
	}, []);

	const [pluginConfig, setPluginConfig, pluginConfigRef] = useStateRef<
		PluginConfig | undefined
	>(undefined);
	const pluginStatusResultRef = useRef<PluginStatusResult[] | undefined>(
		undefined,
	);
	const [pluginStatus, setPluginStatus, pluginStatusRef] = useStateRef<
		PluginStatusRecord | undefined
	>(undefined);
	const [pluginReadyStatus, setPluginReadyStatus, pluginReadyStatusRef] =
		useStateRef<Record<string, boolean> | undefined>(undefined);

	const hasInitService = useRef(false);
	const initServiceReadyRef = useRef(false);
	const initPluginConfig = useCallback(async () => {
		const configDirPath = await getAppConfigBaseDirWithCache();

		const pluginConfig = new PluginConfig(
			pluginList,
			"20251005",
			await path.join(configDirPath, "plugins"),
			await path.join(configDirPath, "pluginsDownloads"),
			"https://snowshot.top/plugins/",
		);
		setPluginConfig(pluginConfig);

		if (!hasInitService.current) {
			hasInitService.current = true;

			if (autoInit) {
				// 单个插件初始化/注册失败不阻断其它插件，也不阻塞托盘/快捷键等基础功能：
				// 失败只记日志，最终由 refreshPluginStatus 填入"未就绪"状态。
				try {
					await pluginInit(
						pluginConfig.version,
						pluginConfig.plugin_install_dir,
						pluginConfig.plugin_download_dir,
						pluginConfig.plugin_download_service_url,
					);
				} catch (error) {
					appError("[pluginServiceContextProvider] pluginInit failed", error);
				}
				await Promise.all(
					pluginList.map(async (plugin) => {
						try {
							await pluginRegisterPlugin(plugin.id, plugin.file_list);
						} catch (error) {
							appError(
								`[pluginServiceContextProvider] pluginRegisterPlugin failed: ${plugin.id}`,
								error,
							);
						}
					}),
				);

				// 后台自动安装：rapid_ocr 随包 models 目录存在时瞬时完成（本地播种）；
				// translate 为空标记插件，创建目录即就绪（截图 OCR 翻译入口依赖它）
				pluginInstallPlugin(PLUGIN_ID_RAPID_OCR, false).catch((error) => {
					appError(
						"[pluginServiceContextProvider] auto install rapid_ocr failed",
						error,
					);
				});
				pluginInstallPlugin(PLUGIN_ID_TRANSLATE, false).catch((error) => {
					appError(
						"[pluginServiceContextProvider] auto install translate failed",
						error,
					);
				});
			}

			initServiceReadyRef.current = true;
		}
	}, [setPluginConfig, pluginList, autoInit]);

	const refreshPluginStatus = useCallback(async () => {
		const pluginStatus = await pluginGetPluginsStatus();

		if (isDeepEqualReact(pluginStatus, pluginStatusResultRef.current)) {
			return;
		}

		pluginStatusResultRef.current = pluginStatus;

		setPluginStatus(
			pluginStatus.reduce((acc, plugin) => {
				acc[plugin.name] = plugin;
				return acc;
			}, {} as PluginStatusRecord),
		);

		const pluginReadyStatus = pluginStatus.reduce(
			(acc, plugin) => {
				acc[plugin.name] = plugin.status === PluginStatus.Installed;
				return acc;
			},
			{} as Record<string, boolean>,
		);

		if (isDeepEqualReact(pluginReadyStatus, pluginReadyStatusRef.current)) {
			return;
		}

		pluginReadyStatusRef.current = pluginReadyStatus;

		setPluginReadyStatus(pluginReadyStatus);
	}, [setPluginStatus, setPluginReadyStatus, pluginReadyStatusRef]);

	const refreshPluginStatusThrottle = useMemo(
		() => throttle(refreshPluginStatus, 1000),
		[refreshPluginStatus],
	);

	const initPluginPendingRef = useRef(false);
	useEffect(() => {
		if (initPluginPendingRef.current) {
			return;
		}

		initPluginPendingRef.current = true;
		initPluginConfig()
			.catch((error) => {
				// 插件初始化失败绝不能让 pluginStatus 永远空着：那会卡死 isReadyStatus 门控，
				// 连截图/托盘等不依赖插件的功能都注册不上。捕获后仍要刷新状态（见 finally）。
				appError("[pluginServiceContextProvider] initPluginConfig failed", error);
			})
			.finally(() => {
				refreshPluginStatus();
				initPluginPendingRef.current = false;
			});
	}, [initPluginConfig, refreshPluginStatus]);

	const isReadyCore = useCallback(
		(pluginId: string) => {
			return pluginReadyStatusRef.current?.[pluginId] ?? false;
		},
		[pluginReadyStatusRef],
	);

	const isReadyStatusCore = useCallback(
		(pluginId: string) => {
			return pluginReadyStatus?.[pluginId] ?? false;
		},
		[pluginReadyStatus],
	);

	const contextValues = useMemo(() => {
		return {
			pluginConfig,
			pluginConfigRef,
			pluginStatus,
			pluginStatusRef,
			refreshPluginStatus,
			refreshPluginStatusThrottle,
			isReady: pluginStatus ? isReadyCore : undefined,
			isReadyStatus: pluginStatus ? isReadyStatusCore : undefined,
		};
	}, [
		isReadyCore,
		pluginConfig,
		pluginConfigRef,
		pluginStatus,
		pluginStatusRef,
		refreshPluginStatus,
		refreshPluginStatusThrottle,
		isReadyStatusCore,
	]);

	return (
		<PluginServiceContext.Provider value={contextValues}>
			{children}
		</PluginServiceContext.Provider>
	);
};
