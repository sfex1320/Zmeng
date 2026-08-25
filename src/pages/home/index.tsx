import {
	CameraOutlined,
	ExpandOutlined,
	PushpinOutlined,
	RobotOutlined,
	ScanOutlined,
	ScissorOutlined,
	SnippetsOutlined,
	TranslationOutlined,
} from "@ant-design/icons";
import { Button, theme, Typography } from "antd";
import type React from "react";
import { useCallback, useContext, useMemo } from "react";
import { useRouter } from "@tanstack/react-router";
import { CheckPermissions } from "@/components/checkPermissions";
import { ContentWrap } from "@/components/contentWrap";
import { GlobalShortcutContext } from "@/components/globalShortcut";
import { ThemeSwitcher } from "@/components/themeSwitcher";
import { toggleClipboardSidebar } from "@/functions/clipboardSidebar";
import { executeScreenshot } from "@/functions/screenshot";
import { executeTranslate } from "@/functions/tools";
import { AppFunction } from "@/types/components/appFunction";
import { ScreenshotType } from "@/utils/types";

const formatShortcut = (key?: string): string => {
	if (!key) return "";
	return key
		.replace(/CommandOrControl/g, "Ctrl")
		.replace(/Control/g, "Ctrl")
		.replace(/Command/g, "Cmd")
		.replace(/\+/g, " + ");
};

type SubAction = { label: string; onClick: () => void | Promise<void> };

type FeatureDef = {
	key: string;
	icon: React.ReactNode;
	title: string;
	desc: string;
	primary: SubAction;
	secondary?: SubAction[];
	shortcutFn?: AppFunction;
	accent: string;
};

export const HomePage = () => {
	const { token } = theme.useToken();
	const { appFunctionSettings } = useContext(GlobalShortcutContext);
	const router = useRouter();

	const openAiSettings = useCallback(() => {
		router.navigate({ to: "/settings/$cat", params: { cat: "ai" } });
	}, [router]);

	const shortcutOf = useCallback(
		(fn?: AppFunction) =>
			fn ? formatShortcut(appFunctionSettings?.[fn]?.shortcutKey) : "",
		[appFunctionSettings],
	);

	const features: FeatureDef[] = useMemo(
		() => [
			{
				key: "ocr",
				icon: <ScanOutlined />,
				title: "OCR 文字识别",
				desc: "框选屏幕区域，识别其中文字并复制",
				primary: {
					label: "识别文字",
					onClick: () => executeScreenshot(ScreenshotType.OcrDetect),
				},
				shortcutFn: AppFunction.ScreenshotOcr,
				accent: "#16b8a3",
			},
			{
				key: "translate",
				icon: <TranslationOutlined />,
				title: "翻译",
				desc: "大模型翻译，或截图识别后翻译",
				primary: { label: "打开翻译", onClick: () => executeTranslate() },
				secondary: [
					{
						label: "截图翻译",
						onClick: () => executeScreenshot(ScreenshotType.OcrTranslate),
					},
				],
				shortcutFn: AppFunction.Translation,
				accent: "#5b8cff",
			},
			{
				key: "ai",
				icon: <RobotOutlined />,
				title: "大模型",
				desc: "翻译 / AI 处理统一后端，集中配置",
				primary: { label: "大模型设置", onClick: () => openAiSettings() },
				accent: "#c084fc",
			},
			{
				key: "clipboard",
				icon: <SnippetsOutlined />,
				title: "剪贴板",
				desc: "历史侧栏，点选即可粘回当前应用",
				primary: { label: "打开侧栏", onClick: () => toggleClipboardSidebar() },
				shortcutFn: AppFunction.ClipboardSidebar,
				accent: "#f0843f",
			},
		],
		[openAiSettings],
	);

	const cardBase: React.CSSProperties = {
		background: token.colorBgContainer,
		border: `1px solid ${token.colorBorderSecondary}`,
		borderRadius: token.borderRadiusLG,
	};

	return (
		<ContentWrap className="home-wrap">
			<CheckPermissions />

			<div className="zmeng-dash">
				{/* 顶部品牌 + 主题切换 */}
				<div className="dash-header">
					<div className="brand">
						<div
							className="brand-logo"
							style={{ background: token.colorPrimary }}
						>
							Z
						</div>
						<div>
							<Typography.Title level={3} style={{ margin: 0 }}>
								ZMENG
							</Typography.Title>
							<div
								className="brand-sub"
								style={{ color: token.colorTextSecondary }}
							>
								截图 · OCR · 翻译 · AI · 剪贴板，一体化效率工具
							</div>
						</div>
					</div>
					<div className="theme-pick">
						<span style={{ color: token.colorTextTertiary, fontSize: 12 }}>
							主题
						</span>
						<ThemeSwitcher />
					</div>
				</div>

				{/* 截图主入口（宽卡片） */}
				<div className="hero" style={cardBase}>
					<div className="hero-left">
						<div
							className="hero-icon"
							style={{
								background: token.colorPrimary,
								color: token.colorWhite,
							}}
						>
							<ScissorOutlined />
						</div>
						<div className="hero-text">
							<div className="hero-title">截图</div>
							<div
								className="hero-desc"
								style={{ color: token.colorTextSecondary }}
							>
								区域 / 窗口 / 全屏截图，标注后保存、复制或固定到屏幕
							</div>
						</div>
					</div>
					<div className="hero-actions">
						<Button
							type="primary"
							size="large"
							icon={<CameraOutlined />}
							onClick={() => executeScreenshot(ScreenshotType.Default)}
						>
							开始截图
						</Button>
						<Button
							icon={<PushpinOutlined />}
							onClick={() => executeScreenshot(ScreenshotType.Fixed)}
						>
							固定到屏幕
						</Button>
						<Button
							icon={<ExpandOutlined />}
							onClick={() => executeScreenshot(ScreenshotType.CaptureFullScreen)}
						>
							全屏
						</Button>
						{shortcutOf(AppFunction.Screenshot) && (
							<span className="kbd">{shortcutOf(AppFunction.Screenshot)}</span>
						)}
					</div>
				</div>

				{/* 其余 4 个功能（2x2 栅格） */}
				<div className="feature-grid">
					{features.map((f) => {
						const sc = shortcutOf(f.shortcutFn);
						return (
							<div key={f.key} className="feature-card" style={cardBase}>
								<div className="feature-top">
									<div
										className="feature-icon"
										style={{ background: f.accent }}
									>
										{f.icon}
									</div>
									{sc && <span className="kbd">{sc}</span>}
								</div>
								<div className="feature-title">{f.title}</div>
								<div
									className="feature-desc"
									style={{ color: token.colorTextSecondary }}
								>
									{f.desc}
								</div>
								<div className="feature-actions">
									<Button type="primary" onClick={f.primary.onClick}>
										{f.primary.label}
									</Button>
									{f.secondary?.map((s) => (
										<Button key={s.label} onClick={s.onClick}>
											{s.label}
										</Button>
									))}
								</div>
							</div>
						);
					})}
				</div>

				<div className="dash-tip" style={{ color: token.colorTextTertiary }}>
					快捷键可在「设置 · 快捷键」中自定义；更多功能见左侧菜单。
				</div>
			</div>

			<style jsx>{`
				.zmeng-dash {
					display: flex;
					flex-direction: column;
					gap: ${token.marginLG}px;
					padding: ${token.margin}px 0;
				}
				.dash-header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 16px;
					flex-wrap: wrap;
				}
				.brand {
					display: flex;
					align-items: center;
					gap: 14px;
				}
				.brand-logo {
					width: 48px;
					height: 48px;
					border-radius: 12px;
					color: #fff;
					font-weight: 800;
					font-size: 24px;
					display: flex;
					align-items: center;
					justify-content: center;
				}
				.brand-sub {
					font-size: 13px;
					margin-top: 2px;
				}
				.theme-pick {
					display: flex;
					align-items: center;
					gap: 10px;
				}
				.hero {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 20px;
					padding: 20px 24px;
					flex-wrap: wrap;
					transition: border-color 0.2s ease, box-shadow 0.2s ease;
				}
				.hero:hover {
					border-color: ${token.colorPrimary} !important;
				}
				.hero-left {
					display: flex;
					align-items: center;
					gap: 16px;
				}
				.hero-icon {
					width: 56px;
					height: 56px;
					border-radius: 14px;
					font-size: 26px;
					display: flex;
					align-items: center;
					justify-content: center;
				}
				.hero-title {
					font-size: 20px;
					font-weight: 700;
				}
				.hero-desc {
					font-size: 13px;
					margin-top: 4px;
					max-width: 420px;
				}
				.hero-actions {
					display: flex;
					align-items: center;
					gap: 10px;
					flex-wrap: wrap;
				}
				.feature-grid {
					display: grid;
					grid-template-columns: repeat(2, minmax(0, 1fr));
					gap: ${token.marginLG}px;
				}
				.feature-card {
					padding: 18px 20px;
					display: flex;
					flex-direction: column;
					gap: 8px;
					transition: border-color 0.2s ease, transform 0.2s ease;
				}
				.feature-card:hover {
					transform: translateY(-2px);
				}
				.feature-top {
					display: flex;
					align-items: center;
					justify-content: space-between;
				}
				.feature-icon {
					width: 40px;
					height: 40px;
					border-radius: 11px;
					color: #fff;
					font-size: 19px;
					display: flex;
					align-items: center;
					justify-content: center;
				}
				.feature-title {
					font-size: 16px;
					font-weight: 600;
					margin-top: 4px;
				}
				.feature-desc {
					font-size: 13px;
					line-height: 1.5;
					min-height: 38px;
				}
				.feature-actions {
					display: flex;
					gap: 8px;
					margin-top: 6px;
					flex-wrap: wrap;
				}
				.kbd {
					font-size: 12px;
					padding: 2px 8px;
					border-radius: 6px;
					background: ${token.colorFillTertiary};
					color: ${token.colorTextSecondary};
					border: 1px solid ${token.colorBorderSecondary};
					font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				}
				.dash-tip {
					font-size: 12px;
					text-align: center;
				}
				@media (max-width: 720px) {
					.feature-grid {
						grid-template-columns: minmax(0, 1fr);
					}
				}
			`}</style>
		</ContentWrap>
	);
};
