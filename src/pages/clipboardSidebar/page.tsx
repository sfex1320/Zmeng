import {
	CameraOutlined,
	CloseOutlined,
	CopyOutlined,
	DeleteOutlined,
	FileTextOutlined,
	FolderOutlined,
	PictureOutlined,
	PushpinFilled,
	PushpinOutlined,
	RobotOutlined,
	ScanOutlined,
	SearchOutlined,
	SnippetsOutlined,
	TranslationOutlined,
	VerticalAlignTopOutlined,
} from "@ant-design/icons";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	availableMonitors,
	currentMonitor,
	getCurrentWindow,
	type Monitor,
	primaryMonitor,
} from "@tauri-apps/api/window";
import { openPath } from "@tauri-apps/plugin-opener";
import {
	Button,
	Dropdown,
	Empty,
	Input,
	type MenuProps,
	message,
	Segmented,
	Tooltip,
} from "antd";
import type React from "react";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	writeFiles,
	writeHtmlAndText,
	writeImageBase64,
	writeText,
} from "tauri-plugin-clipboard-api";
import { getMousePosition } from "@/commands";
import {
	type DragPayload,
	pasteToActiveWindow,
	prepareDragFiles,
	prepareDragImage,
} from "@/commands/clipboardZmeng";
import { executeScreenshot } from "@/functions/screenshot";
import { openImageSaveFolder } from "@/functions/tools";
import { useAppSettingsLoad } from "@/hooks/useAppSettingsLoad";
import {
	type AppSettingsData,
	AppSettingsGroup,
	type ChatApiConfig,
} from "@/types/appSettings";
import { ScreenshotType } from "@/utils/types";
import { AiPanel } from "./AiPanel";
import { buildDedupKey, suppressClipboardCapture } from "./monitor";
import {
	ClipboardHistoryStore,
	type ZmengSettings,
	ZmengSettingsStore,
} from "./store";
import type { ClipboardHistoryItem, ClipboardItemType } from "./types";

const SIDEBAR_WIDTH = 460;
const TASKBAR_RESERVE = 48;

/**
 * 按鼠标当前位置反查所在显示器。
 * currentMonitor() 返回的是「调用窗口自己当前所在的屏」——侧栏窗口多屏下会停在错误的屏，
 * 导致呼出时跑到别的屏。这里改用真实鼠标坐标匹配 availableMonitors 的物理矩形。
 * 取不到（API 失败 / 坐标越界）时返回 null，交由调用方回退。
 */
async function pickMonitorByMouse(): Promise<Monitor | null> {
	try {
		const [mx, my] = await getMousePosition();
		const monitors = await availableMonitors();
		return (
			monitors.find((m) => {
				const { x, y } = m.position;
				const { width, height } = m.size;
				return mx >= x && mx < x + width && my >= y && my < y + height;
			}) ?? null
		);
	} catch {
		return null;
	}
}

/** 取文件路径所在目录（Windows / POSIX 通用） */
function dirOfPath(p: string): string {
	const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
	return idx > 0 ? p.slice(0, idx) : p;
}

const TYPE_META: Record<
	ClipboardItemType,
	{ label: string; color: string; icon: React.ReactNode }
> = {
	text: { label: "文字", color: "#5b8cff", icon: <FileTextOutlined /> },
	code: { label: "代码", color: "#16b8a3", icon: <ScanOutlined /> },
	color: { label: "颜色", color: "#c084fc", icon: <PictureOutlined /> },
	image: { label: "图片", color: "#f0663f", icon: <PictureOutlined /> },
	html: { label: "富文本", color: "#e0a23c", icon: <FileTextOutlined /> },
	files: { label: "文件", color: "#8aa0b6", icon: <FileTextOutlined /> },
};

type FilterKey = "all" | ClipboardItemType | "favorite";

function timeLabel(ts: number): string {
	const d = new Date(ts);
	const hh = `${d.getHours()}`.padStart(2, "0");
	const mm = `${d.getMinutes()}`.padStart(2, "0");
	return `${hh}:${mm}`;
}

function dayGroup(ts: number): string {
	const now = new Date();
	const d = new Date(ts);
	const sameDay =
		now.getFullYear() === d.getFullYear() &&
		now.getMonth() === d.getMonth() &&
		now.getDate() === d.getDate();
	if (sameDay) return "今天";
	const y = new Date(now);
	y.setDate(now.getDate() - 1);
	const isYesterday =
		y.getFullYear() === d.getFullYear() &&
		y.getMonth() === d.getMonth() &&
		y.getDate() === d.getDate();
	if (isYesterday) return "昨天";
	return "更早";
}

async function writeItemToClipboard(item: ClipboardHistoryItem) {
	// 抑制自写触发的监听：避免「仅复制/粘贴」被当成新复制而自动收起或重复入库
	suppressClipboardCapture();
	// 跨窗口全局自写标记（Rust 原子时间戳），兜住本窗口抑制窗口之外的监听触发
	invoke("clipboard_self_write_mark").catch(() => {});
	if (item.type === "image" && item.image) {
		const b64 = item.image.includes(",")
			? item.image.slice(item.image.indexOf(",") + 1)
			: item.image;
		await writeImageBase64(b64);
	} else if (item.type === "files" && item.files?.length) {
		await writeFiles(item.files);
	} else if (item.type === "html" && item.html) {
		await writeHtmlAndText(item.html, item.content ?? "");
	} else if (item.content !== undefined) {
		await writeText(item.content);
	}
}

export const ClipboardSidebarPage: React.FC = () => {
	const [items, setItems] = useState<ClipboardHistoryItem[]>([]);
	const [filter, setFilter] = useState<FilterKey>("all");
	const [search, setSearch] = useState("");
	const [open, setOpen] = useState(false);
	const [settings, setSettings] = useState<ZmengSettings | null>(null);
	const [aiInput, setAiInput] = useState<string | null>(null);
	// 图片视觉模式：待分析图片的 base64 data URL（非空时 AiPanel 进入图片模式）
	const [aiImage, setAiImage] = useState<string | null>(null);
	const [aiInitialAction, setAiInitialAction] = useState<string | undefined>();
	// 统一的 AI 后端（来自设置体系 FunctionChat.chatApiConfigList，与主程序共用）
	const [chatBackends, setChatBackends] = useState<ChatApiConfig[]>([]);
	// 用途分配默认模型（「设置 · 大模型」页配置）
	const [defaultTranslateModel, setDefaultTranslateModel] = useState("");
	const [defaultAiModel, setDefaultAiModel] = useState("");
	const [defaultVisionModel, setDefaultVisionModel] = useState("");
	useAppSettingsLoad(
		useCallback((s: AppSettingsData) => {
			setChatBackends(s[AppSettingsGroup.FunctionChat].chatApiConfigList);
			setDefaultTranslateModel(
				s[AppSettingsGroup.FunctionChat].defaultTranslateModel ?? "",
			);
			setDefaultAiModel(s[AppSettingsGroup.FunctionChat].defaultAiModel ?? "");
			setDefaultVisionModel(
				s[AppSettingsGroup.FunctionChat].defaultVisionModel ?? "",
			);
		}, []),
		true,
	);

	const historyStoreRef = useRef<ClipboardHistoryStore | null>(null);
	const settingsStoreRef = useRef<ZmengSettingsStore | null>(null);
	const settingsRef = useRef<ZmengSettings | null>(null);
	const openRef = useRef(false);
	const itemsRef = useRef<ClipboardHistoryItem[]>([]);
	// 拖拽/移动判定：避免「想拖拽却误触发单击粘贴」
	const dragGuardRef = useRef(false);
	const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
	// 列表滚动容器（用于「回到顶部」）
	const listRef = useRef<HTMLDivElement | null>(null);
	// 原生系统级拖放：登记拖拽起点 + 预备落盘的文件载荷，越过阈值后发起 OS 拖放
	const dragStartRef = useRef<{
		x: number;
		y: number;
		item: ClipboardHistoryItem;
		payload: Promise<DragPayload | null>;
		started: boolean;
	} | null>(null);
	// 已落盘的拖放载荷缓存（按记录 id），避免重复拖拽反复落盘
	const dragPayloadCacheRef = useRef<Map<string, DragPayload>>(new Map());
	// 可取消的隐藏定时器：呼出时取消挂起的隐藏，避免 show/hide 竞态抖动
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	// 打断 hideSidebar 时显式 resolve 上一个 await，否则旧 Promise 永久 pending、
	// 调用方后续的 pasteToActiveWindow 被静默跳过
	const hideResolveRef = useRef<(() => void) | null>(null);
	// 进行中的隐藏 Promise：并发 hideSidebar 复用同一次等待，
	// 避免第二次调用提前 resolve 掉第一次、其 pasteToActiveWindow 在窗口隐藏前执行
	const hidePromiseRef = useRef<Promise<void> | null>(null);

	settingsRef.current = settings;
	openRef.current = open;
	itemsRef.current = items;

	// ---- 窗口停靠 ----
	const dockWindow = useCallback(
		async (side: "left" | "right", width: number) => {
			const win = getCurrentWindow();
			// 多屏：优先定位到鼠标所在屏（currentMonitor 取的是侧栏窗口自己所在屏，会跑偏）
			let mon = await pickMonitorByMouse();
			if (!mon) mon = await currentMonitor();
			if (!mon) mon = await primaryMonitor();
			if (!mon) return;
			const scale = mon.scaleFactor || 1;
			const monW = mon.size.width / scale;
			const monH = mon.size.height / scale;
			const monX = mon.position.x / scale;
			const monY = mon.position.y / scale;
			const height = Math.round(monH - TASKBAR_RESERVE);
			const x =
				side === "right" ? Math.round(monX + monW - width) : Math.round(monX);
			// 并行设置尺寸与位置，减少串行 IPC 往返
			await Promise.all([
				win.setSize(new LogicalSize(width, height)),
				win.setPosition(new LogicalPosition(x, Math.round(monY))),
			]);
		},
		[],
	);

	const showSidebar = useCallback(async (options?: { silent?: boolean }) => {
		// 取消挂起的隐藏定时器，避免与上次收起竞态
		// 取消挂起的隐藏：resolve 上一个 hide 的 await（避免其 pasteToActiveWindow 被跳过），再清定时器
		if (hideResolveRef.current) {
			const resolve = hideResolveRef.current;
			hideResolveRef.current = null;
			hidePromiseRef.current = null;
			resolve();
		}
		if (hideTimerRef.current) {
			clearTimeout(hideTimerRef.current);
			hideTimerRef.current = undefined;
		}
		// 直接用已实时同步的设置（reload-settings 事件会刷新 settingsRef），
		// 不在显示关键路径上 await store 读取，缩短「呼出到可见」延迟
		const s = settingsRef.current;
		const side = s?.dockSide ?? "right";
		const width = s?.sidebarWidth ?? SIDEBAR_WIDTH;
		const win = getCurrentWindow();
		await dockWindow(side, width);
		await win.show();
		setOpen(true); // 立即触发 CSS 滑入
		// 非关键路径的窗口操作 fire-and-forget，不阻塞首帧
		win.setAlwaysOnTop(true).catch(() => {});
		// silent：仅供「粘贴后侧栏回弹」等场景，不抢走目标应用的焦点
		if (!options?.silent) {
			win.setFocus().catch(() => {});
		}
		// 兜底：异步重读设置，若有变化再纠正（不阻塞显示）
		settingsStoreRef.current
			?.loadSettings()
			.then((fresh) => {
				if (fresh) {
					settingsRef.current = fresh;
					setSettings(fresh);
				}
			})
			.catch(() => {});
	}, [dockWindow]);

	const hideSidebar = useCallback(async () => {
		setOpen(false);
		// 并发隐藏复用同一次等待：否则第二次调用会提前 resolve 第一次的 Promise，
		// 让其 pasteToActiveWindow 在窗口实际隐藏前就执行
		if (hidePromiseRef.current) {
			return hidePromiseRef.current;
		}
		// 等待 ≥ CSS 过渡(0.24s) 完成再隐藏窗口；用可取消定时器，呼出时可打断
		const hidePromise = new Promise<void>((resolve) => {
			hideResolveRef.current = resolve;
			hideTimerRef.current = setTimeout(() => {
				hideTimerRef.current = undefined;
				hideResolveRef.current = null;
				hidePromiseRef.current = null;
				getCurrentWindow()
					.hide()
					.catch(() => {});
				resolve();
			}, 260);
		});
		hidePromiseRef.current = hidePromise;
		return hidePromise;
	}, []);

	const toggleSidebar = useCallback(async () => {
		if (openRef.current) {
			await hideSidebar();
		} else {
			await showSidebar();
		}
	}, [hideSidebar, showSidebar]);

	// ---- 初始化：store + 历史 + 监听 + 事件 ----
	useEffect(() => {
		let disposed = false;
		// 统一登记清理函数：注册完成前组件就卸载（disposed 已置位）时当场回收，
		// 修复「异步注册过程中卸载 → 剪贴板监听/事件监听器泄漏」
		const cleanups: (() => void)[] = [];
		const register = (cleanup: () => void) => {
			if (disposed) {
				try {
					cleanup();
				} catch {
					// ignore
				}
			} else {
				cleanups.push(cleanup);
			}
		};

		(async () => {
			const historyStore = new ClipboardHistoryStore();
			const settingsStore = new ZmengSettingsStore();
			await Promise.all([historyStore.init(), settingsStore.init()]);
			historyStoreRef.current = historyStore;
			settingsStoreRef.current = settingsStore;

			const loadedSettings = await settingsStore.loadSettings();
			const loadedItems = await historyStore.listAll();
			if (disposed) return;
			setSettings(loadedSettings);
			setItems(loadedItems);

			// 启动剪贴板监听
			const { startClipboardMonitor } = await import("./monitor");
			if (disposed) return;
			register(
				await startClipboardMonitor(async (item) => {
					const store = historyStoreRef.current;
					if (!store) return;

					// 去重：在整个历史中查找内容相同的记录（不只比最新一条）。
					// 同一次复制有时会触发两次事件（或重复复制同一内容），
					// 命中则把旧记录「置顶并更新时间」，而不是新增一条 —— 修复「记录两份」。
					const keyOf = (i: ClipboardHistoryItem): string =>
						i.dedupKey ?? buildDedupKey(i);
					const key = keyOf(item);
					// 基于引用同步计算下一状态；落盘等副作用放在 setState 更新器之外，
					// 避免 React 严格模式/并发渲染重放更新器时重复写盘
					const prev = itemsRef.current;
					const existing = prev.find((i) => keyOf(i) === key);
					if (existing) {
						const updated = { ...existing, createdAt: item.createdAt };
						const deduped = [
							updated,
							...prev.filter((i) => i.id !== updated.id),
						];
						itemsRef.current = deduped;
						setItems(deduped);
						store.set(updated.id, updated).catch(() => {});
					} else {
						const next = [item, ...prev];
						// 淘汰：超过上限删除最旧的非收藏项
						const max = settingsRef.current?.maxItems ?? 200;
						const removedIds: string[] = [];
						if (next.length > max) {
							for (let i = next.length - 1; i >= 0 && next.length > max; i--) {
								if (!next[i].favorite) {
									const removed = next.splice(i, 1)[0];
									removedIds.push(removed.id);
								}
							}
						}
						itemsRef.current = next;
						setItems(next);
						store.set(item.id, item).catch(() => {});
						for (const id of removedIds) {
							store.delete(id).catch(() => {});
						}
					}

					// 持久化本次变更；复制到新内容后自动收起侧栏（可在设置开启）
					store.save().catch(() => {});

					if (settingsRef.current?.autoHideOnCopy && openRef.current) {
						hideSidebar().catch(() => {});
					}
				}),
			);

			// 监听唤起/切换事件（来自全局快捷键 / 托盘）
			register(
				await listen("zmeng://toggle-sidebar", () => {
					toggleSidebar().catch(() => {});
				}),
			);
			register(
				await listen("zmeng://show-sidebar", () => {
					showSidebar().catch(() => {});
				}),
			);
			// 设置变更实时生效：主窗口改设置后 emit 此事件，侧栏重载并在打开时重排窗口
			register(
				await listen("zmeng://reload-settings", async () => {
					const fresh = await settingsStoreRef.current?.loadSettings();
					if (!fresh) return;
					settingsRef.current = fresh;
					setSettings(fresh);
					if (openRef.current) {
						try {
							await dockWindow(fresh.dockSide, fresh.sidebarWidth);
							await getCurrentWindow().setAlwaysOnTop(true);
						} catch {
							// 窗口操作失败不影响设置生效
						}
					}
				}),
			);
		})();

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				hideSidebar().catch(() => {});
			}
		};
		window.addEventListener("keydown", onKey);

		return () => {
			disposed = true;
			for (const cleanup of cleanups) {
				try {
					cleanup();
				} catch {
					// ignore
				}
			}
			window.removeEventListener("keydown", onKey);
		};
	}, [toggleSidebar, showSidebar, hideSidebar, dockWindow]);

	// 点击其他位置（窗口失焦）自动收拢：鼠标回到其他应用后侧栏自动滑走。
	// 侧栏呼出时会短暂获得焦点，用户点进其他应用对话框即触发失焦收起
	useEffect(() => {
		const un = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
			if (!focused && openRef.current && settingsRef.current?.autoHideOnBlur) {
				hideSidebar().catch(() => {});
			}
		});
		return () => {
			un.then((f) => f());
		};
	}, [hideSidebar]);

	// ---- 操作 ----
	// 粘贴路径统一收口：hideSidebar → pasteToActiveWindow →
	// 若「粘贴后自动收拢」关闭，则侧栏静默回弹到边缘待命（不抢焦点）
	const pasteWithSidebarControl = useCallback(async () => {
		await hideSidebar();
		try {
			await pasteToActiveWindow();
		} catch {
			message.warning("已复制（自动粘贴失败，可手动 Ctrl+V）");
		}
		if (settingsRef.current && !settingsRef.current.autoCollapseOnPaste) {
			await showSidebar({ silent: true });
		}
	}, [hideSidebar, showSidebar]);

	const activateItem = useCallback(
		async (item: ClipboardHistoryItem) => {
			try {
				await writeItemToClipboard(item);
				if (settingsRef.current?.pasteOnSelect) {
					await pasteWithSidebarControl();
				} else {
					message.success("已复制到剪贴板");
				}
			} catch {
				message.error("复制失败，请重试");
			}
		},
		[pasteWithSidebarControl],
	);

	const pasteText = useCallback(
		async (text: string) => {
			try {
				suppressClipboardCapture();
				invoke("clipboard_self_write_mark").catch(() => {});
				await writeText(text);
				await pasteWithSidebarControl();
			} catch {
				message.error("复制失败，请重试");
			}
		},
		[pasteWithSidebarControl],
	);

	const toggleFavorite = useCallback(async (item: ClipboardHistoryItem) => {
		try {
			const next = { ...item, favorite: !item.favorite };
			await historyStoreRef.current?.set(item.id, next);
			await historyStoreRef.current?.save();
			setItems((prev) => prev.map((i) => (i.id === item.id ? next : i)));
		} catch {
			message.error("收藏状态保存失败，请重试");
		}
	}, []);

	const deleteItem = useCallback(async (item: ClipboardHistoryItem) => {
		try {
			await historyStoreRef.current?.delete(item.id);
			await historyStoreRef.current?.save();
			setItems((prev) => prev.filter((i) => i.id !== item.id));
		} catch {
			message.error("删除失败，请重试");
		}
	}, []);

	// 显式「粘贴到当前应用」：写回剪贴板 → 隐藏侧栏 → 模拟 Ctrl+V 进入之前激活的窗口
	const pasteItem = useCallback(
		async (item: ClipboardHistoryItem) => {
			try {
				await writeItemToClipboard(item);
				await pasteWithSidebarControl();
			} catch {
				message.error("复制失败，请重试");
			}
		},
		[pasteWithSidebarControl],
	);

	// 仅复制到剪贴板（不粘贴）
	const copyItem = useCallback(async (item: ClipboardHistoryItem) => {
		try {
			await writeItemToClipboard(item);
			message.success("已复制到剪贴板");
		} catch {
			message.error("复制失败，请重试");
		}
	}, []);

	// 粘贴为纯文本（去掉格式）
	const pasteAsPlain = useCallback(
		async (item: ClipboardHistoryItem) => {
			try {
				suppressClipboardCapture();
				invoke("clipboard_self_write_mark").catch(() => {});
				await writeText(item.content ?? "");
				await pasteWithSidebarControl();
			} catch {
				message.error("复制失败，请重试");
			}
		},
		[pasteWithSidebarControl],
	);

	// 粘贴为格式文本（保留 HTML 富文本）
	const pasteAsFormatted = useCallback(
		async (item: ClipboardHistoryItem) => {
			try {
				suppressClipboardCapture();
				invoke("clipboard_self_write_mark").catch(() => {});
				if (item.html) {
					await writeHtmlAndText(item.html, item.content ?? "");
				} else {
					await writeText(item.content ?? "");
				}
				await pasteWithSidebarControl();
			} catch {
				message.error("复制失败，请重试");
			}
		},
		[pasteWithSidebarControl],
	);

	// 图片 / 文件用「系统级原生拖放」（拖入设计/聊天软件得到真实文件，不再泄漏 base64）；
	// 文本类继续走 HTML5 文本拖拽（拖进输入框）。
	const isNativeDraggable = useCallback(
		(item: ClipboardHistoryItem): boolean =>
			(item.type === "image" && !!item.image) ||
			(item.type === "files" && !!item.files?.length),
		[],
	);

	// 准备拖放载荷：把图片/截图落成真实 PNG、文件直接取路径；按 id 缓存避免重复落盘
	const getDragPayload = useCallback(
		async (item: ClipboardHistoryItem): Promise<DragPayload | null> => {
			const cache = dragPayloadCacheRef.current;
			const hit = cache.get(item.id);
			if (hit) return hit;
			let payload: DragPayload | null = null;
			try {
				if (item.type === "image" && item.image) {
					payload = await prepareDragImage(item.image);
				} else if (item.type === "files" && item.files?.length) {
					payload = await prepareDragFiles(item.files);
				}
			} catch {
				payload = null;
			}
			if (payload) cache.set(item.id, payload);
			return payload;
		},
		[],
	);

	// 全局监听：拖拽起点越过阈值即发起系统拖放；纯单击（未越阈值）交回 onClick 处理
	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			const st = dragStartRef.current;
			if (!st || st.started) return;
			if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
			st.started = true;
			dragGuardRef.current = true; // 抑制本次「单击粘贴」
			(async () => {
				try {
					const payload = await st.payload;
					if (payload?.files?.length) {
						await startDrag({
							item: payload.files,
							icon: payload.icon,
							mode: "copy",
						});
					}
				} catch {
					// 拖放失败（部分应用不接受 OLE 文件拖入）：回退为复制到剪贴板，
					// 用户在目标应用 Ctrl+V 即可，避免拖拽彻底无响应
					try {
						await writeItemToClipboard(st.item);
						message.info("该应用不支持拖入，内容已复制，可 Ctrl+V 粘贴");
					} catch {
						// 回退复制也失败则保持静默
					}
				} finally {
					dragStartRef.current = null;
				}
			})();
		};
		const onUp = () => {
			const st = dragStartRef.current;
			if (st && !st.started) dragStartRef.current = null;
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, []);

	// 拖拽：把文本内容写入拖拽数据，便于拖到其它输入框
	const onCardDragStart = useCallback(
		(e: React.DragEvent, item: ClipboardHistoryItem) => {
			const text =
				item.type === "files"
					? (item.files?.join("\n") ?? "")
					: (item.content ?? "");
			if (text) {
				e.dataTransfer.setData("text/plain", text);
				e.dataTransfer.effectAllowed = "copy";
			}
		},
		[],
	);

	// 右键菜单项
	const cardMenuItems = useCallback(
		(item: ClipboardHistoryItem): MenuProps["items"] => [
			{ key: "paste", label: "粘贴到当前应用", icon: <CopyOutlined /> },
			{ key: "copy", label: "仅复制", icon: <FileTextOutlined /> },
			// 文本类（文字/代码/颜色/富文本）均可选择「纯文本」或「格式文本」粘贴
			...(item.type !== "image" && item.type !== "files"
				? [
						{ type: "divider" as const },
						{
							key: "pastePlain",
							label: "粘贴为纯文本",
							icon: <FileTextOutlined />,
						},
						{
							key: "pasteFormatted",
							label: "粘贴为格式文本",
							icon: <SnippetsOutlined />,
						},
					]
				: []),
			{ type: "divider" },
			{ key: "ai", label: "AI 处理", icon: <RobotOutlined /> },
			{ key: "translate", label: "翻译", icon: <TranslationOutlined /> },
			...(item.type === "files" && item.files?.length
				? [
						{ type: "divider" as const },
						{
							key: "reveal",
							label: "打开文件位置",
							icon: <FolderOutlined />,
						},
					]
				: item.type === "image"
					? [
							{ type: "divider" as const },
							{
								key: "openFolder",
								label: "打开截图保存目录",
								icon: <FolderOutlined />,
							},
						]
					: []),
			{ type: "divider" },
			{
				key: "favorite",
				label: item.favorite ? "取消收藏" : "收藏",
				icon: item.favorite ? <PushpinFilled /> : <PushpinOutlined />,
			},
			{ key: "delete", label: "删除", icon: <DeleteOutlined />, danger: true },
		],
		[],
	);

	const openAi = useCallback((item: ClipboardHistoryItem, action?: string) => {
		// 图片项 → 进入「图片视觉」模式（交给支持视觉的模型分析内容/文字/风格/提示词等）
		if (item.type === "image" && item.image) {
			setAiImage(item.image);
			setAiInput("");
			setAiInitialAction(undefined);
			return;
		}
		const text = item.content ?? item.html ?? "";
		if (!text.trim()) {
			message.info("该记录没有可处理的内容");
			return;
		}
		setAiImage(null);
		setAiInput(text);
		setAiInitialAction(action);
	}, []);

	const onCardMenuClick = useCallback(
		(item: ClipboardHistoryItem, key: string) => {
			switch (key) {
				case "paste":
					pasteItem(item);
					break;
				case "copy":
					copyItem(item);
					break;
				case "pastePlain":
					pasteAsPlain(item);
					break;
				case "pasteFormatted":
					pasteAsFormatted(item);
					break;
				case "ai":
					openAi(item);
					break;
				case "translate":
					openAi(item, "translate");
					break;
				case "reveal":
					if (item.files?.[0]) {
						openPath(dirOfPath(item.files[0])).catch(() =>
							message.warning("无法打开文件位置"),
						);
					}
					break;
				case "openFolder":
					// 截图保存目录由主窗口解析后打开
					openImageSaveFolder();
					break;
				case "favorite":
					toggleFavorite(item);
					break;
				case "delete":
					deleteItem(item);
					break;
			}
		},
		[
			pasteItem,
			copyItem,
			pasteAsPlain,
			pasteAsFormatted,
			openAi,
			toggleFavorite,
			deleteItem,
		],
	);

	// ---- 过滤 ----
	// 搜索防抖：用 deferred value 驱动过滤，逐字输入时不阻塞渲染
	const deferredSearch = useDeferredValue(search);
	const filtered = useMemo(() => {
		const kw = deferredSearch.trim().toLowerCase();
		return items.filter((it) => {
			if (filter === "favorite" && !it.favorite) return false;
			if (filter !== "all" && filter !== "favorite" && it.type !== filter)
				return false;
			if (kw) {
				const hay = `${it.content ?? ""} ${it.sourceTitle ?? ""} ${
					it.files?.join(" ") ?? ""
				}`.toLowerCase();
				if (!hay.includes(kw)) return false;
			}
			return true;
		});
	}, [items, filter, deferredSearch]);

	const grouped = useMemo(() => {
		const groups: { label: string; items: ClipboardHistoryItem[] }[] = [];
		const map = new Map<string, ClipboardHistoryItem[]>();
		for (const it of filtered) {
			const g = dayGroup(it.createdAt);
			if (!map.has(g)) map.set(g, []);
			map.get(g)?.push(it);
		}
		for (const label of ["今天", "昨天", "更早"]) {
			if (map.has(label)) groups.push({ label, items: map.get(label) ?? [] });
		}
		return groups;
	}, [filtered]);

	const filterOptions = useMemo(
		() => [
			{ label: "全部", value: "all" },
			{ label: "文字", value: "text" },
			{ label: "图片", value: "image" },
			{ label: "代码", value: "code" },
			{ label: "颜色", value: "color" },
			{ label: "文件", value: "files" },
			{ label: "收藏", value: "favorite" },
		],
		[],
	);

	return (
		<div
			className={`zmeng-sidebar dock-${settings?.dockSide ?? "right"} ${
				open ? "open" : "closed"
			}`}
			style={
				{
					"--zmeng-sidebar-opacity": settings?.sidebarOpacity ?? 1,
				} as React.CSSProperties
			}
		>
			<div className="panel">
				{/* Header */}
				<div className="header">
					<div className="title">
						<span className="logo">Z</span>
						<div>
							<div className="title-main">ZMENG</div>
							<div className="title-sub">Smart Sidebar</div>
						</div>
					</div>
					<div className="header-actions">
						<Tooltip title="关闭">
							<Button
								type="text"
								icon={<CloseOutlined />}
								onClick={hideSidebar}
							/>
						</Tooltip>
					</div>
				</div>

				{/* Search */}
				<Input
					allowClear
					placeholder="搜索剪贴板…"
					prefix={<SearchOutlined />}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="search"
				/>

				{/* Filters */}
				<div className="filters">
					<Segmented
						size="small"
						value={filter}
						onChange={(v) => setFilter(v as FilterKey)}
						options={filterOptions}
					/>
				</div>

				{/* List */}
				<div className="list" ref={listRef}>
					{grouped.length === 0 ? (
						<Empty
							description="暂无记录，复制点东西试试"
							style={{ marginTop: 60, opacity: 0.6 }}
						/>
					) : (
						grouped.map((group) => (
							<div key={group.label}>
								<div className="group-label">{group.label}</div>
								{group.items.map((item) => {
									const meta = TYPE_META[item.type];
									return (
										<Dropdown
											key={item.id}
											trigger={["contextMenu"]}
											menu={{
												items: cardMenuItems(item),
												onClick: ({ key, domEvent }) => {
													domEvent.stopPropagation();
													onCardMenuClick(item, key);
												},
											}}
										>
											<div
												className="card"
												// 文本类走 HTML5 文本拖拽；图片/文件走系统级原生拖放（onMouseDown 登记，越阈值发起），
												// 故关掉它们的 HTML5 draggable，避免浏览器把 base64/路径当文本丢出去产生乱码。
												draggable={
													item.type !== "image" && item.type !== "files"
												}
												onMouseDown={(e) => {
													if (e.button !== 0) return;
													dragGuardRef.current = false;
													mouseDownPosRef.current = {
														x: e.clientX,
														y: e.clientY,
													};
													// 图片/文件：预备落盘载荷并登记拖拽起点，等待越过阈值再发起原生拖放
													dragStartRef.current = isNativeDraggable(item)
														? {
																x: e.clientX,
																y: e.clientY,
																item,
																payload: getDragPayload(item),
																started: false,
															}
														: null;
												}}
												onDragStart={(e) => {
													dragGuardRef.current = true;
													onCardDragStart(e, item);
												}}
												onClick={(e) => {
													// 拖拽或明显移动时，不触发「单击粘贴」，避免误把历史粘进当前文档
													if (dragGuardRef.current) {
														dragGuardRef.current = false;
														return;
													}
													const p = mouseDownPosRef.current;
													if (
														p &&
														Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6
													) {
														return;
													}
													activateItem(item);
												}}
												title={
													item.favorite
														? "单击粘贴 · 右键更多 · ★已收藏"
														: "单击粘贴 · 右键更多"
												}
											>
												<div
													className="card-left"
													style={{ color: meta.color }}
												>
													<span className="card-icon">{meta.icon}</span>
													<span className="card-type">{meta.label}</span>
												</div>
												<div className="card-right">
													<div className="card-head">
														{item.favorite && (
															<PushpinFilled className="card-fav" />
														)}
														<span className="card-time">
															{timeLabel(item.createdAt)}
														</span>
													</div>
													{item.type === "image" && item.image ? (
														<img
															className="card-image"
															src={item.image}
															alt="clipboard"
															loading="lazy"
															decoding="async"
															draggable={false}
														/>
													) : item.type === "color" && item.content ? (
														<div className="card-color">
															<span
																className="swatch"
																style={{ background: item.content.trim() }}
															/>
															<span className="card-text">{item.content}</span>
														</div>
													) : item.type === "files" && item.files ? (
														<div className="card-files">
															{item.filePreview && (
																<img
																	className="card-image"
																	src={item.filePreview}
																	alt="file preview"
																	loading="lazy"
																	decoding="async"
																	draggable={false}
																/>
															)}
															<div className="card-text">
																{item.files.join("\n")}
															</div>
														</div>
													) : (
														<div className="card-text">{item.content}</div>
													)}
													{item.sourceTitle && (
														<div className="card-source">
															{item.sourceTitle}
														</div>
													)}
												</div>
											</div>
										</Dropdown>
									);
								})}
							</div>
						))
					)}
				</div>

				{/* Bottom toolbar */}
				<div className="toolbar">
					<Tooltip title="回到顶部">
						<Button
							type="text"
							icon={<VerticalAlignTopOutlined />}
							onClick={() =>
								listRef.current?.scrollTo({ top: 0, behavior: "smooth" })
							}
						/>
					</Tooltip>
					<Tooltip title="截图">
						<Button
							type="text"
							icon={<CameraOutlined />}
							onClick={() => executeScreenshot()}
						/>
					</Tooltip>
					<Tooltip title="截图 OCR">
						<Button
							type="text"
							icon={<ScanOutlined />}
							onClick={() => executeScreenshot(ScreenshotType.OcrDetect)}
						/>
					</Tooltip>
					<Tooltip title="截图翻译">
						<Button
							type="text"
							icon={<TranslationOutlined />}
							onClick={() => executeScreenshot(ScreenshotType.OcrTranslate)}
						/>
					</Tooltip>
					<div className="toolbar-status">
						<span className="dot" /> 就绪 · {items.length} 条
					</div>
				</div>
			</div>

			{aiInput !== null && (
				<AiPanel
					key={aiImage ?? aiInput}
					open={aiInput !== null}
					onClose={() => {
						setAiInput(null);
						setAiImage(null);
					}}
					input={aiInput}
					image={aiImage}
					backends={chatBackends}
					defaultTranslateModel={defaultTranslateModel}
					defaultAiModel={defaultAiModel}
					defaultVisionModel={defaultVisionModel}
					translateTargetLang={settings?.translateTargetLang ?? "中文"}
					initialAction={aiInitialAction}
					onPaste={pasteText}
				/>
			)}

			<style>{`
				.zmeng-sidebar {
					width: 100vw;
					height: 100vh;
					overflow: hidden;
					background: transparent;
				}
				.zmeng-sidebar .panel {
					width: 100%;
					height: 100%;
					display: flex;
					flex-direction: column;
					background: var(--zmeng-bg, #171a21);
					color: var(--zmeng-text, #e6e9ef);
					box-shadow: 0 0 24px rgba(0,0,0,0.28);
					opacity: var(--zmeng-sidebar-opacity, 1);
					transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
				}
				.zmeng-sidebar.dock-right .panel { transform: translateX(100%); }
				.zmeng-sidebar.dock-left .panel { transform: translateX(-100%); }
				.zmeng-sidebar.open .panel { transform: translateX(0); }
				.zmeng-sidebar .header {
					display: flex; align-items: center; justify-content: space-between;
					padding: 14px 16px 6px;
				}
				.zmeng-sidebar .title { display: flex; align-items: center; gap: 10px; }
				.zmeng-sidebar .logo {
					width: 34px; height: 34px; border-radius: 9px;
					background: var(--zmeng-primary, #0ea5e9);
					display: flex; align-items: center; justify-content: center;
					font-weight: 800; color: #fff; font-size: 18px;
				}
				.zmeng-sidebar .title-main { font-weight: 700; font-size: 16px; line-height: 1.1; }
				.zmeng-sidebar .title-sub { font-size: 11px; opacity: 0.55; }
				.zmeng-sidebar .header-actions .ant-btn { color: var(--zmeng-text-secondary, #c4cad6); }
				.zmeng-sidebar .search { margin: 6px 16px 8px; width: calc(100% - 32px); }
				.zmeng-sidebar .filters { padding: 0 12px 8px; overflow-x: auto; }
					/* 横向滚动条随主题着色，替换系统默认黑色带箭头的经典滚动条 */
					.zmeng-sidebar .filters::-webkit-scrollbar { height: 8px; }
					.zmeng-sidebar .filters::-webkit-scrollbar-track { background: transparent; }
					.zmeng-sidebar .filters::-webkit-scrollbar-thumb {
						background: var(--zmeng-border, rgba(255,255,255,0.18));
						border-radius: 4px;
						border: 2px solid transparent;
						background-clip: padding-box;
					}
					.zmeng-sidebar .filters::-webkit-scrollbar-thumb:hover {
						background: var(--zmeng-primary, rgba(255,255,255,0.32));
						background-clip: padding-box;
					}
				.zmeng-sidebar .list { flex: 1; overflow-y: auto; padding: 4px 12px 12px; }
				.zmeng-sidebar .list::-webkit-scrollbar { width: 8px; }
				.zmeng-sidebar .list::-webkit-scrollbar-track { background: transparent; }
				.zmeng-sidebar .list::-webkit-scrollbar-thumb {
					background: var(--zmeng-border, rgba(255,255,255,0.18));
					border-radius: 4px;
					border: 2px solid transparent;
					background-clip: padding-box;
				}
				.zmeng-sidebar .list::-webkit-scrollbar-thumb:hover {
					background: var(--zmeng-primary, rgba(255,255,255,0.32));
					background-clip: padding-box;
				}
				.zmeng-sidebar .group-label {
					font-size: 12px; opacity: 0.5; margin: 12px 4px 6px;
				}
				.zmeng-sidebar .card {
					display: flex; gap: 10px; padding: 10px;
					background: var(--zmeng-surface, #1f242d); border: 1px solid var(--zmeng-border, rgba(255,255,255,0.05));
					border-radius: 12px; margin-bottom: 10px; cursor: pointer;
					transition: border-color 0.15s, background 0.15s, transform 0.15s;
					/* 拖拽图片/文件时不选中卡片文字 */
					user-select: none; -webkit-user-select: none;
				}
				.zmeng-sidebar .card-files { display: flex; flex-direction: column; gap: 6px; }
				.zmeng-sidebar .card:hover {
					border-color: var(--zmeng-primary, #0ea5e9); background: var(--zmeng-surface-hover, #232934);
				}
				.zmeng-sidebar .card-left {
					display: flex; flex-direction: column; align-items: center;
					gap: 4px; min-width: 46px; padding-top: 2px;
				}
				.zmeng-sidebar .card-icon {
					width: 34px; height: 34px; border-radius: 9px;
					display: flex; align-items: center; justify-content: center;
					background: var(--zmeng-primary-soft, rgba(255,255,255,0.05)); font-size: 16px;
				}
				.zmeng-sidebar .card-type { font-size: 11px; opacity: 0.8; }
				.zmeng-sidebar .card-right { flex: 1; min-width: 0; }
				.zmeng-sidebar .card-head {
					display: flex; justify-content: flex-end; align-items: center;
					gap: 6px; font-size: 11px; opacity: 0.55;
				}
				.zmeng-sidebar .card-fav { color: #f0b429; font-size: 12px; }
				.zmeng-sidebar .card-text {
					font-size: 13px; line-height: 1.5; white-space: pre-wrap;
					word-break: break-word; max-height: 66px; overflow: hidden;
					display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
				}
				.zmeng-sidebar .card-image {
					max-width: 100%; max-height: 120px; border-radius: 8px; object-fit: contain;
				}
				.zmeng-sidebar .card-color { display: flex; align-items: center; gap: 8px; }
				.zmeng-sidebar .swatch {
					width: 22px; height: 22px; border-radius: 6px;
					border: 1px solid var(--zmeng-border, rgba(255,255,255,0.2));
				}
				.zmeng-sidebar .card-source {
					margin-top: 6px; font-size: 11px; opacity: 0.5;
				}
				.zmeng-sidebar .card-actions {
					display: flex; gap: 2px; margin-top: 6px; opacity: 0;
					transition: opacity 0.15s;
				}
				.zmeng-sidebar .card:hover .card-actions { opacity: 1; }
				.zmeng-sidebar .card-actions .ant-btn { color: var(--zmeng-text-secondary, #aeb6c4); }
				.zmeng-sidebar .toolbar {
					display: flex; align-items: center; gap: 4px;
					padding: 8px 14px; border-top: 1px solid var(--zmeng-border, rgba(255,255,255,0.06));
				}
				.zmeng-sidebar .toolbar .ant-btn { color: var(--zmeng-primary, #f0663f); font-size: 17px; }
				.zmeng-sidebar .toolbar-status {
					margin-left: auto; font-size: 12px; opacity: 0.55;
					display: flex; align-items: center; gap: 6px;
				}
				.zmeng-sidebar .toolbar-status .dot {
					width: 8px; height: 8px; border-radius: 50%; background: #3fcf6a;
				}
			`}</style>
		</div>
	);
};
