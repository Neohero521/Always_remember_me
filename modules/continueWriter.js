export function getContinuePrompt(options) {
    const {
        knowledgeGraph,
        latestThreeChapters,
        continueLength,
        nextChapterNum
    } = options;

    return `你是专业的小说续写作家，请基于以下最近三章的内容以及小说的核心设定，续写下一章（第${nextChapterNum}章）。要求：
1. 人设、世界观必须严格贴合提供的核心设定。
2. 剧情必须与最近三章的内容无缝衔接，逻辑自洽，没有矛盾。
3. 文风必须与原文保持一致。
4. 只输出续写的正文，不要任何额外文字。
5. 字数约${continueLength}字，误差不超过10%。
----------------------
原小说核心设定：
${JSON.stringify(knowledgeGraph, null, 2)}
最近三章内容：
${latestThreeChapters.join('\n\n')}
----------------------
请直接输出续写的正文内容：`;
}

export function getFirstContinuePrompt(options) {
    const {
        knowledgeGraph,
        preContext,
        editContent,
        continueLength
    } = options;

    return `你是专业的小说续写作家，严格遵循以下规则完成续写任务：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC）
2. 剧情衔接：续写内容必须和用户修改后的章节内容、前文剧情完美衔接，逻辑自洽，没有矛盾
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式，和原文无缝衔接
4. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节、生动的细节、符合人设的对话
5. 输出要求：只输出续写的正文内容，不要任何标题、解释、备注、说明、分割线
6. 字数要求：续写约${continueLength}字，误差不超过10%
----------------------
原小说核心设定：
${JSON.stringify(knowledgeGraph, null, 2)}
前文剧情铺垫（当前章节之前的内容）：
${preContext}
用户修改后的当前章节内容（从这里的结尾开始续写，不要重复已有内容）：
${editContent}
----------------------
请直接输出续写的正文内容：`;
}

export function getContinueContext(chapters, currentChapterId, generatedChapters, editContent) {
    const originalChapterList = chapters
        .slice(0, currentChapterId + 1)
        .map(ch => ch.editContent.trim());
    
    const continueChapterList = [editContent.trim(), ...generatedChapters];
    
    const fullChapterList = [...originalChapterList, ...continueChapterList];
    return fullChapterList.slice(-3);
}

export function getFirstPreContext(chapters, currentChapterId, maxLength = 6000) {
    const preContextStart = Math.max(0, currentChapterId - 2);
    let preContext = '';
    for (let i = preContextStart; i < currentChapterId; i++) {
        preContext += `${chapters[i].title}\n${chapters[i].originalContent}\n\n`;
    }
    return preContext.length > maxLength ? preContext.slice(-maxLength) : preContext;
}
