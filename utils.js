// 【关键修复】用ST根目录的绝对路径导入，确保不会404
import { extension_settings, getContext, saveSettingsDebounced } from "../../../extensions.js";
import { extensionName, defaultSettings, globalState } from "./config.js";

// 获取ST全局上下文
export const getSTContext = () => getContext();

// 获取扩展当前设置（自动补全默认值）
export const getExtensionSettings = () => {
  try {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    for (const key of Object.keys(defaultSettings)) {
      if (!Object.hasOwn(extension_settings[extensionName], key)) {
        extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
      }
    }
    return extension_settings[extensionName];
  } catch (error) {
    console.error(`[${extensionName}] 获取设置失败:`, error);
    return structuredClone(defaultSettings);
  }
};

// 保存扩展设置
export const saveExtensionSettings = () => {
  try {
    saveSettingsDebounced();
  } catch (error) {
    console.error(`[${extensionName}] 保存设置失败:`, error);
  }
};

// 命令模板变量替换
export const renderCommandTemplate = (template, charName, chapterContent) => {
  return template
    .replace(/{{char}}/g, charName || '角色')
    .replace(/{{pipe}}/g, `"${chapterContent.replace(/"/g, '\\"').replace(/\|/g, '\\|')}"`);
};

// 进度条更新
export const updateProgress = (progressId, statusId, current, total, textPrefix = "进度") => {
  const $progressEl = $(`#${progressId}`);
  const $statusEl = $(`#${statusId}`);

  if (total === 0) {
    $progressEl.css('width', '0%');
    $statusEl.text('');
    return;
  }

  const percent = Math.floor((current / total) * 100);
  $progressEl.css('width', `${percent}%`);
  $statusEl.text(`${textPrefix}: ${current}/${total} (${percent}%)`);
};

// 获取选中的章节
export const getSelectedChapters = () => {
  const { currentParsedChapters } = globalState;
  const checkedInputs = document.querySelectorAll('.chapter-select:checked');
  const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
  return selectedIndexes.map(index => currentParsedChapters.find(item => item.id === index)).filter(Boolean);
};

// Toast提示封装
export const showToast = (message, type = "info", title = "小说续写器") => {
  try {
    toastr[type](message, title);
  } catch (error) {
    console.log(`[${title}] ${message}`);
  }
};
