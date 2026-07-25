use dashmap::{DashMap, DashSet};
use std::{fs, path::PathBuf, sync::RwLock};
use tauri::Manager;

/**
 * 配置文件每个窗口同步时都会读取一次
 * 通过统一读取提速
 */
pub struct FileCacheService {
    file_cache: DashMap<PathBuf, String>,
    exists_path_cache: DashSet<PathBuf>,
    env_path_cache: DashMap<String, PathBuf>,
    is_portable: RwLock<Option<bool>>,
}

const APP_CONFIG_DIR: &str = "app_config_dir";
const APP_CONFIG_BASE_DIR: &str = "app_config_base_dir";
const APP_CONFIG_DIR_NAME: &str = "configs";
const APP_CUSTOM_CONFIG_DIR_DATA_FILE_NAME: &str = "__custom_config_dir";
#[cfg(target_os = "windows")]
const APP_PORTABLE_DIR_DATA_FILE_NAME: &str = "__portable";

/// 递归复制目录：目标已存在的同名文件会被跳过（保留目标数据），用于切换数据目录时的迁移与合并。
fn copy_dir_skip_existing(
    src: &std::path::Path,
    dst: &std::path::Path,
) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_skip_existing(&from, &to)?;
        } else if !to.exists() {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

impl FileCacheService {
    pub fn new() -> Self {
        Self {
            file_cache: DashMap::new(),
            exists_path_cache: DashSet::new(),
            env_path_cache: DashMap::new(),
            is_portable: RwLock::new(None),
        }
    }

    pub fn is_portable_app(&self) -> bool {
        if let Ok(is_portable) = self.is_portable.read() {
            if let Some(is_portable) = is_portable.as_ref() {
                return *is_portable;
            }
        }

        let is_portable = self.get_app_portable_config_dir().is_some();
        if let Ok(mut guard) = self.is_portable.write() {
            *guard = Some(is_portable);
        }
        is_portable
    }

    fn get_app_global_config_dir(&self, app: &tauri::AppHandle) -> Result<PathBuf, String> {
        Ok(app
            .path()
            .app_config_dir()
            .map_err(|e| e.to_string())?
            .join(APP_CONFIG_DIR_NAME))
    }

    /// 获取便携版配置目录
    fn get_app_portable_config_dir(&self) -> Option<PathBuf> {
        #[cfg(not(target_os = "windows"))]
        {
            return None;
        }

        // 判断是否是便携版
        #[cfg(target_os = "windows")]
        {
            // 获取应用程序所在目录
            use std::env;
            let exe_path = match env::current_exe() {
                Ok(path) => path,
                Err(_) => return None,
            };

            let exe_dir_path = match exe_path.parent() {
                Some(path) => path,
                None => return None,
            };

            let portable_config_file_path = exe_dir_path.join(APP_PORTABLE_DIR_DATA_FILE_NAME);
            if portable_config_file_path.exists() {
                return Some(exe_dir_path.to_path_buf().join(APP_CONFIG_DIR_NAME));
            } else {
                return None;
            }
        }
    }

    fn get_app_custom_config_dir(&self, app: &tauri::AppHandle) -> Option<PathBuf> {
        let app_data_config_dir = match app.path().app_config_dir() {
            Ok(path) => path,
            Err(_) => return None,
        };

        let custom_config_dir_data_file =
            app_data_config_dir.join(APP_CUSTOM_CONFIG_DIR_DATA_FILE_NAME);

        let path = match fs::read_to_string(custom_config_dir_data_file) {
            Ok(path) => path,
            Err(_) => return None,
        };
        let path = PathBuf::from(path);

        if !path.exists() {
            return None;
        }

        Some(path.join(APP_CONFIG_DIR_NAME))
    }

    pub fn create_custom_config_dir(
        &self,
        app: &tauri::AppHandle,
        path: PathBuf,
    ) -> Result<(), String> {
        let target_config_dir = path.join(APP_CONFIG_DIR_NAME);

        if !target_config_dir.exists() {
            fs::create_dir_all(&target_config_dir).map_err(|e| e.to_string())?;
        }

        // 数据迁移：把当前配置基目录下的数据复制到新目录。
        // 目标已存在的同名文件保留目标（不覆盖）——这样不同版本指向同一文件夹时，数据会汇合而非互相覆盖。
        if let Ok(current_base) = self.get_app_config_base_dir(app) {
            if current_base != path {
                for sub in [
                    APP_CONFIG_DIR_NAME, // configs
                    "stores",
                    "captureHistoryImages",
                    "plugins",
                    "pluginsDownloads",
                ] {
                    let from = current_base.join(sub);
                    if from.is_dir() {
                        // 迁移尽力而为，单个目录失败不阻断整体设置
                        let _ = copy_dir_skip_existing(&from, &path.join(sub));
                    }
                }
            }
        }

        let path_str = match path.to_str() {
            Some(path) => path,
            None => return Err(String::from("[create_custom_config_dir] Invalid path")),
        };

        // 写入标记文件记录自定义目录。便携版下 %APPDATA%\com.zmeng.app 可能不存在，
        // 先确保父目录存在，否则 fs::write 会报「系统找不到指定的路径」。
        let app_data_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        if !app_data_config_dir.exists() {
            fs::create_dir_all(&app_data_config_dir).map_err(|e| e.to_string())?;
        }

        let custom_config_dir_data_file =
            app_data_config_dir.join(APP_CUSTOM_CONFIG_DIR_DATA_FILE_NAME);

        fs::write(custom_config_dir_data_file, path_str.as_bytes()).map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn get_app_config_dir(&self, app: &tauri::AppHandle) -> Result<PathBuf, String> {
        if let Some(path) = self.env_path_cache.get(APP_CONFIG_DIR) {
            return Ok(path.clone());
        }

        let local_config_dir = match self.get_app_custom_config_dir(app) {
            Some(path) => {
                if path.exists() {
                    Some(path)
                } else {
                    None
                }
            }
            None => None,
        };

        let path = match local_config_dir {
            Some(path) => path,
            None => self
                .get_app_portable_config_dir()
                .unwrap_or(self.get_app_global_config_dir(app)?),
        };

        self.env_path_cache
            .insert(APP_CONFIG_DIR.to_string(), path.clone());

        Ok(path)
    }

    pub fn get_app_config_base_dir(&self, app: &tauri::AppHandle) -> Result<PathBuf, String> {
        if let Some(path) = self.env_path_cache.get(APP_CONFIG_BASE_DIR) {
            return Ok(path.clone());
        }

        let path = self.get_app_config_dir(app)?;
        let path = path
            .parent()
            .ok_or_else(|| "[get_app_config_base_dir] config dir has no parent".to_string())?
            .to_path_buf();

        self.env_path_cache
            .insert(APP_CONFIG_BASE_DIR.to_string(), path.clone());

        Ok(path)
    }

    pub fn create_dir(&self, dir_path: PathBuf) -> Result<(), String> {
        if self.exists_path_cache.contains(&dir_path) {
            return Ok(());
        }

        let exists = match fs::exists(dir_path.clone()) {
            Ok(exists) => exists,
            Err(e) => {
                log::warn!(
                    "[TextFileCacheService] check dir exists failed: [{}] {}",
                    dir_path.display(),
                    e.to_string()
                );
                false
            }
        };

        if !exists {
            if let Err(e) = fs::create_dir_all(dir_path.clone()) {
                return Err(format!(
                    "[TextFileCacheService] create dir failed: [{}] {}",
                    dir_path.display(),
                    e.to_string()
                ));
            }
        }

        self.exists_path_cache.insert(dir_path);

        Ok(())
    }

    pub fn read(&self, file_path: PathBuf) -> Result<String, String> {
        if let Some(content) = self.file_cache.get(&file_path) {
            return Ok(content.clone());
        }

        // 文件读写不返回异常，提高稳定性
        let content = match fs::read_to_string(file_path.clone()) {
            Ok(content) => content,
            Err(e) => {
                log::error!(
                    "[TextFileCacheService] read failed: [{}] {}",
                    file_path.display(),
                    e.to_string()
                );

                "".to_string()
            }
        };

        Ok(content)
    }

    pub fn write(&self, file_path: PathBuf, content: String) -> Result<(), String> {
        // 文件读写不返回异常，提高稳定性
        if let Err(e) = fs::write(file_path.clone(), content.clone()) {
            log::error!(
                "[TextFileCacheService] write file failed: [{}] {}",
                file_path.display(),
                e.to_string()
            );
        };

        self.file_cache.insert(file_path, content.clone());

        Ok(())
    }

    pub fn clear(&self) {
        self.file_cache.clear();
    }
}
