import {
	CopyOutlined,
	LoadingOutlined,
	SnippetsOutlined,
	StopOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Empty, message, Segmented, Select, Space } from "antd";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { writeText } from "tauri-plugin-clipboard-api";
import type { ChatApiConfig } from "@/types/appSettings";
import {
	type AiActionPreset,
	defaultAiActions,
	defaultImageAiActions,
	getOfficialBackends,
	OFFICIAL_API_URI,
	runAiAction,
	runAiVisionAction,
	runTranslate,
} from "./ai";
import { suppressClipboardCapture } from "./monitor";

export type AiPanelProps = {
	open: boolean;
	onClose: () => void;
	/** 待处理的文本内容（图片模式下可为空） */
	input: string;
	/** 图片模式：待分析图片的 base64 data URL（提供时进入「图片视觉」模式） */
	image?: string | null;
	/** 统一的 AI 后端列表（来自 设置 · AI 助手） */
	backends: ChatApiConfig[];
	/** 翻译目标语言 */
	translateTargetLang: string;
	/** 初始动作（translate 表示翻译） */
	initialAction?: string;
	/** 把结果写回剪贴板并粘贴到当前应用 */
	onPaste?: (text: string) => Promise<void>;
};

export const AiPanel: React.FC<AiPanelProps> = ({
	open,
	onClose,
	input,
	image,
	backends,
	translateTargetLang,
	initialAction,
	onPaste,
}) => {
	// 图片模式：传入了图片 → 用视觉动作预设、仅允许支持视觉的后端
	const isImageMode = !!image;
	const actions: AiActionPreset[] = isImageMode
		? defaultImageAiActions
		: defaultAiActions;
	const [actionId, setActionId] = useState<string>(
		(isImageMode ? undefined : initialAction) ?? actions[0].id,
	);
	const [backendIdx, setBackendIdx] = useState<number>(0);
	const [result, setResult] = useState("");
	const [loading, setLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	// 本次挂载是否已自动运行过初始动作（避免重复触发）
	const autoRanRef = useRef(false);

	// 官方内置模型（通义千问 Flash/Plus/VL Flash），打开面板时拉取一次
	const [officialBackends, setOfficialBackends] = useState<ChatApiConfig[]>([]);
	useEffect(() => {
		if (open) {
			getOfficialBackends().then(setOfficialBackends);
		}
	}, [open]);

	// 自定义后端 + 官方模型合并：用户两者都能选
	const allBackends = useMemo(
		() => [...backends, ...officialBackends],
		[backends, officialBackends],
	);

	// 图片模式只列出「支持视觉」的后端（官方通义千问 VL Flash 或自配 gpt-4o / llava 等）
	const usableBackends = useMemo(
		() => (isImageMode ? allBackends.filter((b) => b.support_vision) : allBackends),
		[allBackends, isImageMode],
	);

	const currentBackend: ChatApiConfig | undefined = useMemo(
		() => usableBackends[backendIdx] ?? usableBackends[0],
		[usableBackends, backendIdx],
	);

	const run = useCallback(
		async (forceAction?: string) => {
			if (!currentBackend) {
				message.error(
					isImageMode
						? "未找到支持视觉的模型，请使用官方「通义千问 VL Flash」或在「设置 · AI 助手」中开启某后端的「支持视觉」"
						: "请先在「设置 · AI 助手」中添加并配置一个 AI 后端",
				);
				return;
			}
			const act = forceAction ?? actionId;
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;
			setResult("");
			setLoading(true);
			try {
				if (isImageMode && image) {
					const preset = actions.find((a) => a.id === act) ?? actions[0];
					await runAiVisionAction(
						currentBackend,
						preset.prompt,
						image,
						(chunk) => setResult((p) => p + chunk),
						controller.signal,
					);
				} else if (act === "translate") {
					await runTranslate(
						currentBackend,
						input,
						translateTargetLang,
						(chunk) => setResult((p) => p + chunk),
						controller.signal,
					);
				} else {
					const preset = actions.find((a) => a.id === act) ?? actions[0];
					await runAiAction(
						currentBackend,
						preset.prompt,
						input,
						(chunk) => setResult((p) => p + chunk),
						controller.signal,
					);
				}
			} catch (e) {
				if (!controller.signal.aborted) {
					setResult(
						(p) =>
							`${p}\n\n> ⚠️ 出错：${e instanceof Error ? e.message : String(e)}`,
					);
				}
			} finally {
				setLoading(false);
			}
		},
		[currentBackend, isImageMode, image, actionId, actions, input, translateTargetLang],
	);

	// #9 可用后端列表变短时收敛下标，避免 Select 显示与实际运行后端不一致
	useEffect(() => {
		if (backendIdx > usableBackends.length - 1) {
			setBackendIdx(0);
		}
	}, [usableBackends.length, backendIdx]);

	// #12 面板打开且后端就绪时，自动运行一次初始/默认动作（每次挂载仅一次）
	useEffect(() => {
		if (open && currentBackend && !autoRanRef.current) {
			autoRanRef.current = true;
			run(actionId);
		}
	}, [open, currentBackend, actionId, run]);

	const stop = useCallback(() => {
		abortRef.current?.abort();
		setLoading(false);
		// #20 给出「已停止」反馈，区分模型答完与手动中断
		setResult((p) => (p ? `${p}\n\n> ⏹ 已停止` : p));
	}, []);

	const segmentOptions = useMemo(
		() =>
			isImageMode
				? actions.map((a) => ({ label: a.name, value: a.id }))
				: [
						...actions.map((a) => ({ label: a.name, value: a.id })),
						{ label: "翻译", value: "translate" },
					],
		[actions, isImageMode],
	);

	// 图片预览：即使没有可用视觉后端也保留，让用户不丢失上下文（#17）
	const imagePreview =
		isImageMode && image ? (
			<div
				style={{
					textAlign: "center",
					background: "var(--zmeng-surface, rgba(0,0,0,0.03))",
					borderRadius: 8,
					padding: 8,
				}}
			>
				{/** biome-ignore lint/a11y/useAltText: 剪贴板图片预览 */}
				<img
					src={image}
					alt="待分析图片"
					draggable={false}
					style={{
						maxHeight: 140,
						maxWidth: "100%",
						objectFit: "contain",
						borderRadius: 6,
					}}
				/>
			</div>
		) : null;

	return (
		<Drawer
			title={isImageMode ? "AI 处理 · 图片视觉" : "AI 处理"}
			placement="bottom"
			height="72%"
			open={open}
			onClose={() => {
				stop();
				onClose();
			}}
			styles={{ body: { padding: 12 } }}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 10,
					height: "100%",
				}}
			>
				{imagePreview}
				{usableBackends.length === 0 ? (
					<Empty
						description={
							isImageMode
								? "未找到支持视觉的模型。请使用官方「通义千问 VL Flash」，或到「设置 · AI 助手」为某个后端开启「支持视觉」（如 gpt-4o、qwen3-vl、llava）"
								: "正在加载模型…若长时间无内容，可到「设置 · AI 助手」添加 Ollama 或云端模型"
						}
						style={{ marginTop: 40 }}
					/>
				) : (
					<>
						<Segmented
							options={segmentOptions}
							value={actionId}
							onChange={(v) => {
								setActionId(v as string);
								run(v as string);
							}}
						/>

						<Space wrap size={8}>
							<Select
								size="small"
								style={{ minWidth: 220 }}
								value={backendIdx}
								onChange={setBackendIdx}
								options={usableBackends.map((b, i) => ({
									label: `${b.model_name || "未命名"}${
										b.api_model ? ` · ${b.api_model}` : "（未设模型）"
									}${b.api_uri === OFFICIAL_API_URI ? "（官方）" : ""}`,
									value: i,
								}))}
							/>
							{loading ? (
								<Button
									size="small"
									danger
									icon={<StopOutlined />}
									onClick={stop}
								>
									停止
								</Button>
							) : (
								<Button size="small" type="primary" onClick={() => run()}>
									运行
								</Button>
							)}
						</Space>

						<div
							style={{
								flex: 1,
								overflow: "auto",
								border: "1px solid var(--zmeng-border, rgba(0,0,0,0.1))",
								borderRadius: 8,
								padding: 12,
								background: "var(--zmeng-surface, #ffffff)",
								color: "var(--zmeng-text, #1f2328)",
							}}
							className="markdown-body zmeng-ai-result"
						>
							{loading && !result ? (
								<span style={{ color: "var(--zmeng-text-secondary, #888)" }}>
									<LoadingOutlined /> 生成中…
								</span>
							) : result ? (
								<Markdown remarkPlugins={[remarkGfm]}>{result}</Markdown>
							) : (
								<span style={{ color: "var(--zmeng-text-secondary, #888)" }}>
									选择一个动作开始处理
								</span>
							)}
						</div>

						<Space>
							<Button
								icon={<CopyOutlined />}
								size="small"
								disabled={!result}
								onClick={async () => {
									suppressClipboardCapture();
									await writeText(result);
									message.success("已复制结果");
								}}
							>
								复制
							</Button>
							<Button
								icon={<SnippetsOutlined />}
								size="small"
								type="primary"
								disabled={!result || !onPaste}
								onClick={async () => {
									await onPaste?.(result);
								}}
							>
								粘贴到当前应用
							</Button>
						</Space>
					</>
				)}
			</div>
		</Drawer>
	);
};
