import { Tooltip } from "antd";
import type React from "react";
import { useCallback, useContext, useState } from "react";
import { THEME_PRESET_LIST } from "@/constants/themePresets";
import { AppSettingsActionContext } from "@/contexts/appSettingsActionContext";
import { useAppSettingsLoad } from "@/hooks/useAppSettingsLoad";
import {
	type AppSettingsData,
	AppSettingsGroup,
	type AppSettingsThemePreset,
} from "@/types/appSettings";

/** 5 套主题预设的快捷切换器（首页 / 设置共用） */
export const ThemeSwitcher: React.FC<{ size?: number }> = ({ size = 22 }) => {
	const { updateAppSettings } = useContext(AppSettingsActionContext);
	const [current, setCurrent] = useState<AppSettingsThemePreset>();

	useAppSettingsLoad(
		useCallback((settings: AppSettingsData) => {
			setCurrent(settings[AppSettingsGroup.Common].themePreset);
		}, []),
		true,
	);

	const select = useCallback(
		(preset: AppSettingsThemePreset) => {
			setCurrent(preset);
			updateAppSettings(
				AppSettingsGroup.Common,
				{ themePreset: preset },
				true,
				true,
				true,
				false,
				false,
			);
		},
		[updateAppSettings],
	);

	return (
		<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
			{THEME_PRESET_LIST.map((p) => {
				const active = current === p.key;
				return (
					<Tooltip key={p.key} title={p.label}>
						<button
							type="button"
							aria-label={p.label}
							aria-pressed={active}
							onClick={() => select(p.key)}
							style={{
								width: size,
								height: size,
								borderRadius: "50%",
								background: p.swatch,
								cursor: "pointer",
								padding: 0,
								border: active
									? "2px solid #fff"
									: "2px solid rgba(127,127,127,0.25)",
								boxShadow: active
									? "0 0 0 2px var(--zmeng-primary, #0ea5e9)"
									: "0 0 0 1px rgba(0,0,0,0.08)",
								transform: active ? "scale(1.08)" : "scale(1)",
								transition: "transform 0.15s ease, box-shadow 0.15s ease",
							}}
						/>
					</Tooltip>
				);
			})}
		</div>
	);
};
