import { pluginName, STORAGE_KEY, defaultConfig } from './config.js';
import { toast } from './toast.js';
import { getPluginSettings } from './utils.js';
import { initNovelImport } from './novel-import.js';

export const registerSettings = async () => {
  try {
    window.registerSettings(STORAGE_KEY, {
      name: '小说续写助手',
      settings: [
        {
          id: 'defaultCommandTemplate',
          name: '默认斜杠命令模板',
          description: '发送章节时使用的斜杠命令模板，支持{{char}}、{{pipe}}变量',
          type: 'string',
          default: defaultConfig.defaultCommandTemplate
        },
        {
          id: 'chapterSplitRegex',
          name: '章节拆分正则表达式',
          description: '用于匹配小说章节标题的正则表达式',
          type: 'string',
          default: defaultConfig.chapterSplitRegex
        },
        {
          id: 'autoTrimContent',
          name: '自动去除内容首尾空白',
          description: '是否自动去除章节内容首尾的空白字符',
          type: 'boolean',
          default: defaultConfig.autoTrimContent
        },
        {
          id: 'maxFileSize',
          name: '最大导入文件大小(MB)',
          description: '允许导入的小说文件最大大小',
          type: 'number',
          default: defaultConfig.maxFileSize,
          min: 1,
          max: 100
        }
      ]
    });
    console.log(`[${pluginName}] 设置注册成功`);
  } catch (error) {
    console.error(`[${pluginName}] 设置注册失败`, error);
  }
};

export const registerCommands = async () => {
  try {
    window.registerSlashCommand({
      name: 'import-novel',
      description: '打开小说导入面板',
      handler: async () => {
        document.getElementById('select-novel-file-btn')?.click();
      }
    });

    window.registerSlashCommand({
      name: 'send-chapter',
      description: '发送指定章节到对话框，参数：章节序号（如 /send-chapter 1）',
      handler: async (args) => {
        const { importedChapters } = require('./novel-import.js');
        const { sendChapterToDialog } = require('./novel-import.js');
        const chapterIndex = parseInt(args[0]) - 1;
        const chapter = importedChapters[chapterIndex];
        if (!chapter) {
          toast.error('章节不存在');
          return;
        }
        await sendChapterToDialog(chapter.content);
      }
    });
    console.log(`[${pluginName}] 命令注册成功`);
  } catch (error) {
    console.error(`[${pluginName}] 命令注册失败`, error);
  }
};

export const registerPanel = async () => {
  try {
    window.registerExtensionPanel({
      id: pluginName,
      name: '小说续写助手',
      icon: 'fa-book',
      render: () => {
        return document.getElementById('novel-import-container');
      }
    });
    console.log(`[${pluginName}] 面板注册成功`);
  } catch (error) {
    console.error(`[${pluginName}] 面板注册失败`, error);
  }
};

export const initPlugin = async () => {
  try {
    initNovelImport();
    window.onSettingsChanged((key, value) => {
      if (key === STORAGE_KEY) console.log(`[${pluginName}] 设置已更新`, value);
    });
    console.log(`[${pluginName}] 插件初始化完成`);
  } catch (error) {
    console.error(`[${pluginName}] 插件初始化失败`, error);
    throw error;
  }
};
