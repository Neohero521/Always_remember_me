import { getContext, executeSlashCommand } from "../../../../script.js";

// ===================== 单章节发送到聊天（严格遵循/sendas格式） =====================
export async function sendChapterToChat(chapter, isBatch = false) {
    // 获取当前聊天角色
    const context = getContext();
    const currentChar = context.character;
    if (!currentChar || !currentChar.name) {
        throw new Error('请先选择一个聊天角色，再发送章节');
    }
    if (!chapter || !chapter.fullContent.trim()) {
        throw new Error('章节内容为空');
    }

    try {
        // 严格遵循用户提供的格式：/sendas name={{char}} 内容
        const charName = currentChar.name.replace(/"/g, '\\"');
        // 超长章节自动拆分（单条消息不超过4000字，避免上下文超限）
        const maxLength = 4000;
        const content = chapter.fullContent;
        const chunks = [];
        for (let i = 0; i < content.length; i += maxLength) {
            chunks.push(content.slice(i, i + maxLength));
        }

        // 逐块执行/sendas命令
        for (let idx = 0; idx < chunks.length; idx++) {
            const chunk = chunks[idx];
            const chunkTitle = chunks.length > 1 ? `${chapter.title} (${idx+1}/${chunks.length})` : chapter.title;
            const command = `/sendas name="${charName}" ${chunkTitle}\n\n${chunk}`;
            await executeSlashCommand(command);
            // 批量发送加延迟，避免触发限流
            if (isBatch || chunks.length > 1) {
                await new Promise(r => setTimeout(r, 800));
            }
        }
        return true;
    } catch (err) {
        console.error('发送章节失败:', err);
        throw err;
    }
}

// ===================== 批量发送所有章节 =====================
export async function batchSendAllChapters(chapters, onProgress) {
    if (!chapters.length) {
        throw new Error('暂无章节可发送');
    }
    let successCount = 0;
    for (let i = 0; i < chapters.length; i++) {
        try {
            if (onProgress) onProgress(i+1, chapters.length);
            await sendChapterToChat(chapters[i], true);
            successCount++;
        } catch (err) {
            console.error(`第${i+1}章发送失败:`, err);
        }
    }
    return successCount;
}
