import { defaultConfig, STORAGE_KEY } from './config.js';
import { toast } from './toast.js';

export const getPluginSettings = async () => {
  try {
    const storedSettings = await window.getSettings(STORAGE_KEY);
    return { ...defaultConfig, ...storedSettings };
  } catch (error) {
    console.error('获取插件设置失败', error);
    return defaultConfig;
  }
};

export const savePluginSettings = async (settings) => {
  try {
    await window.saveSettings(STORAGE_KEY, settings);
    toast.success('设置保存成功');
    return true;
  } catch (error) {
    console.error('保存插件设置失败', error);
    toast.error('设置保存失败');
    return false;
  }
};

export const readTextFile = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('无效的文件'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('文件读取失败'));
    reader.readAsText(file, 'utf-8');
  });
};

export const splitNovelChapters = (content, splitRegex) => {
  if (!content || !splitRegex) return [];
  try {
    const regex = new RegExp(splitRegex, 'gm');
    const matches = [...content.matchAll(regex)];
    const chapters = [];

    if (matches.length === 0) {
      chapters.push({ title: '全文', content: content.trim() });
      return chapters;
    }

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const startIndex = match.index;
      const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
      const chapterContent = content.slice(startIndex, endIndex).trim();
      const title = match[0].trim();
      chapters.push({ title, content: chapterContent });
    }
    return chapters;
  } catch (error) {
    console.error('章节拆分失败', error);
    toast.error('章节拆分失败，请检查正则表达式');
    return [];
  }
};

export const renderTemplate = (template, variables) => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
};

export const insertToInputBox = (content) => {
  try {
    const inputBox = document.getElementById('send_textarea');
    if (!inputBox) throw new Error('未找到输入框');

    const start = inputBox.selectionStart;
    const end = inputBox.selectionEnd;
    inputBox.value = inputBox.value.substring(0, start) + content + inputBox.value.substring(end);
    inputBox.selectionStart = inputBox.selectionEnd = start + content.length;
    inputBox.focus();
    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  } catch (error) {
    console.error('插入内容到输入框失败', error);
    toast.error('插入内容到输入框失败');
    return false;
  }
};

export const executeSlashCommand = (command) => {
  try {
    return window.executeSlashCommand(command);
  } catch (error) {
    console.error('执行斜杠命令失败', error);
    toast.error('执行斜杠命令失败');
    return false;
  }
};

export const getCurrentCharName = () => {
  try {
    return window.currentCharacter?.name || '';
  } catch (error) {
    console.error('获取当前角色名称失败', error);
    return '';
  }
};
