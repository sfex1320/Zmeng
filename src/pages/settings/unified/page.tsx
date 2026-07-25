import {
	CloudOutlined,
	DatabaseOutlined,
	DeleteOutlined,
	DesktopOutlined,
	FolderOpenOutlined,
	RobotOutlined,
	SafetyOutlined,
	ScanOutlined,
	ScissorOutlined,
	SettingOutlined,
	SnippetsOutlined,
	SyncOutlined,
	ThunderboltOutlined,
	TranslationOutlined,
	VideoCameraOutlined,
} from "@ant-design/icons";
import {
	Button,
	Input,
	InputNumber,
	message,
	Modal,
	Segmented,
	Select,
	Slider,
	Space,
	Switch,
	theme,
	Typography,
} from "antd";
import { emit } from "@tauri-apps/api/event";
import * as dialog from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import type React from "react";
import {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { isAdmin, restartWithAdmin } from "@/commands/core";
import { createLocalConfigDir, getAppConfigBaseDir } from "@/commands/file";
import { videoRecordGetMicrophoneDeviceNames } from "@/commands/videoRecord";
import { ContentWrap } from "@/components/contentWrap";
import { DirectoryInput } from "@/components/directoryInput";
import { GlobalShortcutContext } from "@/components/globalShortcut";
import { KeyButton } from "@/components/keyButton";
import { ThemeSwitcher } from "@/components/themeSwitcher";
import { AppSettingsActionContext } from "@/contexts/appSettingsActionContext";
import { useAppSettingsLoad } from "@/hooks/useAppSettingsLoad";
import {
	listCloudModels,
	listOllamaModels,
	testBackend,
} from "@/pages/clipboardSidebar/ai";
import {
	defaultZmengSettings,
	type ZmengSettings,
	ZmengSettingsStore,
} from "@/pages/clipboardSidebar/store";
import {
	type AppSettingsData,
	AppSettingsGroup,
	AppSettingsLanguage,
	type ChatApiConfig,
	DoubleClickAction,
	GifFormat,
	OcrDetectAfterAction,
	OcrModel,
	VideoMaxSize,
} from "@/types/appSettings";
import { AppFunction } from "@/types/components/appFunction";
import { ImageFormat } from "@/types/utils/file";

/** 删除下标为 removed 的项后，把 Record<number,T> 的键整体下移对齐 */
function shiftIndexMap<T>(
	map: Record<number, T>,
	removed: number,
): Record<number, T> {
	const out: Record<number, T> = {};
	for (const [k, v] of Object.entries(map)) {
		const n = Number(k);
		if (n === removed) continue;
		out[n > removed ? n - 1 : n] = v;
	}
	return out;
}

export type CatKey =
	| "general"
	| "screenshot"
	| "video"
	| "ocr"
	| "translation"
	| "ai"
	| "clipboard"
	| "shortcut";

export const SETTINGS_CATEGORIES: CatKey[] = [
	"general",
	"screenshot",
	"video",
	"ocr",
	"translation",
	"ai",
	"clipboard",
	"shortcut",
];

const CATEGORIES: {
	key: CatKey;
	label: string;
	icon: React.ReactNode;
	desc: string;
}[] = [
	{
		key: "general",
		label: "通用",
		icon: <SettingOutlined />,
		desc: "主题 · 语言 · 启动",
	},
	{
		key: "screenshot",
		label: "截图",
		icon: <ScissorOutlined />,
		desc: "保存 · 复制 · 显示",
	},
	{
		key: "video",
		label: "视频录制",
		icon: <VideoCameraOutlined />,
		desc: "帧率 · 编码 · 保存路径",
	},
	{
		key: "ocr",
		label: "文字识别",
		icon: <ScanOutlined />,
		desc: "OCR 模型与行为",
	},
	{
		key: "translation",
		label: "翻译",
		icon: <TranslationOutlined />,
		desc: "语言与排版",
	},
	{
		key: "ai",
		label: "AI 助手",
		icon: <RobotOutlined />,
		desc: "模型后端与参数",
	},
	{
		key: "clipboard",
		label: "剪贴板",
		icon: <SnippetsOutlined />,
		desc: "侧栏 · 历史 · 翻译",
	},
	{
		key: "shortcut",
		label: "快捷键",
		icon: <ThunderboltOutlined />,
		desc: "全局快捷键",
	},
];

const LANG_OPTIONS = [
	{ label: "中文", value: "zh-CHS" },
	{ label: "英语", value: "en" },
	{ label: "日语", value: "ja" },
	{ label: "韩语", value: "ko" },
	{ label: "法语", value: "fr" },
	{ label: "德语", value: "de" },
	{ label: "俄语", value: "ru" },
	{ label: "西班牙语", value: "es" },
];

const SHORTCUT_ITEMS: { fn: AppFunction; label: string }[] = [
	{ fn: AppFunction.Screenshot, label: "截图" },
	{ fn: AppFunction.ScreenshotFixed, label: "固定到屏幕" },
	{ fn: AppFunction.ScreenshotFullScreen, label: "全屏截图" },
	{ fn: AppFunction.ScreenshotOcr, label: "OCR 文字识别" },
	{ fn: AppFunction.Translation, label: "翻译" },
	{ fn: AppFunction.Chat, label: "AI 助手" },
	{ fn: AppFunction.ClipboardSidebar, label: "剪贴板侧栏" },
	{ fn: AppFunction.PasteAsPlainText, label: "粘贴为纯文本" },
];

/** 一行设置：左侧标题/说明，右侧控件 */
const Row: React.FC<{
	title: string;
	desc?: string;
	children: React.ReactNode;
	vertical?: boolean;
}> = ({ title, desc, children, vertical }) => {
	const { token } = theme.useToken();
	return (
		<div className={`s-row ${vertical ? "vertical" : ""}`}>
			<div className="s-row-label">
				<div className="s-row-title">{title}</div>
				{desc && (
					<div className="s-row-desc" style={{ color: token.colorTextTertiary }}>
						{desc}
					</div>
				)}
			</div>
			<div className="s-row-ctrl">{children}</div>
			<style jsx>{`
				.s-row {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 16px;
					padding: 12px 0;
					border-bottom: 1px solid ${token.colorBorderSecondary};
				}
				.s-row:last-child {
					border-bottom: none;
				}
				.s-row.vertical {
					flex-direction: column;
					align-items: stretch;
				}
				.s-row-title {
					font-size: 14px;
					font-weight: 500;
				}
				.s-row-desc {
					font-size: 12px;
					margin-top: 2px;
					line-height: 1.5;
				}
				.s-row.vertical .s-row-ctrl {
					width: 100%;
				}
				.s-row-ctrl {
					flex: none;
					display: flex;
					align-items: center;
					gap: 8px;
				}
			`}</style>
		</div>
	);
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
	title,
	children,
}) => {
	const { token } = theme.useToken();
	return (
		<div
			className="s-section"
			style={{
				background: token.colorBgContainer,
				border: `1px solid ${token.colorBorderSecondary}`,
				borderRadius: token.borderRadiusLG,
			}}
		>
			<div className="s-section-title">{title}</div>
			<div className="s-section-body">{children}</div>
			<style jsx>{`
				.s-section {
					padding: 4px 20px 8px;
					margin-bottom: 16px;
				}
				.s-section-title {
					font-size: 13px;
					font-weight: 600;
					letter-spacing: 0.5px;
					padding: 14px 0 6px;
					color: ${token.colorTextSecondary};
				}
			`}</style>
		</div>
	);
};

export const UnifiedSettingsPage: React.FC<{ category: CatKey }> = ({
	category,
}) => {
	const { token } = theme.useToken();
	const { updateAppSettings } = useContext(AppSettingsActionContext);
	const { appFunctionSettings } = useContext(GlobalShortcutContext);

	const [s, setS] = useState<AppSettingsData | undefined>(undefined);

	useAppSettingsLoad(
		useCallback((settings: AppSettingsData) => {
			setS(settings);
		}, []),
		false,
	);

	const update = useCallback(
		<G extends AppSettingsGroup>(
			group: G,
			patch: Partial<AppSettingsData[G]>,
			deb = false,
		) => {
			setS((prev) =>
				prev ? { ...prev, [group]: { ...prev[group], ...patch } } : prev,
			);
			updateAppSettings(
				group,
				patch as Partial<AppSettingsData[typeof group]>,
				deb,
				true,
				true,
			);
		},
		[updateAppSettings],
	);

	// ZMENG 自有设置（剪贴板侧栏）
	const zmengStoreRef = useRef<ZmengSettingsStore | undefined>(undefined);
	const [zmeng, setZmeng] = useState<ZmengSettings | undefined>(undefined);
	useEffect(() => {
		const st = new ZmengSettingsStore();
		zmengStoreRef.current = st;
		// 必须先 init() 再读写，否则 get/set 抛 "Store not initialized"，导致设置不落盘
		st.init()
			.then(() => st.loadSettings())
			.then(setZmeng);
	}, []);
	// 用 ref 镜像当前值，使副作用（落盘/广播）在 setState 更新器之外执行（#19）
	const zmengRef = useRef<ZmengSettings | undefined>(undefined);
	zmengRef.current = zmeng;
	const persistTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const updateZmeng = useCallback((patch: Partial<ZmengSettings>) => {
		const next = { ...(zmengRef.current ?? defaultZmengSettings), ...patch };
		zmengRef.current = next;
		setZmeng(next);
		// 落盘 + 广播防抖：滑块连续拖动会触发大量调用，合并为最后一次，
		// 避免 reload-settings 事件洪泛导致侧栏窗口被高频重排（崩溃加固）。
		// store 未就绪时静默跳过，避免 "Store not initialized" 未捕获异常（#21）
		if (persistTimerRef.current) {
			clearTimeout(persistTimerRef.current);
		}
		persistTimerRef.current = setTimeout(() => {
			const store = zmengStoreRef.current;
			const latest = zmengRef.current;
			if (store?.inited() && latest) {
				store
					.storeSettings(latest)
					.then(() => emit("zmeng://reload-settings"))
					.catch(() => {});
			}
		}, 200);
	}, []);

	// 数据存储目录（当前）+ 视频录制可用麦克风设备
	const [configBaseDir, setConfigBaseDir] = useState("");
	const [micDevices, setMicDevices] = useState<string[]>([]);
	useEffect(() => {
		getAppConfigBaseDir()
			.then(setConfigBaseDir)
			.catch(() => {});
	}, []);
	useEffect(() => {
		if (category === "video") {
			videoRecordGetMicrophoneDeviceNames()
				.then(setMicDevices)
				.catch(() => {});
		}
	}, [category]);

	// 当前是否以管理员运行（用于「以管理员身份运行」按钮的状态显示）
	const [adminState, setAdminState] = useState(false);
	useEffect(() => {
		if (category === "general") {
			isAdmin()
				.then(setAdminState)
				.catch(() => {});
		}
	}, [category]);

	// 选择数据存储文件夹：确认后把配置/历史/剪贴板等数据改存到该目录并重启
	const chooseDataFolder = useCallback(async () => {
		let path: string | null = null;
		try {
			path = (await dialog.open({
				directory: true,
				defaultPath: configBaseDir || undefined,
			})) as string | null;
		} catch (error) {
			message.error(`${error}`);
			return;
		}
		if (!path) {
			return;
		}
		const target = path;
		Modal.confirm({
			title: "更改数据存储位置",
			content: `将把 ZMENG 的配置、历史、剪贴板等数据改存到：${target}。确定后应用会立即重启以生效。`,
			okText: "确定并重启",
			cancelText: "取消",
			onOk: async () => {
				try {
					await createLocalConfigDir(target);
					await relaunch();
				} catch (error) {
					message.error(`设置失败：${error}`);
				}
			},
		});
	}, [configBaseDir]);

	// AI 后端「拉取模型」结果 + 「测试连接」状态，按 chatApiConfigList 下标存
	const [aiModels, setAiModels] = useState<Record<number, string[]>>({});
	const [aiTest, setAiTest] = useState<
		Record<number, "idle" | "loading" | "ok" | "fail">
	>({});

	const content = useMemo(() => {
		if (!s) {
			return null;
		}

		const screenshot = s[AppSettingsGroup.FunctionScreenshot];
		const sysShot = s[AppSettingsGroup.SystemScreenshot];
		const uiShot = s[AppSettingsGroup.Screenshot];
		const common = s[AppSettingsGroup.Common];
		const sysCommon = s[AppSettingsGroup.SystemCommon];
		const ocr = s[AppSettingsGroup.FunctionOcr];
		const translation = s[AppSettingsGroup.FunctionTranslation];
		const chat = s[AppSettingsGroup.FunctionChat];
		const sysChat = s[AppSettingsGroup.SystemChat];
		const video = s[AppSettingsGroup.FunctionVideoRecord];

		switch (category) {
			case "general":
				return (
					<>
						<Section title="外观">
							<Row title="主题配色" desc="5 套预设，随时切换全局配色">
								<ThemeSwitcher />
							</Row>
							<Row title="界面圆角" desc="控件与卡片的圆角大小">
								<Slider
									style={{ width: 200 }}
									min={0}
									max={16}
									value={common.borderRadius}
									onChange={(v) =>
										update(AppSettingsGroup.Common, { borderRadius: v }, true)
									}
								/>
							</Row>
							<Row title="紧凑布局" desc="更小的间距，单屏显示更多内容">
								<Switch
									checked={common.enableCompactLayout}
									onChange={(v) =>
										update(AppSettingsGroup.Common, { enableCompactLayout: v })
									}
								/>
							</Row>
						</Section>
						<Section title="通用">
							<Row title="界面语言">
								<Select
									style={{ width: 160 }}
									value={common.language}
									onChange={(v) =>
										update(AppSettingsGroup.Common, { language: v })
									}
									options={[
										{ label: "简体中文", value: AppSettingsLanguage.ZHHans },
										{ label: "繁體中文", value: AppSettingsLanguage.ZHHant },
										{ label: "English", value: AppSettingsLanguage.EN },
									]}
								/>
							</Row>
							<Row title="开机自启动" desc="登录系统后自动在后台运行">
								<Switch
									checked={sysCommon.autoStart}
									onChange={(v) =>
										update(AppSettingsGroup.SystemCommon, { autoStart: v })
									}
								/>
							</Row>
							<Row
								title="以管理员身份运行"
								desc="提权后可操作受保护窗口（如向管理员程序粘贴）；点击会弹出 UAC 并重启"
							>
								{adminState ? (
									<Button disabled icon={<SafetyOutlined />}>
										已是管理员
									</Button>
								) : (
									<Button
										icon={<SafetyOutlined />}
										onClick={async () => {
											try {
												await restartWithAdmin();
											} catch (error) {
												message.error(`提权失败：${error}`);
											}
										}}
									>
										以管理员重启
									</Button>
								)}
							</Row>
							<Row title="记录运行日志" desc="排查问题时开启">
								<Switch
									checked={sysCommon.runLog}
									onChange={(v) =>
										update(AppSettingsGroup.SystemCommon, { runLog: v })
									}
								/>
							</Row>
						</Section>
						<Section title="数据存储">
							<Row
								title="数据存储文件夹"
								desc="配置、剪贴板历史、截图历史等数据的存放位置。更改后会迁移到所选文件夹并重启应用。"
								vertical
							>
								<Space wrap>
									<Typography.Text
										style={{ wordBreak: "break-all" }}
										copyable={configBaseDir ? { text: configBaseDir } : false}
										type="secondary"
									>
										{configBaseDir || "（默认位置）"}
									</Typography.Text>
								</Space>
								<Space wrap style={{ marginTop: 8 }}>
									<Button
										icon={<DatabaseOutlined />}
										onClick={() => chooseDataFolder()}
									>
										选择文件夹…
									</Button>
									<Button
										icon={<FolderOpenOutlined />}
										onClick={() =>
											configBaseDir &&
											openPath(configBaseDir).catch(() =>
												message.warning("无法打开该文件夹"),
											)
										}
										disabled={!configBaseDir}
									>
										打开当前位置
									</Button>
								</Space>
							</Row>
						</Section>
					</>
				);

			case "screenshot":
				return (
					<>
						<Section title="保存">
							<Row title="默认保存目录" desc="留空则每次手动选择" vertical>
								<DirectoryInput
									value={screenshot.saveFileDirectory}
									onChange={(v) =>
										update(
											AppSettingsGroup.FunctionScreenshot,
											{ saveFileDirectory: v },
											true,
										)
									}
								/>
							</Row>
							<Row title="图片格式">
								<Select
									style={{ width: 160 }}
									value={screenshot.saveFileFormat}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionScreenshot, {
											saveFileFormat: v,
										})
									}
									options={[
										{ label: "PNG（无损）", value: ImageFormat.PNG },
										{ label: "JPEG（小体积）", value: ImageFormat.JPEG },
										{ label: "WEBP", value: ImageFormat.WEBP },
									]}
								/>
							</Row>
							<Row title="复制后自动保存" desc="复制截图的同时保存为文件">
								<Switch
									checked={screenshot.autoSaveOnCopy}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionScreenshot, {
											autoSaveOnCopy: v,
										})
									}
								/>
							</Row>
						</Section>
						<Section title="行为">
							<Row title="截图后复制到剪贴板">
								<Switch
									checked={screenshot.focusedWindowCopyToClipboard}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionScreenshot, {
											focusedWindowCopyToClipboard: v,
											fullScreenCopyToClipboard: v,
										})
									}
								/>
							</Row>
							<Row title="双击截图区域" desc="对选区双击时执行的操作">
								<Select
									style={{ width: 180 }}
									value={screenshot.doubleClickAction}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionScreenshot, {
											doubleClickAction: v,
										})
									}
									options={[
										{ label: "复制到剪贴板", value: DoubleClickAction.Copy },
										{ label: "保存为文件", value: DoubleClickAction.Save },
										{
											label: "固定到屏幕",
											value: DoubleClickAction.FixedToScreen,
										},
										{ label: "无", value: DoubleClickAction.None },
									]}
								/>
							</Row>
						</Section>
						<Section title="显示">
							<Row title="界面缩放" desc="截图工具栏与控件的缩放比例">
								<Slider
									style={{ width: 200 }}
									min={50}
									max={100}
									step={5}
									value={uiShot.uiScale}
									onChange={(v) =>
										update(AppSettingsGroup.Screenshot, { uiScale: v }, true)
									}
								/>
							</Row>
							<Row title="记录截图历史" desc="可在历史中回看最近的截图">
								<Switch
									checked={sysShot.recordCaptureHistory}
									onChange={(v) =>
										update(AppSettingsGroup.SystemScreenshot, {
											recordCaptureHistory: v,
										})
									}
								/>
							</Row>
							<Row title="多显示器截图" desc="跨多个屏幕进行截图">
								<Switch
									checked={sysShot.enableMultipleMonitor}
									onChange={(v) =>
										update(AppSettingsGroup.SystemScreenshot, {
											enableMultipleMonitor: v,
										})
									}
								/>
							</Row>
						</Section>
					</>
				);

			case "ocr":
				return (
					<Section title="文字识别 OCR">
						<Row title="识别模型" desc="本地离线模型，V5 精度更高">
							<Select
								style={{ width: 180 }}
								value={ocr.ocrModel}
								onChange={(v) =>
									update(AppSettingsGroup.FunctionOcr, { ocrModel: v })
								}
								options={[
									{ label: "RapidOCR V4（快速）", value: OcrModel.RapidOcrV4 },
									{ label: "RapidOCR V5（高精度）", value: OcrModel.RapidOcrV5 },
								]}
							/>
						</Row>
						<Row title="识别后操作" desc="OCR 完成后默认执行的动作">
							<Select
								style={{ width: 220 }}
								value={screenshot.ocrAfterAction}
								onChange={(v) =>
									update(AppSettingsGroup.FunctionScreenshot, {
										ocrAfterAction: v,
									})
								}
								options={[
									{ label: "不处理", value: OcrDetectAfterAction.None },
									{ label: "复制文本", value: OcrDetectAfterAction.CopyText },
									{
										label: "复制文本并关闭",
										value: OcrDetectAfterAction.CopyTextAndCloseWindow,
									},
								]}
							/>
						</Row>
						<Row title="模型热启动" desc="预加载模型，识别更快（占用更多内存）">
							<Switch
								checked={sysShot.ocrHotStart}
								onChange={(v) =>
									update(AppSettingsGroup.SystemScreenshot, { ocrHotStart: v })
								}
							/>
						</Row>
						<Row title="检测文字角度" desc="识别旋转/倾斜的文字">
							<Switch
								checked={sysShot.ocrDetectAngle}
								onChange={(v) =>
									update(AppSettingsGroup.SystemScreenshot, {
										ocrDetectAngle: v,
									})
								}
							/>
						</Row>
					</Section>
				);

			case "translation":
				return (
					<>
						<Section title="语言">
							<Row title="默认目标语言">
								<Select
									style={{ width: 160 }}
									value={translation.targetLanguage}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionTranslation, {
											targetLanguage: v,
										})
									}
									options={LANG_OPTIONS}
								/>
							</Row>
							<Row title="默认源语言">
								<Select
									style={{ width: 160 }}
									value={translation.sourceLanguage}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionTranslation, {
											sourceLanguage: v,
										})
									}
									options={[
										{ label: "自动检测", value: "auto" },
										...LANG_OPTIONS,
									]}
								/>
							</Row>
							<Row title="优化 AI 翻译排版" desc="对大模型译文做段落与格式优化">
								<Switch
									checked={translation.optimizeAiTranslationLayout}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionTranslation, {
											optimizeAiTranslationLayout: v,
										})
									}
								/>
							</Row>
						</Section>
						<Section title="AI 翻译提示词">
							<Row title="系统提示词" desc="使用大模型翻译时的指令" vertical>
								<Input.TextArea
									autoSize={{ minRows: 4, maxRows: 10 }}
									value={translation.translationSystemPrompt}
									onChange={(e) =>
										update(
											AppSettingsGroup.FunctionTranslation,
											{ translationSystemPrompt: e.target.value },
											true,
										)
									}
								/>
							</Row>
						</Section>
					</>
				);

			case "ai": {
				const list = chat.chatApiConfigList;
				const updateItem = (idx: number, p: Partial<ChatApiConfig>) => {
					const next = list.map((it, i) => (i === idx ? { ...it, ...p } : it));
					update(AppSettingsGroup.FunctionChat, { chatApiConfigList: next }, true);
				};
				const removeItem = (idx: number) => {
					update(AppSettingsGroup.FunctionChat, {
						chatApiConfigList: list.filter((_, i) => i !== idx),
					});
					// 删除后键位下移，避免「拉取模型/测试」状态错位到别的后端
					setAiModels((prev) => shiftIndexMap(prev, idx));
					setAiTest((prev) => shiftIndexMap(prev, idx));
				};
				const addItem = (type: "cloud" | "ollama") => {
					const item: ChatApiConfig =
						type === "ollama"
							? {
									model_name: "Ollama 本地",
									api_uri: "http://localhost:11434/v1",
									api_key: "ollama",
									api_model: "",
									support_thinking: false,
									support_vision: false,
								}
							: {
									model_name: "云端模型",
									api_uri: "https://api.openai.com/v1",
									api_key: "",
									api_model: "gpt-4o-mini",
									support_thinking: false,
									support_vision: false,
								};
					update(AppSettingsGroup.FunctionChat, {
						chatApiConfigList: [...list, item],
					});
				};
				const pullModels = async (idx: number, item: ChatApiConfig) => {
					const looksOllama =
						item.api_uri.includes("11434") || item.api_uri.includes("ollama");
					let models = looksOllama
						? await listOllamaModels(item.api_uri)
						: await listCloudModels(item.api_uri, item.api_key);
					if (!models.length) {
						models = looksOllama
							? await listCloudModels(item.api_uri, item.api_key)
							: await listOllamaModels(item.api_uri);
					}
					if (models.length) {
						setAiModels((prev) => ({ ...prev, [idx]: models }));
						if (!item.api_model) {
							updateItem(idx, { api_model: models[0] });
						}
						message.success(`拉取到 ${models.length} 个模型`);
					} else {
						message.warning(
							"未拉取到模型：请检查地址/密钥，或确认本地 Ollama 已启动",
						);
					}
				};
				const testConn = async (idx: number, item: ChatApiConfig) => {
					setAiTest((prev) => ({ ...prev, [idx]: "loading" }));
					const ok = await testBackend(item);
					setAiTest((prev) => ({ ...prev, [idx]: ok ? "ok" : "fail" }));
					if (ok) {
						message.success("连接成功");
					} else {
						message.warning("连接失败：请检查地址 / 密钥 / 模型");
					}
				};
				return (
					<>
						<Section title="模型后端">
							<div
								style={{
									display: "flex",
									gap: 8,
									padding: "12px 0",
									flexWrap: "wrap",
								}}
							>
								<Button
									icon={<DesktopOutlined />}
									onClick={() => addItem("ollama")}
								>
									添加 Ollama 本地
								</Button>
								<Button
									icon={<CloudOutlined />}
									onClick={() => addItem("cloud")}
								>
									添加云端 API
								</Button>
							</div>
							{list.length === 0 && (
								<div
									style={{
										color: token.colorTextTertiary,
										padding: "8px 0 16px",
										fontSize: 13,
									}}
								>
									还没有配置任何 AI 后端。本地推荐 Ollama，云端可填 OpenAI
									兼容地址。
								</div>
							)}
							<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
								{list.map((item, idx) => (
									<div
										key={`chat-${idx}`}
										style={{
											border: `1px solid ${token.colorBorderSecondary}`,
											borderRadius: token.borderRadius,
											padding: 12,
											background: token.colorFillQuaternary,
										}}
									>
										<div
											style={{
												display: "flex",
												gap: 8,
												alignItems: "center",
												marginBottom: 8,
											}}
										>
											<Input
												style={{ maxWidth: 220 }}
												placeholder="显示名称"
												value={item.model_name}
												onChange={(e) =>
													updateItem(idx, { model_name: e.target.value })
												}
											/>
											<div style={{ flex: 1 }} />
											<Button
												danger
												type="text"
												icon={<DeleteOutlined />}
												onClick={() => removeItem(idx)}
											/>
										</div>
										<div
											style={{
												display: "flex",
												flexDirection: "column",
												gap: 8,
											}}
										>
											<Input
												addonBefore="地址"
												placeholder="http://localhost:11434/v1"
												value={item.api_uri}
												onChange={(e) =>
													updateItem(idx, { api_uri: e.target.value })
												}
											/>
											<Input.Password
												addonBefore="密钥"
												placeholder="云端填 API Key，Ollama 可留默认"
												value={item.api_key}
												onChange={(e) =>
													updateItem(idx, { api_key: e.target.value })
												}
											/>
											<div style={{ display: "flex", gap: 8 }}>
												{aiModels[idx]?.length ? (
													<Select
														style={{ flex: 1 }}
														showSearch
														placeholder="选择模型"
														value={item.api_model || undefined}
														onChange={(v) =>
															update(
																AppSettingsGroup.FunctionChat,
																{
																	chatApiConfigList: list.map((it, i) =>
																		i === idx
																			? { ...it, api_model: v }
																			: it,
																	),
																},
																false,
															)
														}
														options={aiModels[idx].map((m) => ({
															label: m,
															value: m,
														}))}
													/>
												) : (
													<Input
														addonBefore="模型"
														placeholder="如 qwen2.5、gpt-4o-mini"
														value={item.api_model}
														onChange={(e) =>
															updateItem(idx, { api_model: e.target.value })
														}
													/>
												)}
												<Button
													icon={<SyncOutlined />}
													onClick={() => pullModels(idx, item)}
												>
													拉取模型
												</Button>
												<Button
													loading={aiTest[idx] === "loading"}
													type={aiTest[idx] === "ok" ? "primary" : "default"}
													danger={aiTest[idx] === "fail"}
													onClick={() => testConn(idx, item)}
												>
													{aiTest[idx] === "ok"
														? "已连通"
														: aiTest[idx] === "fail"
															? "重试"
															: "测试连接"}
												</Button>
											</div>
											<div style={{ display: "flex", gap: 24 }}>
												<span style={{ fontSize: 13 }}>
													<Switch
														size="small"
														checked={item.support_thinking}
														onChange={(v) =>
															updateItem(idx, { support_thinking: v })
														}
													/>{" "}
													支持思考
												</span>
												<span style={{ fontSize: 13 }}>
													<Switch
														size="small"
														checked={!!item.support_vision}
														onChange={(v) =>
															updateItem(idx, { support_vision: v })
														}
													/>{" "}
													支持视觉
												</span>
											</div>
										</div>
									</div>
								))}
							</div>
						</Section>
						<Section title="对话参数">
							<Row title="自动新建会话" desc="每次打开自动开启新对话">
								<Switch
									checked={chat.autoCreateNewSession}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionChat, {
											autoCreateNewSession: v,
										})
									}
								/>
							</Row>
							<Row title="最大 Token" desc="单次回复的最大长度">
								<InputNumber
									min={512}
									max={8192}
									step={256}
									value={sysChat.maxTokens}
									onChange={(v) =>
										update(
											AppSettingsGroup.SystemChat,
											{ maxTokens: v ?? 4096 },
											true,
										)
									}
								/>
							</Row>
							<Row title="温度" desc="越高越发散，越低越稳定">
								<Slider
									style={{ width: 200 }}
									min={0}
									max={2}
									step={0.1}
									value={sysChat.temperature}
									onChange={(v) =>
										update(AppSettingsGroup.SystemChat, { temperature: v }, true)
									}
								/>
							</Row>
						</Section>
					</>
				);
			}

			case "clipboard": {
				const z = zmeng ?? defaultZmengSettings;
				return (
					<>
						<Section title="侧栏">
							<Row title="停靠侧" desc="侧栏从哪一侧滑出">
								<Segmented
									value={z.dockSide}
									onChange={(v) => updateZmeng({ dockSide: v as "left" | "right" })}
									options={[
										{ label: "左侧", value: "left" },
										{ label: "右侧", value: "right" },
									]}
								/>
							</Row>
							<Row title="侧栏宽度" desc="单位像素（300 ~ 720）">
								<InputNumber
									min={300}
									max={720}
									step={10}
									value={z.sidebarWidth}
									onChange={(v) => updateZmeng({ sidebarWidth: v ?? 460 })}
								/>
							</Row>
							<Row title="不透明度" desc="调低可在特殊场景下透视背后内容">
								<Slider
									style={{ width: 200 }}
									min={30}
									max={100}
									step={5}
									value={Math.round((z.sidebarOpacity ?? 1) * 100)}
									onChange={(v) => updateZmeng({ sidebarOpacity: v / 100 })}
								/>
							</Row>
							<Row title="点选直接粘贴" desc="关闭则只复制到剪贴板">
								<Switch
									checked={z.pasteOnSelect}
									onChange={(v) => updateZmeng({ pasteOnSelect: v })}
								/>
							</Row>
							<Row title="历史上限" desc="超出后淘汰最旧的非收藏项">
								<InputNumber
									min={20}
									max={2000}
									value={z.maxItems}
									onChange={(v) => updateZmeng({ maxItems: v ?? 200 })}
								/>
							</Row>
							<Row title="复制后自动收起" desc="复制到新内容后自动收起侧栏">
								<Switch
									checked={z.autoHideOnCopy}
									onChange={(v) => updateZmeng({ autoHideOnCopy: v })}
								/>
							</Row>
						</Section>
						<Section title="翻译">
							<Row title="翻译引擎">
								<Segmented
									value={z.translateEngine}
									onChange={(v) =>
										updateZmeng({ translateEngine: v as "llm" | "official" })
									}
									options={[
										{ label: "大模型（自包含）", value: "llm" },
										{ label: "官方在线", value: "official" },
									]}
								/>
							</Row>
							<Row title="目标语言">
								<Input
									style={{ width: 160 }}
									value={z.translateTargetLang}
									onChange={(e) =>
										updateZmeng({ translateTargetLang: e.target.value })
									}
								/>
							</Row>
						</Section>
						<Section title="AI 处理">
							<div
								style={{
									fontSize: 13,
									color: token.colorTextSecondary,
									padding: "12px 0",
									lineHeight: 1.7,
								}}
							>
								剪贴板侧栏的「总结 / 解释 / 翻译」等 AI 动作，已统一使用
								<b style={{ color: token.colorText }}>「设置 · AI 助手」</b>
								中配置的模型后端，无需在此重复设置。
							</div>
						</Section>
					</>
				);
			}

			case "video":
				return (
					<>
						<Section title="基础设置">
							<Row title="分辨率上限" desc="录制画面缩放到不超过此高度，越低文件越小">
								<Select
									style={{ width: 160 }}
									value={video.videoMaxSize}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionVideoRecord, {
											videoMaxSize: v,
										})
									}
									options={[
										{ label: "原始（2160p 上限）", value: VideoMaxSize.P2160 },
										{ label: "1440p", value: VideoMaxSize.P1440 },
										{ label: "1080p", value: VideoMaxSize.P1080 },
										{ label: "720p", value: VideoMaxSize.P720 },
										{ label: "480p（最小）", value: VideoMaxSize.P480 },
									]}
								/>
							</Row>
							<Row title="录制时隐藏工具栏" desc="录制画面中不出现 ZMENG 的录制控制条">
								<Switch
									checked={video.enableExcludeFromCapture}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionVideoRecord, {
											enableExcludeFromCapture: v,
										})
									}
								/>
							</Row>
							<Row title="硬件加速" desc="使用 GPU 编码，更省 CPU（取决于显卡支持）">
								<Switch
									checked={video.hwaccel}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionVideoRecord, { hwaccel: v })
									}
								/>
							</Row>
						</Section>

						<Section title="帧率">
							<Row title="视频帧率" desc="每秒画面数，越高越流畅、文件越大">
								<Select
									style={{ width: 160 }}
									value={video.frameRate}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionVideoRecord, { frameRate: v })
									}
									options={[
										{ label: "15 fps", value: 15 },
										{ label: "24 fps", value: 24 },
										{ label: "30 fps", value: 30 },
										{ label: "60 fps", value: 60 },
										{ label: "120 fps", value: 120 },
									]}
								/>
							</Row>
							<Row title="GIF 帧率" desc="录制为动图时的帧率">
								<Select
									style={{ width: 160 }}
									value={video.gifFrameRate}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionVideoRecord, {
											gifFrameRate: v,
										})
									}
									options={[
										{ label: "10 fps", value: 10 },
										{ label: "15 fps", value: 15 },
										{ label: "24 fps", value: 24 },
									]}
								/>
							</Row>
						</Section>

						<Section title="保存">
							<Row
								title="视频保存目录"
								desc="录制完成后保存到此文件夹；留空则使用「视频」库下的 ZMENG 目录"
								vertical
							>
								<DirectoryInput
									value={video.saveDirectory}
									onChange={(v) =>
										update(
											AppSettingsGroup.FunctionVideoRecord,
											{ saveDirectory: v },
											true,
										)
									}
								/>
							</Row>
						</Section>

						<Section title="编码与音频">
							<Row title="编码器" desc="libx264 兼容性最好；含 GPU 的可选硬件编码器">
								<Select
									style={{ width: 200 }}
									value={video.encoder}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionVideoRecord, { encoder: v })
									}
									options={[
										{ label: "libx264（通用 H.264）", value: "libx264" },
										{ label: "libx265（H.265 更小）", value: "libx265" },
										{ label: "h264_amf（AMD 显卡）", value: "h264_amf" },
										{ label: "h264_nvenc（NVIDIA 显卡）", value: "h264_nvenc" },
									]}
								/>
							</Row>
							<Row title="编码预设" desc="越快越省时但文件略大，越慢压缩越好">
								<Select
									style={{ width: 200 }}
									value={video.encoderPreset}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionVideoRecord, {
											encoderPreset: v,
										})
									}
									options={[
										{ label: "ultrafast（最快）", value: "ultrafast" },
										{ label: "veryfast", value: "veryfast" },
										{ label: "medium（均衡）", value: "medium" },
										{ label: "slower", value: "slower" },
										{ label: "placebo（最高质量）", value: "placebo" },
									]}
								/>
							</Row>
							<Row title="麦克风设备" desc="录制时采集的麦克风；不指定则不录麦克风">
								<Select
									style={{ width: 240 }}
									value={video.microphoneDeviceName || ""}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionVideoRecord, {
											microphoneDeviceName: v,
										})
									}
									options={[
										{ label: "不指定（不录麦克风）", value: "" },
										...micDevices.map((d) => ({ label: d, value: d })),
									]}
								/>
							</Row>
							<Row title="动图格式" desc="录制为动图时的输出格式">
								<Select
									style={{ width: 160 }}
									value={video.gifFormat}
									onChange={(v) =>
										update(AppSettingsGroup.FunctionVideoRecord, { gifFormat: v })
									}
									options={[
										{ label: "GIF", value: GifFormat.Gif },
										{ label: "APNG", value: GifFormat.Apng },
										{ label: "WebP", value: GifFormat.Webp },
									]}
								/>
							</Row>
						</Section>
					</>
				);

			case "shortcut":
				return (
					<Section title="全局快捷键">
						<div
							style={{
								fontSize: 12,
								color: token.colorTextTertiary,
								padding: "10px 0 4px",
							}}
						>
							在任意应用中按下即可触发；点按钮后按下新的组合键即可修改。
						</div>
						{SHORTCUT_ITEMS.map(({ fn, label }) => (
							<Row key={fn} title={label}>
								<KeyButton
									title={label}
									maxLength={1}
									keyValue={appFunctionSettings?.[fn]?.shortcutKey ?? ""}
									onKeyChange={async (value: string) => {
										update(
											AppSettingsGroup.AppFunction,
											{
												[fn]: {
													shortcutKey: value,
													group: appFunctionSettings?.[fn]?.group,
												},
											} as unknown as Partial<
												AppSettingsData[AppSettingsGroup.AppFunction]
											>,
											false,
										);
									}}
								/>
							</Row>
						))}
					</Section>
				);
		}
	}, [
		s,
		category,
		token,
		update,
		zmeng,
		updateZmeng,
		appFunctionSettings,
		aiModels,
		aiTest,
		configBaseDir,
		micDevices,
		chooseDataFolder,
		adminState,
	]);

	const meta = CATEGORIES.find((c) => c.key === category);
	return (
		<ContentWrap className="unified-settings-wrap">
			<div className="us-root">
				<div className="us-head">
					<span
						className="us-head-icon"
						style={{
							background: token.colorPrimary,
							color: token.colorWhite,
						}}
					>
						{meta?.icon}
					</span>
					<div>
						<Typography.Title level={3} style={{ margin: 0 }}>
							{meta?.label ?? "设置"}
						</Typography.Title>
						<div style={{ color: token.colorTextTertiary, fontSize: 13 }}>
							{meta?.desc}
						</div>
					</div>
				</div>

				<div className="us-content">{content}</div>
			</div>

			<style jsx>{`
				.us-root {
					display: flex;
					flex-direction: column;
					gap: 18px;
					padding: ${token.margin}px 0 ${token.paddingLG}px;
					max-width: 880px;
				}
				.us-head {
					display: flex;
					align-items: center;
					gap: 14px;
				}
				.us-head-icon {
					width: 44px;
					height: 44px;
					flex: none;
					border-radius: 12px;
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 22px;
				}
				.us-content {
					min-width: 0;
				}
			`}</style>
		</ContentWrap>
	);
};
