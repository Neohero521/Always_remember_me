// 完全重写的index.legacy.js，采用与Cola-Echo/Cola相同的架构
const extensionName = '小说续写助手';

// 创建插件面板
const createPluginPanel = () => {
    const mainDiv = document.createElement('div');
    mainDiv.id = 'novel-continuation-panel';
    mainDiv.style.cssText = `
        position: fixed;
        top: 50px;
        right: 20px;
        width: 400px;
        height: calc(100vh - 100px);
        background: #fff;
        border-radius: 10px;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.2);
        overflow: auto;
        display: none;
        z-index: 9999;
    `;

    // 标题栏
    const header = document.createElement('div');
    header.style.cssText = `
        height: 40px;
        background: #f0f0f0;
        border-bottom: 1px solid #ddd;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 10px;
    `;
    
    // 标题
    const title = document.createElement('span');
    title.textContent = '小说续写助手';
    title.style.cssText = `
        font-size: 16px;
        font-weight: 600;
    `;
    
    // 关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
    `;
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
    closeBtn.addEventListener('click', () => {
        mainDiv.style.display = 'none';
    });
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    mainDiv.appendChild(header);

    // 内容区域
    const content = document.createElement('div');
    content.style.cssText = `
        padding: 10px;
        height: calc(100% - 40px);
        overflow-y: auto;
    `;
    
    // 这里添加您的插件内容
    content.innerHTML = `
        <div style="padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 5px;">
            <h3>功能列表</h3>
            <ul>
                <li>章节拆分</li>
                <li>知识图谱构建</li>
                <li>AI续写</li>
                <li>角色对话快捷发送</li>
            </ul>
        </div>
    `;
    
    mainDiv.appendChild(content);
    document.body.appendChild(mainDiv);
    
    return mainDiv;
};

// 创建侧边栏图标
const createSidebarIcon = () => {
    const iconDiv = document.createElement('div');
    iconDiv.id = 'novel-continuation-icon';
    iconDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        background: #4CAF50;
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        z-index: 9999;
    `;
    
    // 图标SVG（书本图标）
    iconDiv.innerHTML = `
        <svg viewBox="0 0 24 24" style="width: 30px; height: 30px; fill: white;">
            <path d="M19 21h-4v-3h-2v3h-4v-3h-2v3H5v-3H3v-2h2v-3h4v3h2v-3h4v3h2v-3h2v5zM19 15h-4v-3h-2v3h-4v-3h-2v3H5v-3H3v-2h2v-3h4v3h2v-3h4v3h2v-3h2v2z"/>
        </svg>
    `;
    
    iconDiv.addEventListener('click', () => {
        const panel = document.getElementById('novel-continuation-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    
    document.body.appendChild(iconDiv);
};

// 初始化函数
const init = () => {
    const panel = createPluginPanel();
    createSidebarIcon();
    
    // 自动居中面板
    const centerPanel = () => {
        const panel = document.getElementById('novel-continuation-panel');
        if (!panel) return;
        
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const panelWidth = panel.offsetWidth;
        const panelHeight = panel.offsetHeight;
        
        panel.style.left = `${(windowWidth - panelWidth) / 2}px`;
        panel.style.top = `50px`;
    };
    
    window.addEventListener('resize', centerPanel);
    centerPanel();
};

// 立即执行初始化
init();

// 导出必要的接口（如果需要）
export { init };
