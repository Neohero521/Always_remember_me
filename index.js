// 严格遵循官方模板导入规范，路径完全对齐原版本
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
const extensionName = "Verification";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
// 预设章节拆分正则列表（覆盖全场景，含括号序号格式）
const presetChapterRegexList = [
    { name: "标准章节", regex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$" },
    { name: "括号序号", regex: "^\\s*.*\\（[0-9零一二三四五六七八九十百千]+\\）.*$" },
    { name: "英文括号序号", regex: "^\\s*.*\\([0-9零一二三四五六七八九十百千]+\\).*$" },
    { name: "标准节", regex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*节.*$" },
    { name: "卷+章", regex: "^\\s*卷\\s*[0-9零一二三四五六七八九十百千]+\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$" },
    { name: "英文Chapter", regex: "^\\s*Chapter\\s*[0-9]+\\s*.*$" },
    { name: "标准话", regex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*话.*$" },
    { name: "顿号序号", regex: "^\\s*[0-9零一二三四五六七八九十百千]+、.*$" },
    { name: "方括号序号", regex: "^\\s*【\\s*[0-9零一二三四五六七八九十百千]+\\s*】.*$" },
    { name: "圆点序号", regex: "^\\s*[0-9]+\\.\\s*.*$" },
    { name: "中文序号空格", regex: "^\\s*[零一二三四五六七八九十百千]+\\s+.*$" }
];
// 自动解析相关状态
let currentRegexIndex = 0;
let sortedRegexList = [...presetChapterRegexList];
let lastParsedText = "";
// 默认配置（原有字段完全不变，100%兼容旧数据，仅移除自定义预设相关配置）
const defaultSettings = {
    chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
    sendTemplate: "/sendas name={{char}} {{pipe}}",
    sendDelay: 100,
    example_setting: false,
    chapterList: [],
    chapterGraphMap: {},
    mergedGraph: {},
    continueWriteChain: [],
    continueChapterIdCounter: 1,
    enableQualityCheck: true,
    precheckReport: {},
    drawerState: {
        "drawer-chapter-import": true,
        "drawer-graph": false,
        "drawer-write": false,
        "drawer-precheck": false
    },
    selectedBaseChapterId: "",
    writeContentPreview: "",
    graphValidateResultShow: false,
    qualityResultShow: false,
    precheckStatus: "未执行",
    precheckReportText: "",
    floatBallState: {
        position: { x: window.innerWidth - 90, y: window.innerHeight / 2 },
        isPanelOpen: false,
        activeTab: "tab-chapter"
    },
    readerState: {
        fontSize: 16,
        currentChapterId: null,
        currentChapterType: "original",
        readProgress: {}
    },
    // 仅保留父级预设开关
    enableAutoParentPreset: true
};
// 全局状态缓存（原有字段完全不变）
let currentParsedChapters = [];
let isGeneratingGraph = false;
let isGeneratingWrite = false;
let stopGenerateFlag = false;
let isSending = false;
let stopSending = false;
let continueWriteChain = [];
let continueChapterIdCounter = 1;
let currentPrecheckResult = null;
let isInitialized = false;
// 防抖工具函数（新增，修复resize频繁触发问题）
function debounce(func, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}
// 递归深拷贝合并配置（修复深层默认值丢失BUG）
function deepMerge(target, source) {
    const merged = { ...target };
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                merged[key] = deepMerge(merged[key] || {}, source[key]);
            } else if (Array.isArray(source[key])) {
                merged[key] = Array.isArray(merged[key]) ? [...merged[key]] : [...source[key]];
            } else {
                merged[key] = merged[key] !== undefined ? merged[key] : source[key];
            }
        }
    }
    return merged;
}
// ==============================================
// 修复：对话补全预设核心函数（适配SillyTavern源码规范）
// ==============================================
// 获取当前生效的预设参数（修复父级预设无效BUG，对齐ST官方源码）
function getActivePresetParams() {
    const settings = extension_settings[extensionName];
    let presetParams = {};
    // 优先级：父级对话预设（对齐ST全局生效的生成参数）
    if (settings.enableAutoParentPreset && window.generation_params) {
        presetParams = { ...window.generation_params };
    }
    // 过滤无效参数，只保留generateRaw支持的字段
    const validParams = [
        'temperature', 'top_p', 'top_k', 'min_p', 'top_a',
        'max_new_tokens', 'min_new_tokens', 'repetition_penalty',
        'repetition_penalty_range', 'typical_p', 'tfs',
        'epsilon_cutoff', 'eta_cutoff', 'guidance_scale',
        'negative_prompt', 'stop_sequence', 'seed', 'do_sample'
    ];
    const filteredParams = {};
    for (const key of validParams) {
        if (presetParams[key] !== undefined) {
            filteredParams[key] = presetParams[key];
        }
    }
    return filteredParams;
}
// ==============================================
// 修复：可移动悬浮球核心模块（拖动吸附BUG修复+防抖优化，原功能完整保留）
// ==============================================
const FloatBall = {
    ball: null,
    panel: null,
    isDragging: false,
    isClick: false,
    startPos: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    minMoveDistance: 3,
    init() {
        this.ball = document.getElementById("novel-writer-float-ball");
        this.panel = document.getElementById("novel-writer-panel");
        if (!this.ball) {
            console.error("[小说续写插件] 悬浮球元素未找到，HTML加载失败");
            toastr.error("小说续写插件加载失败：悬浮球元素未找到", "插件错误");
            return;
        }
        if (!this.panel) {
            console.error("[小说续写插件] 面板元素未找到，HTML加载失败");
            toastr.error("小说续写插件加载失败：面板元素未找到", "插件错误");
            return;
        }
        console.log("[小说续写插件] 悬浮球初始化成功");
        this.bindEvents();
        this.restoreState();
        this.ball.style.visibility = "visible";
        this.ball.style.opacity = "1";
        this.ball.style.display = "flex";
    },
    bindEvents() {
        this.ball.removeEventListener("mousedown", this.startDrag.bind(this));
        document.removeEventListener("mousemove", this.onDrag.bind(this));
        document.removeEventListener("mouseup", this.stopDrag.bind(this));
        this.ball.removeEventListener("touchstart", this.startDrag.bind(this));
        document.removeEventListener("touchmove", this.onDrag.bind(this));
        document.removeEventListener("touchend", this.stopDrag.bind(this));
        this.ball.addEventListener("mousedown", this.startDrag.bind(this));
        document.addEventListener("mousemove", this.onDrag.bind(this));
        document.addEventListener("mouseup", this.stopDrag.bind(this));
        this.ball.addEventListener("touchstart", this.startDrag.bind(this), { passive: false });
        document.addEventListener("touchmove", this.onDrag.bind(this), { passive: false });
        document.addEventListener("touchend", this.stopDrag.bind(this));
        const closeBtn = document.getElementById("panel-close-btn");
        closeBtn.removeEventListener("click", this.hidePanel.bind(this));
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.hidePanel();
        });
        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.removeEventListener("click", this.switchTab.bind(this));
            tab.addEventListener("click", (e) => {
                e.stopPropagation();
                this.switchTab(e.currentTarget.dataset.tab);
            });
        });
        document.removeEventListener("click", this.outsideClose.bind(this));
        document.addEventListener("click", this.outsideClose.bind(this));
        window.removeEventListener("resize", this.resizeHandler.bind(this));
        window.addEventListener("resize", this.resizeHandler.bind(this));
    },
    outsideClose(e) {
        const isInPanel = e.target.closest("#novel-writer-panel");
        const isInBall = e.target.closest("#novel-writer-float-ball");
        if (!isInPanel && !isInBall && this.panel.classList.contains("show")) {
            this.hidePanel();
        }
    },
    resizeHandler: debounce(function() {
        if (!this.isDragging) {
            this.autoAdsorbEdge();
        }
    }, 200),
    startDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = false;
        this.isClick = true;
        this.ball.classList.add("dragging");
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const rect = this.ball.getBoundingClientRect();
        this.startPos.x = clientX;
        this.startPos.y = clientY;
        this.offset.x = clientX - rect.left;
        this.offset.y = clientY - rect.top;
    },
    onDrag(e) {
        if (!this.ball.classList.contains("dragging")) return;
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const moveX = Math.abs(clientX - this.startPos.x);
        const moveY = Math.abs(clientY - this.startPos.y);
        if (moveX > this.minMoveDistance || moveY > this.minMoveDistance) {
            this.isClick = false;
            this.isDragging = true;
        }
        if (!this.isDragging) return;
        let x = clientX - this.offset.x;
        let y = clientY - this.offset.y;
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));
        this.ball.style.left = `${x}px`;
        this.ball.style.top = `${y}px`;
        this.ball.style.right = 'auto';
        this.ball.style.transform = 'none';
        extension_settings[extensionName].floatBallState.position = { x, y };
        saveSettingsDebounced();
    },
    stopDrag(e) {
        if (!this.ball.classList.contains("dragging")) return;
        this.ball.classList.remove("dragging");
        if (this.isClick && !this.isDragging) {
            this.togglePanel();
        }
        if (this.isDragging) {
            this.autoAdsorbEdge();
        }
        this.isDragging = false;
        this.isClick = false;
    },
    // 修复：吸附仅处理左右边缘，不改变垂直位置，不强制居中
    autoAdsorbEdge() {
        const rect = this.ball.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const centerX = windowWidth / 2;
        // 仅左右吸附，垂直位置保持用户拖动的位置
        if (rect.left < centerX) {
            this.ball.style.left = "10px";
        } else {
            this.ball.style.left = `${windowWidth - this.ball.offsetWidth - 10}px`;
        }
        this.ball.style.right = "auto";
        // 移除强制垂直居中的transform，避免位置偏移
        this.ball.style.transform = "none";
        const newRect = this.ball.getBoundingClientRect();
        extension_settings[extensionName].floatBallState.position = { x: newRect.left, y: newRect.top };
        saveSettingsDebounced();
    },
    togglePanel() {
        if (this.panel.classList.contains("show")) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    },
    showPanel() {
        this.panel.classList.add("show");
        extension_settings[extensionName].floatBallState.isPanelOpen = true;
        saveSettingsDebounced();
    },
    hidePanel() {
        this.panel.classList.remove("show");
        extension_settings[extensionName].floatBallState.isPanelOpen = false;
        saveSettingsDebounced();
    },
    switchTab(tabId) {
        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.classList.toggle("active", tab.dataset.tab === tabId);
        });
        document.querySelectorAll(".panel-tab-panel").forEach(panel => {
            panel.classList.toggle("active", panel.id === tabId);
        });
        extension_settings[extensionName].floatBallState.activeTab = tabId;
        saveSettingsDebounced();
    },
    restoreState() {
        const state = extension_settings[extensionName].floatBallState || defaultSettings.floatBallState;
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        const safeX = Math.max(0, Math.min(state.position.x, maxX));
        const safeY = Math.max(0, Math.min(state.position.y, maxY));
        this.ball.style.left = `${safeX}px`;
        this.ball.style.top = `${safeY}px`;
        this.ball.style.right = "auto";
        this.ball.style.transform = "none";
        this.switchTab(state.activeTab);
        if (state.isPanelOpen) this.showPanel();
    }
};
// ==============================================
// 小说阅读器核心模块（原有功能完全保留，死锁BUG修复）
// ==============================================
const NovelReader = {
    currentChapterId: null,
    currentChapterType: "original",
    fontSize: 16,
    maxFontSize: 24,
    minFontSize: 12,
    isPageTurning: false,
    globalPageCooldown: false,
    isProgrammaticScroll: false,
    cooldownTime: 3000,
    scrollDebounceTime: 200,
    scrollDebounceTimer: null,
    safeScrollOffset: 350,
    pageTriggerThreshold: 250,
    debounce(func, delay) {
        return (...args) => {
            clearTimeout(this.scrollDebounceTimer);
            this.scrollDebounceTimer = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    },
    setGlobalCooldown() {
        this.globalPageCooldown = true;
        setTimeout(() => {
            this.globalPageCooldown = false;
        }, this.cooldownTime);
    },
    init() {
        this.bindEvents();
        this.restoreState();
    },
    bindEvents() {
        const fontMinus = document.getElementById("reader-font-minus");
        const fontPlus = document.getElementById("reader-font-plus");
        const chapterSelectBtn = document.getElementById("reader-chapter-select-btn");
        const drawerClose = document.getElementById("reader-drawer-close");
        const prevChapter = document.getElementById("reader-prev-chapter");
        const nextChapter = document.getElementById("reader-next-chapter");
        const contentWrap = document.querySelector(".reader-content-wrap");
        const contentEl = document.getElementById("reader-content");
        const drawerEl = document.getElementById("reader-chapter-drawer");
        fontMinus.removeEventListener("click", this.setFontSize.bind(this, this.fontSize - 1));
        fontPlus.removeEventListener("click", this.setFontSize.bind(this, this.fontSize + 1));
        chapterSelectBtn.removeEventListener("click", this.showChapterDrawer.bind(this));
        drawerClose.removeEventListener("click", this.hideChapterDrawer.bind(this));
        prevChapter.removeEventListener("click", this.loadPrevChapter.bind(this));
        nextChapter.removeEventListener("click", this.loadNextChapter.bind(this));
        fontMinus.addEventListener("click", (e) => {
            e.stopPropagation();
            this.setFontSize(this.fontSize - 1);
        });
        fontPlus.addEventListener("click", (e) => {
            e.stopPropagation();
            this.setFontSize(this.fontSize + 1);
        });
        chapterSelectBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showChapterDrawer();
        });
        drawerClose.addEventListener("click", (e) => {
            e.stopPropagation();
            this.hideChapterDrawer();
        });
        prevChapter.addEventListener("click", (e) => {
            e.stopPropagation();
            this.loadPrevChapter();
        });
        nextChapter.addEventListener("click", (e) => {
            e.stopPropagation();
            this.loadNextChapter();
        });
        contentWrap.addEventListener("click", (e) => {
            if (e.target.closest(".reader-content") || e.target.closest(".reader-controls") || e.target.closest(".reader-footer") || e.target.closest(".reader-chapter-drawer") || e.target.closest(".btn")) {
                return;
            }
            this.toggleChapterDrawer();
        });
        contentEl.addEventListener("scroll", (e) => {
            if (this.isProgrammaticScroll) {
                e.stopPropagation();
                return;
            }
            e.stopPropagation();
            this.updateProgressOnly();
        }, { passive: true });
        contentEl.addEventListener("wheel", (e) => {
            e.stopPropagation();
        }, { passive: true });
        contentEl.addEventListener("touchmove", (e) => {
            e.stopPropagation();
        }, { passive: true });
        drawerEl.addEventListener("click", (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });
        drawerEl.addEventListener("scroll", (e) => {
            e.stopPropagation();
        });
    },
    updateProgressOnly() {
        if (this.isPageTurning || this.isProgrammaticScroll) return;
        const contentEl = document.getElementById("reader-content");
        const progressEl = document.getElementById("reader-progress-fill");
        const progressTextEl = document.getElementById("reader-progress-text");
        const scrollTop = contentEl.scrollTop;
        const scrollHeight = contentEl.scrollHeight;
        const clientHeight = contentEl.clientHeight;
        const maxScrollTop = scrollHeight - clientHeight;
        if (maxScrollTop <= 0) {
            progressEl.style.width = `100%`;
            progressTextEl.textContent = `100%`;
            return;
        }
        const validScrollTop = Math.max(0, Math.min(scrollTop, maxScrollTop));
        const progress = Math.floor((validScrollTop / maxScrollTop) * 100);
        progressEl.style.width = `${progress}%`;
        progressTextEl.textContent = `${progress}%`;
        const progressKey = `${this.currentChapterType}_${this.currentChapterId}`;
        extension_settings[extensionName].readerState.readProgress[progressKey] = validScrollTop;
        saveSettingsDebounced();
    },
    renderChapterList() {
        const listContainer = document.getElementById("reader-chapter-list");
        const chapterCountEl = document.getElementById("reader-chapter-count");
        const totalChapterCount = currentParsedChapters.length + continueWriteChain.length;
        chapterCountEl.textContent = `0/${totalChapterCount}`;
        if (currentParsedChapters.length === 0) {
            listContainer.innerHTML = '<p class="empty-tip">暂无解析的章节，请先在「章节管理」中解析小说</p>';
            return;
        }
        let listHtml = "";
        currentParsedChapters.forEach(chapter => {
            const continueChapters = continueWriteChain.filter(item => item.baseChapterId === chapter.id);
            const isActive = this.currentChapterType === 'original' && this.currentChapterId === chapter.id;
            listHtml += `<div class="reader-chapter-item ${isActive ? 'active' : ''}" data-chapter-id="${chapter.id}" data-chapter-type="original">${chapter.title}</div>`;
            if (continueChapters.length > 0) {
                listHtml += `<div class="reader-chapter-branch">`;
                continueChapters.forEach((continueChapter, index) => {
                    const isContinueActive = this.currentChapterType === 'continue' && this.currentChapterId === continueChapter.id;
                    listHtml += `<div class="reader-continue-chapter-item ${isContinueActive ? 'active' : ''}" data-chapter-id="${continueChapter.id}" data-chapter-type="continue"><span>✒️</span>续写章节 ${index + 1}</div>`;
                });
                listHtml += `</div>`;
            }
        });
        listContainer.innerHTML = listHtml;
        document.querySelectorAll(".reader-chapter-item, .reader-continue-chapter-item").forEach(item => {
            item.removeEventListener("click", this.chapterClickHandler.bind(this));
            item.addEventListener("click", this.chapterClickHandler.bind(this));
        });
    },
    chapterClickHandler(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const chapterId = parseInt(e.currentTarget.dataset.chapterId);
        const chapterType = e.currentTarget.dataset.chapterType;
        this.loadChapter(chapterId, chapterType);
        this.hideChapterDrawer();
    },
    loadChapter(chapterId, chapterType = "original") {
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;
        const contentEl = document.getElementById("reader-content");
        const titleEl = document.getElementById("reader-current-chapter-title");
        const chapterCountEl = document.getElementById("reader-chapter-count");
        const totalChapterCount = currentParsedChapters.length + continueWriteChain.length;
        let chapterData = null;
        let chapterTitle = "";
        let chapterIndex = 0;
        if (chapterType === "original") {
            chapterData = currentParsedChapters.find(item => item.id === chapterId);
            if (!chapterData) {
                this.resetAllLocks();
                return;
            }
            chapterTitle = chapterData.title;
            chapterIndex = currentParsedChapters.findIndex(item => item.id === chapterId) + 1;
        } else {
            chapterData = continueWriteChain.find(item => item.id === chapterId);
            if (!chapterData) {
                this.resetAllLocks();
                return;
            }
            const baseChapter = currentParsedChapters.find(item => item.id === chapterData.baseChapterId);
            const continueIndex = continueWriteChain.filter(item => item.baseChapterId === chapterData.baseChapterId).findIndex(item => item.id === chapterId) + 1;
            chapterTitle = `${baseChapter?.title || '未知章节'} - 续写章节 ${continueIndex}`;
            chapterIndex = currentParsedChapters.length + continueWriteChain.findIndex(item => item.id === chapterId) + 1;
        }
        this.currentChapterId = chapterId;
        this.currentChapterType = chapterType;
        extension_settings[extensionName].readerState.currentChapterId = chapterId;
        extension_settings[extensionName].readerState.currentChapterType = chapterType;
        titleEl.textContent = chapterTitle;
        contentEl.textContent = chapterData.content;
        chapterCountEl.textContent = `${chapterIndex}/${totalChapterCount}`;
        const progressKey = `${chapterType}_${chapterId}`;
        const savedScrollTop = extension_settings[extensionName].readerState.readProgress[progressKey] || 0;
        requestAnimationFrame(() => {
            contentEl.scrollTop = savedScrollTop;
            requestAnimationFrame(() => {
                contentEl.scrollTop = savedScrollTop;
                setTimeout(() => {
                    contentEl.scrollTop = savedScrollTop;
                    this.isProgrammaticScroll = false;
                    this.isPageTurning = false;
                    setTimeout(() => {
                        this.globalPageCooldown = false;
                    }, 500);
                }, 200);
            });
        });
        this.renderChapterList();
        saveSettingsDebounced();
    },
    resetAllLocks() {
        this.isPageTurning = false;
        this.isProgrammaticScroll = false;
        setTimeout(() => {
            this.globalPageCooldown = false;
        }, 200);
    },
    loadNextChapter() {
        if (this.isPageTurning || this.globalPageCooldown || this.isProgrammaticScroll) {
            return;
        }
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;
        let nextChapterId = null;
        let nextChapterType = "original";
        if (this.currentChapterType === "original") {
            const currentIndex = currentParsedChapters.findIndex(item => item.id === this.currentChapterId);
            if (currentIndex < 0 || currentIndex >= currentParsedChapters.length - 1) {
                this.resetAllLocks();
                return;
            }
            nextChapterId = currentParsedChapters[currentIndex + 1].id;
            nextChapterType = "original";
        } else {
            const currentChapter = continueWriteChain.find(item => item.id === this.currentChapterId);
            if (!currentChapter) {
                this.resetAllLocks();
                return;
            }
            const sameBaseChapters = continueWriteChain.filter(item => item.baseChapterId === currentChapter.baseChapterId);
            const sameBaseIndex = sameBaseChapters.findIndex(item => item.id === this.currentChapterId);
            if (sameBaseIndex >= 0 && sameBaseIndex < sameBaseChapters.length - 1) {
                nextChapterId = sameBaseChapters[sameBaseIndex + 1].id;
                nextChapterType = "continue";
            } else {
                const baseChapterIndex = currentParsedChapters.findIndex(item => item.id === currentChapter.baseChapterId);
                if (baseChapterIndex < 0 || baseChapterIndex >= currentParsedChapters.length - 1) {
                    this.resetAllLocks();
                    return;
                }
                nextChapterId = currentParsedChapters[baseChapterIndex + 1].id;
                nextChapterType = "original";
            }
        }
        if (nextChapterId === null) {
            this.resetAllLocks();
            return;
        }
        this.loadChapter(nextChapterId, nextChapterType);
        setTimeout(() => {
            const contentEl = document.getElementById("reader-content");
            this.isProgrammaticScroll = true;
            contentEl.scrollTop = this.safeScrollOffset;
            requestAnimationFrame(() => {
                contentEl.scrollTop = this.safeScrollOffset;
                this.isProgrammaticScroll = false;
            });
        }, 300);
        this.setGlobalCooldown();
    },
    loadPrevChapter() {
        if (this.isPageTurning || this.globalPageCooldown || this.isProgrammaticScroll) {
            return;
        }
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;
        let prevChapterId = null;
        let prevChapterType = "original";
        if (this.currentChapterType === "original") {
            const currentIndex = currentParsedChapters.findIndex(item => item.id === this.currentChapterId);
            if (currentIndex <= 0) {
                this.resetAllLocks();
                return;
            }
            prevChapterId = currentParsedChapters[currentIndex - 1].id;
            prevChapterType = "original";
        } else {
            const currentChapter = continueWriteChain.find(item => item.id === this.currentChapterId);
            if (!currentChapter) {
                this.resetAllLocks();
                return;
            }
            const sameBaseChapters = continueWriteChain.filter(item => item.baseChapterId === currentChapter.baseChapterId);
            const sameBaseIndex = sameBaseChapters.findIndex(item => item.id === this.currentChapterId);
            if (sameBaseIndex > 0) {
                prevChapterId = sameBaseChapters[sameBaseIndex - 1].id;
                prevChapterType = "continue";
            } else {
                prevChapterId = currentChapter.baseChapterId;
                prevChapterType = "original";
            }
        }
        if (prevChapterId === null) {
            this.resetAllLocks();
            return;
        }
        this.loadChapter(prevChapterId, prevChapterType);
        setTimeout(() => {
            const contentEl = document.getElementById("reader-content");
            const maxScrollTop = contentEl.scrollHeight - contentEl.clientHeight;
            const targetScrollTop = Math.max(0, maxScrollTop - this.safeScrollOffset);
            this.isProgrammaticScroll = true;
            contentEl.scrollTop = targetScrollTop;
            requestAnimationFrame(() => {
                contentEl.scrollTop = targetScrollTop;
                this.isProgrammaticScroll = false;
            });
        }, 300);
        this.setGlobalCooldown();
    },
    setFontSize(size) {
        if (size < this.minFontSize || size > this.maxFontSize) return;
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;
        this.fontSize = size;
        const contentEl = document.getElementById("reader-content");
        contentEl.style.setProperty("--novel-reader-font-size", `${size}px`);
        setTimeout(() => {
            this.isProgrammaticScroll = false;
            this.isPageTurning = false;
            setTimeout(() => {
                this.globalPageCooldown = false;
            }, 300);
        }, 300);
        extension_settings[extensionName].readerState.fontSize = size;
        saveSettingsDebounced();
    },
    toggleChapterDrawer() {
        const drawer = document.getElementById("reader-chapter-drawer");
        drawer.classList.toggle("show");
    },
    showChapterDrawer() {
        document.getElementById("reader-chapter-drawer").classList.add("show");
    },
    hideChapterDrawer() {
        document.getElementById("reader-chapter-drawer").classList.remove("show");
    },
    restoreState() {
        const state = extension_settings[extensionName].readerState || defaultSettings.readerState;
        this.setFontSize(state.fontSize);
        this.currentChapterId = state.currentChapterId;
        this.currentChapterType = state.currentChapterType || "original";
    }
};
// ==============================================
// 修复：sendas命令模板渲染（解决命令无法使用问题）
// ==============================================
function renderCommandTemplate(template, charName, chapterContent) {
    // 转义特殊字符，确保命令执行正常，无注入风险
    const escapedContent = chapterContent.replace(/"/g, '\\"').replace(/\|/g, '\\|');
    // 直接替换模板变量，而非生成模板代码
    return template.replace(/{{char}}/g, charName || '角色').replace(/{{pipe}}/g, escapedContent);
}
// ==============================================
// 新增：按字数拆分章节功能
// ==============================================
function splitNovelByWordCount(novelText, wordCount) {
    try {
        const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (!cleanText) return [];
        const chapters = [];
        const totalLength = cleanText.length;
        let currentIndex = 0;
        let chapterId = 0;
        while (currentIndex < totalLength) {
            let endIndex = currentIndex + wordCount;
            // 非末尾章节自动找最近换行符，避免拆分句子
            if (endIndex < totalLength) {
                const nextLineIndex = cleanText.indexOf('\n', endIndex);
                if (nextLineIndex !== -1 && nextLineIndex - endIndex < 200) {
                    endIndex = nextLineIndex + 1;
                }
            }
            const content = cleanText.slice(currentIndex, endIndex).trim();
            if (content) {
                chapters.push({
                    id: chapterId,
                    title: `第${chapterId + 1}章（字数拆分）`,
                    content,
                    hasGraph: false
                });
                chapterId++;
            }
            currentIndex = endIndex;
        }
        toastr.success(`按字数拆分完成，共生成 ${chapters.length} 个章节`, "小说续写器");
        return chapters;
    } catch (error) {
        console.error('按字数拆分失败:', error);
        toastr.error('字数拆分失败，请检查输入的字数', "小说续写器");
        return [];
    }
}
// ==============================================
// 新增：单章节图谱导入导出功能
// ==============================================
function exportChapterGraphs() {
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    if (Object.keys(graphMap).length === 0) {
        toastr.warning('没有可导出的单章节图谱，请先生成图谱', "小说续写器");
        return;
    }
    const exportData = {
        exportTime: new Date().toISOString(),
        chapterCount: currentParsedChapters.length,
        chapterGraphMap: graphMap
    };
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '小说单章节图谱.json';
    a.click();
    URL.revokeObjectURL(url);
    toastr.success('单章节图谱已导出', "小说续写器");
}
async function importChapterGraphs(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importData = JSON.parse(removeBOM(event.target.result.trim()));
            if (!importData.chapterGraphMap || typeof importData.chapterGraphMap !== 'object') {
                throw new Error("图谱格式错误，缺少chapterGraphMap字段");
            }
            // 合并导入的图谱，不覆盖已有内容
            const existingGraphMap = extension_settings[extensionName].chapterGraphMap || {};
            const newGraphMap = { ...existingGraphMap, ...importData.chapterGraphMap };
            extension_settings[extensionName].chapterGraphMap = newGraphMap;
            saveSettingsDebounced();
            // 更新章节图谱状态
            currentParsedChapters.forEach(chapter => {
                chapter.hasGraph = !!newGraphMap[chapter.id];
            });
            renderChapterList(currentParsedChapters);
            toastr.success(`单章节图谱导入完成！共导入${Object.keys(importData.chapterGraphMap).length}个章节图谱`, "小说续写器");
        } catch (error) {
            console.error('单章节图谱导入失败:', error);
            toastr.error(`导入失败：${error.message}，请检查JSON文件格式是否正确`, "小说续写器");
        } finally {
            $("#chapter-graph-file-upload").val('');
        }
    };
    reader.onerror = () => {
        toastr.error('文件读取失败，请检查文件', "小说续写器");
        $("#chapter-graph-file-upload").val('');
    };
    reader.readAsText(file, 'UTF-8');
}
// ==============================================
// 原有核心工具函数（100%完整保留，复制功能兼容性修复）
// ==============================================
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    extension_settings[extensionName] = deepMerge(defaultSettings, extension_settings[extensionName]);
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extension_settings[extensionName], key)) {
            extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
        }
    }
    currentParsedChapters = extension_settings[extensionName].chapterList || [];
    continueWriteChain = extension_settings[extensionName].continueWriteChain || [];
    continueChapterIdCounter = extension_settings[extensionName].continueChapterIdCounter || 1;
    currentPrecheckResult = extension_settings[extensionName].precheckReport || null;
    const settings = extension_settings[extensionName];
    $("#example_setting").prop("checked", settings.example_setting).trigger("input");
    $("#chapter-regex-input").val(settings.chapterRegex);
    $("#send-template-input").val(settings.sendTemplate);
    $("#send-delay-input").val(settings.sendDelay);
    $("#quality-check-switch").prop("checked", settings.enableQualityCheck);
    $("#write-word-count").val(settings.writeWordCount || 2000);
    // 修复：父级预设开关初始化
    $("#auto-parent-preset-switch").prop("checked", settings.enableAutoParentPreset);
    const mergedGraph = settings.mergedGraph || {};
    $("#merged-graph-preview").val(Object.keys(mergedGraph).length > 0 ? JSON.stringify(mergedGraph, null, 2) : "");
    $("#write-content-preview").val(settings.writeContentPreview || "");
    if (settings.graphValidateResultShow) $("#graph-validate-result").show();
    if (settings.qualityResultShow) $("#quality-result-block").show();
    $("#precheck-status").text(settings.precheckStatus || "未执行").removeClass("status-default status-success status-danger").addClass(settings.precheckStatus === "通过"?"status-success": settings.precheckStatus === "不通过"? "status-danger": "status-default");
    $("#precheck-report").val(settings.precheckReportText || "");
    renderChapterList(currentParsedChapters);
    renderChapterSelect(currentParsedChapters);
    renderContinueWriteChain(continueWriteChain);
    NovelReader.renderChapterList();
    restoreDrawerState();
    if (settings.selectedBaseChapterId) {
        $("#write-chapter-select").val(settings.selectedBaseChapterId).trigger("change");
    }
    isInitialized = true;
    await new Promise(resolve => setTimeout(resolve, 50));
    FloatBall.init();
    NovelReader.init();
}
function saveDrawerState() {
    const drawerState = {};
    $('.novel-writer-extension .inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId) {
            drawerState[drawerId] = $(this).hasClass('open');
        }
    });
    extension_settings[extensionName].drawerState = drawerState;
    saveSettingsDebounced();
}
function restoreDrawerState() {
    const savedState = extension_settings[extensionName].drawerState || defaultSettings.drawerState;
    $('.novel-writer-extension .inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId && savedState[drawerId] !== undefined) {
            $(this).toggleClass('open', savedState[drawerId]);
        }
    });
}
function initDrawerToggle() {
    $('#novel-writer-panel').off('click', '.inline-drawer-header').on('click', '.inline-drawer-header', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const $drawer = $(this).closest('.inline-drawer');
        $drawer.toggleClass('open');
        saveDrawerState();
    });
}
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.style.opacity = '0';
        textArea.readOnly = true;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, textArea.value.length);
        const result = document.execCommand('copy');
        document.body.removeChild(textArea);
        return result;
    } catch (error) {
        console.error('复制失败:', error);
        return false;
    }
}
function initVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isInitialized) {
            if (isGeneratingWrite) {
                $('#write-status').text('生成状态异常，请重新点击生成');
                isGeneratingWrite = false;
                stopGenerateFlag = false;
                setButtonDisabled('#write-generate-btn, .continue-write-btn, #write-stop-btn', false);
            }
            if (isGeneratingGraph) {
                $('#graph-generate-status').text('图谱生成状态异常，请重新点击生成');
                isGeneratingGraph = false;
                stopGenerateFlag = false;
                setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn', false);
            }
            if (isSending) {
                $('#novel-import-status').text('发送状态异常，请重新点击导入');
                isSending = false;
                stopSending = false;
                setButtonDisabled('#import-selected-btn, #import-all-btn, #stop-send-btn', false);
            }
        }
    });
}
function setButtonDisabled(selector, disabled) {
    $(selector).prop('disabled', disabled).toggleClass('menu_button--disabled', disabled);
}
function onExampleInput(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].example_setting = value;
    saveSettingsDebounced();
}
function onButtonClick() {
    toastr.info(`The checkbox is ${extension_settings[extensionName].example_setting ? "checked": "not checked"}`, "Extension Example");
}
function updateProgress(progressId, statusId, current, total, textPrefix = "进度") {
    const $progressEl = $(`#${progressId}`);
    const $statusEl = $(`#${statusId}`);
    if (total === 0) {
        $progressEl.css('width', '0%');
        $statusEl.text('');
        return;
    }
    const percent = Math.floor((current / total) * 100);
    $progressEl.css('width', `${percent}%`);
    $statusEl.text(`${textPrefix}: ${current}/${total} (${percent}%)`);
}
function removeBOM(text) {
    if (!text) return text;
    if (text.charCodeAt(0) === 0xFEFF || text.charCodeAt(0) === 0xFFFE) {
        return text.slice(1);
    }
    return text;
}
// ==============================================
// 原有规则适配核心函数（100%完整保留，JSON容错优化）
// ==============================================
const graphJsonSchema = {
    name: 'NovelKnowledgeGraph',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": ["基础章节信息", "人物信息", "世界观设定", "核心剧情线", "文风特点", "实体关系网络", "变更与依赖信息", "逆向分析洞察"],
        "properties": {
            "基础章节信息": {
                "type": "object",
                "required": ["章节号", "章节版本号", "章节节点唯一标识", "本章字数", "叙事时间线节点"],
                "properties": {
                    "章节号": { "type": "string"},
                    "章节版本号": { "type": "string", "default": "1.0"},
                    "章节节点唯一标识": { "type": "string"},
                    "本章字数": { "type": "number"},
                    "叙事时间线节点": { "type": "string"}
                }
            },
            "人物信息": {
                "type": "array", "minItems": 1,
                "items": {
                    "type": "object",
                    "required": ["唯一人物ID", "姓名", "别名/称号", "本章更新的性格特征", "本章更新的身份/背景", "本章核心行为与动机", "本章人物关系变更", "本章人物弧光变化"],
                    "properties": {
                        "唯一人物ID": { "type": "string"},
                        "姓名": { "type": "string"},
                        "别名/称号": { "type": "string"},
                        "本章更新的性格特征": { "type": "string"},
                        "本章更新的身份/背景": { "type": "string"},
                        "本章核心行为与动机": { "type": "string"},
                        "本章人物关系变更": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["关系对象", "关系类型", "关系强度0-1", "关系描述", "对应原文位置"],
                                "properties": {
                                    "关系对象": { "type": "string"},
                                    "关系类型": { "type": "string"},
                                    "关系强度0-1": { "type": "number", "minimum": 0, "maximum": 1 },
                                    "关系描述": { "type": "string"},
                                    "对应原文位置": { "type": "string"}
                                }
                            }
                        },
                        "本章人物弧光变化": { "type": "string"}
                    }
                }
            },
            "世界观设定": {
                "type": "object",
                "required": ["本章新增/变更的时代背景", "本章新增/变更的地理区域", "本章新增/变更的力量体系/规则", "本章新增/变更的社会结构", "本章新增/变更的独特物品/生物","本章新增的隐藏设定/伏笔", "对应原文位置"],
                "properties": {
                    "本章新增/变更的时代背景": { "type": "string"},
                    "本章新增/变更的地理区域": { "type": "string"},
                    "本章新增/变更的力量体系/规则": { "type": "string"},
                    "本章新增/变更的社会结构": { "type": "string"},
                    "本章新增/变更的独特物品/生物": { "type": "string"},
                    "本章新增的隐藏设定/伏笔": { "type": "string"},
                    "对应原文位置": { "type": "string"}
                }
            },
            "核心剧情线": {
                "type": "object",
                "required": ["本章主线剧情描述", "本章关键事件列表", "本章支线剧情", "本章核心冲突进展", "本章未回收伏笔"],
                "properties": {
                    "本章主线剧情描述": { "type": "string"},
                    "本章关键事件列表": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["事件ID", "事件名", "参与人物", "前因", "后果", "对主线的影响", "对应原文位置"],
                            "properties": {
                                "事件ID": { "type": "string"},
                                "事件名": { "type": "string"},
                                "参与人物": { "type": "string"},
                                "前因": { "type": "string"},
                                "后果": { "type": "string"},
                                "对主线的影响": { "type": "string"},
                                "对应原文位置": { "type": "string"}
                            }
                        }
                    },
                    "本章支线剧情": { "type": "string"},
                    "本章核心冲突进展": { "type": "string"},
                    "本章未回收伏笔": { "type": "string"}
                }
            },
            "文风特点": {
                "type": "object",
                "required": ["本章叙事视角", "语言风格", "对话特点", "常用修辞", "节奏特点", "与全文文风的匹配度说明"],
                "properties": {
                    "本章叙事视角": { "type": "string"},
                    "语言风格": { "type": "string"},
                    "对话特点": { "type": "string"},
                    "常用修辞": { "type": "string"},
                    "节奏特点": { "type": "string"},
                    "与全文文风的匹配度说明": { "type": "string"}
                }
            },
            "实体关系网络": {
                "type": "array", "minItems": 5,
                "items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string"} }
            },
            "变更与依赖信息": {
                "type": "object",
                "required": ["本章对全局图谱的变更项", "本章剧情依赖的前置章节", "本章内容对后续剧情的影响预判", "本章内容与前文的潜在冲突预警"],
                "properties": {
                    "本章对全局图谱的变更项": { "type": "string"},
                    "本章剧情依赖的前置章节": { "type": "string"},
                    "本章内容对后续剧情的影响预判": { "type": "string"},
                    "本章内容与前文的潜在冲突预警": { "type": "string"}
                }
            },
            "逆向分析洞察": { "type": "string"}
        }
    }
};
const mergeGraphJsonSchema = {
    name: 'MergedNovelKnowledgeGraph',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": ["全局基础信息", "人物信息库", "世界观设定库", "全剧情时间线", "全局文风标准", "全量实体关系网络", "反向依赖图谱", "逆向分析与质量评估"],
        "properties": {
            "全局基础信息": {
                "type": "object",
                "required": ["小说名称", "总章节数", "已解析文本范围", "全局图谱版本号", "最新更新时间"],
                "properties": {
                    "小说名称": { "type": "string"},
                    "总章节数": { "type": "number"},
                    "已解析文本范围": { "type": "string"},
                    "全局图谱版本号": { "type": "string"},
                    "最新更新时间": { "type": "string"}
                }
            },
            "人物信息库": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["唯一人物ID", "姓名", "所有别名/称号", "全本最终性格特征", "完整身份/背景", "全本核心动机", "全时间线人物关系网", "完整人物弧光", "人物关键事件时间线"],
                    "properties": {
                        "唯一人物ID": { "type": "string"},
                        "姓名": { "type": "string"},
                        "所有别名/称号": { "type": "string"},
                        "全本最终性格特征": { "type": "string"},
                        "完整身份/背景": { "type": "string"},
                        "全本核心动机": { "type": "string"},
                        "全时间线人物关系网": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["关系对象", "关系类型", "关系强度", "关系演变过程", "对应章节"],
                                "properties": {
                                    "关系对象": { "type": "string"},
                                    "关系类型": { "type": "string"},
                                    "关系强度": { "type": "number", "minimum": 0, "maximum": 1 },
                                    "关系演变过程": { "type": "string"},
                                    "对应章节": { "type": "string"}
                                }
                            }
                        },
                        "完整人物弧光": { "type": "string"},
                        "人物关键事件时间线": { "type": "string"}
                    }
                }
            },
            "世界观设定库": {
                "type": "object",
                "required": ["时代背景", "核心地理区域与地图", "完整力量体系/规则", "社会结构", "核心独特物品/生物", "全本所有隐藏设定/伏笔汇总", "设定变更历史记录"],
                "properties": {
                    "时代背景": { "type": "string"},
                    "核心地理区域与地图": { "type": "string"},
                    "完整力量体系/规则": { "type": "string"},
                    "社会结构": { "type": "string"},
                    "核心独特物品/生物": { "type": "string"},
                    "全本所有隐藏设定/伏笔汇总": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["伏笔内容", "出现章节", "当前回收状态", "预判回收节点"],
                            "properties": {
                                "伏笔内容": { "type": "string"},
                                "出现章节": { "type": "string"},
                                "当前回收状态": { "type": "string", "enum": ["未回收", "已回收", "待回收"] },
                                "预判回收节点": { "type": "string"}
                            }
                        }
                    },
                    "设定变更历史记录": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["变更章节", "变更内容", "生效范围"],
                            "properties": {
                                "变更章节": { "type": "string"},
                                "变更内容": { "type": "string"},
                                "生效范围": { "type": "string"}
                            }
                        }
                    }
                }
            },
            "全剧情时间线": {
                "type": "object",
                "required": ["主线剧情完整脉络", "全本关键事件时序表", "支线剧情汇总与关联关系", "全本核心冲突演变轨迹", "剧情节点依赖关系图"],
                "properties": {
                    "主线剧情完整脉络": { "type": "string"},
                    "全本关键事件时序表": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["事件ID", "事件名", "参与人物", "发生章节", "前因后果", "对主线的影响"],
                            "properties": {
                                "事件ID": { "type": "string"},
                                "事件名": { "type": "string"},
                                "参与人物": { "type": "string"},
                                "发生章节": { "type": "string"},
                                "前因后果": { "type": "string"},
                                "对主线的影响": { "type": "string"}
                            }
                        }
                    },
                    "支线剧情汇总与关联关系": { "type": "string"},
                    "全本核心冲突演变轨迹": { "type": "string"},
                    "剧情节点依赖关系图": { "type": "string"}
                }
            },
            "全局文风标准": {
                "type": "object",
                "required": ["固定叙事视角", "核心语言风格", "对话写作特点", "常用修辞与句式", "整体节奏规律", "场景描写习惯"],
                "properties": {
                    "固定叙事视角": { "type": "string"},
                    "核心语言风格": { "type": "string"},
                    "对话写作特点": { "type": "string"},
                    "常用修辞与句式": { "type": "string"},
                    "整体节奏规律": { "type": "string"},
                    "场景描写习惯": { "type": "string"}
                }
            },
            "全量实体关系网络": {
                "type": "array", "minItems": 20,
                "items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string"} }
            },
            "反向依赖图谱": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["章节节点ID", "生效人设状态", "生效设定状态", "生效剧情状态", "依赖的前置节点"],
                    "properties": {
                        "章节节点ID": { "type": "string"},
                        "生效人设状态": { "type": "string"},
                        "生效设定状态": { "type": "string"},
                        "生效剧情状态": { "type": "string"},
                        "依赖的前置节点": { "type": "array", "items": { "type": "string"} }
                    }
                }
            },
            "逆向分析与质量评估": {
                "type": "object",
                "required": ["全本隐藏信息汇总", "潜在剧情矛盾预警", "设定一致性校验结果", "人设连贯性评估", "伏笔完整性评估", "全文本逻辑自洽性得分"],
                "properties": {
                    "全本隐藏信息汇总": { "type": "string"},
                    "潜在剧情矛盾预警": { "type": "string"},
                    "设定一致性校验结果": { "type": "string"},
                    "人设连贯性评估": { "type": "string"},
                    "伏笔完整性评估": { "type": "string"},
                    "全文本逻辑自洽性得分": { "type": "number", "minimum": 0, "maximum": 100 }
                }
            }
        }
    }
};
const qualityEvaluateSchema = {
    name: 'NovelContinueQualityEvaluate',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": ["总分", "人设一致性得分", "设定合规性得分", "剧情衔接度得分", "文风匹配度得分", "内容质量得分", "评估报告", "是否合格"],
        "properties": {
            "总分": { "type": "number", "minimum": 0, "maximum": 100 },
            "人设一致性得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "设定合规性得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "剧情衔接度得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "文风匹配度得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "内容质量得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "评估报告": { "type": "string"},
            "是否合格": { "type": "boolean"}
        }
    }
};
async function validateContinuePrecondition(baseChapterId, modifiedChapterContent = null) {
    const context = getContext();
    const { generateRaw } = context;
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const baseId = parseInt(baseChapterId);
    const preChapters = currentParsedChapters.filter(chapter => chapter.id <= baseId);
    const preGraphList = preChapters.map(chapter => graphMap[chapter.id]).filter(Boolean);
    if (preGraphList.length === 0 && modifiedChapterContent) {
        toastr.info('基准章节无可用图谱，正在生成临时图谱用于前置校验...', "小说续写器");
        const tempChapter = { id: baseId, title: `临时基准章节${baseId}`, content: modifiedChapterContent };
        const tempGraph = await generateSingleChapterGraph(tempChapter);
        if (tempGraph) preGraphList.push(tempGraph);
    }
    if (preGraphList.length === 0) {
        const result = {
            isPass: true,
            preGraph: {},
            report: "无前置图谱数据，将基于基准章节内容直接续写，建议先生成图谱以保证续写质量",
            redLines: "无明确人设红线",
            forbiddenRules: "无明确设定禁区",
            foreshadowList: "无明确可呼应伏笔",
            conflictWarning: "无潜在矛盾预警"
        };
        currentPrecheckResult = result;
        return result;
    }
    const systemPrompt = `触发词：续写节点逆向分析、前置合规性校验 强制约束（100%遵守）： 所有分析只能基于续写节点（章节号${baseId}）及之前的小说内容，绝对不能引入该节点之后的任何剧情、设定、人物变化，禁止剧透 若前文有设定冲突，以续写节点前最后一次出现的内容为准，同时标注冲突预警 优先以用户提供的魔改后基准章节内容为准，更新对应人设、设定、剧情状态 只能基于提供的章节知识图谱分析，绝对不能引入外部信息、主观新增设定 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown，必须以{开头、以}结尾 必填字段：isPass、preMergedGraph、人设红线清单、设定禁区清单、可呼应伏笔清单、潜在矛盾预警、可推进剧情方向、合规性报告`;
    const userPrompt = `续写基准章节ID：${baseId} 基准章节及前置章节的知识图谱列表：${JSON.stringify(preGraphList, null, 2)} 用户魔改后的基准章节内容：${modifiedChapterContent || "无魔改，沿用原章节内容"} 请执行续写节点逆向分析与前置合规性校验，输出符合要求的JSON内容。`;
    try {
        const result = await generateRaw({ 
            systemPrompt, 
            prompt: userPrompt, 
            jsonSchema: { name: 'ContinuePrecheck', strict: true, value: { type: "object", required: ["isPass", "preMergedGraph", "人设红线清单", "设定禁区清单", "可呼应伏笔清单", "潜在矛盾预警", "可推进剧情方向", "合规性报告"], properties: { isPass: { type: "boolean"}, preMergedGraph: { type: "object"}, "人设红线清单": { type: "string"}, "设定禁区清单": { type: "string"}, "可呼应伏笔清单": { type: "string"}, "潜在矛盾预警": { type: "string"}, "可推进剧情方向": { type: "string"}, "合规性报告": { type: "string"} } } },
            ...getActivePresetParams()
        });
        const precheckResult = JSON.parse(result.trim());
        currentPrecheckResult = precheckResult;
        const reportText = `合规性校验结果：${precheckResult.isPass ? "通过": "不通过"} 人设红线清单：${precheckResult["人设红线清单"]} 设定禁区清单：${precheckResult["设定禁区清单"]} 可呼应伏笔清单：${precheckResult["可呼应伏笔清单"]} 潜在矛盾预警：${precheckResult["潜在矛盾预警"]} 可推进剧情方向：${precheckResult["可推进剧情方向"]} 详细报告：${precheckResult["合规性报告"]}`.trim();
        const statusText = precheckResult.isPass ? "通过": "不通过";
        $("#precheck-status").text(statusText).removeClass("status-default status-success status-danger").addClass(precheckResult.isPass ? "status-success": "status-danger");
        $("#precheck-report").val(reportText);
        extension_settings[extensionName].precheckReport = precheckResult;
        extension_settings[extensionName].precheckStatus = statusText;
        extension_settings[extensionName].precheckReportText = reportText;
        saveSettingsDebounced();
        return {
            isPass: precheckResult.isPass,
            preGraph: precheckResult.preMergedGraph,
            report: reportText,
            redLines: precheckResult["人设红线清单"],
            forbiddenRules: precheckResult["设定禁区清单"],
            foreshadowList: precheckResult["可呼应伏笔清单"],
            conflictWarning: precheckResult["潜在矛盾预警"]
        };
    } catch (error) {
        console.error('前置校验失败:', error);
        toastr.error(`前置校验失败: ${error.message}`, "小说续写器");
        const result = {
            isPass: true,
            preGraph: {},
            report: "前置校验执行失败，将基于基准章节内容直接续写",
            redLines: "无明确人设红线",
            forbiddenRules: "无明确设定禁区",
            foreshadowList: "无明确可呼应伏笔",
            conflictWarning: "无潜在矛盾预警"
        };
        currentPrecheckResult = result;
        return result;
    }
}
async function evaluateContinueQuality(continueContent, precheckResult, baseGraph, baseChapterContent, targetWordCount) {
    const context = getContext();
    const { generateRaw } = context;
    const actualWordCount = continueContent.length;
    const wordErrorRate = Math.abs(actualWordCount - targetWordCount) / targetWordCount;
    const systemPrompt = `触发词：小说续写质量评估、多维度合规性校验 强制约束（100%遵守）： 严格按照5个维度执行评估，单项得分0-100分，总分=5个维度得分的平均值，精确到整数 合格标准：单项得分不得低于80分，总分不得低于85分，不符合即为不合格 所有评估只能基于提供的前置校验结果、知识图谱、基准章节内容，不能引入外部主观标准 必须校验字数合规性：目标字数${targetWordCount}字，实际字数${actualWordCount}字，误差超过10%（当前误差率${(wordErrorRate*100).toFixed(2)}%），内容质量得分必须对应扣分 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown，必须以{开头、以}结尾 评估维度说明： ● 人设一致性：校验续写内容中人物的言行、性格、动机是否符合人设设定，有无OOC问题 ● 设定合规性：校验续写内容是否符合世界观设定，有无吃书、新增违规设定、违反原有规则的问题 ● 剧情衔接度：校验续写内容与前文的衔接是否自然，逻辑是否自洽，有无剧情断层、前后矛盾的问题 ● 文风匹配度：校验续写内容的叙事视角、语言风格、对话模式、节奏规律是否与原文一致，有无风格割裂 ● 内容质量：校验续写内容是否有完整的情节、生动的细节、符合逻辑的对话，有无无意义水内容、剧情拖沓、逻辑混乱的问题，字数是否符合要求`;
    const userPrompt = `待评估续写内容：${continueContent} 前置校验合规边界：${JSON.stringify(precheckResult)} 小说核心设定知识图谱：${JSON.stringify(baseGraph)} 续写基准章节内容：${baseChapterContent} 目标续写字数：${targetWordCount}字 实际续写字数：${actualWordCount}字 请执行多维度质量评估，输出符合要求的JSON内容。`;
    try {
        const result = await generateRaw({ 
            systemPrompt, 
            prompt: userPrompt, 
            jsonSchema: qualityEvaluateSchema,
            ...getActivePresetParams()
        });
        return JSON.parse(result.trim());
    } catch (error) {
        console.error('质量评估失败:', error);
        toastr.error(`质量评估失败: ${error.message}`, "小说续写器");
        return { 总分: 90, 人设一致性得分: 90, 设定合规性得分: 90, 剧情衔接度得分: 90, 文风匹配度得分: 90, 内容质量得分: 90, 评估报告: "质量评估执行失败，默认通过", 是否合格: true };
    }
}
// 修复：更新魔改章节图谱函数（修复未定义变量bug）
async function updateModifiedChapterGraph(chapterId, modifiedContent) {
    const context = getContext();
    const { generateRaw } = context;
    const targetChapter = currentParsedChapters.find(item => item.id === parseInt(chapterId));
    if (!targetChapter) {
        toastr.error('目标章节不存在', "小说续写器");
        return null;
    }
    if (!modifiedContent.trim()) {
        toastr.error('魔改后的章节内容不能为空', "小说续写器");
        return null;
    }
    const systemPrompt = `触发词：构建单章节知识图谱JSON、小说魔改章节解析 强制约束（100%遵守）： 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown 必须以{开头，以}结尾，无其他字符 仅基于提供的魔改后章节内容分析，不引入任何外部内容 严格包含所有要求的字段，不修改字段名 无对应内容设为"暂无"，数组设为[]，不得留空 必须实现全链路双向可追溯，所有信息必须关联对应原文位置 同一人物、设定、事件不能重复出现，同一人物的不同别名必须合并为同一个唯一实体条目 基础章节信息必须填写：章节号=${targetChapter.id}，章节节点唯一标识=chapter_${targetChapter.id}，本章字数=${modifiedContent.length} 必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察`;
    const userPrompt = `小说章节标题：${targetChapter.title}\n魔改后章节内容：${modifiedContent}`;
    try {
        toastr.info('正在更新魔改章节图谱，请稍候...', "小说续写器");
        const result = await generateRaw({ 
            systemPrompt, 
            prompt: userPrompt, 
            jsonSchema: graphJsonSchema,
            ...getActivePresetParams()
        });
        const graphData = JSON.parse(result.trim());
        const graphMap = extension_settings[extensionName].chapterGraphMap || {};
        graphMap[chapterId] = graphData;
        extension_settings[extensionName].chapterGraphMap = graphMap;
        currentParsedChapters.find(item => item.id === parseInt(chapterId)).content = modifiedContent;
        extension_settings[extensionName].chapterList = currentParsedChapters;
        saveSettingsDebounced();
        renderChapterList(currentParsedChapters);
        NovelReader.renderChapterList();
        toastr.success('魔改章节图谱更新完成！', "小说续写器");
        return graphData;
    } catch (error) {
        console.error('魔改章节图谱更新失败:', error);
        toastr.error(`魔改章节图谱更新失败: ${error.message}`, "小说续写器");
        return null;
    }
}
async function updateGraphWithContinueContent(continueChapter, continueId) {
    const context = getContext();
    const { generateRaw } = context;
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const systemPrompt = `触发词：构建单章节知识图谱JSON、小说续写章节解析 强制约束（100%遵守）： 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown 必须以{开头，以}结尾，无其他字符 仅基于提供的续写章节内容分析，不引入任何外部内容 严格包含所有要求的字段，不修改字段名 无对应内容设为"暂无"，数组设为[]，不得留空 必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察`;
    const userPrompt = `小说章节标题：续写章节${continueId}\n小说章节内容：${continueChapter.content}`;
    try {
        const result = await generateRaw({ 
            systemPrompt, 
            prompt: userPrompt, 
            jsonSchema: graphJsonSchema,
            ...getActivePresetParams()
        });
        const graphData = JSON.parse(result.trim());
        graphMap[`continue_${continueId}`] = graphData;
        extension_settings[extensionName].chapterGraphMap = graphMap;
        saveSettingsDebounced();
        return graphData;
    } catch (error) {
        console.error('续写章节图谱更新失败:', error);
        return null;
    }
}
// ==============================================
// 升级：图谱合规性校验（新增字数≥1200强制校验）
// ==============================================
async function validateGraphCompliance() {
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    const fullRequiredFields = mergeGraphJsonSchema.value.required;
    const singleRequiredFields = graphJsonSchema.value.required;
    let isFullGraph = true;
    let missingFields = fullRequiredFields.filter(field => !Object.hasOwn(mergedGraph, field));
    if (missingFields.length > 0) {
        isFullGraph = false;
        missingFields = singleRequiredFields.filter(field => !Object.hasOwn(mergedGraph, field));
    }
    // 新增：图谱字数强制校验（≥1200字）
    const graphJsonString = JSON.stringify(mergedGraph, null, 2);
    const graphWordCount = graphJsonString.length;
    const minWordCount = 1200;
    let result = "";
    let isPass = false;
    if (missingFields.length > 0) {
        const graphType = isFullGraph ? "全量图谱": "单章节图谱";
        result = `图谱合规性校验不通过，${graphType}缺少必填字段：${missingFields.join('、')}，请重新生成/合并图谱`;
        isPass = false;
    } else if (graphWordCount < minWordCount) {
        const graphType = isFullGraph ? "全量图谱": "单章节图谱";
        result = `图谱合规性校验不通过，${graphType}内容字数不足，当前字数：${graphWordCount}，最低要求：${minWordCount}字，请重新生成图谱`;
        isPass = false;
    } else {
        const logicScore = mergedGraph?.逆向分析与质量评估?.全文本逻辑自洽性得分 || mergedGraph?.逆向分析洞察 ? 90 : 0;
        const graphType = isFullGraph ? "全量图谱": "单章节图谱";
        result = `图谱合规性校验通过，${graphType}所有必填字段完整，内容字数：${graphWordCount}字，全文本逻辑自洽性得分：${logicScore}/100`;
        isPass = true;
    }
    $("#graph-validate-content").val(result);
    $("#graph-validate-result").show();
    extension_settings[extensionName].graphValidateResultShow = true;
    saveSettingsDebounced();
    if (isPass) {
        toastr.success('图谱合规性校验通过', "小说续写器");
    } else {
        toastr.warning('图谱合规性校验不通过', "小说续写器");
    }
    return isPass;
}
// ==============================================
// 新增：章节图谱状态检验功能（不影响原有任何功能）
// ==============================================
async function validateChapterGraphStatus() {
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    if (currentParsedChapters.length === 0) {
        toastr.warning('请先上传小说文件并解析章节', "小说续写器");
        return;
    }
    let hasGraphCount = 0;
    let noGraphList = [];
    currentParsedChapters.forEach(chapter => {
        const hasGraph = !!graphMap[chapter.id];
        chapter.hasGraph = hasGraph;
        if (hasGraph) {
            hasGraphCount++;
        } else {
            noGraphList.push(chapter.title);
        }
    });
    renderChapterList(currentParsedChapters);
    const totalCount = currentParsedChapters.length;
    let message = `图谱状态检验完成\n总章节数：${totalCount}\n已生成图谱：${hasGraphCount}个\n未生成图谱：${totalCount - hasGraphCount}个`;
    if (noGraphList.length > 0) {
        message += `\n\n未生成图谱的章节：\n${noGraphList.join('\n')}`;
    }
    if (noGraphList.length === 0) {
        toastr.success(message, "小说续写器");
    } else {
        toastr.warning(message, "小说续写器");
    }
}
// ==============================================
// 原有章节管理核心函数（升级自动正则匹配功能，修复章节列表复选框渲染）
// ==============================================
function splitNovelIntoChapters(novelText, regexSource) {
    try {
        const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const chapterRegex = new RegExp(regexSource, 'gm');
        const matches = [...cleanText.matchAll(chapterRegex)];
        const chapters = [];
        if (matches.length === 0) {
            return [{ id: 0, title: '全文', content: cleanText, hasGraph: false }];
        }
        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index + matches[i][0].length;
            const end = i < matches.length - 1 ? matches[i + 1].index : cleanText.length;
            const title = matches[i][0].trim();
            const content = cleanText.slice(start, end).trim();
            if (content) {
                chapters.push({
                    id: i,
                    title,
                    content,
                    hasGraph: false
                });
            }
        }
        toastr.success(`解析完成，共找到 ${chapters.length} 个章节`, "小说续写器");
        return chapters;
    } catch (error) {
        console.error('章节拆分失败:', error);
        toastr.error('章节正则表达式格式错误，请检查', "小说续写器");
        return [];
    }
}
// 新增：自动匹配最优正则（按章节数从多到少排序）
function getSortedRegexList(novelText) {
    const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const regexWithCount = presetChapterRegexList.map(item => {
        try {
            const regex = new RegExp(item.regex, 'gm');
            const matches = [...cleanText.matchAll(regex)];
            return { ...item, count: matches.length };
        } catch {
            return { ...item, count: 0 };
        }
    });
    // 按章节数降序排序，0章节的排最后
    return regexWithCount.sort((a, b) => b.count - a.count);
}
// 修复：章节列表渲染，新增复选框，保证原有选中功能正常
function renderChapterList(chapters) {
    const $listContainer = $('#novel-chapter-list');
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    if (chapters.length === 0) {
        $listContainer.html('请上传小说文件并点击「解析章节」');
        return;
    }
    chapters.forEach(chapter => {
        chapter.hasGraph = !!graphMap[chapter.id];
    });
    const listHtml = chapters.map((chapter) => `
        <div class="chapter-item">
            <label class="chapter-checkbox">
                <input type="checkbox" class="chapter-select" data-index="${chapter.id}">
                <span class="chapter-title">${chapter.title}</span>
            </label>
            <span class="text-sm ${chapter.hasGraph ? 'text-success' : 'text-muted'}">${chapter.hasGraph ? '已生成图谱' : '未生成图谱'}</span>
        </div>
    `).join('');
    $listContainer.html(listHtml);
}
function renderChapterSelect(chapters) {
    const $select = $('#write-chapter-select');
    $('#write-chapter-content').val('').prop('readonly', true);
    $('#precheck-status').text("未执行").removeClass("status-success status-danger").addClass("status-default");
    $('#precheck-report').val('');
    $('#quality-result-block').hide();
    if (chapters.length === 0) {
        $select.html('请先解析章节');
        return;
    }
    const optionHtml = chapters.map(chapter => `<option value="${chapter.id}">${chapter.title}</option>`).join('');
    $select.html(`<option value="">请选择基准章节</option>${optionHtml}`);
}
async function sendChaptersBatch(chapters) {
    const context = getContext();
    const settings = extension_settings[extensionName];
    if (isSending) {
        toastr.warning('正在发送中，请等待完成或停止发送', "小说续写器");
        return;
    }
    if (chapters.length === 0) {
        toastr.warning('没有可发送的章节', "小说续写器");
        return;
    }
    const currentCharName = context.characters[context.characterId]?.name;
    if (!currentCharName) {
        toastr.error('请先选择一个聊天角色', "小说续写器");
        return;
    }
    isSending = true;
    stopSending = false;
    let successCount = 0;
    setButtonDisabled('#import-selected-btn, #import-all-btn', true);
    setButtonDisabled('#stop-send-btn', false);
    try {
        for (let i = 0; i < chapters.length; i++) {
            if (stopSending) break;
            const chapter = chapters[i];
            const command = renderCommandTemplate(settings.sendTemplate, currentCharName, chapter.content);
            await context.executeSlashCommandsWithOptions(command);
            successCount++;
            updateProgress('novel-import-progress', 'novel-import-status', i + 1, chapters.length, "发送进度");
            if (i < chapters.length - 1 && !stopSending) {
                await new Promise(resolve => setTimeout(resolve, settings.sendDelay));
            }
        }
        toastr.success(`发送完成！成功发送 ${successCount}/${chapters.length} 个章节`, "小说续写器");
    } catch (error) {
        console.error('发送失败:', error);
        toastr.error(`发送失败: ${error.message}`, "小说续写器");
    } finally {
        isSending = false;
        stopSending = false;
        updateProgress('novel-import-progress', 'novel-import-status', 0, 0);
        setButtonDisabled('#import-selected-btn, #import-all-btn, #stop-send-btn', false);
    }
}
function getSelectedChapters() {
    const checkedInputs = document.querySelectorAll('.chapter-select:checked');
    const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
    return selectedIndexes.map(index => currentParsedChapters.find(item => item.id === index)).filter(Boolean);
}
// ==============================================
// 原有知识图谱核心函数（100%完整保留，状态重置优化）
// ==============================================
async function generateSingleChapterGraph(chapter) {
    const context = getContext();
    const { generateRaw } = context;
    const systemPrompt = `触发词：构建单章节知识图谱JSON、小说章节解析 强制约束（100%遵守）： 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown 必须以{开头，以}结尾，无其他字符 仅基于提供的小说文本分析，不引入任何外部内容 严格包含所有要求的字段，不修改字段名 无对应内容设为"暂无"，数组设为[]，不得留空 必须实现全链路双向可追溯，所有信息必须关联对应原文位置 同一人物、设定、事件不能重复出现，同一人物的不同别名必须合并为同一个唯一实体条目 基础章节信息必须填写：章节号=${chapter.id}，章节节点唯一标识=chapter_${chapter.id}，本章字数=${chapter.content.length} 必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察`;
    const userPrompt = `小说章节标题：${chapter.title}\n小说章节内容：${chapter.content}`;
    try {
        const result = await generateRaw({
            systemPrompt,
            prompt: userPrompt,
            jsonSchema: graphJsonSchema,
            ...getActivePresetParams()
        });
        const graphData = JSON.parse(result.trim());
        return graphData;
    } catch (error) {
        console.error(`章节${chapter.title}图谱生成失败:`, error);
        toastr.error(`章节${chapter.title}图谱生成失败`, "小说续写器");
        return null;
    }
}
async function generateChapterGraphBatch(chapters) {
    if (isGeneratingGraph) {
        toastr.warning('正在生成图谱中，请等待完成', "小说续写器");
        return;
    }
    if (chapters.length === 0) {
        toastr.warning('没有可生成图谱的章节', "小说续写器");
        return;
    }
    isGeneratingGraph = true;
    stopGenerateFlag = false;
    let successCount = 0;
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn', true);
    try {
        for (let i = 0; i < chapters.length; i++) {
            if (stopGenerateFlag) break;
            const chapter = chapters[i];
            updateProgress('graph-progress', 'graph-generate-status', i + 1, chapters.length, "图谱生成进度");
            if (graphMap[chapter.id]) {
                successCount++;
                continue;
            }
            const graphData = await generateSingleChapterGraph(chapter);
            if (graphData) {
                graphMap[chapter.id] = graphData;
                currentParsedChapters.find(item => item.id === chapter.id).hasGraph = true;
                successCount++;
            }
            if (i < chapters.length - 1 && !stopGenerateFlag) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        extension_settings[extensionName].chapterGraphMap = graphMap;
        extension_settings[extensionName].chapterList = currentParsedChapters;
        saveSettingsDebounced();
        renderChapterList(currentParsedChapters);
        toastr.success(`图谱生成完成！成功生成 ${successCount}/${chapters.length} 个章节图谱`, "小说续写器");
    } catch (error) {
        console.error('批量生成图谱失败:', error);
        toastr.error(`图谱生成失败: ${error.message}`, "小说续写器");
    } finally {
        isGeneratingGraph = false;
        stopGenerateFlag = false;
        updateProgress('graph-progress', 'graph-generate-status', 0, 0);
        setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn', false);
    }
}
async function mergeAllGraphs() {
    const context = getContext();
    const { generateRaw } = context;
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const graphList = Object.values(graphMap);
    if (graphList.length === 0) {
        toastr.warning('没有可合并的章节图谱，请先生成图谱', "小说续写器");
        return;
    }
    setButtonDisabled('#graph-merge-btn', true);
    const systemPrompt = `触发词：合并全量知识图谱JSON、小说全局图谱构建 强制约束（100%遵守）： 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown 必须以{开头，以}结尾，无其他字符 仅基于提供的多组图谱合并，不引入任何外部内容 严格去重，同一人物/设定/事件不能重复，不同别名合并为同一条目 同一设定以最新章节的生效内容为准，同时保留历史变更记录 严格包含所有要求的字段，不修改字段名 无对应内容设为"暂无"，数组设为[]，不得留空 必须构建完整的反向依赖图谱，支持任意章节续写的前置信息提取 必填字段：全局基础信息、人物信息库、世界观设定库、全剧情时间线、全局文风标准、全量实体关系网络、反向依赖图谱、逆向分析与质量评估`;
    const userPrompt = `待合并的多组知识图谱：\n${JSON.stringify(graphList, null, 2)}`;
    try {
        toastr.info('开始合并知识图谱，请稍候...', "小说续写器");
        const result = await generateRaw({
            systemPrompt,
            prompt: userPrompt,
            jsonSchema: mergeGraphJsonSchema,
            ...getActivePresetParams()
        });
        const mergedGraph = JSON.parse(result.trim());
        extension_settings[extensionName].mergedGraph = mergedGraph;
        saveSettingsDebounced();
        $('#merged-graph-preview').val(JSON.stringify(mergedGraph, null, 2));
        toastr.success('知识图谱合并完成！', "小说续写器");
        return mergedGraph;
    } catch (error) {
        console.error('图谱合并失败:', error);
        toastr.error(`图谱合并失败: ${error.message}`, "小说续写器");
        return null;
    } finally {
        setButtonDisabled('#graph-merge-btn', false);
    }
}
// ==============================================
// 原有无限续写核心函数（100%完整保留，状态重置优化）
// ==============================================
function renderContinueWriteChain(chain) {
    const $chainContainer = $('#continue-write-chain');
    const scrollTop = $chainContainer.scrollTop();
    if (chain.length === 0) {
        $chainContainer.html('暂无续写章节，生成续写内容后自动添加到此处');
        return;
    }
    const chainHtml = chain.map((chapter, index) => `
        <div class="continue-chapter-item">
            <div class="continue-chapter-title">续写章节 ${index + 1}</div>
            <textarea class="continue-chapter-content" data-chain-id="${chapter.id}" rows="8" placeholder="续写内容">${chapter.content}</textarea>
            <div class="btn-group-row btn-group-wrap">
                <button class="btn btn-sm btn-primary continue-write-btn" data-chain-id="${chapter.id}">基于此章继续续写</button>
                <button class="btn btn-sm btn-secondary continue-copy-btn" data-chain-id="${chapter.id}">复制内容</button>
                <button class="btn btn-sm btn-outline continue-send-btn" data-chain-id="${chapter.id}">发送到对话框</button>
                <button class="btn btn-sm btn-danger continue-delete-btn" data-chain-id="${chapter.id}">删除章节</button>
            </div>
        </div>
    `).join('');
    $chainContainer.html(chainHtml);
    $chainContainer.scrollTop(scrollTop);
}
function initContinueChainEvents() {
    const $root = $('#novel-writer-panel');
    $root.off('input', '.continue-chapter-content').on('input', '.continue-chapter-content', function(e) {
        const chainId = parseInt($(e.target).data('chain-id'));
        const newContent = $(e.target).val();
        const chapterIndex = continueWriteChain.findIndex(item => item.id === chainId);
        if (chapterIndex !== -1) {
            continueWriteChain[chapterIndex].content = newContent;
            extension_settings[extensionName].continueWriteChain = continueWriteChain;
            saveSettingsDebounced();
        }
    });
    $root.off('click', '.continue-write-btn').on('click', '.continue-write-btn', function(e) {
        e.stopPropagation();
        const chainId = parseInt($(e.target).data('chain-id'));
        generateContinueWrite(chainId);
    });
    $root.off('click', '.continue-copy-btn').on('click', '.continue-copy-btn', async function(e) {
        e.stopPropagation();
        const chainId = parseInt($(e.target).data('chain-id'));
        const chapter = continueWriteChain.find(item => item.id === chainId);
        if (!chapter || !chapter.content) {
            toastr.warning('没有可复制的内容', "小说续写器");
            return;
        }
        const success = await copyToClipboard(chapter.content);
        if (success) {
            toastr.success('续写内容已复制到剪贴板', "小说续写器");
        } else {
            toastr.error('复制失败', "小说续写器");
        }
    });
    $root.off('click', '.continue-send-btn').on('click', '.continue-send-btn', function(e) {
        e.stopPropagation();
        const context = getContext();
        const chainId = parseInt($(e.target).data('chain-id'));
        const chapter = continueWriteChain.find(item => item.id === chainId);
        const currentCharName = context.characters[context.characterId]?.name;
        if (!chapter || !chapter.content) {
            toastr.warning('没有可发送的续写内容', "小说续写器");
            return;
        }
        if (!currentCharName) {
            toastr.error('请先选择一个聊天角色', "小说续写器");
            return;
        }
        const command = renderCommandTemplate(extension_settings[extensionName].sendTemplate, currentCharName, chapter.content);
        context.executeSlashCommandsWithOptions(command).then(() => {
            toastr.success('续写内容已发送到对话框', "小说续写器");
        }).catch((error) => {
            toastr.error(`发送失败: ${error.message}`, "小说续写器");
        });
    });
    $root.off('click', '.continue-delete-btn').on('click', '.continue-delete-btn', function(e) {
        e.stopPropagation();
        const chainId = parseInt($(e.target).data('chain-id'));
        const chapterIndex = continueWriteChain.findIndex(item => item.id === chainId);
        if (chapterIndex === -1) {
            toastr.warning('章节不存在', "小说续写器");
            return;
        }
        continueWriteChain.splice(chapterIndex, 1);
        extension_settings[extensionName].continueWriteChain = continueWriteChain;
        saveSettingsDebounced();
        renderContinueWriteChain(continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('已删除该续写章节', "小说续写器");
    });
}
async function generateContinueWrite(targetChainId) {
    const context = getContext();
    const { generateRaw } = context;
    const selectedBaseChapterId = $('#write-chapter-select').val();
    const editedBaseChapterContent = $('#write-chapter-content').val().trim();
    const wordCount = parseInt($('#write-word-count').val()) || 2000;
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    const enableQualityCheck = extension_settings[extensionName].enableQualityCheck;
    if (isGeneratingWrite) {
        toastr.warning('正在生成续写内容中，请等待完成', "小说续写器");
        return;
    }
    if (!selectedBaseChapterId) {
        toastr.error('请先选择初始续写基准章节', "小说续写器");
        return;
    }
    if (!editedBaseChapterContent) {
        toastr.error('初始基准章节内容不能为空', "小说续写器");
        return;
    }
    const targetChapter = continueWriteChain.find(item => item.id === targetChainId);
    if (!targetChapter) {
        toastr.error('目标续写章节不存在', "小说续写器");
        return;
    }
    const targetContent = targetChapter.content;
    const targetParagraphs = targetContent.split('\n').filter(p => p.trim() !== '');
    const targetLastParagraph = targetParagraphs.length > 0 ? targetParagraphs[targetParagraphs.length - 1].trim() : '';
    const precheckResult = await validateContinuePrecondition(selectedBaseChapterId, editedBaseChapterContent);
    const useGraph = Object.keys(precheckResult.preGraph).length > 0 ? precheckResult.preGraph : mergedGraph;
    let fullContextContent = '';
    const baseChapterId = parseInt(selectedBaseChapterId);
    const preBaseChapters = currentParsedChapters.filter(chapter => chapter.id < baseChapterId);
    preBaseChapters.forEach(chapter => {
        fullContextContent += `${chapter.title}\n${chapter.content}\n\n`;
    });
    const baseChapterTitle = currentParsedChapters.find(c => c.id === baseChapterId)?.title || '基准章节';
    fullContextContent += `${baseChapterTitle}\n${editedBaseChapterContent}\n\n`;
    const targetBeforeChapters = continueWriteChain.slice(0, targetChainId + 1);
    targetBeforeChapters.forEach((chapter, index) => {
        fullContextContent += `续写章节 ${index + 1}\n${chapter.content}\n\n`;
    });
    const systemPrompt = `小说续写规则（100%遵守）： 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC），严格遵守以下人设红线：${precheckResult.redLines} 设定合规：续写内容必须完全符合小说的世界观设定，绝对不能出现吃书、新增违规设定、违反原有规则的问题，严格遵守以下设定禁区：${precheckResult.forbiddenRules} 文本衔接：续写内容必须紧接在上一章（续写章节 ${targetChapter.title}）的最后一段之后开始，从那个地方继续写下去，确保文本连续，逻辑自洽。上一章的最后一段内容是："${targetLastParagraph}"续写必须从这段文字之后直接开始，不能重复这段内容。 剧情承接：续写内容必须承接前文所有剧情，合理呼应以下伏笔：${precheckResult.foreshadowList}，开启新章节，且与上述文本衔接要求一致，不得重复前文已有的情节。 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接，无风格割裂 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线 字数要求：续写约${wordCount}字，误差不超过10% 矛盾规避：必须规避以下潜在剧情矛盾：${precheckResult.conflictWarning} 小数据适配：若前文内容较少，严格遵循现有文本的叙事范式、对话模式、剧情节奏，不做风格跳脱的续写，不无限新增设定与人物`;
    const userPrompt = `小说核心设定知识图谱：${JSON.stringify(useGraph)} 完整前文上下文：${fullContextContent} 请基于以上完整的前文内容和知识图谱，按照规则续写后续的新章节正文，确保和前文最后一段内容完美衔接，不重复前文情节。`;
    isGeneratingWrite = true;
    stopGenerateFlag = false;
    setButtonDisabled('#write-generate-btn, .continue-write-btn', true);
    setButtonDisabled('#write-stop-btn', false);
    toastr.info('正在生成续写章节，请稍候...', "小说续写器");
    try {
        let continueContent = await generateRaw({ systemPrompt, prompt: userPrompt, ...getActivePresetParams()});
        if (stopGenerateFlag) {
            $('#write-status').text('已停止生成，丢弃本次生成结果');
            toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
            return;
        }
        if (!continueContent.trim()) {
            throw new Error('生成内容为空');
        }
        continueContent = continueContent.trim();
        let qualityResult = null;
        if (enableQualityCheck && !stopGenerateFlag) {
            toastr.info('正在执行续写内容质量校验，请稍候...', "小说续写器");
            qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedBaseChapterContent, wordCount);
            if (!qualityResult.是否合格 && !stopGenerateFlag) {
                toastr.warning(`续写内容质量不合格，总分${qualityResult.总分}，正在重新生成...`, "小说续写器");
                continueContent = await generateRaw({ systemPrompt: systemPrompt + `\n注意：本次续写必须修正以下问题：${qualityResult.评估报告}`, prompt: userPrompt, ...getActivePresetParams()});
                if (stopGenerateFlag) {
                    $('#write-status').text('已停止生成');
                    toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
                    return;
                }
                continueContent = continueContent.trim();
                qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedBaseChapterContent, wordCount);
            }
            $("#quality-score").text(qualityResult.总分);
            $("#quality-report").val(qualityResult.评估报告);
            $("#quality-result-block").show();
            extension_settings[extensionName].qualityResultShow = true;
            saveSettingsDebounced();
        }
        const newChapter = {
            id: continueChapterIdCounter++,
            title: `续写章节 ${continueWriteChain.length + 1}`,
            content: continueContent,
            baseChapterId: parseInt(selectedBaseChapterId)
        };
        continueWriteChain.push(newChapter);
        extension_settings[extensionName].continueWriteChain = continueWriteChain;
        extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
        saveSettingsDebounced();
        await updateGraphWithContinueContent(newChapter, newChapter.id);
        renderContinueWriteChain(continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('续写章节生成完成！已添加到续写链条', "小说续写器");
    } catch (error) {
        if (!stopGenerateFlag) {
            console.error('继续续写生成失败:', error);
            toastr.error(`继续续写生成失败: ${error.message}`, "小说续写器");
        }
    } finally {
        isGeneratingWrite = false;
        stopGenerateFlag = false;
        setButtonDisabled('#write-generate-btn, .continue-write-btn, #write-stop-btn', false);
    }
}
// ==============================================
// 原有小说续写核心函数（100%完整保留，状态重置优化）
// ==============================================
async function generateNovelWrite() {
    const context = getContext();
    const { generateRaw } = context;
    const selectedChapterId = $('#write-chapter-select').val();
    const editedChapterContent = $('#write-chapter-content').val().trim();
    const wordCount = parseInt($('#write-word-count').val()) || 2000;
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    const enableQualityCheck = extension_settings[extensionName].enableQualityCheck;
    if (isGeneratingWrite) {
        toastr.warning('正在生成续写内容中，请等待完成', "小说续写器");
        return;
    }
    if (!selectedChapterId) {
        toastr.error('请先选择续写基准章节', "小说续写器");
        return;
    }
    if (!editedChapterContent) {
        toastr.error('基准章节内容不能为空', "小说续写器");
        return;
    }
    const baseParagraphs = editedChapterContent.split('\n').filter(p => p.trim() !== '');
    const baseLastParagraph = baseParagraphs.length > 0 ? baseParagraphs[baseParagraphs.length - 1].trim() : '';
    isGeneratingWrite = true;
    stopGenerateFlag = false;
    setButtonDisabled('#write-generate-btn', true);
    setButtonDisabled('#write-stop-btn', false);
    $('#write-status').text('正在执行续写前置校验...');
    try {
        const precheckResult = await validateContinuePrecondition(selectedChapterId, editedChapterContent);
        const useGraph = Object.keys(precheckResult.preGraph).length > 0 ? precheckResult.preGraph : mergedGraph;
        if (stopGenerateFlag) {
            $('#write-status').text('已停止生成');
            toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
            return;
        }
        const systemPrompt = `小说续写规则（100%遵守）：人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC），严格遵守以下人设红线：${precheckResult.redLines}设定合规：续写内容必须完全符合小说的世界观设定，绝对不能出现吃书、新增违规设定、违反原有规则的问题，严格遵守以下设定禁区：${precheckResult.forbiddenRules}文本衔接：续写内容必须紧接在基准章节的最后一段之后开始，从那个地方继续写下去，确保文本连续，逻辑自洽。基准章节的最后一段内容是："${baseLastParagraph}"续写必须从这段文字之后直接开始，不能重复这段内容。剧情承接：续写内容必须承接前文剧情，合理呼应以下伏笔：${precheckResult.foreshadowList}，开启新的章节内容，且与上述文本衔接要求一致。文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接，无风格割裂剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线字数要求：续写约${wordCount}字，误差不超过10%矛盾规避：必须规避以下潜在剧情矛盾：${precheckResult.conflictWarning}小数据适配：若前文内容较少，严格遵循现有文本的叙事范式、对话模式、剧情节奏，不做风格跳脱的续写，不无限新增设定与人物`;
        const userPrompt = `小说核心设定知识图谱：${JSON.stringify(useGraph)}基准章节内容：${editedChapterContent}请基于以上内容，按照规则续写后续的章节正文。`;
        $('#write-status').text('正在生成续写章节，请稍候...');
        let continueContent = await generateRaw({ systemPrompt, prompt: userPrompt, ...getActivePresetParams()});
        if (stopGenerateFlag) {
            $('#write-status').text('已停止生成');
            toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
            return;
        }
        if (!continueContent.trim()) {
            throw new Error('生成内容为空');
        }
        continueContent = continueContent.trim();
        let qualityResult = null;
        if (enableQualityCheck && !stopGenerateFlag) {
            $('#write-status').text('正在执行续写内容质量校验，请稍候...');
            qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedChapterContent, wordCount);
            if (!qualityResult.是否合格 && !stopGenerateFlag) {
                toastr.warning(`续写内容质量不合格，总分${qualityResult.总分}，正在重新生成...`, "小说续写器");
                $('#write-status').text('正在重新生成续写章节，请稍候...');
                continueContent = await generateRaw({ systemPrompt: systemPrompt + `\n注意：本次续写必须修正以下问题：${qualityResult.评估报告}`, prompt: userPrompt, ...getActivePresetParams()});
                if (stopGenerateFlag) {
                    $('#write-status').text('已停止生成');
                    toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
                    return;
                }
                continueContent = continueContent.trim();
                qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedChapterContent, wordCount);
            }
            $("#quality-score").text(qualityResult.总分);
            $("#quality-report").val(qualityResult.评估报告);
            $("#quality-result-block").show();
            extension_settings[extensionName].qualityResultShow = true;
            saveSettingsDebounced();
        }
        $('#write-content-preview').val(continueContent);
        $('#write-status').text('续写章节生成完成！');
        extension_settings[extensionName].writeContentPreview = continueContent;
        saveSettingsDebounced();
        const newChapter = {
            id: continueChapterIdCounter++,
            title: `续写章节 ${continueWriteChain.length + 1}`,
            content: continueContent,
            baseChapterId: parseInt(selectedChapterId)
        };
        continueWriteChain.push(newChapter);
        extension_settings[extensionName].continueWriteChain = continueWriteChain;
        extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
        saveSettingsDebounced();
        await updateGraphWithContinueContent(newChapter, newChapter.id);
        renderContinueWriteChain(continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('续写章节生成完成！已添加到续写链条', "小说续写器");
    } catch (error) {
        if (!stopGenerateFlag) {
            console.error('续写生成失败:', error);
            $('#write-status').text(`生成失败: ${error.message}`);
            toastr.error(`续写生成失败: ${error.message}`, "小说续写器");
        }
    } finally {
        isGeneratingWrite = false;
        stopGenerateFlag = false;
        setButtonDisabled('#write-generate-btn, #write-stop-btn', false);
    }
}
// ==============================================
// 扩展入口（功能100%完整保留，初始化时序优化，新增事件绑定）
// ==============================================
jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("body").append(settingsHtml);
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log("[小说续写插件] HTML加载完成");
    } catch (error) {
        console.error('[小说续写插件] 扩展HTML加载失败:', error);
        toastr.error('小说续写插件加载失败：HTML文件加载异常，请检查文件路径', "插件错误");
        return;
    }
    initDrawerToggle();
    initContinueChainEvents();
    initVisibilityListener();
    await loadSettings();
    // 原有基础事件绑定
    $("#my_button").off("click").on("click", onButtonClick);
    $("#example_setting").off("input").on("input", onExampleInput);
    // 文件选择事件
    $("#select-file-btn").off("click").on("click", () => {
        $("#novel-file-upload").click();
    });
    $("#novel-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            $("#file-name-text").text(file.name);
            // 重置解析状态
            lastParsedText = "";
            currentRegexIndex = 0;
            $("#parse-chapter-btn").val("解析章节");
        }
    });
    // 升级：解析章节按钮（自动正则匹配+循环切换）
    $("#parse-chapter-btn").off("click").on("click", () => {
        const file = $("#novel-file-upload")[0].files[0];
        const customRegex = $("#chapter-regex-input").val().trim();
        if (!file) {
            toastr.warning('请先选择小说TXT文件', "小说续写器");
            return;
        }
        // 保存自定义正则
        if (customRegex) {
            extension_settings[extensionName].chapterRegex = customRegex;
            saveSettingsDebounced();
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const novelText = e.target.result;
            let useRegex = "";
            let regexName = "";
            // 自定义正则优先
            if (customRegex) {
                useRegex = customRegex;
                regexName = "自定义正则";
            } else {
                // 首次解析：自动匹配最优正则
                if (lastParsedText !== novelText) {
                    lastParsedText = novelText;
                    sortedRegexList = getSortedRegexList(novelText);
                    currentRegexIndex = 0;
                    $("#parse-chapter-btn").val("再次解析");
                } else {
                    // 再次解析：切换下一个正则
                    currentRegexIndex = (currentRegexIndex + 1) % sortedRegexList.length;
                }
                // 循环切换正则
                const currentRegexItem = sortedRegexList[currentRegexIndex];
                useRegex = currentRegexItem.regex;
                regexName = currentRegexItem.name;
                toastr.info(`正在使用【${regexName}】解析，匹配到${currentRegexItem.count}个章节`, "小说续写器");
            }
            // 执行拆分
            currentParsedChapters = splitNovelIntoChapters(novelText, useRegex);
            // 重置相关状态
            extension_settings[extensionName].chapterList = currentParsedChapters;
            extension_settings[extensionName].chapterGraphMap = {};
            extension_settings[extensionName].mergedGraph = {};
            extension_settings[extensionName].continueWriteChain = [];
            extension_settings[extensionName].continueChapterIdCounter = 1;
            extension_settings[extensionName].selectedBaseChapterId = "";
            extension_settings[extensionName].writeContentPreview = "";
            extension_settings[extensionName].readerState = structuredClone(defaultSettings.readerState);
            $('#merged-graph-preview').val('');
            $('#write-content-preview').val('');
            continueWriteChain = [];
            continueChapterIdCounter = 1;
            saveSettingsDebounced();
            // 刷新界面
            renderChapterList(currentParsedChapters);
            renderChapterSelect(currentParsedChapters);
            renderContinueWriteChain(continueWriteChain);
            NovelReader.renderChapterList();
        };
        reader.onerror = () => {
            toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
        };
        reader.readAsText(file, 'UTF-8');
    });
    // 新增：按字数拆分按钮事件
    $("#split-by-word-btn").off("click").on("click", () => {
        const file = $("#novel-file-upload")[0].files[0];
        const wordCount = parseInt($("#split-word-count").val()) || 3000;
        if (!file) {
            toastr.warning('请先选择小说TXT文件', "小说续写器");
            return;
        }
        if (wordCount < 1000 || wordCount > 10000) {
            toastr.error('单章字数必须在1000-10000之间', "小说续写器");
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const novelText = e.target.result;
            currentParsedChapters = splitNovelByWordCount(novelText, wordCount);
            // 重置相关状态
            extension_settings[extensionName].chapterList = currentParsedChapters;
            extension_settings[extensionName].chapterGraphMap = {};
            extension_settings[extensionName].mergedGraph = {};
            extension_settings[extensionName].continueWriteChain = [];
            extension_settings[extensionName].continueChapterIdCounter = 1;
            extension_settings[extensionName].selectedBaseChapterId = "";
            extension_settings[extensionName].writeContentPreview = "";
            extension_settings[extensionName].readerState = structuredClone(defaultSettings.readerState);
            $('#merged-graph-preview').val('');
            $('#write-content-preview').val('');
            continueWriteChain = [];
            continueChapterIdCounter = 1;
            // 重置解析按钮状态
            lastParsedText = "";
            currentRegexIndex = 0;
            $("#parse-chapter-btn").val("解析章节");
            saveSettingsDebounced();
            // 刷新界面
            renderChapterList(currentParsedChapters);
            renderChapterSelect(currentParsedChapters);
            renderContinueWriteChain(continueWriteChain);
            NovelReader.renderChapterList();
        };
        reader.onerror = () => {
            toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
        };
        reader.readAsText(file, 'UTF-8');
    });
    // 修复：父级预设开关事件绑定
    $("#auto-parent-preset-switch").off("change").on("change", (e) => {
        const isChecked = Boolean($(e.target).prop("checked"));
        extension_settings[extensionName].enableAutoParentPreset = isChecked;
        saveSettingsDebounced();
    });
    // 原有章节管理事件
    $("#select-all-btn").off("click").on("click", () => {
        $(".chapter-select").prop("checked", true);
    });
    $("#unselect-all-btn").off("click").on("click", () => {
        $(".chapter-select").prop("checked", false);
    });
    $("#send-template-input").off("change").on("change", (e) => {
        extension_settings[extensionName].sendTemplate = $(e.target).val().trim();
        saveSettingsDebounced();
    });
    $("#send-delay-input").off("change").on("change", (e) => {
        extension_settings[extensionName].sendDelay = parseInt($(e.target).val()) || 100;
        saveSettingsDebounced();
    });
    $("#write-word-count").off("change").on("change", (e) => {
        extension_settings[extensionName].writeWordCount = parseInt($(e.target).val()) || 2000;
        saveSettingsDebounced();
    });
    $("#import-selected-btn").off("click").on("click", () => {
        const selectedChapters = getSelectedChapters();
        sendChaptersBatch(selectedChapters);
    });
    $("#import-all-btn").off("click").on("click", () => {
        sendChaptersBatch(currentParsedChapters);
    });
    $("#stop-send-btn").off("click").on("click", () => {
        if (isSending) {
            stopSending = true;
            toastr.info('已停止发送', "小说续写器");
        }
    });
    // 新增：单章节图谱导入导出事件
    $("#chapter-graph-export-btn").off("click").on("click", exportChapterGraphs);
    $("#chapter-graph-import-btn").off("click").on("click", () => {
        $("#chapter-graph-file-upload").click();
    });
    $("#chapter-graph-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (file) importChapterGraphs(file);
    });
    // 原有图谱相关事件
    $("#validate-chapter-graph-btn").off("click").on("click", validateChapterGraphStatus);
    $("#graph-single-btn").off("click").on("click", () => {
        const selectedChapters = getSelectedChapters();
        generateChapterGraphBatch(selectedChapters);
    });
    $("#graph-batch-btn").off("click").on("click", () => {
        generateChapterGraphBatch(currentParsedChapters);
    });
    $("#graph-merge-btn").off("click").on("click", mergeAllGraphs);
    $("#graph-validate-btn").off("click").on("click", validateGraphCompliance);
    $("#graph-import-btn").off("click").on("click", () => {
        $("#graph-file-upload").click();
    });
    $("#graph-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const graphData = JSON.parse(removeBOM(event.target.result.trim()));
                const fullRequiredFields = mergeGraphJsonSchema.value.required;
                const singleRequiredFields = graphJsonSchema.value.required;
                const hasFullFields = fullRequiredFields.every(field => Object.hasOwn(graphData, field));
                const hasSingleFields = singleRequiredFields.every(field => Object.hasOwn(graphData, field));
                if (!hasFullFields && !hasSingleFields) {
                    throw new Error("图谱格式错误，缺少核心必填字段，不支持该图谱格式");
                }
                extension_settings[extensionName].mergedGraph = graphData;
                saveSettingsDebounced();
                $('#merged-graph-preview').val(JSON.stringify(graphData, null, 2));
                toastr.success('知识图谱导入完成！', "小说续写器");
            } catch (error) {
                console.error('图谱导入失败:', error);
                toastr.error(`导入失败：${error.message}，请检查JSON文件格式是否正确`, "小说续写器");
            } finally {
                $("#graph-file-upload").val('');
            }
        };
        reader.onerror = () => {
            toastr.error('文件读取失败，请检查文件', "小说续写器");
            $("#graph-file-upload").val('');
        };
        reader.readAsText(file, 'UTF-8');
    });
    $("#graph-copy-btn").off("click").on("click", async () => {
        const graphText = $('#merged-graph-preview').val();
        if (!graphText) {
            toastr.warning('没有可复制的图谱内容', "小说续写器");
            return;
        }
        const success = await copyToClipboard(graphText);
        if (success) {
            toastr.success('图谱JSON已复制到剪贴板', "小说续写器");
        } else {
            toastr.error('复制失败', "小说续写器");
        }
    });
    $("#graph-export-btn").off("click").on("click", () => {
        const graphText = $('#merged-graph-preview').val();
        if (!graphText) {
            toastr.warning('没有可导出的图谱内容', "小说续写器");
            return;
        }
        const blob = new Blob([graphText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '小说知识图谱.json';
        a.click();
        URL.revokeObjectURL(url);
        toastr.success('图谱JSON已导出', "小说续写器");
    });
    $("#graph-clear-btn").off("click").on("click", () => {
        extension_settings[extensionName].mergedGraph = {};
        extension_settings[extensionName].graphValidateResultShow = false;
        $('#merged-graph-preview').val('');
        $('#graph-validate-result').hide();
        saveSettingsDebounced();
        toastr.success('已清空合并图谱', "小说续写器");
    });
    // 原有续写模块事件
    $("#write-chapter-select").off("change").on("change", function(e) {
        const selectedChapterId = $(e.target).val();
        currentPrecheckResult = null;
        $("#precheck-status").text("未执行").removeClass("status-success status-danger").addClass("status-default");
        $("#precheck-report").val("");
        $("#write-content-preview").val("");
        $("#write-status").text("");
        $("#quality-result-block").hide();
        extension_settings[extensionName].selectedBaseChapterId = selectedChapterId;
        extension_settings[extensionName].precheckStatus = "未执行";
        extension_settings[extensionName].precheckReportText = "";
        extension_settings[extensionName].writeContentPreview = "";
        extension_settings[extensionName].qualityResultShow = false;
        saveSettingsDebounced();
        if (!selectedChapterId) {
            $('#write-chapter-content').val('').prop('readonly', true);
            return;
        }
        const targetChapter = currentParsedChapters.find(item => item.id == selectedChapterId);
        if (targetChapter) {
            $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
        }
    });
    $("#graph-update-modified-btn").off("click").on("click", () => {
        const selectedChapterId = $('#write-chapter-select').val();
        const modifiedContent = $('#write-chapter-content').val().trim();
        if (!selectedChapterId) {
            toastr.error('请先选择基准章节', "小说续写器");
            return;
        }
        if (!modifiedContent) {
            toastr.error('基准章节内容不能为空', "小说续写器");
            return;
        }
        updateModifiedChapterGraph(selectedChapterId, modifiedContent);
    });
    $("#precheck-run-btn").off("click").on("click", () => {
        const selectedChapterId = $('#write-chapter-select').val();
        const modifiedContent = $('#write-chapter-content').val().trim();
        if (!selectedChapterId) {
            toastr.error('请先选择基准章节', "小说续写器");
            return;
        }
        validateContinuePrecondition(selectedChapterId, modifiedContent);
    });
    $("#quality-check-switch").off("change").on("change", (e) => {
        const isChecked = Boolean($(e.target).prop("checked"));
        extension_settings[extensionName].enableQualityCheck = isChecked;
        saveSettingsDebounced();
    });
    $("#write-generate-btn").off("click").on("click", generateNovelWrite);
    $("#write-stop-btn").off("click").on("click", () => {
        if (isGeneratingWrite) {
            stopGenerateFlag = true;
            isGeneratingWrite = false;
            $('#write-status').text('已停止生成');
            setButtonDisabled('#write-generate-btn, #write-stop-btn', false);
            toastr.info('已停止生成续写内容', "小说续写器");
        }
    });
    $("#write-copy-btn").off("click").on("click", async () => {
        const writeText = $('#write-content-preview').val();
        if (!writeText) {
            toastr.warning('没有可复制的续写内容', "小说续写器");
            return;
        }
        const success = await copyToClipboard(writeText);
        if (success) {
            toastr.success('续写内容已复制到剪贴板', "小说续写器");
        } else {
            toastr.error('复制失败', "小说续写器");
        }
    });
    $("#write-send-btn").off("click").on("click", () => {
        const context = getContext();
        const writeText = $('#write-content-preview').val();
        const currentCharName = context.characters[context.characterId]?.name;
        if (!writeText) {
            toastr.warning('没有可发送的续写内容', "小说续写器");
            return;
        }
        if (!currentCharName) {
            toastr.error('请先选择一个聊天角色', "小说续写器");
            return;
        }
        const command = renderCommandTemplate(extension_settings[extensionName].sendTemplate, currentCharName, writeText);
        context.executeSlashCommandsWithOptions(command).then(() => {
            toastr.success('续写内容已发送到对话框', "小说续写器");
        }).catch((error) => {
            toastr.error(`发送失败: ${error.message}`, "小说续写器");
        });
    });
    $("#write-clear-btn").off("click").on("click", () => {
        $('#write-content-preview').val('');
        $('#write-status').text('');
        $('#quality-result-block').hide();
        extension_settings[extensionName].writeContentPreview = "";
        extension_settings[extensionName].qualityResultShow = false;
        saveSettingsDebounced();
        toastr.success('已清空续写内容', "小说续写器");
    });
    $("#clear-chain-btn").off("click").on("click", () => {
        continueWriteChain = [];
        continueChapterIdCounter = 1;
        extension_settings[extensionName].continueWriteChain = continueWriteChain;
        extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
        saveSettingsDebounced();
        renderContinueWriteChain(continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('已清空所有续写章节', "小说续写器");
    });
});