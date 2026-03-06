// ==============================================
// SillyTavern 插件：Always remember me - 小说章节导入器
// 功能：导入小说 → 拆分章节 → /input /sendas 命令发送到对话框
// ==============================================

let novelChapters = []; // 存储拆分后的章节
let currentChapterIndex = 0;

// 1. 扩展初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Always_remember_me] 插件加载成功');

    // 注册你要的 2 个斜杠命令
    registerSlashCommands();

    // 创建小说导入按钮（加到顶部快捷栏）
    createImportButton();
});

// 2. 注册斜杠命令 /input 和 /sendas
function registerSlashCommands() {
    // ------------------------------
    // 命令 1：/input 弹出输入框
    // ------------------------------
    window.registerSlashCommand({
        command: 'input',
        description: '请输入{{char}}的动作或台词：',
        async callback(args) {
            const input = prompt('请输入{{char}}的动作或台词：', '');
            if (input) {
                window.setUserInput(input); // 填入输入框
            }
        }
    });

    // ------------------------------
    // 命令 2：/sendas 以角色名义发送
    // ------------------------------
    window.registerSlashCommand({
        command: 'sendas',
        description: '以{{char}}名义发送内容',
        async callback(args) {
            const content = args.join(' ');
            if (!content) return;

            // 拼接成你要的格式：name={{char}} 内容
            const sendContent = `name={{char}}|${content}`;
            window.setUserInput(sendContent);
            window.sendMessage(); // 自动发送
        }
    });
}

// 3. 创建【导入小说】按钮
function createImportButton() {
    const bar = document.querySelector('#send_buttons');
    if (!bar) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.style.display = 'none';
    input.id = 'novel-upload-input';

    const btn = document.createElement('button');
    btn.className = 'menu_button';
    btn.innerText = '📖导入小说';
    btn.onclick = () => input.click();

    bar.appendChild(btn);
    bar.appendChild(input);

    // 选择文件后读取
    input.onchange = (e) => readNovelFile(e.target.files[0]);
}

// 4. 读取小说文件 + 自动拆分章节
function readNovelFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        novelChapters = splitNovelIntoChapters(text);
        currentChapterIndex = 0;

        alert(`导入成功！共拆分出 ${novelChapters.length} 章`);
    };
    reader.readAsText(file, 'UTF-8');
}

// 5. 智能拆分章节（匹配：第1章、第一章、第〇章、章节空行分段）
function splitNovelIntoChapters(text) {
    if (!text) return [];

    // 正则匹配章节标题
    const chapterReg = /(第[一二三四五六七八九十百零\d]+章.*?)(?=\n第[一二三四五六七八九十百零\d]+章|$)/gs;
    const rawChapters = [...text.matchAll(chapterReg)].map(m => m[0].trim());

    // 没匹配到章节 → 按大段拆分
    if (rawChapters.length === 0) {
        return text.split(/\n\s*\n/).filter(p => p.trim().length > 50);
    }

    return rawChapters;
}

// 6. 发送当前章节到对话框（可绑定命令/按钮）
function sendCurrentChapter() {
    if (!novelChapters.length) {
        alert('请先导入小说！');
        return;
    }
    if (currentChapterIndex >= novelChapters.length) {
        alert('已发送全部章节！');
        return;
    }

    const content = novelChapters[currentChapterIndex];
    window.setUserInput(content);
    window.sendMessage();

    currentChapterIndex++;
}

// 可选：注册 /next 命令发送下一章（方便你用）
window.registerSlashCommand({
    command: 'next',
    description: '发送小说下一章到对话框',
    callback: sendCurrentChapter
});
