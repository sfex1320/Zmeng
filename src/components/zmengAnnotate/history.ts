import type { ZmengElement } from "./types";

/**
 * 撤销/重做：元素快照栈。
 * 每次提交（新增/修改/删除/清空）压入一份全量快照——标注元素数量级小（几十个），
 * 快照栈比命令模式简单得多且绝对无 bug 风险。
 */
export class ZmengHistory {
	private past: ZmengElement[][] = [];
	private future: ZmengElement[][] = [];

	constructor(private present: ZmengElement[] = []) {}

	get elements(): ZmengElement[] {
		return this.present;
	}

	get canUndo(): boolean {
		return this.past.length > 0;
	}

	get canRedo(): boolean {
		return this.future.length > 0;
	}

	/** 提交一次变更 */
	commit(next: ZmengElement[]) {
		this.past.push(this.present);
		if (this.past.length > 100) {
			this.past.shift();
		}
		this.present = next;
		this.future = [];
	}

	undo(): ZmengElement[] {
		const prev = this.past.pop();
		if (prev === undefined) {
			return this.present;
		}
		this.future.push(this.present);
		this.present = prev;
		return this.present;
	}

	redo(): ZmengElement[] {
		const next = this.future.pop();
		if (next === undefined) {
			return this.present;
		}
		this.past.push(this.present);
		this.present = next;
		return this.present;
	}

	/** 重置（更换底图时） */
	reset(elements: ZmengElement[] = []) {
		this.past = [];
		this.future = [];
		this.present = elements;
	}
}

/** 删除点附近的元素（画笔：命中其任一点；图形：命中包围盒） */
export const hitTest = (
	elements: ZmengElement[],
	point: { x: number; y: number },
	radius: number,
): ZmengElement | undefined => {
	// 后绘制的在上层，从尾部往前找
	for (let i = elements.length - 1; i >= 0; i--) {
		const el = elements[i];
		switch (el.type) {
			case "pen": {
				if (
					el.points.some(
						(p) =>
							Math.hypot(p.x - point.x, p.y - point.y) <=
							radius + el.style.strokeWidth,
					)
				) {
					return el;
				}
				break;
			}
			case "arrow":
			case "line": {
				if (
					distanceToSegment(point, el.from, el.to) <=
					radius + el.style.strokeWidth
				) {
					return el;
				}
				break;
			}
			case "text":
			case "serialNumber": {
				// 粗略命中：以文字基线为中心的方形区域
				const size = el.style.fontSize ?? 20;
				const textLength =
					el.type === "text" ? el.content.length : el.label.length;
				if (
					point.x >= el.position.x - radius &&
					point.x <= el.position.x + size * Math.max(textLength, 1) + radius &&
					point.y >= el.position.y - size - radius &&
					point.y <= el.position.y + radius
				) {
					return el;
				}
				break;
			}
			default: {
				// rect/ellipse/highlight/blur：包围盒命中（含描边宽度）
				const pad = radius + (el.style.strokeWidth ?? 0);
				if (
					point.x >= el.min.x - pad &&
					point.x <= el.max.x + pad &&
					point.y >= el.min.y - pad &&
					point.y <= el.max.y + pad
				) {
					return el;
				}
			}
		}
	}
	return undefined;
};

/** 点到线段的距离 */
const distanceToSegment = (
	p: { x: number; y: number },
	a: { x: number; y: number },
	b: { x: number; y: number },
): number => {
	const abx = b.x - a.x;
	const aby = b.y - a.y;
	const lenSq = abx * abx + aby * aby;
	if (lenSq === 0) {
		return Math.hypot(p.x - a.x, p.y - a.y);
	}
	let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
};
