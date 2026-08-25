import React, {
	useCallback,
	useRef,
	useState,
} from "react";
import { theme } from "antd";

/**
 * 自研 Popover（截图工具栏二级菜单专用）：纯 CSS 绝对定位。
 *
 * 背景：antd Popover 在跨双屏大视口中，rc-trigger 的定位计算会偏移一整屏。
 * 改为 position:absolute + bottom/top + left:50% + translateX(-50%)，
 * 定位完全相对于触发按钮自身，不可能跨屏。
 *
 * 交互：hover 展开，鼠标可移入面板内操作。按钮靠屏幕顶部时自动向下弹出。
 */
export const ToolbarPopover: React.FC<{
	children: React.ReactNode;
	content: React.ReactNode;
	trigger?: unknown;
	open?: boolean;
}> = ({ children, content, open: controlledOpen }) => {
	const { token } = theme.useToken();
	const [hovered, setHovered] = useState(false);
	const [direction, setDirection] = useState<"up" | "down">("up");
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const wrapRef = useRef<HTMLDivElement | null>(null);

	const isOpen = controlledOpen ?? hovered;

	const handleMouseEnter = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			if (wrapRef.current) {
				const rect = wrapRef.current.getBoundingClientRect();
				setDirection(rect.top < 80 ? "down" : "up");
			}
			setHovered(true);
		}, 180);
	}, []);

	const handleMouseLeave = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		// 延迟关闭让鼠标有时间移入面板
		timerRef.current = setTimeout(() => setHovered(false), 120);
	}, []);

	const panelStyle: React.CSSProperties = {
		position: "absolute",
		...(direction === "up"
			? { bottom: "calc(100% + 6px)" }
			: { top: "calc(100% + 6px)" }),
		left: "50%",
		transform: "translateX(-50%)",
		background: `${token.colorBgContainer}E6`,
		backdropFilter: "blur(24px) saturate(1.5)",
		WebkitBackdropFilter: "blur(24px) saturate(1.5)",
		border: `1px solid ${token.colorBorderSecondary}`,
		borderRadius: 12,
		padding: "4px 6px",
		boxShadow: "0 10px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)",
		zIndex: 9999,
		pointerEvents: "auto",
	};

	return (
		<div
			ref={wrapRef}
			style={{ position: "relative", display: "inline-flex" }}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{children}
			{isOpen && <div style={panelStyle}>{content}</div>}
		</div>
	);
};
