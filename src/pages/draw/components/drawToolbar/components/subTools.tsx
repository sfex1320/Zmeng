import { HolderOutlined } from "@ant-design/icons";
import { Flex, theme } from "antd";
import {
	useCallback,
	useContext,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import { useIntl } from "react-intl";
import { DrawContext } from "@/pages/draw/types";
import { zIndexs } from "@/utils/zIndex";
import { useMonitorRect } from "../../statusBar";
import { useDragElement } from "./dragButton";

export type SubToolsActionType = {
	getSubToolContainer: () => HTMLDivElement | null;
};

export const SubTools: React.FC<{
	buttons: React.ReactNode[];
	actionRef?: React.RefObject<SubToolsActionType | undefined>;
}> = ({ buttons, actionRef }) => {
	const intl = useIntl();
	const { token } = theme.useToken();

	const { selectLayerActionRef } = useContext(DrawContext);

	const subToolsContainerRef = useRef<HTMLDivElement>(null);
	const subToolsRef = useRef<HTMLDivElement>(null);

	const {
		calculatedBoundaryRect,
		contentScale: [contentScale],
	} = useMonitorRect(true);

	const getSelectedRect = useCallback(() => {
		return (
			selectLayerActionRef.current?.getSelectRect() ?? {
				min_x: 0,
				min_y: 0,
				max_x: 0,
				max_y: 0,
			}
		);
	}, [selectLayerActionRef]);
	const {
		update: updateDrawToolbarStyleCore,
		reset: resetDrag,
		onMouseDown,
		onMouseMove,
		onMouseUp,
	} = useDragElement(
		useMemo(() => {
			return {
				getBaseOffset: (element) => {
					// 优先跟随主工具条的实际渲染位置（getBoundingClientRect 为视口 CSS 坐标，
					// 多屏/混合缩放下天然正确）。旧实现按选区坐标 + devicePixelRatio 换算，
					// 在多屏下会把子工具条定位到另一块屏幕。
					const mainToolbar = document.querySelector(".draw-toolbar");
					if (mainToolbar) {
						const rect = mainToolbar.getBoundingClientRect();
						return {
							x: rect.left,
							y: rect.bottom + 8,
						};
					}

					// 主工具条不可见时回退旧逻辑（选区左上方）
					const selectedRect = getSelectedRect();

					return {
						x:
							selectedRect.min_x / window.devicePixelRatio -
							(element.clientWidth + token.marginXXS) * contentScale,
						y: selectedRect.min_y / window.devicePixelRatio,
					};
				},
			};
		}, [contentScale, getSelectedRect, token.marginXXS]),
	);

	const updateDrawToolbarStyle = useCallback(() => {
		if (!subToolsRef.current) {
			return;
		}

		updateDrawToolbarStyleCore(
			subToolsRef.current,
			contentScale,
			calculatedBoundaryRect,
		);
	}, [updateDrawToolbarStyleCore, contentScale, calculatedBoundaryRect]);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			e.stopPropagation();
			onMouseDown(e);
		},
		[onMouseDown],
	);

	const handleMouseMove = useCallback(
		(event: MouseEvent) => {
			if (!subToolsRef.current) return;

			onMouseMove(
				event,
				subToolsRef.current,
				contentScale,
				calculatedBoundaryRect,
			);
		},
		[onMouseMove, contentScale, calculatedBoundaryRect],
	);

	const dragTitle = useMemo(() => {
		return intl.formatMessage({ id: "draw.drag" });
	}, [intl]);

	useEffect(() => {
		resetDrag();
		updateDrawToolbarStyle();
		requestAnimationFrame(() => {
			if (subToolsRef.current) {
				subToolsRef.current.style.opacity = "1";
			}
		});
	}, [updateDrawToolbarStyle, resetDrag]);

	useEffect(() => {
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", onMouseUp);
		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};
	}, [handleMouseMove, onMouseUp]);

	useImperativeHandle(
		actionRef,
		useCallback(() => {
			return {
				getSubToolContainer: () => subToolsContainerRef.current,
			};
		}, []),
	);

	const onDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		e.stopPropagation();
		e.preventDefault();
	}, []);

	return (
		<div
			className="sub-tools-container"
			ref={subToolsContainerRef}
			onDoubleClick={onDoubleClick}
		>
			<div className="sub-tools" ref={subToolsRef}>
				<div
					className="drag-button"
					title={dragTitle}
					onMouseDown={handleMouseDown}
				>
					<HolderOutlined />
				</div>
				<Flex
					align="center"
					gap={token.paddingXS}
					style={{ flexDirection: "column", marginTop: -token.marginXS }}
				>
					{buttons}
				</Flex>
			</div>
			<style jsx>{`
                .sub-tools-container {
                    position: fixed;
                    z-index: ${zIndexs.Draw_SubToolbar};
                    top: 0;
                    left: 0;
                }

                /* 与主工具条同系列：毛玻璃胶囊 + 系列化按钮 */
                .sub-tools {
                    opacity: 0;
                    pointer-events: auto;
                    padding: 5px;
                    box-sizing: border-box;
                    background-color: ${token.colorBgContainer}B3;
                    backdrop-filter: blur(24px) saturate(1.5);
                    -webkit-backdrop-filter: blur(24px) saturate(1.5);
                    border: 1px solid ${token.colorBorderSecondary};
                    border-radius: 14px;
                    cursor: default; /* 防止非拖动区域也变成可拖动状态 */
                    color: ${token.colorText};
                    box-shadow:
                        0 10px 30px rgba(0, 0, 0, 0.18),
                        0 2px 8px rgba(0, 0, 0, 0.1),
                        inset 0 1px 0 rgba(255, 255, 255, 0.06);
                    transition: opacity ${token.motionDurationMid} ${token.motionEaseInOut};
                    transform-origin: top left;
                }

                .sub-tools :global(.ant-btn) {
                    min-width: 32px;
                    width: 32px;
                    height: 32px;
                    padding: 0;
                    border-radius: 9px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition:
                        background-color 0.15s ease,
                        color 0.15s ease,
                        transform 0.15s ease,
                        box-shadow 0.15s ease;
                }

                .sub-tools :global(.ant-btn):not(:disabled):hover {
                    transform: translateY(-1px);
                }

                .sub-tools :global(.ant-btn):global(.ant-btn-primary) {
                    box-shadow: 0 2px 8px ${token.colorPrimary}66;
                }

                .drag-button {
                    margin-top: -${token.marginXXS / 2}px;
                    transform: rotate(90deg);
                    font-size: 18px;
                }

                .sub-tools :global(.ant-btn) :global(.ant-btn-icon) {
                    font-size: 19px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
            `}</style>
		</div>
	);
};
