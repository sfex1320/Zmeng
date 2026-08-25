import type { GlobalToken } from "antd";
import type { BaseButtonProps } from "antd/es/button/button";
import React from "react";
import { DrawState } from "@/types/draw";

export const getButtonTypeByState = (
	active: boolean,
): BaseButtonProps["type"] => {
	return active ? "primary" : "text";
};

export const getButtonIconColorByState = (
	active: boolean,
	token: GlobalToken,
) => {
	return active ? token.colorSuccess : token.colorTextDisabled;
};

export type DrawToolbarContextType = {
	drawToolarContainerRef: React.RefObject<HTMLDivElement | null>;
	drawToolbarRef: React.RefObject<HTMLDivElement | null>;
	/** 弹层（Tooltip/Popover）专用挂载点：fixed 无 transform + 可交互（容器本体是 pointer-events:none，弹层挂它会无法悬停） */
	popupContainerRef: React.RefObject<HTMLDivElement | null>;
	draggingRef: React.RefObject<boolean>;
	setDragging: (dragging: boolean) => void;
};

export const DrawToolbarContext = React.createContext<DrawToolbarContextType>({
	drawToolarContainerRef: { current: null },
	drawToolbarRef: { current: null },
	popupContainerRef: { current: null },
	draggingRef: { current: false },
	setDragging: () => {},
});

export const isEnableSubToolbar = (drawState: DrawState) => {
	switch (drawState) {
		case DrawState.Idle:
			return false;
		default:
			return true;
	}
};
