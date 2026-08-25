import { Popover } from "antd";
import { useCallback, useContext } from "react";
import { DrawToolbarContext } from "@/pages/draw/components/drawToolbar/extra";

/// 渲染在节点内部的 Popover
export const ToolbarPopover = ({
	children,
	...props
}: React.ComponentProps<typeof Popover>) => {
	const { drawToolbarRef, popupContainerRef } = useContext(DrawToolbarContext);

	// 挂 fixed 专用容器：定位准（无 transform）且弹层自身可交互（容器本体 pointer-events:none）
	const getPopupContainer = useCallback(() => {
		return popupContainerRef.current ?? drawToolbarRef.current ?? document.body;
	}, [popupContainerRef, drawToolbarRef]);
	return (
		<Popover {...props} getPopupContainer={getPopupContainer}>
			{children}
		</Popover>
	);
};
