import type { ThemeConfig } from "antd";
import { AppSettingsThemePreset } from "@/types/appSettings";

/** 供自定义样式组件使用的 CSS 变量（注入到 :root） */
export type ThemeCssVars = {
	/** 应用背景 */
	bg: string;
	/** 卡片/容器表面 */
	surface: string;
	/** 表面悬停 */
	surfaceHover: string;
	/** 浮层（抽屉/弹窗） */
	elevated: string;
	/** 主文字 */
	text: string;
	/** 次要文字 */
	textSecondary: string;
	/** 边框 */
	border: string;
	/** 主色 */
	primary: string;
	/** 主色柔光（hover 背景等） */
	primarySoft: string;
};

export type ThemePresetDef = {
	key: AppSettingsThemePreset;
	/** 中文显示名 */
	label: string;
	/** 切换器代表色 */
	swatch: string;
	/** 是否暗色基底（驱动 antd darkAlgorithm 与旧的 dark 判断） */
	isDark: boolean;
	/** antd 主题 token 覆盖 */
	token: NonNullable<ThemeConfig["token"]>;
	cssVars: ThemeCssVars;
};

export const THEME_PRESETS: Record<AppSettingsThemePreset, ThemePresetDef> = {
	[AppSettingsThemePreset.SkyBlue]: {
		key: AppSettingsThemePreset.SkyBlue,
		label: "天蓝",
		swatch: "#0ea5e9",
		isDark: false,
		token: {
			colorPrimary: "#0ea5e9",
			colorInfo: "#0ea5e9",
			colorBgLayout: "#e8f3ff",
			colorBgContainer: "#ffffff",
			colorBgElevated: "#ffffff",
			colorBorderSecondary: "#dbeafe",
			colorText: "#0f2a43",
			colorTextSecondary: "#4a6685",
		},
		cssVars: {
			bg: "#e8f3ff",
			surface: "#ffffff",
			surfaceHover: "#eff7ff",
			elevated: "#ffffff",
			text: "#0f2a43",
			textSecondary: "#4a6685",
			border: "#d4e6fa",
			primary: "#0ea5e9",
			primarySoft: "rgba(14,165,233,0.10)",
		},
	},
	[AppSettingsThemePreset.White]: {
		key: AppSettingsThemePreset.White,
		label: "白色",
		swatch: "#1677ff",
		isDark: false,
		token: {
			colorPrimary: "#1677ff",
			colorInfo: "#1677ff",
			colorBgLayout: "#f4f6fa",
			colorBgContainer: "#ffffff",
			colorBgElevated: "#ffffff",
			colorBorderSecondary: "#eef0f4",
			colorText: "#1f2328",
			colorTextSecondary: "#5b6470",
		},
		cssVars: {
			bg: "#f4f6fa",
			surface: "#ffffff",
			surfaceHover: "#f3f6fb",
			elevated: "#ffffff",
			text: "#1f2328",
			textSecondary: "#5b6470",
			border: "#e6e9ef",
			primary: "#1677ff",
			primarySoft: "rgba(22,119,255,0.08)",
		},
	},
	[AppSettingsThemePreset.Warm]: {
		key: AppSettingsThemePreset.Warm,
		label: "暖色",
		swatch: "#f97316",
		isDark: false,
		token: {
			colorPrimary: "#f97316",
			colorInfo: "#f97316",
			colorBgLayout: "#fdf3e8",
			colorBgContainer: "#fffaf4",
			colorBgElevated: "#fffaf4",
			colorBorderSecondary: "#f3e3d2",
			colorText: "#3a2a1d",
			colorTextSecondary: "#8a7565",
		},
		cssVars: {
			bg: "#fdf3e8",
			surface: "#fffaf4",
			surfaceHover: "#fdf0e2",
			elevated: "#fffaf4",
			text: "#3a2a1d",
			textSecondary: "#8a7565",
			border: "#efdcc8",
			primary: "#f97316",
			primarySoft: "rgba(249,115,22,0.10)",
		},
	},
	[AppSettingsThemePreset.Cool]: {
		key: AppSettingsThemePreset.Cool,
		label: "冷色",
		swatch: "#0891b2",
		isDark: false,
		token: {
			colorPrimary: "#0891b2",
			colorInfo: "#0891b2",
			colorBgLayout: "#eaf1f3",
			colorBgContainer: "#ffffff",
			colorBgElevated: "#ffffff",
			colorBorderSecondary: "#dbe7ea",
			colorText: "#16282f",
			colorTextSecondary: "#4c626c",
		},
		cssVars: {
			bg: "#eaf1f3",
			surface: "#ffffff",
			surfaceHover: "#eef5f6",
			elevated: "#ffffff",
			text: "#16282f",
			textSecondary: "#4c626c",
			border: "#d4e2e6",
			primary: "#0891b2",
			primarySoft: "rgba(8,145,178,0.10)",
		},
	},
	[AppSettingsThemePreset.Black]: {
		key: AppSettingsThemePreset.Black,
		label: "黑色",
		swatch: "#4c8dff",
		isDark: true,
		token: {
			colorPrimary: "#4c8dff",
			colorInfo: "#4c8dff",
			colorBgLayout: "#0d0f14",
			colorBgContainer: "#161a22",
			colorBgElevated: "#1e242e",
			colorBorderSecondary: "rgba(255,255,255,0.08)",
			colorText: "#e6e9ef",
			colorTextSecondary: "#9aa4b2",
		},
		cssVars: {
			bg: "#0d0f14",
			surface: "#161a22",
			surfaceHover: "#1d2330",
			elevated: "#1e242e",
			text: "#e6e9ef",
			textSecondary: "#9aa4b2",
			border: "rgba(255,255,255,0.09)",
			primary: "#4c8dff",
			primarySoft: "rgba(76,141,255,0.16)",
		},
	},
};

/** 切换器展示顺序 */
export const THEME_PRESET_LIST: ThemePresetDef[] = [
	THEME_PRESETS[AppSettingsThemePreset.SkyBlue],
	THEME_PRESETS[AppSettingsThemePreset.White],
	THEME_PRESETS[AppSettingsThemePreset.Warm],
	THEME_PRESETS[AppSettingsThemePreset.Cool],
	THEME_PRESETS[AppSettingsThemePreset.Black],
];

export function getThemePreset(
	preset: AppSettingsThemePreset | undefined,
): ThemePresetDef {
	return (
		(preset && THEME_PRESETS[preset]) ||
		THEME_PRESETS[AppSettingsThemePreset.SkyBlue]
	);
}

/** 生成注入到 :root 的 CSS 变量文本 */
export function themeCssVarsText(vars: ThemeCssVars): string {
	return `:root{
  --zmeng-bg:${vars.bg};
  --zmeng-surface:${vars.surface};
  --zmeng-surface-hover:${vars.surfaceHover};
  --zmeng-elevated:${vars.elevated};
  --zmeng-text:${vars.text};
  --zmeng-text-secondary:${vars.textSecondary};
  --zmeng-border:${vars.border};
  --zmeng-primary:${vars.primary};
  --zmeng-primary-soft:${vars.primarySoft};
}`;
}
