export const pluginName = 'novel-continue-helper';
export const pluginDisplayName = '小说续写助手';
export const pluginVersion = '1.0.0';
export const pluginAuthor = '你的昵称';

export const defaultConfig = {
  chapterSplitRegex: '^\\s*第[0-9一二三四五六七八九十百千]+[章回节卷集].*$',
  defaultCommandTemplate: '/input 请输入{{char}}的动作或台词：| /sendas name={{char}} {{pipe}}',
  autoTrimContent: true,
  maxFileSize: 10
};

export const STORAGE_KEY = `plugin-${pluginName}-settings`;
