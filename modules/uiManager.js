// modules/uiManager.js - 对齐Cola插件的UI写法，用ST全局API零报错
class UIManager {
    constructor() {
        this.container = null;
    }

    // 获取ST全局API（和Cola插件一致）
    get ST() {
        return window.SillyTavern;
    }

    // 获取插件全局模块
    get plugin() {
        return window.STNovelPlugin;
    }

    // 渲染面板
    render(container) {
        if (!container) return;
        this.container = container;
        const { storageManager, chapterSplitter, knowledgeGraph, continuationEngine, stCommandBridge } = this.plugin;
        const { toaster } = this.ST;

        // 清空容器
        container.innerHTML = '';

        // 基础数据
        const novels = storageManager.getAllNovels();
        const currentNovel = storageManager.getCurrentNovel();
        const currentChapter = storageManager.getCurrentChapter();

        // 面板容器
        const wrapper = document.createElement('div');
        wrapper.className = 'novel-continuation-panel';
        wrapper.style.cssText = 'padding: 12px; height: 100%; overflow-y: auto; box-sizing: border-box;';

        // 标题
        const title = document.createElement('h3');
        title.textContent = '小说续写助手';
        title.style.cssText = 'margin: 0 0 16px 0; color: var(--primary-text-color); font-size: 18px;';
        wrapper.appendChild(title);

        // 1. 小说导入区域
        const importSection = this.createSection('导入小说');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,.md';
        fileInput.style.cssText = 'margin-bottom: 10px; width: 100%; box-sizing: border-box;';
        const importBtn = this.createButton('导入并拆分章节', 'primary');
        importBtn.style.width = '100%';

        // 导入事件
        importBtn.addEventListener('click', async () => {
            const file = fileInput.files[0];
            if (!file) return toaster.show('请先选择小说文件', 'error');
            try {
                toaster.show('正在导入并拆分章节...', 'info');
                const result = await chapterSplitter.handleFileUpload(file);
                toaster.show(`导入成功！共拆分${result.chapterCount}个章节`, 'success');
                storageManager.setCurrentNovel(result.novelId);
                this.render(container);
            } catch (error) {
                toaster.show(`导入失败：${error.message}`, 'error');
            }
        });

        importSection.appendChild(fileInput);
        importSection.appendChild(importBtn);
        wrapper.appendChild(importSection);

        // 2. 小说列表区域
        if (novels.length > 0) {
            const novelSection = this.createSection('我的小说');
            const novelList = document.createElement('div');
            novelList.style.cssText = 'max-height: 160px; overflow-y: auto; margin-bottom: 10px;';

            novels.forEach(novel => {
                const novelItem = document.createElement('div');
                novelItem.style.cssText = `padding: 6px 8px; margin-bottom: 6px; border-radius: 4px; cursor: pointer; background: ${currentNovel?.id === novel.id ? 'var(--highlight-bg-color)' : 'transparent'};`;
                novelItem.innerHTML = `
                    <span style="font-weight: 500; font-size: 14px;">${novel.title}</span>
                    <span style="font-size: 12px; color: var(--secondary-text-color); margin-left: 10px;">${novel.chapterCount}章</span>
                `;
                novelItem.addEventListener('click', () => {
                    storageManager.setCurrentNovel(novel.id);
                    this.render(container);
                });
                novelList.appendChild(novelItem);
            });

            novelSection.appendChild(novelList);

            // 删除小说按钮
            if (currentNovel) {
                const deleteBtn = this.createButton('删除当前小说', 'danger');
                deleteBtn.style.width = '100%';
                deleteBtn.addEventListener('click', () => {
                    if (confirm(`确定要删除《${currentNovel.title}》吗？此操作不可恢复！`)) {
                        storageManager.deleteNovel(currentNovel.id);
                        toaster.show('删除成功', 'success');
                        this.render(container);
                    }
                });
                novelSection.appendChild(deleteBtn);
            }

            wrapper.appendChild(novelSection);
        }

        // 3. 章节列表区域
        if (currentNovel) {
            const chapterSection = this.createSection('章节列表');
            const chapterList = document.createElement('div');
            chapterList.style.cssText = 'max-height: 200px; overflow-y: auto; margin-bottom: 10px;';

            currentNovel.chapters.forEach(chapter => {
                const chapterItem = document.createElement('div');
                chapterItem.style.cssText = `padding: 6px 8px; margin-bottom: 6px; border-radius: 4px; cursor: pointer; background: ${currentChapter?.id === chapter.id ? 'var(--highlight-bg-color)' : 'transparent'};`;
                chapterItem.innerHTML = `<span style="font-weight: 500; font-size: 14px;">${chapter.title}</span>`;
                chapterItem.addEventListener('click', () => {
                    storageManager.setCurrentChapter(chapter.id);
                    this.render(container);
                });
                chapterList.appendChild(chapterItem);
            });

            chapterSection.appendChild(chapterList);
            wrapper.appendChild(chapterSection);
        }

        // 4. 章节操作区域
        if (currentChapter) {
            const actionSection = this.createSection('章节操作');
            const btnGrid = document.createElement('div');
            btnGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;';

            // 导入到输入框
            const importInputBtn = this.createButton('导入到输入框');
            importInputBtn.addEventListener('click', () => {
                stCommandBridge.importToInput(currentChapter.content);
                toaster.show('已导入到输入框', 'success');
            });

            // 以角色发送
            const sendAsCharBtn = this.createButton('以角色发送');
            sendAsCharBtn.addEventListener('click', async () => {
                try {
                    await stCommandBridge.sendAsChar(currentChapter.content);
                    toaster.show('已以角色身份发送', 'success');
                } catch (e) {
                    toaster.show(`发送失败：${e.message}`, 'error');
                }
            });

            // 发送为上下文
            const sendAsContextBtn = this.createButton('发送为上下文');
            sendAsContextBtn.addEventListener('click', async () => {
                try {
                    await stCommandBridge.sendAsContext(currentChapter.content);
                    toaster.show('已发送为上下文', 'success');
                } catch (e) {
                    toaster.show(`发送失败：${e.message}`, 'error');
                }
            });

            // 您指定的角色输入命令
            const charInputBtn = this.createButton('角色输入命令');
            charInputBtn.addEventListener('click', async () => {
                try {
                    await stCommandBridge.executeCharInputCommand();
                } catch (e) {
                    toaster.show(`执行失败：${e.message}`, 'error');
                }
            });

            btnGrid.append(importInputBtn, sendAsCharBtn, sendAsContextBtn, charInputBtn);
            actionSection.appendChild(btnGrid);

            // 章节预览
            const previewLabel = document.createElement('h5');
            previewLabel.textContent = '章节内容预览';
            previewLabel.style.cssText = 'margin: 0 0 6px 0; font-size: 13px;';
            const previewTextarea = document.createElement('textarea');
            previewTextarea.readOnly = true;
            previewTextarea.value = currentChapter.content.substring(0, 500) + (currentChapter.content.length > 500 ? '...' : '');
            previewTextarea.style.cssText = 'width: 100%; height: 100px; resize: vertical; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg-color); color: var(--input-text-color); box-sizing: border-box;';
            
            actionSection.append(previewLabel, previewTextarea);
            wrapper.appendChild(actionSection);

            // 5. 知识图谱区域
            const graphSection = this.createSection('知识图谱');
            const graphBtnGrid = document.createElement('div');
            graphBtnGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;';

            const analyzeBtn = this.createButton('分析当前章节');
            analyzeBtn.addEventListener('click', async () => {
                try {
                    toaster.show('正在分析章节，生成知识图谱...', 'info');
                    await knowledgeGraph.analyzeChapter(currentNovel.id, currentChapter.id, currentChapter.content);
                    toaster.show('章节分析完成', 'success');
                    this.render(container);
                } catch (e) {
                    toaster.show(`分析失败：${e.message}`, 'error');
                }
            });

            const mergeBtn = this.createButton('合并全本图谱');
            mergeBtn.addEventListener('click', async () => {
                try {
                    toaster.show('正在合并全本知识图谱...', 'info');
                    await knowledgeGraph.mergeNovelGraphs(currentNovel.id);
                    toaster.show('全本图谱合并完成', 'success');
                    this.render(container);
                } catch (e) {
                    toaster.show(`合并失败：${e.message}`, 'error');
                }
            });

            graphBtnGrid.append(analyzeBtn, mergeBtn);
            graphSection.appendChild(graphBtnGrid);

            // 图谱预览
            const graphPreview = document.createElement('div');
            graphPreview.style.cssText = 'max-height: 150px; overflow-y: auto; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg-color); font-size: 13px;';
            const hasChapterGraph = storageManager.getChapterGraph(currentNovel.id, currentChapter.id);
            const hasMergedGraph = storageManager.getMergedGraph(currentNovel.id);
            
            if (!hasChapterGraph && !hasMergedGraph) {
                graphPreview.innerHTML = '<p style="color: var(--secondary-text-color); text-align: center; margin: 0;">暂无分析数据</p>';
            } else {
                graphPreview.innerHTML = `
                    ${hasChapterGraph ? '<p style="color: var(--success-color); margin: 0;">✅ 已生成当前章节知识图谱</p>' : ''}
                    ${hasMergedGraph ? '<p style="color: var(--success-color); margin: 5px 0 0 0;">✅ 已生成全本合并知识图谱</p>' : ''}
                `;
            }
            graphSection.appendChild(graphPreview);
            wrapper.appendChild(graphSection);

            // 6. AI续写区域
            const continueSection = this.createSection('AI续写');
            const wordCountLabel = document.createElement('label');
            wordCountLabel.textContent = '续写字数';
            wordCountLabel.style.cssText = 'display: block; margin-bottom: 6px; font-size: 13px;';
            const wordCountInput = document.createElement('input');
            wordCountInput.type = 'number';
            wordCountInput.value = '1000';
            wordCountInput.min = '500';
            wordCountInput.max = '10000';
            wordCountInput.step = '100';
            wordCountInput.style.cssText = 'width: 100%; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg-color); color: var(--input-text-color); box-sizing: border-box; margin-bottom: 12px;';

            const continueBtnGrid = document.createElement('div');
            continueBtnGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;';

            const continueChapterBtn = this.createButton('续写当前章节');
            continueChapterBtn.addEventListener('click', async () => {
                const wordCount = parseInt(wordCountInput.value) || 1000;
                try {
                    toaster.show(`正在续写章节，约${wordCount}字...`, 'info');
                    const result = await continuationEngine.continueSingleChapter(currentNovel.id, currentChapter.id, wordCount);
                    toaster.show('续写完成', 'success');
                    resultPreview.innerHTML = `<pre style="white-space: pre-wrap; margin: 0; font-size: 13px;">${result}</pre>`;
                    stCommandBridge.importToInput(result);
                } catch (e) {
                    toaster.show(`续写失败：${e.message}`, 'error');
                }
            });

            const continueNextBtn = this.createButton('续写下一章');
            continueNextBtn.addEventListener('click', async () => {
                const wordCount = parseInt(wordCountInput.value) || 2000;
                try {
                    toaster.show(`正在续写下一章，约${wordCount}字...`, 'info');
                    const result = await continuationEngine.continueNextChapter(currentNovel.id, wordCount);
                    toaster.show(`下一章续写完成，已自动添加到章节列表`, 'success');
                    resultPreview.innerHTML = `<pre style="white-space: pre-wrap; margin: 0; font-size: 13px;">${result.content}</pre>`;
                    this.render(container);
                } catch (e) {
                    toaster.show(`续写失败：${e.message}`, 'error');
                }
            });

            continueBtnGrid.append(continueChapterBtn, continueNextBtn);

            const resultPreview = document.createElement('div');
            resultPreview.style.cssText = 'max-height: 200px; overflow-y: auto; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg-color); font-size: 13px;';
            resultPreview.innerHTML = '<p style="color: var(--secondary-text-color); text-align: center; margin: 0;">续写结果将显示在这里</p>';

            continueSection.append(wordCountLabel, wordCountInput, continueBtnGrid, resultPreview);
            wrapper.appendChild(continueSection);
        }

        // 挂载到容器
        container.appendChild(wrapper);
    }

    // 工具函数：创建区块
    createSection(title) {
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom: 20px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px;';
        const sectionTitle = document.createElement('h4');
        sectionTitle.textContent = title;
        sectionTitle.style.cssText = 'margin: 0 0 10px 0; font-size: 15px;';
        section.appendChild(sectionTitle);
        return section;
    }

    // 工具函数：创建按钮
    createButton(text, type = 'primary') {
        const btn = document.createElement('button');
        btn.className = 'menu_button';
        btn.textContent = text;
        if (type === 'danger') {
            btn.style.backgroundColor = 'var(--danger-color)';
            btn.style.color = 'white';
        }
        return btn;
    }
}

export default new UIManager();
