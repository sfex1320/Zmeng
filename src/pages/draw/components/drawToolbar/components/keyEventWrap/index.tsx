import { Tooltip } from "antd";
import React, {
	type JSX,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { HotkeyCallback } from "react-hotkeys-hook";
import { useIntl } from "react-intl";
import { defaultDrawToolbarKeyEventComponentConfig } from "@/constants/drawToolbarKeyEvent";
import { AntdContext } from "@/contexts/antdContext";
import { DrawToolbarContext } from "@/pages/draw/components/drawToolbar/extra";
import { useAppSettingsLoad } from "@/hooks/useAppSettingsLoad";
import { useHotkeysApp } from "@/hooks/useHotkeysApp";
import { useStateSubscriber } from "@/hooks/useStateSubscriber";
import { type AppSettingsData, AppSettingsGroup } from "@/types/appSettings";
import type {
	DrawToolbarKeyEventKey,
	DrawToolbarKeyEventValue,
} from "@/types/components/drawToolbar";
import { HotkeysScope } from "@/types/core/appHotKeys";
import { formatKey } from "@/utils/format";
import { EnableKeyEventPublisher } from "./extra";

const KeyEventHandleCore: React.FC<{
	keyEventValue: DrawToolbarKeyEventValue | undefined;
	onKeyDownChildren: HotkeyCallback;
	onKeyUpChildren: HotkeyCallback;
	componentKey: DrawToolbarKeyEventKey;
	children: JSX.Element;
	hotkeyScope?: HotkeysScope;
}> = ({
	keyEventValue,
	onKeyDownChildren,
	onKeyUpChildren,
	componentKey,
	children,
	hotkeyScope,
}) => {
	const intl = useIntl();
	useHotkeysApp(
		keyEventValue?.hotKey ?? "",
		onKeyDownChildren,
		useMemo(
			() => ({
				keydown: true,
				keyup: false,
				scopes: hotkeyScope ?? HotkeysScope.DrawTool,
			}),
			[hotkeyScope],
		),
	);
	useHotkeysApp(
		keyEventValue?.hotKey ?? "",
		onKeyUpChildren,
		useMemo(
			() => ({
				keydown: false,
				keyup: true,
				scopes: hotkeyScope ?? HotkeysScope.DrawTool,
			}),
			[hotkeyScope],
		),
	);

	const buttonTitle = useMemo(() => {
		return intl.formatMessage(
			{
				id: "draw.keyEventTooltip",
			},
			{
				message: intl.formatMessage({
					id: defaultDrawToolbarKeyEventComponentConfig[componentKey].messageId,
				}),
				key: formatKey(keyEventValue?.hotKey),
			},
		);
	}, [componentKey, intl, keyEventValue?.hotKey]);

	// 多屏修复：提示挂到无 transform 的外层容器。此前挂 .draw-toolbar（带拖拽
	// transform + 缩放），antd 对 transform 祖先的定位计算会偏移到另一块屏幕
	const { drawToolbarRef, popupContainerRef } = useContext(DrawToolbarContext);
	// 挂 fixed 专用容器：无 transform（定位准）且 pointer-events 可交互（可悬停）
	const getPopupContainer = useCallback(
		() => popupContainerRef.current ?? drawToolbarRef.current ?? document.body,
		[popupContainerRef, drawToolbarRef],
	);

	return (
		<Tooltip title={buttonTitle} getPopupContainer={getPopupContainer}>
			{children}
		</Tooltip>
	);
};

const KeyEventHandle = React.memo(KeyEventHandleCore);

const KeyEventWrapCore: React.FC<{
	onKeyDownEventPropName?: string;
	onKeyUpEventPropName?: string;
	onKeyDown?: () => void;
	onKeyUp?: () => void;
	children: JSX.Element;
	componentKey: DrawToolbarKeyEventKey;
	confirmTip?: React.ReactNode;
	enable?: boolean;
	hotkeyScope?: HotkeysScope;
}> = ({
	onKeyDownEventPropName,
	onKeyUpEventPropName,
	onKeyDown,
	onKeyUp,
	children,
	componentKey,
	confirmTip,
	enable,
	hotkeyScope,
}) => {
	const enableRef = useRef<boolean | undefined>(enable);
	useEffect(() => {
		enableRef.current = enable;
	}, [enable]);

	const { modal, isConfirmingRef } = useContext(AntdContext);

	const [keyEventValue, setKeyEventValue] = useState<
		DrawToolbarKeyEventValue | undefined
	>(undefined);
	const [getEnableKeyEvent] = useStateSubscriber(
		EnableKeyEventPublisher,
		undefined,
	);
	const isEnable = useCallback(() => {
		if (enableRef.current !== undefined) {
			return enableRef.current;
		}

		if (isConfirmingRef.current) {
			return false;
		}

		return getEnableKeyEvent();
	}, [getEnableKeyEvent, isConfirmingRef]);
	useAppSettingsLoad(
		useCallback(
			(appSettings: AppSettingsData) => {
				setKeyEventValue(
					appSettings[AppSettingsGroup.DrawToolbarKeyEvent][componentKey] ??
						defaultDrawToolbarKeyEventComponentConfig[componentKey],
				);
			},
			[componentKey],
		),
		true,
	);

	const keyEvent = useCallback(
		async (
			element: JSX.Element,
			eventName: string | undefined,
			event: (() => void) | undefined,
		) => {
			let tempEvent: (() => void) | undefined;
			if (event) {
				tempEvent = event;
			}

			if (eventName && typeof element.props[eventName] === "function") {
				tempEvent = element.props[eventName];
			}

			if (!tempEvent) {
				return;
			}

			if (confirmTip) {
				const confirmResult = await modal.confirmWithStatus({
					content: confirmTip,
					centered: true,
				});

				if (!confirmResult) {
					return;
				}
			}

			return tempEvent();
		},
		[confirmTip, modal],
	);
	const onKeyDownChildren = useCallback(
		(keyboardEvent: KeyboardEvent) => {
			if (!isEnable()) {
				return;
			}

			keyboardEvent.preventDefault();

			keyEvent(children, onKeyDownEventPropName, onKeyDown);
		},
		[children, isEnable, keyEvent, onKeyDown, onKeyDownEventPropName],
	);
	const onKeyUpChildren = useCallback(
		(keyboardEvent: KeyboardEvent) => {
			if (!isEnable()) {
				return;
			}

			keyboardEvent.preventDefault();

			keyEvent(children, onKeyUpEventPropName, onKeyUp);
		},
		[children, isEnable, keyEvent, onKeyUp, onKeyUpEventPropName],
	);

	return (
		<KeyEventHandle
			keyEventValue={keyEventValue}
			onKeyDownChildren={onKeyDownChildren}
			onKeyUpChildren={onKeyUpChildren}
			componentKey={componentKey}
			hotkeyScope={hotkeyScope}
		>
			{children}
		</KeyEventHandle>
	);
};

export const KeyEventWrap = React.memo(KeyEventWrapCore);
