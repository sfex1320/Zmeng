import { join as joinPath, pictureDir, videoDir } from "@tauri-apps/api/path";
import * as dialog from "@tauri-apps/plugin-dialog";
import dayjs from "dayjs";
import { createDir } from "@/commands/file";
import { getAppConfigBaseDirWithCache } from "@/utils/environment";
import { type AppSettingsData, AppSettingsGroup } from "@/types/appSettings";
import { ImageFormat, type ImagePath } from "@/types/utils/file";

const parseTemplate = (template: string): string => {
	const regex = /\{\{([^}]+)\}\}/g;

	return template.replace(regex, (match, content) => {
		if (content.match(/^[YMDHmsAa\-_:\s/.]+$/)) {
			return dayjs().format(content);
		}
		return match;
	});
};

/**
 * 生成图片文件名
 * @param format 格式模板，例如 "ZMENG_{YYYY-MM-DD_HH-mm-ss}"
 * @returns 生成的文件名
 */
export const generateImageFileName = (format: string) => {
	if (!format) {
		return "";
	}

	return parseTemplate(format);
};

export const joinImagePath = (filePath: string, imageFormat: ImageFormat) => {
	let fileExtension = "png";
	switch (imageFormat) {
		case ImageFormat.JPEG:
			fileExtension = "jpg";
			break;
		case ImageFormat.WEBP:
			fileExtension = "webp";
			break;
		case ImageFormat.AVIF:
			fileExtension = "avif";
			break;
		case ImageFormat.JPEG_XL:
			fileExtension = "jxl";
			break;
		case ImageFormat.PNG:
			fileExtension = "png";
			break;
	}

	return `${filePath}.${fileExtension}`;
};

export const getImageFormat = (filePath: string) => {
	let imageFormat = ImageFormat.PNG;
	if (filePath.endsWith(".jpg")) {
		imageFormat = ImageFormat.JPEG;
	} else if (filePath.endsWith(".webp")) {
		imageFormat = ImageFormat.WEBP;
	} else if (filePath.endsWith(".avif")) {
		imageFormat = ImageFormat.AVIF;
	} else if (filePath.endsWith(".jxl")) {
		imageFormat = ImageFormat.JPEG_XL;
	}

	return imageFormat;
};

export const getImageSaveDirectory = async (appSettings: AppSettingsData) => {
	let savePath =
		appSettings[AppSettingsGroup.FunctionScreenshot].saveFileDirectory;

	if (!savePath) {
		// 未自定义时默认存到「数据文件夹/截图」（如 D:\剪贴板数据\截图），
		// 与剪贴板历史同处一地，避免用户在数据目录找不到截图
		try {
			const baseDir = await getAppConfigBaseDirWithCache();
			if (baseDir) {
				savePath = await joinPath(baseDir, "截图");
			}
		} catch {
			// 数据目录不可用时回退到图片库
		}
		if (!savePath) {
			savePath = await joinPath(await pictureDir(), "ZMENG");
		}
	}
	// 按当天日期子文件夹存放（YYYY-MM-DD），避免一个目录堆满所有文件
	try {
		savePath = await joinPath(savePath, dayjs().format("YYYY-MM-DD"));
	} catch {
		// joinPath 失败时维持原目录
	}

	return savePath;
};

export const getImagePathFromSettings = async (
	appSettings: AppSettingsData | undefined,
	method: "auto" | "fast" | "focused-window" | "full-screen",
): Promise<ImagePath | undefined> => {
	if (!appSettings) {
		return undefined;
	}

	const screenshotSettings = appSettings[AppSettingsGroup.FunctionScreenshot];
	const outputSettings = appSettings[AppSettingsGroup.FunctionOutput];

	if (!screenshotSettings || !outputSettings) {
		return undefined;
	}

	let fileName = "";
	switch (method) {
		case "auto":
			fileName = generateImageFileName(outputSettings.autoSaveFileNameFormat);
			break;
		case "fast":
			fileName = generateImageFileName(outputSettings.fastSaveFileNameFormat);
			break;
		case "focused-window":
			fileName = generateImageFileName(
				outputSettings.focusedWindowFileNameFormat,
			);
			break;
		case "full-screen":
			fileName = generateImageFileName(outputSettings.fullScreenFileNameFormat);
			break;
	}

	const saveDirectory = await getImageSaveDirectory(appSettings);
	await createDir(saveDirectory);

	return {
		filePath: joinImagePath(
			await joinPath(saveDirectory, fileName),
			screenshotSettings.saveFileFormat,
		),
		imageFormat: screenshotSettings.saveFileFormat,
	};
};

export const showImageDialog = async (
	appSettings: AppSettingsData,
	prevFormat?: ImageFormat,
): Promise<ImagePath | undefined> => {
	let firstFilter: { name: string; extensions: string[] };
	switch (prevFormat) {
		case ImageFormat.JPEG:
			firstFilter = {
				name: "JPEG(*.jpg)",
				extensions: ["jpg"],
			};
			break;
		case ImageFormat.WEBP:
			firstFilter = {
				name: "WebP(*.webp)",
				extensions: ["webp"],
			};
			break;
		case ImageFormat.AVIF:
			firstFilter = {
				name: "AVIF(*.avif)",
				extensions: ["avif"],
			};
			break;
		case ImageFormat.JPEG_XL:
			firstFilter = {
				name: "JPEG XL(*.jxl)",
				extensions: ["jxl"],
			};
			break;
		default:
			firstFilter = {
				name: "PNG(*.png)",
				extensions: ["png"],
			};
			break;
	}

	const filePath = await dialog.save({
		filters: [
			firstFilter,
			{
				name: "PNG(*.png)",
				extensions: ["png"],
			},
			{
				name: "JPEG(*.jpg)",
				extensions: ["jpg"],
			},
			{
				name: "WebP(*.webp)",
				extensions: ["webp"],
			},
			{
				name: "AVIF(*.avif)",
				extensions: ["avif"],
			},
			{
				name: "JPEG XL(*.jxl)",
				extensions: ["jxl"],
			},
		],
		defaultPath: generateImageFileName(
			appSettings[AppSettingsGroup.FunctionOutput].manualSaveFileNameFormat,
		),
		canCreateDirectories: true,
	});

	if (!filePath) {
		return;
	}

	return {
		filePath,
		imageFormat: getImageFormat(filePath),
	};
};

export const getVideoRecordSaveDirectory = async (
	appSettings: AppSettingsData,
) => {
	let savePath =
		appSettings[AppSettingsGroup.FunctionVideoRecord].saveDirectory;

	if (!savePath) {
		// 与截图一致：默认存到「数据文件夹/录屏」，方便用户统一查找
		try {
			const baseDir = await getAppConfigBaseDirWithCache();
			if (baseDir) {
				savePath = await joinPath(baseDir, "录屏");
			}
		} catch {
			// 数据目录不可用时回退到视频库
		}
		if (!savePath) {
			savePath = await joinPath(await videoDir(), "ZMENG");
		}
	}
	// 与截图一致：按当天日期子文件夹存放
	try {
		savePath = await joinPath(savePath, dayjs().format("YYYY-MM-DD"));
	} catch {
		// joinPath 失败时维持原目录
	}

	return savePath;
};
