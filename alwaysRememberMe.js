// 等待SillyTavern扩展API加载完成
document.addEventListener('extensionLoaded', async () => {
    // 注册插件
    const extensionId = 'novel-chapter-importer';
    ExtensionUtils.registerExtension({
        id: extensionId,
        name: 'Novel Chapter Importer',
        description: '导入小说拆分章节并通过斜杠命令导入对话框',
        version: '1.0.0',
        author: 'Neohero521',
    });

    // ========== 1. 创建UI元素（侧边栏添加导入按钮） ==========
    const createImportUI = () => {
        // 找到侧边栏容器（适配SillyTavern界面结构）
        const sidebar = document.querySelector('.sidebar-menu') || document.querySelector('#sidebar');
        if (!sidebar) return;

        // 创建导入按钮
        const importBtn = document.createElement('button');
        importBtn.className = 'btn btn-sm btn-primary mt-2';
        importBtn.textContent = '导入小说';
        importBtn.style.marginLeft = '10px';
        sidebar.appendChild(importBtn);

        // 创建隐藏的文件选择框
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,.text'; // 仅支持TXT小说（可扩展为epub等）
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        // 点击按钮触发文件选择
        importBtn.addEventListener('click', () => fileInput.click());

        // ========== 2. 处理文件上传与章节拆分 ==========
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // 读取TXT文件内容
            const text = await file.text();
            // 拆分章节（核心正则：匹配「第X章」「第一章」等常见格式）
            const chapters = splitNovelToChapters(text);
            
            // 弹出章节选择弹窗
            showChapterSelector(chapters);
        });
    };

    // ========== 3. 章节拆分核心函数 ==========
    /**
     * 拆分小说文本为章节
     * @param {string} text 小说文本
     * @returns {Array<{title: string, content: string}>} 章节列表
     */
    const splitNovelToChapters = (text) => {
        // 正则匹配章节标题（适配：第1章/第一章/第100章 等格式）
        const chapterRegex = /(第[\d一二三四五六七八九十百千万]+章\s*.+?)(?=第[\d一二三四五六七八九十百千万]+章|$)/g;
        const chapters = [];
        let match;

        // 处理无章节标题的情况（按换行/分隔符拆分）
        if (!text.match(chapterRegex)) {
            // 按空行拆分段落作为简易章节
            const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
            paragraphs.forEach((content, index) => {
                chapters.push({
                    title: `章节${index + 1}`,
                    content: content.trim()
                });
            });
            return chapters;
        }

        // 匹配带标题的章节
        while ((match = chapterRegex.exec(text)) !== null) {
            const fullMatch = match[0];
            // 拆分标题和内容
            const titleMatch = fullMatch.match(/(第[\d一二三四五六七八九十百千万]+章\s*.+?)\n/);
            let title = titleMatch ? titleMatch[1].trim() : `章节${chapters.length + 1}`;
            let content = fullMatch.replace(titleMatch[0], '').trim();

            chapters.push({ title, content });
        }
        return chapters;
    };

    // ========== 4. 章节选择弹窗 ==========
    const showChapterSelector = (chapters) => {
        // 创建弹窗容器
        const modal = document.createElement('div');
        modal.className = 'modal fade show';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">选择要导入的章节</h5>
                        <button type="button" class="btn-close" id="closeModal"></button>
                    </div>
                    <div class="modal-body">
                        <select id="chapterSelect" class="form-select" size="10">
                            ${chapters.map((chapter, index) => 
                                `<option value="${index}">${chapter.title}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="modal-footer">
                        <button id="importAsInput" class="btn btn-primary">导入为/input命令</button>
                        <button id="importAsSendas" class="btn btn-secondary">导入为/sendas命令</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 关闭弹窗
        document.getElementById('closeModal').addEventListener('click', () => {
            modal.remove();
        });

        // ========== 5. 导入为/input命令 ==========
        document.getElementById('importAsInput').addEventListener('click', () => {
            const selectedIndex = document.getElementById('chapterSelect').value;
            const selectedChapter = chapters[selectedIndex];
            if (!selectedChapter) return;

            // 封装/input命令格式：/input 请输入{{char}}的动作或台词：| 章节内容
            const charPlaceholder = '{{char}}'; // 可替换为实际角色名
            const inputCommand = `/input 请输入${charPlaceholder}的动作或台词：| ${selectedChapter.content}`;
            
            // 插入到对话框输入框
            insertToChatInput(inputCommand);
            modal.remove();
        });

        // ========== 6. 导入为/sendas命令 ==========
        document.getElementById('importAsSendas').addEventListener('click', () => {
            const selectedIndex = document.getElementById('chapterSelect').value;
            const selectedChapter = chapters[selectedIndex];
            if (!selectedChapter) return;

            // 封装/sendas命令格式：/sendas name={{char}} 章节内容
            const charPlaceholder = '{{char}}';
            const sendasCommand = `/sendas name=${charPlaceholder} ${selectedChapter.content}`;
            
            // 插入到对话框输入框
            insertToChatInput(sendasCommand);
            modal.remove();
        });
    };

    // ========== 7. 插入内容到对话框输入框 ==========
    const insertToChatInput = (content) => {
        // 找到SillyTavern的对话框输入框（适配界面结构）
        const chatInput = document.querySelector('#chat-input') || document.querySelector('[name="chat-input"]');
        if (chatInput) {
            chatInput.value = content;
            // 可选：聚焦输入框
            chatInput.focus();
        } else {
            alert('未找到对话框输入框，请检查SillyTavern版本');
        }
    };

    // 初始化UI
    createImportUI();

    // 可选：注册自定义斜杠命令（直接在输入框输入/novelImport触发）
    CommandHandler.registerCommand({
        command: 'novelImport',
        description: '导入小说章节（弹窗选择）',
        handler: () => {
            document.querySelector('input[type="file"][accept=".txt,.text"]').click();
        }
    });
});
