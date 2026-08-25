import { theme } from "antd";
import React, {
	type JSX,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

/**
 * 截图工具条统一提示。
 *
 * 截图窗口横跨虚拟桌面，工具条还会通过 transform 完成混合 DPI 缩放。
 * 提示必须留在触发按钮的 DOM 坐标系内，不能 Portal 到 body 或交给 WebView
 * 的原生 title；否则副屏上的提示会按另一套屏幕坐标定位。
 */
export const ToolbarTooltip: React.FC<{
	title: React.ReactNode;
	children: JSX.Element;
}> = ({ title, children }) => {
	const { token } = theme.useToken();
	const [visible, setVisible] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const handleMouseEnter = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
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

	return (
		<span
			style={{ position: "relative", display: "inline-flex" }}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{children}
			{visible && (
				<span
					role="tooltip"
					style={{
						position: "absolute",
						left: "50%",
						bottom: "calc(100% + 8px)",
						transform: "translateX(-50%)",
						boxSizing: "border-box",
						padding: "5px 10px",
						backgroundColor: `${token.colorBgContainer}E6`,
						backdropFilter: "blur(24px) saturate(1.5)",
						WebkitBackdropFilter: "blur(24px) saturate(1.5)",
						border: `1px solid ${token.colorBorderSecondary}`,
						borderRadius: 10,
						boxShadow:
							"0 10px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
						color: token.colorText,
						fontFamily: token.fontFamily,
						fontSize: token.fontSizeSM,
						fontWeight: 500,
						lineHeight: `${token.lineHeightSM * token.fontSizeSM}px`,
						whiteSpace: "nowrap",
						zIndex: 1,
						pointerEvents: "none",
						textAlign: "center",
					}}
				>
					{title}
				</span>
			)}
		</span>
	);
};
