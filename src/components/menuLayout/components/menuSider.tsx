import { Layout, theme } from "antd";
import React, { useCallback, useContext, useEffect, useState } from "react";

const { Sider } = Layout;

import * as tauriOs from "@tauri-apps/plugin-os";
import RSC from "react-scrollbars-custom";
import { AppSettingsActionContext } from "@/contexts/appSettingsActionContext";
import { useAppSettingsLoad } from "@/hooks/useAppSettingsLoad";
import { type AppSettingsData, AppSettingsGroup } from "@/types/appSettings";

export type SidebarNavItem = {
	key: string;
	path: string;
	label: string;
	desc?: string;
	icon: React.ReactNode;
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

const MenuSiderCore: React.FC<{
	navGroups: SidebarNavGroup[];
	darkMode: boolean;
	pathname: string;
	onNavigate: (path: string) => void;
}> = ({ navGroups, darkMode, pathname, onNavigate }) => {
	const { token } = theme.useToken();
	const [collapsed, setCollapsed] = useState(false);
	useAppSettingsLoad(
		useCallback((settings: AppSettingsData) => {
			setCollapsed(settings[AppSettingsGroup.Cache].menuCollapsed);
		}, []),
	);
	const { updateAppSettings } = useContext(AppSettingsActionContext);

	useEffect(() => {
		if (process.env.NODE_ENV === "development") {
			return;
		}

		window.oncontextmenu = (e) => {
			e.preventDefault();
			e.stopPropagation();
		};

		return () => {
			window.oncontextmenu = null;
		};
	}, []);

	const [currentPlatform, setCurrentPlatform] = useState<
		tauriOs.Platform | undefined
	>(undefined);
	useEffect(() => {
		setCurrentPlatform(tauriOs.platform());
	}, []);

	const isActive = useCallback(
		(path: string) => {
			if (path === "/") {
				return pathname === "/";
			}
			return pathname === path || pathname.startsWith(`${path}/`);
		},
		[pathname],
	);

	return (
		<Sider
			theme={darkMode ? "dark" : "light"}
			width={222}
			collapsedWidth={74}
			collapsed={collapsed}
			collapsible
			onCollapse={(value) => {
				setCollapsed(value);
				updateAppSettings(
					AppSettingsGroup.Cache,
					{ menuCollapsed: value },
					true,
					true,
					false,
				);
			}}
		>
			<div className="menu-sider-wrap">
				{currentPlatform === "macos" && (
					<div className="macos-title-bar-margin app-tauri-drag-region"></div>
				)}

				{currentPlatform !== "macos" && (
					<div className="brand-wrap">
						<div className="brand-mark">Z</div>
						{!collapsed && <div className="brand-name">ZMENG</div>}
					</div>
				)}

				<RSC>
					<div className="rail">
						{navGroups.map((group, gi) => (
							<div className="rail-group" key={group.label ?? `g-${gi}`}>
								{!collapsed && group.label && (
									<div className="rail-group-label">{group.label}</div>
								)}
								{group.items.map((item) => {
									const active = isActive(item.path);
									return (
										<button
											type="button"
											key={item.key}
											title={collapsed ? item.label : undefined}
											className={`rail-item ${active ? "active" : ""} ${
												collapsed ? "collapsed" : ""
											}`}
											onClick={() => onNavigate(item.path)}
											style={{
												background: active ? token.colorPrimary : "transparent",
												color: active ? "#fff" : token.colorText,
											}}
										>
											<span className="rail-icon">{item.icon}</span>
											{!collapsed && (
												<span className="rail-text">
													<span className="rail-label">{item.label}</span>
													{item.desc && (
														<span
															className="rail-desc"
															style={{
																color: active
																	? "rgba(255,255,255,0.82)"
																	: token.colorTextTertiary,
															}}
														>
															{item.desc}
														</span>
													)}
												</span>
											)}
										</button>
									);
								})}
							</div>
						))}
					</div>
				</RSC>
			</div>
			<style jsx>{`
                .menu-sider-wrap {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }

                .menu-sider-wrap :global(.ScrollbarsCustom-Wrapper) {
                    inset: 0 0 0 0 !important;
                }

                .brand-wrap {
                    margin: 18px 14px 8px;
                    display: flex;
                    align-items: center;
                    justify-content: ${collapsed ? "center" : "flex-start"};
                    gap: 10px;
                    user-select: none;
                }

                .brand-mark {
                    width: 32px;
                    height: 32px;
                    flex: none;
                    border-radius: 9px;
                    background: ${token.colorPrimary};
                    color: #fff;
                    font-weight: 800;
                    font-size: 19px;
                    line-height: 32px;
                    text-align: center;
                    box-shadow: 0 2px 8px ${token.colorPrimary}40;
                }

                .brand-name {
                    font-size: 19px;
                    font-weight: 700;
                    letter-spacing: 2px;
                    color: ${darkMode ? "#fff" : token.colorTextHeading};
                }

                .macos-title-bar-margin {
                    width: 100%;
                    height: 32px;
                }

                .rail {
                    display: flex;
                    flex-direction: column;
                    padding: 6px 10px 16px;
                    gap: 2px;
                }

                .rail-group {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    margin-top: 12px;
                }

                .rail-group:first-child {
                    margin-top: 4px;
                }

                .rail-group-label {
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    color: ${token.colorTextTertiary};
                    padding: 6px 10px 4px;
                }

                .rail-item {
                    display: flex;
                    align-items: center;
                    gap: 11px;
                    width: 100%;
                    padding: 8px 10px;
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                    text-align: left;
                    transition: background 0.15s ease;
                }

                .rail-item.collapsed {
                    justify-content: center;
                    padding: 10px 0;
                }

                .rail-item:hover:not(.active) {
                    background: ${token.colorFillTertiary} !important;
                }

                .rail-icon {
                    font-size: 18px;
                    display: flex;
                    flex: none;
                }

                .rail-text {
                    display: flex;
                    flex-direction: column;
                    line-height: 1.25;
                    min-width: 0;
                }

                .rail-label {
                    font-size: 14px;
                    font-weight: 600;
                }

                .rail-desc {
                    font-size: 11px;
                    margin-top: 1px;
                }
            `}</style>
		</Sider>
	);
};

export const MenuSider = React.memo(MenuSiderCore);
