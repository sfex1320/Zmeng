import type { ZmengElement, ZmengPoint } from "./types";

/**
 * Canvas 2D 渲染器：只读元素绘制，不含交互。
 * blur（马赛克）需要读取底图像素——通过传入 backgroundCanvas 实现局部像素化。
 */

export type RenderContext = {
	ctx: CanvasRenderingContext2D;
	/** 底图（马赛克取像素用） */
	background?: HTMLCanvasElement | HTMLImageElement | null;
	/** 序列号计数（渲染时自动递增标签） */
	serialCounter?: { value: number };
};

const roundRect = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) => {
	const radius = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + w, y, x + w, y + h, radius);
	ctx.arcTo(x + w, y + h, x, y + h, radius);
	ctx.arcTo(x, y + h, x, y, radius);
	ctx.arcTo(x, y, x + w, y, radius);
	ctx.closePath();
};

const drawArrowHead = (
	ctx: CanvasRenderingContext2D,
	from: ZmengPoint,
	to: ZmengPoint,
	thickness: number,
) => {
	const angle = Math.atan2(to.y - from.y, to.x - from.x);
	const headLen = Math.max(10, thickness * 3.2);
	ctx.beginPath();
	ctx.moveTo(to.x, to.y);
	ctx.lineTo(
		to.x - headLen * Math.cos(angle - Math.PI / 7),
		to.y - headLen * Math.sin(angle - Math.PI / 7),
	);
	ctx.lineTo(
		to.x - headLen * Math.cos(angle + Math.PI / 7),
		to.y - headLen * Math.sin(angle + Math.PI / 7),
	);
	ctx.closePath();
	ctx.fill();
};

/** 单个元素绘制 */
export const renderElement = (
	rc: RenderContext,
	el: ZmengElement,
	selected = false,
) => {
	const { ctx } = rc;
	const { color, strokeWidth } = el.style;

	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	ctx.lineWidth = strokeWidth;

	switch (el.type) {
		case "rect": {
			const x = Math.min(el.min.x, el.max.x);
			const y = Math.min(el.min.y, el.max.y);
			const w = Math.abs(el.max.x - el.min.x);
			const h = Math.abs(el.max.y - el.min.y);
			roundRect(ctx, x, y, w, h, 4);
			ctx.stroke();
			break;
		}
		case "ellipse": {
			const cx = (el.min.x + el.max.x) / 2;
			const cy = (el.min.y + el.max.y) / 2;
			ctx.beginPath();
			ctx.ellipse(
				cx,
				cy,
				Math.abs(el.max.x - el.min.x) / 2,
				Math.abs(el.max.y - el.min.y) / 2,
				0,
				0,
				Math.PI * 2,
			);
			ctx.stroke();
			break;
		}
		case "arrow": {
			ctx.beginPath();
			ctx.moveTo(el.from.x, el.from.y);
			ctx.lineTo(el.to.x, el.to.y);
			ctx.stroke();
			drawArrowHead(ctx, el.from, el.to, strokeWidth);
			break;
		}
		case "line": {
			ctx.beginPath();
			ctx.moveTo(el.from.x, el.from.y);
			ctx.lineTo(el.to.x, el.to.y);
			ctx.stroke();
			break;
		}
		case "pen": {
			if (el.points.length === 0) break;
			ctx.beginPath();
			ctx.moveTo(el.points[0].x, el.points[0].y);
			for (const p of el.points.slice(1)) {
				ctx.lineTo(p.x, p.y);
			}
			if (el.points.length === 1) {
				// 单点：画圆点
				ctx.arc(el.points[0].x, el.points[0].y, strokeWidth / 2, 0, Math.PI * 2);
				ctx.fill();
			} else {
				ctx.stroke();
			}
			break;
		}
		case "text": {
			const fontSize = el.style.fontSize ?? 20;
			ctx.font = `600 ${fontSize}px system-ui, "Microsoft YaHei", sans-serif`;
			ctx.textBaseline = "alphabetic";
			// 描边底白提高可读性
			ctx.lineWidth = strokeWidth;
			ctx.strokeStyle = "rgba(255,255,255,0.85)";
			ctx.lineJoin = "round";
			for (const line of el.content.split("\n")) {
				ctx.strokeText(line, el.position.x, el.position.y);
				ctx.fillText(line, el.position.x, el.position.y);
				ctx.translate(0, fontSize * 1.25);
			}
			break;
		}
		case "serialNumber": {
			const fontSize = el.style.fontSize ?? 20;
			const r = fontSize * 0.72;
			ctx.beginPath();
			ctx.arc(el.position.x + r, el.position.y - r, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#fff";
			ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(el.label, el.position.x + r, el.position.y - r + 1);
			break;
		}
		case "highlight": {
			const x = Math.min(el.min.x, el.max.x);
			const y = Math.min(el.min.y, el.max.y);
			const w = Math.abs(el.max.x - el.min.x);
			const h = Math.abs(el.max.y - el.min.y);
			ctx.globalAlpha = el.style.fillOpacity ?? 0.4;
			ctx.fillRect(x, y, w, h);
			break;
		}
		case "blur": {
			const x = Math.floor(Math.min(el.min.x, el.max.x));
			const y = Math.floor(Math.min(el.min.y, el.max.y));
			const w = Math.max(1, Math.floor(Math.abs(el.max.x - el.min.x)));
			const h = Math.max(1, Math.floor(Math.abs(el.max.y - el.min.y)));
			const block = el.blockSize || 10;
			if (!rc.background) {
				// 无底图时退化为半透明遮盖
				ctx.globalAlpha = 0.7;
				ctx.fillRect(x, y, w, h);
				break;
			}
			// 局部像素化：小画布缩小再放大
			const temp = document.createElement("canvas");
			const cols = Math.max(1, Math.ceil(w / block));
			const rows = Math.max(1, Math.ceil(h / block));
			temp.width = cols;
			temp.height = rows;
			const tctx = temp.getContext("2d");
			if (!tctx) break;
			tctx.drawImage(rc.background, x, y, w, h, 0, 0, cols, rows);
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(temp, 0, 0, cols, rows, x, y, cols * block, rows * block);
			break;
		}
	}

	// 选中态：虚线包围框
	if (selected) {
		const box = getElementBounds(el);
		if (box) {
			ctx.globalAlpha = 1;
			ctx.setLineDash([5, 4]);
			ctx.lineWidth = 1;
			ctx.strokeStyle = "#1677ff";
			ctx.strokeRect(box.x - 5, box.y - 5, box.w + 10, box.h + 10);
			ctx.setLineDash([]);
		}
	}

	ctx.restore();
};

/** 元素包围盒（text/serialNumber 用估算） */
export const getElementBounds = (
	el: ZmengElement,
): { x: number; y: number; w: number; h: number } | undefined => {
	switch (el.type) {
		case "rect":
		case "ellipse":
		case "highlight":
		case "blur":
			return {
				x: Math.min(el.min.x, el.max.x),
				y: Math.min(el.min.y, el.max.y),
				w: Math.abs(el.max.x - el.min.x),
				h: Math.abs(el.max.y - el.min.y),
			};
		case "arrow":
		case "line":
			return {
				x: Math.min(el.from.x, el.to.x),
				y: Math.min(el.from.y, el.to.y),
				w: Math.abs(el.to.x - el.from.x),
				h: Math.abs(el.to.y - el.from.y),
			};
		case "pen": {
			if (!el.points.length) return undefined;
			const xs = el.points.map((p) => p.x);
			const ys = el.points.map((p) => p.y);
			return {
				x: Math.min(...xs),
				y: Math.min(...ys),
				w: Math.max(...xs) - Math.min(...xs),
				h: Math.max(...ys) - Math.min(...ys),
			};
		}
		case "text": {
			const size = el.style.fontSize ?? 20;
			const lines = el.content.split("\n");
			return {
				x: el.position.x,
				y: el.position.y - size,
				w: Math.max(...lines.map((l) => l.length)) * size * 0.62,
				h: lines.length * size * 1.25,
			};
		}
		case "serialNumber": {
			const size = el.style.fontSize ?? 20;
			const r = size * 0.72;
			return { x: el.position.x, y: el.position.y - r * 2, w: r * 2, h: r * 2 };
		}
	}
};

/** 全量重绘 */
export const renderAll = (
	rc: RenderContext,
	elements: ZmengElement[],
	selectedId?: string,
) => {
	for (const el of elements) {
		renderElement(rc, el, el.id === selectedId);
	}
};
