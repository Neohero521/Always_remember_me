// 【关键修复】用ST原生全局导入，避免路径错误
import { extension_settings, getContext, saveSettingsDebounced } from "../../../extensions.js";
import { extensionName, defaultSettings } from "./config.js";

// 获取ST全局上下文
export const getSTContext = () => getContext();

// 获取扩展设置
export const getExtensionSettings = () => {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  for (const key of Object.keys(defaultSettings)) {
    if (!Object.hasOwn(extension_settings[extensionName], key)) {
      extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
    }
  }
  return extension_settings[extensionName];
};

// 保存设置
export const saveExtensionSettings = () => saveSettingsDebounced();

// 命令模板渲染
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

// 获取选中章节
export const getSelectedChapters = (chapterList) => {
  const checkedInputs = document.querySelectorAll('.chapter-select:checked');
  const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
  return selectedIndexes.map(index => chapterList.find(item => item.id === index)).filter(Boolean);
};

// Toast提示
export const showToast = (message, type = "info", title = "小说续写器") => {
  toastr[type](message, title);
};
