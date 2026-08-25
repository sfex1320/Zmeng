const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

/** 尾部与标签前缀匹配的最长长度（标签可能被拆到下一个 chunk） */
const longestTagPrefixSuffix = (text: string, tag: string): number => {
	const max = Math.min(text.length, tag.length - 1);
	for (let i = max; i > 0; i--) {
		if (text.endsWith(tag.slice(0, i))) {
			return i;
		}
	}
	return 0;
};

/**
 * 流式过滤 `<think>...</think>` 段。
 * MiniMax-M2 等思考型模型把推理过程直接混在 content 里输出，
 * 翻译/AI 动作只应展示思考结束后的正文。
 */
export const createThinkFilter = () => {
	let pending = "";
	let inThink = false;

	const push = (chunk: string): string => {
		let text = pending + chunk;
		pending = "";
		let out = "";

		while (text.length > 0) {
			if (inThink) {
				const end = text.indexOf(THINK_CLOSE);
				if (end !== -1) {
					text = text.slice(end + THINK_CLOSE.length);
					inThink = false;
					continue;
				}
				const keep = longestTagPrefixSuffix(text, THINK_CLOSE);
				pending = text.slice(text.length - keep);
				text = "";
			} else {
				const start = text.indexOf(THINK_OPEN);
				if (start !== -1) {
					out += text.slice(0, start);
					text = text.slice(start + THINK_OPEN.length);
					inThink = true;
					continue;
				}
				const keep = longestTagPrefixSuffix(text, THINK_OPEN);
				out += text.slice(0, text.length - keep);
				pending = text.slice(text.length - keep);
				text = "";
			}
		}

		return out;
	};

	return {
		push,
		/** 流结束时调用：取回因疑似半截标签而滞留的尾部（如正文本身以 "<" 结尾） */
		flush: (): string => {
			const rest = pending;
			pending = "";
			return inThink ? "" : rest;
		},
	};
};

/** 非流式完整文本的一次性过滤（本地 Ollama 等一次拿全量的场景） */
export const stripThink = (text: string): string => {
	const filter = createThinkFilter();
	return filter.push(text) + filter.flush();
};
