import type React from "react";

/**
 * ZMENG 系列图标（截图工具条专用统一视觉）。
 *
 * 设计规范 —— 所有图标必须遵守，保证"一套系列"的观感：
 * - viewBox 24×24，仅用 stroke 描线（fill none），stroke=currentColor
 * - stroke-width 统一 1.7，linecap/linejoin 统一 round
 * - 基础几何语言：圆角矩形/正圆/三角/45°线；圆角矩形统一 rx=2.5
 * - 不用字符文本路径（跨字体不一致），除单个笔画数字/字母外
 */
export type ZmengIconProps = {
	className?: string;
	style?: React.CSSProperties;
};

const Svg: React.FC<{
	children: React.ReactNode;
	className?: string;
	style?: React.CSSProperties;
}> = ({ children, className, style }) => (
	<svg
		viewBox="0 0 24 24"
		width="1em"
		height="1em"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.7"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
		style={style}
		aria-hidden
	>
		{children}
	</svg>
);

/** 拖动手柄（两列圆点） */
export const ZmengMoveIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<circle cx="9" cy="6" r="0.9" fill="currentColor" stroke="none" />
		<circle cx="15" cy="6" r="0.9" fill="currentColor" stroke="none" />
		<circle cx="9" cy="12" r="0.9" fill="currentColor" stroke="none" />
		<circle cx="15" cy="12" r="0.9" fill="currentColor" stroke="none" />
		<circle cx="9" cy="18" r="0.9" fill="currentColor" stroke="none" />
		<circle cx="15" cy="18" r="0.9" fill="currentColor" stroke="none" />
	</Svg>
);

/** 选区（箭头光标） */
export const ZmengSelectIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M6 4 L6 18 L10.2 14.2 L12.6 19.5 L14.8 18.5 L12.4 13.3 L17.6 12.8 Z" />
	</Svg>
);

/** 锁定绘制工具 */
export const ZmengLockIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<rect x="5.5" y="10.5" width="13" height="9" rx="2.5" />
		<path d="M8.5 10.5 V7.5 a3.5 3.5 0 0 1 7 0 V10.5" />
		<circle cx="12" cy="15" r="1.1" fill="currentColor" stroke="none" />
	</Svg>
);

/** 矩形 */
export const ZmengRectIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<rect x="4.5" y="6" width="15" height="12" rx="2.5" />
	</Svg>
);

/** 椭圆 */
export const ZmengEllipseIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<ellipse cx="12" cy="12" rx="7.5" ry="6" />
	</Svg>
);

/** 直线 */
export const ZmengLineIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M5.5 18.5 L18.5 5.5" />
		<circle cx="5.5" cy="18.5" r="1.2" fill="currentColor" stroke="none" />
		<circle cx="18.5" cy="5.5" r="1.2" fill="currentColor" stroke="none" />
	</Svg>
);

/** 菱形 */
export const ZmengDiamondIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M12 4.5 L19.5 12 L12 19.5 L4.5 12 Z" />
	</Svg>
);

/** 箭头 */
export const ZmengArrowIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M5.5 18.5 L16.5 7.5" />
		<path d="M10 7 L17 7.5 L16.5 14.5" fill="none" />
	</Svg>
);

/** 画笔 */
export const ZmengPenIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M4.5 19.5 L6 15 L16 5 a2 2 0 0 1 3 3 L9 18 Z" />
		<path d="M14 7 L17 10" />
	</Svg>
);

/** 文字 T */
export const ZmengTextIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M5.5 6.5 H18.5" />
		<path d="M12 6.5 V18" />
		<path d="M9.5 18 H14.5" />
	</Svg>
);

/** 序列号钉（圆内数字 1） */
export const ZmengSerialNumberIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<circle cx="12" cy="12" r="8" />
		<path d="M10.2 9.2 L11.8 8.4 V15.8" />
		<path d="M9.8 15.8 H13.8" />
	</Svg>
);

/** 马赛克（网格） */
export const ZmengBlurIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
		<path d="M4.5 9.5 H19.5 M4.5 14.5 H19.5 M9.5 4.5 V19.5 M14.5 4.5 V19.5" strokeWidth="1.3" />
	</Svg>
);

/** 高亮笔 */
export const ZmengHighlightIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M8 19.5 L5.5 19.5 L5.5 17 L14.5 8 L17.5 11 Z" />
		<path d="M14 8.5 L16.5 6 a1.8 1.8 0 0 1 2.5 2.5 L16.5 11" />
		<path d="M12 19.5 H19" strokeWidth="2.4" />
	</Svg>
);

/** 橡皮 */
export const ZmengEraserIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M4.5 15.5 L11 9 a2 2 0 0 1 3 0 L16.5 11.5 a2 2 0 0 1 0 2.8 L13 17.8 H8.5 Z" />
		<path d="M9.5 11.5 L14 16" />
		<path d="M6 19.5 H19.5" />
	</Svg>
);

/** 撤销 */
export const ZmengUndoIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M8 6 L4 10 L8 14" />
		<path d="M4.5 10 H14 a5 5 0 0 1 5 5 v3" />
	</Svg>
);

/** 重做 */
export const ZmengRedoIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M16 6 L20 10 L16 14" />
		<path d="M19.5 10 H10 a5 5 0 0 0 -5 5 v3" />
	</Svg>
);

/** 保存（软盘） */
export const ZmengSaveIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M5.5 5.5 H16 L18.5 8 V18.5 H5.5 Z" />
		<path d="M8.5 5.5 V10.5 H14.5 V5.5" />
		<rect x="8.5" y="14" width="7" height="4.5" rx="1" />
	</Svg>
);

/** 快速保存（闪电+盘） */
export const ZmengFastSaveIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M5.5 5.5 H15.5 L18.5 8.5 V18.5 H5.5 Z" />
		<path d="M12.5 8 L9.5 12.5 H12 L11 16.5 L14.5 11.5 H12 Z" />
	</Svg>
);

/** 保存到云端 */
export const ZmengSaveToCloudIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M7 17.5 a4 4 0 0 1 0.4 -8 a5 5 0 0 1 9.6 1.2 a3.4 3.4 0 0 1 -0.4 6.8 Z" />
		<path d="M12 12 V17" />
		<path d="M9.8 14.6 L12 12 L14.2 14.6" />
	</Svg>
);

/** 水印 */
export const ZmengWatermarkIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<rect x="4.5" y="4.5" width="15" height="15" rx="2.5" strokeDasharray="2.6 2.2" />
		<path d="M8.5 15.5 L12 8.5 L15.5 15.5" />
		<path d="M9.9 13.2 H14.1" />
	</Svg>
);

/** 旋转 */
export const ZmengRotateIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M19 12 a7 7 0 1 1 -2.2 -5.1" />
		<path d="M19.5 3.5 V7.5 H15.5" />
	</Svg>
);

/** OCR 文字识别（扫描框+文字行） */
export const ZmengOcrDetectIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M4.5 8.5 V6 a1.5 1.5 0 0 1 1.5 -1.5 H8.5" />
		<path d="M15.5 4.5 H18 a1.5 1.5 0 0 1 1.5 1.5 V8.5" />
		<path d="M19.5 15.5 V18 a1.5 1.5 0 0 1 -1.5 1.5 H15.5" />
		<path d="M8.5 19.5 H6 a1.5 1.5 0 0 1 -1.5 -1.5 V15.5" />
		<path d="M8 9.5 H16 M8 12.5 H13.5" />
		<path d="M8 16.2 H11" />
	</Svg>
);

/** 翻译（气泡+文） */
export const ZmengOcrTranslateIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M4.5 7.5 a2 2 0 0 1 2 -2 H17.5 a2 2 0 0 1 2 2 V14 a2 2 0 0 1 -2 2 H10 L6.5 19.5 V16 H6.5 a2 2 0 0 1 -2 -2 Z" />
		<path d="M9.5 9 V12.2 M9.5 12.2 c0 -1.6 1.4 -2.6 2.6 -2.1 c0.8 0.3 1 1 1 1.6 v2.7 M9.5 10.7 h2.4" strokeWidth="1.4" />
		<path d="M15.2 9 V12.4" strokeWidth="1.4" />
	</Svg>
);

/** 图片转 HTML（尖括号） */
export const ZmengVisionHtmlIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<rect x="3.5" y="4.5" width="17" height="12" rx="2" />
		<path d="M10 8 L7.5 10.5 L10 13" />
		<path d="M14 8 L16.5 10.5 L14 13" />
		<path d="M9.5 19.5 H14.5" />
	</Svg>
);

/** 图片转 Markdown（M 形） */
export const ZmengVisionMarkdownIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<rect x="3.5" y="4.5" width="17" height="12" rx="2" />
		<path d="M7.5 12.5 V8.5 L10 11 L12.5 8.5 V12.5" />
		<path d="M15 8.5 L17 10.8 L16.9 8.5 M15 12.5 V8.5" />
		<path d="M9.5 19.5 H14.5" />
	</Svg>
);

/** 录屏（圆+方框） */
export const ZmengVideoRecordIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<rect x="3.5" y="6" width="17" height="12" rx="2.5" />
		<circle cx="12" cy="12" r="3.2" />
	</Svg>
);

/** 扫码（二维码角框） */
export const ZmengScanIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M4.5 9 V6.5 a2 2 0 0 1 2 -2 H9" />
		<path d="M15 4.5 h2.5 a2 2 0 0 1 2 2 V9" />
		<path d="M19.5 15 v2.5 a2 2 0 0 1 -2 2 H15" />
		<path d="M9 19.5 H6.5 a2 2 0 0 1 -2 -2 V15" />
		<path d="M7.5 7.5 h3 v3 h-3 Z M13.5 7.5 h3 v3 h-3 Z M13.5 13.5 h3 v3 h-3 Z M7.5 13.5 h1.6" />
	</Svg>
);

/** 固定到屏幕（图钉） */
export const ZmengFixedIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M9 4.5 H15" />
		<path d="M12 4.5 V9" />
		<path d="M8 9 a4 4 0 0 1 8 0 L15.8 13.5 H8.2 Z" />
		<path d="M12 13.5 V19.5" />
	</Svg>
);

/** 设置（齿轮简化） */
export const ZmengSettingsIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<circle cx="12" cy="12" r="3" />
		<path d="M12 3.5 V6 M12 18 V20.5 M3.5 12 H6 M18 12 H20.5 M6 6 L7.8 7.8 M16.2 16.2 L18 18 M18 6 L16.2 7.8 M7.8 16.2 L6 18" />
	</Svg>
);

/** 复制（双卡片） */
export const ZmengClipboardIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<rect x="8" y="8" width="11.5" height="11.5" rx="2" />
		<path d="M15.5 8 V6 a1.5 1.5 0 0 0 -1.5 -1.5 H6 A1.5 1.5 0 0 0 4.5 6 v8 A1.5 1.5 0 0 0 6 15.5 h2" />
	</Svg>
);

/** 滚动截图（层叠+下箭头） */
export const ZmengScrollIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<rect x="7" y="3.5" width="10" height="10" rx="2" strokeDasharray="2.6 2.2" />
		<rect x="4.5" y="7" width="15" height="13" rx="2" />
		<path d="M12 10.5 V16 M9.8 14 L12 16.2 L14.2 14" />
	</Svg>
);

/** 置顶窗口 */
export const ZmengTopWindowIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<rect x="4.5" y="7.5" width="15" height="12" rx="2" />
		<path d="M4.5 10.5 H19.5" />
		<path d="M12 13 V17 M10.2 14.8 L12 13 L13.8 14.8" />
	</Svg>
);

/** 自由涂抹马赛克（波浪笔） */
export const ZmengFilterFreeDrawIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M4.5 15 C7 12 8.5 17 11 14 C13.5 11 15 16 17.5 13" />
		<path d="M4.5 9.5 C7 6.5 8.5 11.5 11 8.5 C13.5 5.5 15 10.5 17.5 7.5" strokeDasharray="2.4 2" />
		<path d="M19.5 5 V11" />
	</Svg>
);

/** 滤镜（滑杆） */
export const ZmengFilterIcon: React.FC<ZmengIconProps> = (props) => (
	<Svg {...props}>
		<path d="M4.5 8 H15 M19.5 8 H19.5" />
		<circle cx="17.2" cy="8" r="2.2" />
		<path d="M4.5 16 H8.8 M13 16 H19.5" />
		<circle cx="10.8" cy="16" r="2.2" />
	</Svg>
);
