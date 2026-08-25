import { Button, Flex, theme } from "antd";
import React, { useCallback, useContext, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { DrawStatePublisher } from "@/components/drawCore/extra";
import {
	ZmengFilterFreeDrawIcon,
	ZmengFilterIcon,
} from "@/components/zmengIcons";
import {
	AppSettingsActionContext,
	AppSettingsPublisher,
} from "@/contexts/appSettingsActionContext";
import { useStateSubscriber } from "@/hooks/useStateSubscriber";
import { ToolbarPopover } from "@/pages/draw/components/drawToolbar/components/toolbarPopover";
import { type AppSettingsData, AppSettingsGroup } from "@/types/appSettings";
import { DrawToolbarKeyEventKey } from "@/types/components/drawToolbar";
import { DrawState } from "@/types/draw";
import { getButtonTypeByState } from "../../../extra";
import { ToolButton } from "../../toolButton";
import { ToolbarTooltip } from "../../toolbarTooltip";

const BlurGroupToolCore: React.FC<{
	customToolbarToolHiddenMap: Partial<Record<DrawState, boolean>> | undefined;
	onToolClickAction: (tool: DrawState) => void;
	disable: boolean;
}> = ({ customToolbarToolHiddenMap, onToolClickAction, disable }) => {
	const intl = useIntl();
	const { token } = theme.useToken();

	const { updateAppSettings } = useContext(AppSettingsActionContext);

	const [lastBlurTool, setLastBlurTool] = useState<DrawState>(DrawState.Blur);
	useStateSubscriber(
		AppSettingsPublisher,
		useCallback((settings: AppSettingsData) => {
			setLastBlurTool(settings[AppSettingsGroup.Cache].lastFilterTool);
		}, []),
	);
	const [drawState, setDrawState] = useState(DrawState.Idle);
	useStateSubscriber(
		DrawStatePublisher,
		useCallback((state: DrawState) => {
			setDrawState(state);
		}, []),
	);

	const updateLastBlurTool = useCallback(
		(value: DrawState) => {
			updateAppSettings(
				AppSettingsGroup.Cache,
				{ lastFilterTool: value },
				true,
				true,
				false,
				true,
				false,
			);
		},
		[updateAppSettings],
	);

	const blurButton = useMemo(() => {
		return (
			<ToolButton
				hidden={customToolbarToolHiddenMap?.[DrawState.Blur]}
				componentKey={DrawToolbarKeyEventKey.BlurTool}
				icon={<ZmengFilterIcon />}
				drawState={DrawState.Blur}
				disable={disable}
				key="blur"
				onClick={() => {
					onToolClickAction(DrawState.Blur);
					updateLastBlurTool(DrawState.Blur);
				}}
			/>
		);
	}, [
		disable,
		customToolbarToolHiddenMap,
		onToolClickAction,
		updateLastBlurTool,
	]);

	const blurFreeDrawButton = useMemo(() => {
		const title = intl.formatMessage({ id: "draw.blurFreeDrawTool" });
		return (
			<ToolbarTooltip title={title} key="blurFreeDraw">
				<Button
					icon={<ZmengFilterFreeDrawIcon style={{ fontSize: "1em" }} />}
					aria-label={title}
					type={getButtonTypeByState(drawState === DrawState.BlurFreeDraw)}
					onClick={() => {
						onToolClickAction(DrawState.BlurFreeDraw);
						updateLastBlurTool(DrawState.BlurFreeDraw);
					}}
					disabled={disable}
				/>
			</ToolbarTooltip>
		);
	}, [disable, drawState, intl, onToolClickAction, updateLastBlurTool]);

	let mainToolbarButton: React.ReactNode = customToolbarToolHiddenMap?.[
		DrawState.Blur
	]
		? blurFreeDrawButton
		: blurButton;
	if (
		lastBlurTool === DrawState.Blur &&
		!customToolbarToolHiddenMap?.[DrawState.Blur]
	) {
		mainToolbarButton = blurButton;
	} else if (
		lastBlurTool === DrawState.BlurFreeDraw &&
		!customToolbarToolHiddenMap?.[DrawState.BlurFreeDraw]
	) {
		mainToolbarButton = blurFreeDrawButton;
	}

	if (
		customToolbarToolHiddenMap?.[DrawState.Blur] &&
		customToolbarToolHiddenMap?.[DrawState.BlurFreeDraw]
	) {
		mainToolbarButton = null;
	}

	return (
		<ToolbarPopover
			trigger={
				!customToolbarToolHiddenMap?.[DrawState.Blur] &&
				!customToolbarToolHiddenMap?.[DrawState.BlurFreeDraw]
					? "hover"
					: []
			}
			content={
				<Flex align="center" gap={token.paddingXS} className="popover-toolbar">
					{blurButton}
					{!customToolbarToolHiddenMap?.[DrawState.BlurFreeDraw] &&
						blurFreeDrawButton}
				</Flex>
			}
		>
			<div>{mainToolbarButton}</div>
		</ToolbarPopover>
	);
};

export const BlurGroupTool = React.memo(BlurGroupToolCore);
