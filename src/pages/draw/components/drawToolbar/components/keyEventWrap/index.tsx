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


/**
 * 自研 Tooltip：纯 CSS 绝对定位，不经过 antd/rc-trigger 的视口坐标计算。
 *
 * 背景：antd Tooltip 在跨双屏大视口（如 7680×2160）中，
 * 无论怎么设置 getPopupContainer，rc-trigger 的定位计算都会偏移一整屏。
 * 改用 position:absolute + bottom + left:50% + translateX(-50%)，
 * 定位完全相对于按钮自身，物理上不可能跨屏。
 *
 * 风格：深色毛玻璃、圆角、居中文本、350ms 延迟。
 */
const ZmengTooltip: React.FC<{
	title: string;
	children: JSX.Element;
}> = ({ title, children }) => {
	const [visible, setVisible] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const wrapRef = useRef<HTMLSpanElement | null>(null);
	const [align, setAlign] = useState<"center" | "left" | "right">("center");

	const handleMouseEnter = useCallback(() => {
		timerRef.current = setTimeout(() => setVisible(true), 350);
	}, []);

	const handleMouseLeave = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		setVisible(false);
	}, []);

	useEffect(() => {
		if (!visible || !wrapRef.current) return;
		const rect = wrapRef.current.getBoundingClientRect();
		const margin = 110;
		if (rect.left < margin) {
			setAlign("left");
		} else if (rect.right + margin > window.innerWidth) {
			setAlign("right");
		} else {
			setAlign("center");
		}
	}, [visible]);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const tooltipStyle: React.CSSProperties = useMemo(() => {
		const base: React.CSSProperties = {
			position: "absolute",
			bottom: "calc(100% + 6px)",
			background: "rgba(30,30,30,0.88)",
			backdropFilter: "blur(8px)",
			WebkitBackdropFilter: "blur(8px)",
			border: "1px solid rgba(255,255,255,0.12)",
			borderRadius: 6,
			padding: "3px 10px",
			fontSize: 12,
			lineHeight: "20px",
			color: "rgba(255,255,255,0.92)",
			whiteSpace: "nowrap",
			zIndex: 10000,
			pointerEvents: "none",
			textAlign: "center",
			boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
			fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
		};
		switch (align) {
			case "left":
				return { ...base, left: 0 };
			case "right":
				return { ...base, right: 0 };
			default:
				return { ...base, left: "50%", transform: "translateX(-50%)" };
		}
	}, [align]);

	return (
		<span
			ref={wrapRef}
			style={{ position: "relative", display: "inline-flex" }}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{children}
			{visible && <span style={tooltipStyle}>{title}</span>}
		</span>
	);
};

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

	return <ZmengTooltip title={buttonTitle}>{children}</ZmengTooltip>;
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
