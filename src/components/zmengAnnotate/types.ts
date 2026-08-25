/**
 * ZMENG 自研标注画布（复刻阶段三）——元素模型与工具状态。
 *
 * 设计原则：
 * - 元素是不可变数据（撤销/重做 = 快照栈，简单可靠）
 * - 所有坐标为画图像素坐标（origin 左上）
 * - 渲染与交互分离：render.ts 只读元素绘制，交互层只产出新元素
 */

export type ZmengTool =
	| "select"
	| "rect"
	| "ellipse"
	| "arrow"
	| "line"
	| "pen"
	| "text"
	| "serialNumber"
	| "highlight"
	| "blur"
	| "eraser";

export type ZmengPoint = { x: number; y: number };

/** 通用样式（工具独立样式的基础） */
export type ZmengStyle = {
	color: string;
	strokeWidth: number;
	/** 字号（text/serialNumber） */
	fontSize?: number;
	/** 填充不透明度（highlight 0.4 之类） */
	fillOpacity?: number;
};

export type ZmengElementBase = {
	id: string;
	/** 创建时间戳，同为删除态时用于排序 */
	createdAt: number;
	style: ZmengStyle;
};

export type ZmengRectElement = ZmengElementBase & {
	type: "rect";
	min: ZmengPoint;
	max: ZmengPoint;
};

export type ZmengEllipseElement = ZmengElementBase & {
	type: "ellipse";
	min: ZmengPoint;
	max: ZmengPoint;
};

export type ZmengArrowElement = ZmengElementBase & {
	type: "arrow";
	from: ZmengPoint;
	to: ZmengPoint;
};

export type ZmengLineElement = ZmengElementBase & {
	type: "line";
	from: ZmengPoint;
	to: ZmengPoint;
};

export type ZmengPenElement = ZmengElementBase & {
	type: "pen";
	points: ZmengPoint[];
};

export type ZmengTextElement = ZmengElementBase & {
	type: "text";
	position: ZmengPoint;
	content: string;
};

export type ZmengSerialNumberElement = ZmengElementBase & {
	type: "serialNumber";
	position: ZmengPoint;
	label: string;
};

export type ZmengHighlightElement = ZmengElementBase & {
	type: "highlight";
	min: ZmengPoint;
	max: ZmengPoint;
};

export type ZmengBlurElement = ZmengElementBase & {
	type: "blur";
	min: ZmengPoint;
	max: ZmengPoint;
	/** 马赛克块大小（像素） */
	blockSize: number;
};

export type ZmengElement =
	| ZmengRectElement
	| ZmengEllipseElement
	| ZmengArrowElement
	| ZmengLineElement
	| ZmengPenElement
	| ZmengTextElement
	| ZmengSerialNumberElement
	| ZmengHighlightElement
	| ZmengBlurElement;

export const createElementId = () =>
	`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const defaultStyle: ZmengStyle = {
	color: "#ff4d4f",
	strokeWidth: 3,
	fontSize: 20,
	fillOpacity: 0.4,
};

/** 两点归一为 min/max */
export const normalize = (
	a: ZmengPoint,
	b: ZmengPoint,
): { min: ZmengPoint; max: ZmengPoint } => ({
	min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
	max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
});
