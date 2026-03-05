// ===================== 【已修复】ST API导入路径（深一层目录，多一个../） =====================
// 路径：/scripts/extensions/Always_remember_me/modules/chatSender.js
// 目标：/scripts/script.js → 相对路径 ../../../script.js
import { getContext, executeSlashCommand } from "../../../script.js";

// ===================== 单章节发送（严格遵循/sendas格式） =====================
export async function sendChapterToChat(chapter, isBatch = false) {
    const context = getContext();
    const currentChar = context.character;
    if (!currentChar || !currentChar.name) {
        throw new Error('请先选择一个聊天角色，再发送章节');
    }
    if (!chapter || !chapter.fullContent.trim()) {
        throw new Error('章节内容为空');
    }
    try {
        const charName = currentChar.name.replace(/"/g, '\\"');
        const maxLength = 4000;
        const content = chapter.fullContent;
        const chunks = [];
        for (let i = 0; i < content.length; i += maxLength) {
            chunks.push(content.slice(i, i + maxLength));
        }
        for (let idx = 0; idx < chunks.length; idx++) {
            const chunk = chunks[idx];
            const chunkTitle = chunks.length > 1 ? `${chapter.title} (${idx+1}/${chunks.length})` : chapter.title;
            const command = `/sendas name="${charName}" ${chunkTitle}\n\n${chunk}`;
            await executeSlashCommand(command);
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
