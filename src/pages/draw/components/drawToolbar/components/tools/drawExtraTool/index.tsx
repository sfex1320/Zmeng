"use client";

import { Button, Flex, theme } from "antd";
import { useCallback, useContext, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { DrawStatePublisher } from "@/components/drawCore/extra";
import {
	ZmengHighlightIcon,
	ZmengWatermarkIcon,
} from "@/components/zmengIcons";
import {
	AppSettingsActionContext,
	AppSettingsPublisher,
} from "@/contexts/appSettingsActionContext";
import { useStateSubscriber } from "@/hooks/useStateSubscriber";
import { ToolbarPopover } from "@/pages/draw/components/drawToolbar/components/toolbarPopover";
import { type AppSettingsData, AppSettingsGroup } from "@/types/appSettings";
import { DrawState } from "@/types/draw";
import { getButtonTypeByState } from "../../../extra";
import { ToolbarTooltip } from "../../toolbarTooltip";
import { WatermarkTool } from "./components/watermarkTool";

export const DrawExtraTool: React.FC<{
	customToolbarToolHiddenMap: Partial<Record<DrawState, boolean>> | undefined;
	onToolClickAction: (tool: DrawState) => void;
	disable: boolean;
}> = ({ customToolbarToolHiddenMap, onToolClickAction, disable }) => {
	const intl = useIntl();
	const { token } = theme.useToken();

	const { updateAppSettings } = useContext(AppSettingsActionContext);

	const [lastDrawExtraTool, setLastDrawExtraTool] = useState<DrawState>(
		DrawState.Watermark,
	);
	useStateSubscriber(
		AppSettingsPublisher,
		useCallback((settings: AppSettingsData) => {
			setLastDrawExtraTool(settings[AppSettingsGroup.Cache].lastDrawExtraTool);
		}, []),
	);
	const [drawState, setDrawState] = useState(DrawState.Idle);
	useStateSubscriber(
		DrawStatePublisher,
		useCallback((state: DrawState) => {
			setDrawState(state);
		}, []),
	);

	const updateLastDrawExtraTool = useCallback(
		(value: DrawState) => {
			updateAppSettings(
				AppSettingsGroup.Cache,
				{ lastDrawExtraTool: value },
				true,
				true,
				false,
				true,
				false,
			);
		},
		[updateAppSettings],
	);

	const watermarkButton = useMemo(() => {
		const title = intl.formatMessage({ id: "draw.watermarkTool" });
		return (
			<ToolbarTooltip title={title} key="watermark">
				<Button
					icon={<ZmengWatermarkIcon />}
					aria-label={title}
					type={getButtonTypeByState(drawState === DrawState.Watermark)}
					onClick={() => {
						onToolClickAction(DrawState.Watermark);
						updateLastDrawExtraTool(DrawState.Watermark);
					}}
					disabled={disable}
				/>
			</ToolbarTooltip>
		);
	}, [disable, drawState, intl, onToolClickAction, updateLastDrawExtraTool]);

	const highlightButton = useMemo(() => {
		const title = intl.formatMessage({ id: "draw.highlightTool" });
		return (
			<ToolbarTooltip title={title} key="highlight">
				<Button
					icon={<ZmengHighlightIcon />}
					aria-label={title}
					type={getButtonTypeByState(drawState === DrawState.Highlight)}
					onClick={() => {
						onToolClickAction(DrawState.Highlight);
						updateLastDrawExtraTool(DrawState.Highlight);
					}}
					disabled={disable}
				/>
			</ToolbarTooltip>
		);
	}, [disable, drawState, intl, onToolClickAction, updateLastDrawExtraTool]);

	let mainToolbarButton = customToolbarToolHiddenMap?.[DrawState.Watermark]
		? highlightButton
		: watermarkButton;
	if (
		lastDrawExtraTool === DrawState.Watermark &&
		!customToolbarToolHiddenMap?.[DrawState.Watermark]
	) {
		mainToolbarButton = watermarkButton;
	} else if (
		lastDrawExtraTool === DrawState.Highlight &&
		!customToolbarToolHiddenMap?.[DrawState.Highlight]
	) {
		mainToolbarButton = highlightButton;
	}

	if (
		customToolbarToolHiddenMap?.[DrawState.Watermark] &&
		customToolbarToolHiddenMap?.[DrawState.Highlight]
	) {
		return null;
	}

	return (
		<>
			<ToolbarPopover
				trigger={
					!customToolbarToolHiddenMap?.[DrawState.Watermark] &&
					!customToolbarToolHiddenMap?.[DrawState.Highlight]
						? "hover"
						: []
				}
				content={
					<Flex
						align="center"
						gap={token.paddingXS}
						className="popover-toolbar"
					>
						{!customToolbarToolHiddenMap?.[DrawState.Watermark] &&
							watermarkButton}
						{!customToolbarToolHiddenMap?.[DrawState.Highlight] &&
							highlightButton}
					</Flex>
				}
			>
				<div>{mainToolbarButton}</div>
			</ToolbarPopover>

			<WatermarkTool />
		</>
	);
};
