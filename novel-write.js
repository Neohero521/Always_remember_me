import { getSTContext, getExtensionSettings, showToast, renderCommandTemplate } from "./utils.js";
import { globalState } from "./config.js";

// 生成续写内容
export const generateNovelWrite = async () => {
  const context = getSTContext();
  const { generateRaw } = context;
  const settings = getExtensionSettings();
  
  const selectedChapterId = $('#write-chapter-select').val();
  const editedChapterContent = $('#write-chapter-content').val().trim();
  const wordCount = parseInt($('#write-word-count').val()) || 2000;
  const mergedGraph = settings.mergedGraph || {};

  if (globalState.isGeneratingWrite) {
    showToast('正在生成续写内容中，请等待完成', "warning");
    return;
  }
  if (!selectedChapterId) {
    showToast('请先选择续写基准章节', "error");
    return;
  }
  if (!editedChapterContent) {
    showToast('基准章节内容不能为空', "error");
    return;
  }
  if (Object.keys(mergedGraph).length === 0) {
    showToast('未检测到合并后的知识图谱，建议先合并图谱以保证续写质量', "warning");
  }

  const systemPrompt = `
小说续写规则（100%严格遵守）：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC）
2. 剧情衔接：续写内容必须和提供的基准章节内容完美衔接，逻辑自洽，没有任何矛盾，承接前文剧情，开启新的章节内容
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接，看不出任何差异
4. 剧情合理：续写内容要完全符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节描写、符合人设的对话
5. 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线、markdown格式
6. 字数要求：续写约${wordCount}字，误差不超过10%
`;

  const userPrompt = `
小说核心设定知识图谱：${JSON.stringify(mergedGraph)}
基准章节内容：${editedChapterContent}
请基于以上内容，严格按照规则续写后续的章节正文。
`;

  globalState.isGeneratingWrite = true;
  globalState.stopGenerateWrite = false;
  $('#write-status').text('正在生成续写章节，请稍候...');

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt });
    if (!result.trim()) {
      throw new Error('生成内容为空');
    }

    $('#write-content-preview').val(result.trim());
    $('#write-status').text('续写章节生成完成！');
    showToast('续写章节生成完成！', "success");
  } catch (error) {
    console.error('续写生成失败:', error);
    $('#write-status').text(`生成失败: ${error.message}`);
    showToast(`续写生成失败: ${error.message}`, "error");
  } finally {
    globalState.isGeneratingWrite = false;
    globalState.stopGenerateWrite = false;
  }
};

// 章节选择联动
export const onChapterSelectChange = () => {
  const selectedChapterId = $('#write-chapter-select').val();
  if (!selectedChapterId) {
    $('#write-chapter-content').val('').prop('readonly', true);
    return;
  }

  const targetChapter = globalState.currentParsedChapters.find(item => item.id == selectedChapterId);
  if (targetChapter) {
    $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
  }
};

// 发送续写内容到对话框
export const sendWriteContentToChat = async () => {
  const context = getSTContext();
  const settings = getExtensionSettings();
  const writeText = $('#write-content-preview').val();
  const currentCharName = context.characters[context.characterId]?.name;

  if (!writeText) {
    showToast('没有可发送的续写内容', "warning");
    return;
  }
  if (!currentCharName) {
    showToast('请先选择一个聊天角色', "error");
    return;
  }

  try {
    const command = renderCommandTemplate(settings.sendTemplate, currentCharName, writeText);
    await context.executeSlashCommandsWithOptions(command);
    showToast('续写内容已发送到对话框', "success");
  } catch (error) {
    console.error('发送失败:', error);
    showToast(`发送失败: ${error.message}`, "error");
  }
};
