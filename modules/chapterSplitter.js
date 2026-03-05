// modules/chapterSplitter.js
import storageManager from './storageManager.js';

class ChapterSplitter {
    constructor() {
        // 兼容主流章节标题格式的正则规则
        this.chapterRegex = [
            /^\s*第\s*([0-9零一二三四五六七八九十百千]+)\s*[章節卷集回]\s*(.*)\s*$/m,
            /^\s*Chapter\s*([0-9]+)\s*(.*)\s*$/m,
            /^\s*([0-9]+)\s*[章節]\s*(.*)\s*$/m,
            /^\s*卷\s*([0-9零一二三四五六七八九十百千]+)\s*第\s*([0-9零一二三四五六七八九十百千]+)\s*[章節]\s*(.*)\s*$/m
        ];
    }

    splitNovelContent(content, novelTitle) {
        const lines = content.split('\n');
        const chapters = [];
        let currentChapter = null;
        let chapterIdCounter = 1;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // 匹配章节标题
            let matched = false;
            for (const regex of this.chapterRegex) {
                const match = trimmedLine.match(regex);
                if (match) {
                    // 保存上一章节
                    if (currentChapter) {
                        currentChapter.content = currentChapter.content.trim();
                        chapters.push(currentChapter);
                    }

                    // 创建新章节
                    const chapterNum = match[1] || chapterIdCounter;
                    const chapterTitle = match[match.length - 1] || `第${chapterNum}章`;
                    const fullTitle = `第${chapterNum}章 ${chapterTitle}`.trim();

                    currentChapter = {
                        id: `chapter_${chapterIdCounter}`,
                        number: chapterNum,
                        title: fullTitle,
                        content: '',
                        createTime: Date.now()
                    };

                    chapterIdCounter++;
                    matched = true;
                    break;
                }
            }

            // 追加章节内容
            if (!matched && currentChapter) {
                currentChapter.content += line + '\n';
            }
        }

        // 保存最后一个章节
        if (currentChapter) {
            currentChapter.content = currentChapter.content.trim();
            chapters.push(currentChapter);
        }

        // 无章节匹配时创建默认全文章节
        if (chapters.length === 0) {
            chapters.push({
                id: 'chapter_1',
                number: 1,
                title: '全文',
                content: content.trim(),
                createTime: Date.now()
            });
        }

        // 保存到本地存储
        const novelId = storageManager.addNovel({
            title: novelTitle,
            chapters: chapters,
            chapterCount: chapters.length
        });

        return { novelId, chapterCount: chapters.length, chapters };
    }

    // 处理文件上传
    async handleFileUpload(file) {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error('请选择有效的小说文件'));

            const allowedTypes = ['text/plain', 'text/markdown', 'application/octet-stream'];
            if (!allowedTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
                return reject(new Error('仅支持TXT、MD格式的小说文件'));
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    const novelTitle = file.name.replace(/\.(txt|md)$/, '');
                    const result = this.splitNovelContent(content, novelTitle);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file, 'utf-8');
        });
    }
}

export default new ChapterSplitter();
