import {
	ApiOutlined,
	AppstoreOutlined,
	InfoCircleOutlined,
	RobotOutlined,
	ScanOutlined,
	ScissorOutlined,
	SettingOutlined,
	SnippetsOutlined,
	ThunderboltOutlined,
	TranslationOutlined,
	VideoCameraOutlined,
} from "@ant-design/icons";
import { listen } from "@tauri-apps/api/event";
import { useLocation, useRouter } from "@tanstack/react-router";
import { Layout, theme } from "antd";
import React, { useCallback, useContext, useEffect, useMemo } from "react";
import { CheckEnvironment } from "@/components/checkEnvironment";
import { CheckVersion } from "@/components/checkVersion";
import { GlobalEventHandler } from "@/components/globalEventHandler";
import { GlobalShortcut } from "@/components/globalShortcut";
import { InitService } from "@/components/initService";
import {
	TrayIconLoader,
	TrayIconStatePublisher,
} from "@/components/trayIconLoader";
import { AppContext } from "@/contexts/appContext";
import { AppSettingsActionContext } from "@/contexts/appSettingsActionContext";
import { useAppSettingsLoad } from "@/hooks/useAppSettingsLoad";
import { withStatePublisher } from "@/hooks/useStatePublisher";
import { en } from "@/messages/en";
import { zhHans } from "@/messages/zhHans";
import { zhHant } from "@/messages/zhHant";
import {
	AppSettingsGroup,
	AppSettingsLanguage,
	AppSettingsTheme,
} from "@/types/appSettings";
import type { RouteMapItem } from "@/types/components/menuLayout";
import { MenuContent } from "./components/menuContent";
import {
	MenuSider,
	type SidebarNavGroup,
} from "./components/menuSider";

const NAV_GROUPS: SidebarNavGroup[] = [
	{
		items: [
			{
				key: "/",
				path: "/",
				label: "首页",
				desc: "功能总览",
				icon: <AppstoreOutlined />,
			},
		],
	},
	{
		label: "设置",
		items: [
			{
				key: "/settings/general",
				path: "/settings/general",
				label: "通用",
				desc: "主题 · 语言 · 启动",
				icon: <SettingOutlined />,
			},
			{
				key: "/settings/screenshot",
				path: "/settings/screenshot",
				label: "截图",
				desc: "保存 · 复制 · 显示",
				icon: <ScissorOutlined />,
			},
			{
				key: "/settings/video",
				path: "/settings/video",
				label: "视频录制",
				desc: "帧率 · 编码 · 保存路径",
				icon: <VideoCameraOutlined />,
			},
			{
				key: "/settings/ocr",
				path: "/settings/ocr",
				label: "文字识别",
				desc: "OCR 模型与行为",
				icon: <ScanOutlined />,
			},
			{
				key: "/settings/translation",
				path: "/settings/translation",
				label: "翻译",
				desc: "语言与排版",
				icon: <TranslationOutlined />,
			},
			{
				key: "/settings/ai",
				path: "/settings/ai",
				label: "AI 助手",
				desc: "模型后端与参数",
				icon: <RobotOutlined />,
			},
			{
				key: "/settings/clipboard",
				path: "/settings/clipboard",
				label: "剪贴板",
				desc: "侧栏 · 历史 · 翻译",
				icon: <SnippetsOutlined />,
			},
			{
				key: "/settings/shortcut",
				path: "/settings/shortcut",
				label: "快捷键",
				desc: "全局快捷键",
				icon: <ThunderboltOutlined />,
			},
		],
	},
	{
		label: "更多",
		items: [
			{
				key: "/personalization/plugins",
				path: "/personalization/plugins",
				label: "插件",
				desc: "OCR / 翻译 / AI 模型",
				icon: <ApiOutlined />,
			},
			{
				key: "/about",
				path: "/about",
				label: "关于",
				desc: "版本与信息",
				icon: <InfoCircleOutlined />,
			},
		],
	},
];

const MenuLayoutCore: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	useEffect(() => {
		if (process.env.NODE_ENV !== "development") {
			return;
		}

		const zhHansKeys = Object.keys(zhHans);
		const zhHantKeys = new Set(Object.keys(zhHant));
		const enKeys = new Set(Object.keys(en));

		const zhHantMissingKeys: Record<string, string> = {};
		zhHansKeys
			.filter((key) => !zhHantKeys.has(key))
			.forEach((key) => {
				zhHantMissingKeys[key] = zhHans[key as keyof typeof zhHans];
			});

		const enMissingKeys: Record<string, string> = {};
		zhHansKeys
			.filter((key) => !enKeys.has(key))
			.forEach((key) => {
				enMissingKeys[key] = zhHans[key as keyof typeof zhHans];
			});

		console.log("App zh-Hant missing messages: ", zhHantMissingKeys);
		console.log("App en missing messages: ", enMissingKeys);
	}, []);

	const appSettings = useContext(AppSettingsActionContext);
	const { currentTheme } = useContext(AppContext);
	const { updateAppSettings } = appSettings;

	const routerLocation = useLocation();
	const pathname = routerLocation.pathname || "/";
	useAppSettingsLoad(
		useCallback(
			(settings) => {
				// 获取浏览器语言，判断是否需要切换语言
				const settingBrowserLanguage =
					settings[AppSettingsGroup.Common].browserLanguage;
				const browserLanguage = navigator.language;
				if (settingBrowserLanguage !== browserLanguage) {
					// 切换语言
					let language = AppSettingsLanguage.EN;
					if (browserLanguage.startsWith("zh")) {
						if (browserLanguage.startsWith("zh-TW")) {
							language = AppSettingsLanguage.ZHHant;
						} else {
							language = AppSettingsLanguage.ZHHans;
						}
					}

					updateAppSettings(
						AppSettingsGroup.Common,
						{
							browserLanguage: browserLanguage,
							language,
						},
						false,
						true,
						true,
					);
				}
			},
			[updateAppSettings],
		),
	);

	const { token } = theme.useToken();
	const router = useRouter();
	const onNavigate = useCallback(
		(path: string) => {
			router.navigate({ to: path });
		},
		[router],
	);

	// 托盘「设置」入口：跳转到统一设置页
	useEffect(() => {
		const un = listen("zmeng://open-settings", () => {
			router.navigate({ to: "/settings/$cat", params: { cat: "general" } });
		});
		return () => {
			un.then((f) => f());
		};
	}, [router]);

	const routeTabsMap = useMemo(() => {
		const map: Record<string, RouteMapItem> = {};
		for (const group of NAV_GROUPS) {
			for (const item of group.items) {
				map[item.path] = { items: [], hideTabs: true };
			}
		}
		return map;
	}, []);

	return (
		<>
			<TrayIconLoader />
			<GlobalEventHandler />
			<CheckEnvironment />
			<CheckVersion />
			<div className="menu-layout-wrap">
				<Layout>
					<MenuSider
						navGroups={NAV_GROUPS}
						darkMode={currentTheme === AppSettingsTheme.Dark}
						pathname={pathname}
						onNavigate={onNavigate}
					/>
					<MenuContent pathname={pathname} routeTabsMap={routeTabsMap}>
						<GlobalShortcut>{children}</GlobalShortcut>
					</MenuContent>
				</Layout>
				<style jsx>{`
                    .menu-layout-wrap {
                        box-shadow: 0 0 12px 0 rgba(0, 0, 0, 0.21);
                        overflow: hidden;
                        height: 100%;
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        z-index: 1;
                    }

                    .menu-layout-wrap :global(.ant-layout) {
                        height: 100% !important;
                    }

                    .menu-layout-wrap > :global(.ant-layout) {
                        flex-direction: row !important;
                    }

                    .menu-layout-wrap :global(.ant-layout-sider-trigger) {
                        position: absolute !important;
                    }

                    .menu-layout-wrap :global(.ant-layout-sider) {
                        box-shadow: ${token.boxShadowSecondary};
                    }

                    .menu-layout-wrap :global(.ant-layout-header) {
                        height: 32px !important;
                        background: ${token.colorBgContainer};
                        display: flex;
                        align-items: center;
                        justify-content: flex-end;
                        padding: 0 ${token.padding}px;
                    }
                `}</style>
			</div>
		</>
	);
};

const ML = React.memo(
	withStatePublisher(MenuLayoutCore, TrayIconStatePublisher),
);

export const MenuLayout = ({ children }: { children: React.ReactNode }) => {
	return (
		<>
			<InitService />
			<ML>{children}</ML>
		</>
	);
};
