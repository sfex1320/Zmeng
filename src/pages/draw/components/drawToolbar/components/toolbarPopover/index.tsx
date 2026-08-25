import { Popover } from "antd";
import { useCallback } from "react";

/**
 * 渲染在节点内部的 Popover。
 *
 * 弹层直接挂到触发按钮的父元素上（antd 官方推荐的就近挂载）：
 * - 定位以按钮自身为锚点，不经过全局视口坐标换算，
 *   多屏 / 混合 DPI / 内容缩放下天然正确（此前挂共享容器在副屏会偏移到主屏）；
 * - 弹层与按钮 DOM 相邻，hover 交互稳定。
 */
export const ToolbarPopover = ({
	children,
	...props
}: React.ComponentProps<typeof Popover>) => {
	const getPopupContainer = useCallback((triggerNode: HTMLElement) => {
		return triggerNode.parentElement ?? document.body;
	}, []);
	return (
		<Popover {...props} getPopupContainer={getPopupContainer}>
			{children}
		</Popover>
	);
};
