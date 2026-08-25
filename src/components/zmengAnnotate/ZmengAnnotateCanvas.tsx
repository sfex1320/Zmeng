import React, {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { ZmengHistory, hitTest } from "./history";
import { renderAll, renderElement } from "./render";
import {
	createElementId,
	defaultStyle,
	normalize,
	type ZmengElement,
	type ZmengPoint,
	type ZmengStyle,
	type ZmengTool,
} from "./types";

/**
 * ZMENG 自研标注画布（阶段三核心组件）。
 * 覆盖：矩形/椭圆/箭头/直线/画笔/文字/序号/高亮/马赛克/橡皮 + 撤销重做。
 * 输出：exportCanvas() 合成底图与元素 → 复制/保存由宿主处理。
 */
export type ZmengAnnotateHandle = {
	undo: () => void;
	redo: () => void;
	clear: () => void;
	/** 合成最终图（底图+标注） */
	exportCanvas: () => HTMLCanvasElement | undefined;
	setStyle: (patch: Partial<ZmengStyle>) => void;
	getStyle: () => ZmengStyle;
};

export type ZmengAnnotateProps = {
	/** 底图 */
	background: HTMLCanvasElement | HTMLImageElement | null;
	tool: ZmengTool;
	style?: Partial<ZmengStyle>;
	className?: string;
	onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
};

export const ZmengAnnotateCanvas = forwardRef<
	ZmengAnnotateHandle,
	ZmengAnnotateProps
>(({ background, tool, style, className, onHistoryChange }, ref) => {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const historyRef = useRef(new ZmengHistory());
	const styleRef = useRef<ZmengStyle>({ ...defaultStyle, ...style });
	const toolRef = useRef<ZmengTool>(tool);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [textEditing, setTextEditing] = useState<{
		position: ZmengPoint;
		value: string;
	} | null>(null);
	const serialCounterRef = useRef({ value: 0 });

	// 绘制中的元素（预览）
	const drawingRef = useRef<ZmengElement | null>(null);
	const [selectedId, setSelectedId] = useState<string | undefined>();

	toolRef.current = tool;
	if (style) {
		styleRef.current = { ...styleRef.current, ...style };
	}

	// 底图同步到内部 canvas
	useEffect(() => {
		if (!background) return;
		const w =
			background instanceof HTMLImageElement
				? background.naturalWidth
				: background.width;
		const h =
			background instanceof HTMLImageElement
				? background.naturalHeight
				: background.height;
		setSize({ w, h });
		const bgc = bgCanvasRef.current;
		if (!bgc) return;
		bgc.width = w;
		bgc.height = h;
		const bctx = bgc.getContext("2d");
		bctx?.drawImage(background, 0, 0);
		// 全量重绘
		redraw();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [background]);

	const redraw = useCallback(() => {
		const canvas = canvasRef.current;
		const bgc = bgCanvasRef.current;
		if (!canvas || !bgc) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		renderAll(
			{ ctx, background: bgc, serialCounter: serialCounterRef.current },
			historyRef.current.elements,
			selectedId,
		);
		if (drawingRef.current) {
			renderElement(
				{ ctx, background: bgc, serialCounter: serialCounterRef.current },
				drawingRef.current,
			);
		}
	}, [selectedId]);

	useEffect(() => {
		redraw();
	}, [redraw, size]);

	const notifyHistory = useCallback(() => {
		onHistoryChange?.(historyRef.current.canUndo, historyRef.current.canRedo);
	}, [onHistoryChange]);

	useImperativeHandle(
		ref,
		(): ZmengAnnotateHandle => ({
			undo: () => {
				historyRef.current.undo();
				setSelectedId(undefined);
				redraw();
				notifyHistory();
			},
			redo: () => {
				historyRef.current.redo();
				setSelectedId(undefined);
				redraw();
				notifyHistory();
			},
			clear: () => {
				historyRef.current.commit([]);
				serialCounterRef.current.value = 0;
				setSelectedId(undefined);
				redraw();
				notifyHistory();
			},
			exportCanvas: () => {
				const bgc = bgCanvasRef.current;
				if (!bgc) return undefined;
				const out = document.createElement("canvas");
				out.width = bgc.width;
				out.height = bgc.height;
				const ctx = out.getContext("2d");
				if (!ctx) return undefined;
				ctx.drawImage(bgc, 0, 0);
				renderAll(
					{ ctx, background: bgc, serialCounter: serialCounterRef.current },
					historyRef.current.elements,
				);
				return out;
			},
			setStyle: (patch) => {
				styleRef.current = { ...styleRef.current, ...patch };
			},
			getStyle: () => ({ ...styleRef.current }),
		}),
		[notifyHistory, redraw],
	);

	const toCanvasPoint = (e: React.PointerEvent | PointerEvent): ZmengPoint => {
		const canvas = canvasRef.current!;
		const rect = canvas.getBoundingClientRect();
		const sx = canvas.width / rect.width;
		const sy = canvas.height / rect.height;
		return {
			x: ((e as PointerEvent).clientX - rect.left) * sx,
			y: ((e as PointerEvent).clientY - rect.top) * sy,
		};
	};

	const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (textEditing) commitText();
		const point = toCanvasPoint(e);
		const style = { ...styleRef.current };
		const base = { id: createElementId(), createdAt: Date.now(), style };
		let el: ZmengElement | null = null;

		switch (toolRef.current) {
			case "rect":
				el = { ...base, type: "rect", min: point, max: point };
				break;
			case "ellipse":
				el = { ...base, type: "ellipse", min: point, max: point };
				break;
			case "highlight":
				el = { ...base, type: "highlight", min: point, max: point };
				break;
			case "blur":
				el = { ...base, type: "blur", min: point, max: point, blockSize: 12 };
				break;
			case "arrow":
				el = { ...base, type: "arrow", from: point, to: point };
				break;
			case "line":
				el = { ...base, type: "line", from: point, to: point };
				break;
			case "pen":
				el = { ...base, type: "pen", points: [point] };
				break;
			case "serialNumber":
				serialCounterRef.current.value += 1;
				el = {
					...base,
					type: "serialNumber",
					position: point,
					label: String(serialCounterRef.current.value),
				};
				historyRef.current.commit([...historyRef.current.elements, el]);
				notifyHistory();
				redraw();
				return;
			case "text":
				setTextEditing({ position: point, value: "" });
				return;
			case "eraser": {
				const hit = hitTest(historyRef.current.elements, point, 6);
				if (hit) {
					historyRef.current.commit(
						historyRef.current.elements.filter((x) => x.id !== hit.id),
					);
					notifyHistory();
					redraw();
				}
				return;
			}
			case "select": {
				const hit = hitTest(historyRef.current.elements, point, 6);
				setSelectedId(hit?.id);
				redraw();
				return;
			}
		}

		if (el) {
			drawingRef.current = el;
			(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
			redraw();
		}
	};

	const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const el = drawingRef.current;
		if (!el) return;
		const point = toCanvasPoint(e);
		switch (el.type) {
			case "rect":
			case "ellipse":
			case "highlight":
			case "blur": {
				const start = el.min;
				const n = normalize(start, point);
				el.min = n.min;
				el.max = n.max;
				break;
			}
			case "arrow":
			case "line":
				el.to = point;
				break;
			case "pen":
				el.points.push(point);
				break;
		}
		redraw();
	};

	const onPointerUp = () => {
		const el = drawingRef.current;
		if (!el) return;
		drawingRef.current = null;
		// 忽略误触（过小的形状）
		const tooSmall =
			el.type === "pen"
				? el.points.length < 2
				: el.type === "rect" ||
						el.type === "ellipse" ||
						el.type === "highlight" ||
						el.type === "blur"
					? Math.abs(el.max.x - el.min.x) < 3 &&
						Math.abs(el.max.y - el.min.y) < 3
					: el.type === "arrow" || el.type === "line"
						? Math.hypot(el.to.x - el.from.x, el.to.y - el.from.y) < 3
						: false;
		if (!tooSmall) {
			historyRef.current.commit([...historyRef.current.elements, el]);
			notifyHistory();
		}
		redraw();
	};

	const commitText = () => {
		const editing = textEditing;
		setTextEditing(null);
		if (!editing || !editing.value.trim()) return;
		const el: ZmengElement = {
			id: createElementId(),
			createdAt: Date.now(),
			style: { ...styleRef.current },
			type: "text",
			position: editing.position,
			content: editing.value,
		};
		historyRef.current.commit([...historyRef.current.elements, el]);
		notifyHistory();
		redraw();
	};

	return (
		<div
			className={className}
			style={{ position: "relative", display: "inline-block" }}
		>
			<canvas ref={bgCanvasRef} style={{ display: "none" }} />
			<canvas
				ref={canvasRef}
				width={size.w || 1}
				height={size.h || 1}
				style={{
					display: "block",
					maxWidth: "100%",
					cursor:
						tool === "select" ? "default" : tool === "text" ? "text" : "crosshair",
					touchAction: "none",
				}}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
			/>
			{textEditing && (
				<textarea
					autoFocus
					value={textEditing.value}
					onChange={(e) =>
						setTextEditing({ ...textEditing, value: e.target.value })
					}
					onBlur={commitText}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							setTextEditing(null);
						}
						e.stopPropagation();
					}}
					style={{
						position: "absolute",
						left: textEditing.position.x,
						top: textEditing.position.y - (styleRef.current.fontSize ?? 20),
						fontSize: styleRef.current.fontSize ?? 20,
						fontFamily: "system-ui, sans-serif",
						color: styleRef.current.color,
						background: "rgba(0,0,0,0.05)",
						border: "1px dashed currentColor",
						outline: "none",
						resize: "both",
						minWidth: 160,
						minHeight: 44,
						padding: 2,
					}}
				/>
			)}
		</div>
	);
});
