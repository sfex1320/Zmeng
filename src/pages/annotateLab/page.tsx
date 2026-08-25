import { DownloadOutlined } from "@ant-design/icons";
import { Button, ColorPicker, Flex, Segmented, Slider, Space, theme } from "antd";
import React, { useCallback, useRef, useState } from "react";
import { ContentWrap } from "@/components/contentWrap";
import {
	ZmengAnnotateCanvas,
	type ZmengAnnotateHandle,
} from "@/components/zmengAnnotate";
import {
	ZmengArrowIcon,
	ZmengBlurIcon,
	ZmengEllipseIcon,
	ZmengEraserIcon,
	ZmengHighlightIcon,
	ZmengLineIcon,
	ZmengPenIcon,
	ZmengRectIcon,
	ZmengRedoIcon,
	ZmengSelectIcon,
	ZmengSerialNumberIcon,
	ZmengTextIcon,
	ZmengUndoIcon,
} from "@/components/zmengIcons";
import type { ZmengStyle, ZmengTool } from "@/components/zmengAnnotate";

/**
 * ZMENG 自研标注画布实验场（复刻阶段三）。
 * 底图为程序生成的测试图；后续标注画布验证成熟后，将从这里迁入截图主流程
 * 替换上游 draw 页（按「并存→切换→删除」策略推进）。
 */

const TOOLS: { value: ZmengTool; label: string; icon: React.ReactNode }[] = [
	{ value: "select", label: "选择", icon: <ZmengSelectIcon /> },
	{ value: "rect", label: "矩形", icon: <ZmengRectIcon /> },
	{ value: "ellipse", label: "椭圆", icon: <ZmengEllipseIcon /> },
	{ value: "arrow", label: "箭头", icon: <ZmengArrowIcon /> },
	{ value: "line", label: "直线", icon: <ZmengLineIcon /> },
	{ value: "pen", label: "画笔", icon: <ZmengPenIcon /> },
	{ value: "text", label: "文字", icon: <ZmengTextIcon /> },
	{ value: "serialNumber", label: "序号", icon: <ZmengSerialNumberIcon /> },
	{ value: "highlight", label: "高亮", icon: <ZmengHighlightIcon /> },
	{ value: "blur", label: "马赛克", icon: <ZmengBlurIcon /> },
	{ value: "eraser", label: "橡皮", icon: <ZmengEraserIcon /> },
];

const makeTestBackground = (): HTMLCanvasElement => {
	const canvas = document.createElement("canvas");
	canvas.width = 960;
	canvas.height = 600;
	const ctx = canvas.getContext("2d")!;
	// 渐变底
	const grad = ctx.createLinearGradient(0, 0, 960, 600);
	grad.addColorStop(0, "#e6f4ff");
	grad.addColorStop(0.5, "#f6ffed");
	grad.addColorStop(1, "#fff7e6");
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, 960, 600);
	// 网格
	ctx.strokeStyle = "rgba(0,0,0,0.08)";
	for (let x = 0; x <= 960; x += 40) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, 600);
		ctx.stroke();
	}
	for (let y = 0; y <= 600; y += 40) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(960, y);
		ctx.stroke();
	}
	// 文本
	ctx.fillStyle = "#333";
	ctx.font = "600 28px system-ui, sans-serif";
	ctx.fillText("ZMENG 标注画布实验场（zmeng-annotate）", 48, 80);
	ctx.font = "16px system-ui, sans-serif";
	ctx.fillStyle = "#666";
	ctx.fillText("矩形 / 椭圆 / 箭头 / 直线 / 画笔 / 文字 / 序号 / 高亮 / 马赛克 / 橡皮 + 撤销重做", 48, 116);
	ctx.fillText("此页为自研标注核心的验证场，验证成熟后接入截图主流程替换上游 draw 页。", 48, 142);
	// 色块（测试马赛克/高亮效果）
	const colors = ["#ff4d4f", "#faad14", "#52c41a", "#1677ff", "#722ed1"];
	colors.forEach((c, i) => {
		ctx.fillStyle = c;
		ctx.beginPath();
		ctx.arc(140 + i * 90, 320, 34, 0, Math.PI * 2);
		ctx.fill();
	});
	return canvas;
};

export const AnnotateLabPage: React.FC = () => {
	const { token } = theme.useToken();
	const annotateRef = useRef<ZmengAnnotateHandle>(null);
	const [tool, setTool] = useState<ZmengTool>("rect");
	const [style, setStyle] = useState<Partial<ZmengStyle>>({
		color: "#ff4d4f",
		strokeWidth: 3,
	});
	const [history, setHistory] = useState({ undo: false, redo: false });
	const [background] = useState(makeTestBackground);

	const updateStyle = useCallback((patch: Partial<ZmengStyle>) => {
		setStyle((prev) => ({ ...prev, ...patch }));
	}, []);

	const exportPng = useCallback(() => {
		const canvas = annotateRef.current?.exportCanvas();
		if (!canvas) return;
		const link = document.createElement("a");
		link.download = `zmeng-annotate-${Date.now()}.png`;
		link.href = canvas.toDataURL("image/png");
		link.click();
	}, []);

	return (
		<ContentWrap>
			<Flex vertical gap={12}>
				<Flex
					align="center"
					gap={10}
					wrap="wrap"
					style={{
						padding: "10px 14px",
						background: token.colorBgContainer,
						border: `1px solid ${token.colorBorderSecondary}`,
						borderRadius: 14,
					}}
				>
					<Segmented
						value={tool}
						onChange={(v) => setTool(v as ZmengTool)}
						options={TOOLS.map((t) => ({
							value: t.value,
							label: (
								<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
									{t.icon}
									{t.label}
								</span>
							),
						}))}
					/>
					<Space size={6}>
						<Button
							icon={<ZmengUndoIcon />}
							disabled={!history.undo}
							onClick={() => annotateRef.current?.undo()}
						>
							撤销
						</Button>
						<Button
							icon={<ZmengRedoIcon />}
							disabled={!history.redo}
							onClick={() => annotateRef.current?.redo()}
						>
							重做
						</Button>
						<Button onClick={() => annotateRef.current?.clear()}>清空</Button>
					</Space>
					<Space size={6} align="center">
						<ColorPicker
							value={style.color}
							onChange={(c) => updateStyle({ color: c.toHexString() })}
						/>
						<Slider
							style={{ width: 120, margin: 0 }}
							min={1}
							max={12}
							value={style.strokeWidth}
							onChange={(v) => updateStyle({ strokeWidth: v })}
						/>
					</Space>
					<Button type="primary" icon={<DownloadOutlined />} onClick={exportPng}>
						导出 PNG
					</Button>
				</Flex>

				<div
					style={{
						padding: 8,
						background: token.colorBgContainer,
						border: `1px solid ${token.colorBorderSecondary}`,
						borderRadius: 14,
					}}
				>
					<ZmengAnnotateCanvas
						ref={annotateRef}
						background={background}
						tool={tool}
						style={style}
						onHistoryChange={(undo, redo) => setHistory({ undo, redo })}
					/>
				</div>
			</Flex>
		</ContentWrap>
	);
};
