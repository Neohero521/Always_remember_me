import { pluginState } from '../index.js';

export function parseNovelText(text) {
  if (!text) return [];
  const splitRegex = new RegExp(getSetting('chapter_split_regex') || '^\\s*第[0-9一二三四五六七八九十百千]+[章回节卷集]\\s*.*', 'gm');
  const matches = [...text.matchAll(splitRegex)];
  const chapters = [];

  if (matches.length === 0) {
    chapters.push({
      title: '全文',
      content: text.trim(),
      index: 0
    });
    return chapters;
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const startIndex = match.index;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : text.length;
    const title = match[0].trim();
    const content = text.slice(startIndex + title.length, endIndex).trim();
    chapters.push({
      title,
      content,
      index: i
    });
  }

  return chapters;
}

export function getChapterContent(index) {
  return pluginState.novelChapters[index]?.content || '';
}

export function getLatestThreeChapters(currentIndex) {
  const startIndex = Math.max(0, currentIndex - 2);
  return pluginState.novelChapters.slice(startIndex, currentIndex + 1);
}
