import ReactDOM from "react-dom";
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
 * 自研 Tooltip（v3 终极方案）：JS 计算像素坐标 + Portal 到 body + position: fixed。
 *
 * 此前尝试的方案均失败：
 * - antd Tooltip：rc-trigger 在跨屏大视口中定位偏移一整屏
 * - CSS absolute + 百分比：祖先 transform/scale 下仍不可靠
 *
 * 本方案：getBoundingClientRect() 获取按钮的视口坐标 →
 * JS 计算提示位置 → Portal 到 document.body → position: fixed。
 * 完全不依赖任何祖先的 CSS 属性，坐标来自浏览器实际渲染位置。
 */
const ZmengTooltip: React.FC<{
	title: string;
	children: JSX.Element;
}> = ({ title, children }) => {
	const [visible, setVisible] = useState(false);
	const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const wrapRef = useRef<HTMLSpanElement | null>(null);

	const handleMouseEnter = useCallback(() => {
		timerRef.current = setTimeout(() => {
			if (!wrapRef.current) return;
			// 获取按钮在视口中的真实渲染位置（浏览器保证准确）
			const rect = wrapRef.current.getBoundingClientRect();
			setPos({ x: rect.left + rect.width / 2, y: rect.top });
			setVisible(true);
		}, 350);
	}, []);

	const handleMouseLeave = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		setVisible(false);
	}, []);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const tooltipContent = visible && pos ? (
		<Portal>
			<div
				style={{
					position: "fixed",
					// JS 计算的视口坐标，浏览器保证与实际渲染位置一致
					left: pos.x,
					top: pos.y - 6,
					transform: "translate(-50%, -100%)",
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
					zIndex: 99999,
					pointerEvents: "none",
					textAlign: "center",
					boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
					fontFamily:
						'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
				}}
			>
				{title}
			</div>
		</Portal>
	) : null;

	return (
		<span
			ref={wrapRef}
			style={{ display: "inline-flex" }}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{children}
			{tooltipContent}
		</span>
	);
};

// 轻量 Portal：渲染到 document.body，脱离任何祖先 transform/scale
const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [el] = useState(() => {
		if (typeof document !== "undefined") {
			const div = document.createElement("div");
			return div;
		}
		return null;
	});

	useEffect(() => {
		if (el && document.body) {
			document.body.appendChild(el);
			return () => {
				el.remove();
			};
		}
	}, [el]);

	if (!el) return null;
	return ReactDOM.createPortal(children, el);
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
