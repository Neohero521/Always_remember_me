// 章节标题匹配正则（覆盖主流小说格式，可扩展）
const CHAPTER_REGEX = /^\s*(第[0-9零一二三四五六七八九十百千]+[章回节卷集])\s*(.*?)\s*$/gm;

/**
 * 解析小说文本，自动拆分章节
 * @param {string} text 小说全文本
 * @returns {Array<{id: number, title: string, content: string}>} 章节列表
 */
export function parseNovelChapters(text) {
  if (!text || typeof text !== 'string') return [];

  const chapters = [];
  const matches = [...text.matchAll(CHAPTER_REGEX)];
  
  // 无匹配章节时，返回全文单章节
  if (matches.length === 0) {
    return [{
      id: 1,
      title: "全文",
      content: text.trim()
    }];
  }

  // 拆分章节内容
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const chapterTitle = `${match[1]} ${match[2]}`.trim();
    const startIndex = match.index + match[0].length;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : text.length;
    const chapterContent = text.slice(startIndex, endIndex).trim();

    chapters.push({
      id: i + 1,
      title: chapterTitle,
      content: chapterContent
    });
  }

  return chapters;
}

/**
 * 生成酒馆斜杠命令（完全匹配你要求的格式）
 * @param {string} charName 当前角色名称
 * @param {string} content 要发送的章节内容
 * @returns {string} 可执行的斜杠命令
 */
export function generateChapterCommand(charName, content) {
  // 转义管道符，处理特殊字符
  const escapedContent = content.replace(/\|/g, '\\|').replace(/\n/g, '\\n');
  // 完全匹配你指定的命令格式，替换{{char}}变量
  return `/input 请输入{{char}}的动作或台词：${escapedContent} | /sendas name=${charName} {{pipe}}`;
}
