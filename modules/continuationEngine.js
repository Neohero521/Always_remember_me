// modules/continuationEngine.js
import storageManager from './storageManager.js';

class ContinuationEngine {
    constructor() {
        // 单章节续写Prompt，100%遵循您的续写规则
        this.singleChapterPromptTemplate = `
请严格按照以下规则，续写当前的小说章节内容，仅输出续写的正文内容，不要任何标题、解释、备注、说明、分割线。

续写规则：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC）。
2. 剧情衔接：续写内容必须和提供的当前章节内容、前文剧情完美衔接，逻辑自洽，没有矛盾。
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式，和原文无缝衔接。
4. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节、生动的细节、符合人设的对话。
5. 字数要求：续写约{{wordCount}}字，误差不超过10%。

核心设定参考（知识图谱）：
{{knowledgeGraph}}

当前章节原文内容：
{{chapterContent}}

请开始续写：
`;

        // 下一章续写Prompt，100%遵循您的续写规则
        this.nextChapterPromptTemplate = `
请严格按照以下规则，续写下一章的小说内容，仅输出续写的正文内容，不要任何标题、解释、备注、说明、分割线。

续写规则：
1. 人设、世界观：必须严格贴合提供的核心设定，绝对不能出现人设崩塌、世界观矛盾。
2. 剧情衔接：必须与提供的最近三章内容无缝衔接，逻辑自洽，没有矛盾，承接前文剧情，开启新的情节发展。
3. 文风：必须与原文保持一致，叙事风格、语言习惯、对话方式完全贴合原文。
4. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节、生动的细节、符合人设的对话。
5. 字数要求：续写约{{wordCount}}字，误差不超过10%。

核心设定参考（知识图谱）：
{{knowledgeGraph}}

最近三章原文内容：
{{recentChaptersContent}}

请开始续写下一章：
`;
    }

    async generateContent(prompt) {
        if (!window.SillyTavern) throw new Error('SillyTavern API 不可用');
        try {
            const result = await window.SillyTavern.generateText(prompt, {
                temperature: 0.7,
                top_p: 0.9,
                max_tokens: 8000,
                frequency_penalty: 0.2,
                presence_penalty: 0.1
            });
            return result.trim();
        } catch (error) {
            throw new Error(`AI续写生成失败: ${error.message}`);
        }
    }

    // 单章节续写
    async continueSingleChapter(novelId, chapterId, wordCount = 1000) {
        const novel = storageManager.getNovel(novelId);
        const chapter = novel?.chapters.find(c => c.id === chapterId);
        if (!chapter) throw new Error('章节不存在');

        const graph = storageManager.getMergedGraph(novelId) || storageManager.getChapterGraph(novelId, chapterId);
        const graphJson = graph ? JSON.stringify(graph, null, 2) : '暂无核心设定参考';

        const prompt = this.singleChapterPromptTemplate
            .replace('{{wordCount}}', wordCount)
            .replace('{{knowledgeGraph}}', graphJson)
            .replace('{{chapterContent}}', chapter.content);

        return await this.generateContent(prompt);
    }

    // 续写下一章
    async continueNextChapter(novelId, wordCount = 2000) {
        const novel = storageManager.getNovel(novelId);
        if (!novel || novel.chapters.length === 0) throw new Error('小说不存在或没有章节');

        const recentChapters = novel.chapters.slice(-3);
        const recentChaptersContent = recentChapters.map(chapter => 
            `【${chapter.title}】\n${chapter.content}`
        ).join('\n\n');

        const graph = storageManager.getMergedGraph(novelId);
        const graphJson = graph ? JSON.stringify(graph, null, 2) : '暂无核心设定参考';

        const prompt = this.nextChapterPromptTemplate
            .replace('{{wordCount}}', wordCount)
            .replace('{{knowledgeGraph}}', graphJson)
            .replace('{{recentChaptersContent}}', recentChaptersContent);

        const nextChapterContent = await this.generateContent(prompt);
        const newChapterNumber = novel.chapters.length + 1;
        const newChapterId = `chapter_${newChapterNumber}`;
        const newChapter = {
            id: newChapterId,
            number: newChapterNumber,
            title: `第${newChapterNumber}章`,
            content: nextChapterContent,
            createTime: Date.now()
        };

        const updatedChapters = [...novel.chapters, newChapter];
        storageManager.updateNovel(novelId, {
            chapters: updatedChapters,
            chapterCount: updatedChapters.length
        });

        return { newChapter, content: nextChapterContent };
    }
}

export default new ContinuationEngine();
