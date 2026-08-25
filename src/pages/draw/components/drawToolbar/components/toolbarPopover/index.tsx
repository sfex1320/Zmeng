import { Popover } from "antd";
import { useCallback, useContext } from "react";
import { DrawToolbarContext } from "@/pages/draw/components/drawToolbar/extra";

/// 渲染在节点内部的 Popover
export const ToolbarPopover = ({
	children,
	...props
}: React.ComponentProps<typeof Popover>) => {
	const { drawToolbarRef, drawToolarContainerRef } = useContext(DrawToolbarContext);

	// 挂无 transform 的外层容器，避免 transform 祖先下的定位偏移（多屏跑偏）
	const getPopupContainer = useCallback(() => {
		return drawToolarContainerRef.current ?? drawToolbarRef.current ?? document.body;
	}, [drawToolarContainerRef, drawToolbarRef]);
	return (
		<Popover {...props} getPopupContainer={getPopupContainer}>
			{children}
		</Popover>
	);
};
