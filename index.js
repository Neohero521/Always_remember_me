// 严格遵循官方模板导入规范，路径完全对齐
import {
  extension_settings,
  getContext,
  loadExtensionSettings,
} from "../../../extensions.js";

import { saveSettingsDebounced } from "../../../../script.js";

// 与仓库名称完全一致，确保路径正确
const extensionName = "Always_remember_me";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
// 按要求修改默认配置，新增悬浮相关默认项
const defaultSettings = {
  chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
  sendTemplate: "/sendas name={{char}} {{pipe}}", // 按要求修改发送命令
  sendDelay: 100, // 按要求默认间隔100ms
  example_setting: false,
  chapterList: [],
  chapterGraphMap: {},
  mergedGraph: {},
  // 新增Cola同款悬浮功能默认配置
  floatingBallEnabled: true,
  floatingBallPosition: null,
  floatingWindowVisible: false,
  floatingWindowPosition: null,
};

// 全局状态缓存
let currentParsedChapters = [];
let isGeneratingGraph = false;
let isGeneratingWrite = false;
let stopGenerateFlag = false;
let isSending = false;
let stopSending = false;

// ====================== 新增：Cola同款悬浮球与悬浮窗核心逻辑 ======================
// 悬浮球状态管理
let floatingBallState = {
  isDragging: false,
  startX: 0,
  startY: 0,
  initialX: 0,
  initialY: 0,
  currentX: 0,
  currentY: 0,
  hasMoved: false
};

// 悬浮窗状态管理
let floatingWindowState = {
  isDragging: false,
  isMinimized: false,
  startX: 0,
  startY: 0,
  initialLeft: 0,
  initialTop: 0,
  hasMoved: false
};

// Cola同款猫咪悬浮球SVG图标
const FLOATING_BALL_SVG = `
<svg viewBox="0 0 100 100" width="30" height="30" class="floating-ball-svg">
<defs>
<linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" style="stop-color:#FFFFFF;stop-opacity:1" />
<stop offset="100%" style="stop-color:#FFE4EC;stop-opacity:1" />
</linearGradient>
</defs>
<!-- 圆形背景 -->
<circle cx="50" cy="50" r="48" fill="url(#bg-gradient)" />
<!-- 左耳 -->
<path d="M18,45 L28,12 L45,38" fill="#FFB6C1" stroke="#333" stroke-width="2" stroke-linejoin="round" />
<!-- 右耳 -->
<path d="M82,45 L72,12 L55,38" fill="#FFB6C1" stroke="#333" stroke-width="2" stroke-linejoin="round" />
<!-- 胡须 -->
<g stroke="#333" stroke-width="2" stroke-linecap="round">
<path d="M8,52 L35,56" />
<path d="M8,64 L35,62" />
<path d="M92,52 L65,56" />
<path d="M92,64 L65,62" />
</g>
</svg>
`;

// 生成悬浮窗HTML（完整包含原有所有功能UI，ID加前缀避免冲突）
function generateFloatingWindowHTML() {
  return `
  <div id="novel-writer-floating-window" class="novel-writer-floating-window">
    <!-- 悬浮窗顶部拖拽栏 -->
    <div class="floating-window-header">
      <span class="floating-window-title">小说续写器</span>
      <div class="floating-window-actions">
        <button id="floating-window-minimize-btn" class="floating-window-btn" title="最小化">
          <svg viewBox="0 0 24 24" width="16" height="16"><rect x="2" y="10" width="20" height="2" fill="currentColor" /></svg>
        </button>
        <button id="floating-window-close-btn" class="floating-window-btn" title="关闭">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" /></svg>
        </button>
      </div>
    </div>
    <!-- 悬浮窗内容区域（完整原有功能） -->
    <div class="floating-window-content">
      <div class="novel-writer-extension floating-version">
        <!-- 模块1：章节导入与管理 -->
        <div class="inline-drawer">
          <div class="inline-drawer-toggle inline-drawer-header">
            <b>1. 章节导入与管理</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
          </div>
          <div class="inline-drawer-content">
            <div class="novel-block flex-container">
              <label for="floating-novel-file-upload" class="margin-r5">小说TXT文件</label>
              <input id="floating-novel-file-upload" type="file" accept=".txt" class="flex1" />
            </div>
            <div class="novel-block flex-container">
              <label for="floating-chapter-regex-input" class="margin-r5">章节拆分正则</label>
              <input id="floating-chapter-regex-input" type="text" class="flex1" placeholder="^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$" />
            </div>
            <div class="novel-block flex-container">
              <label for="floating-send-template-input" class="margin-r5">发送命令模板</label>
              <input id="floating-send-template-input" type="text" class="flex1" value="/sendas name={{char}} {{pipe}}" />
            </div>
            <div class="novel-block flex-container">
              <label for="floating-send-delay-input" class="margin-r5">发送间隔(ms)</label>
              <input id="floating-send-delay-input" type="number" min="50" step="10" class="flex1" value="100" />
            </div>
            <div class="novel-block flex-container">
              <input id="floating-parse-chapter-btn" class="menu_button menu_button--primary" type="submit" value="解析章节" />
            </div>
            <hr class="sysHR" />
            <div class="novel-block flex-container justifySpaceBetween">
              <b>章节列表（仅显示标题）</b>
              <div class="flex-container gap5">
                <input id="floating-select-all-btn" class="menu_button menu_button--sm" type="submit" value="全选" />
                <input id="floating-unselect-all-btn" class="menu_button menu_button--sm" type="submit" value="全不选" />
              </div>
            </div>
            <div id="floating-novel-chapter-list" class="novel-block chapter-list">
              <p class="text-muted text-center">请上传小说文件并点击「解析章节」</p>
            </div>
            <div class="novel-block">
              <p id="floating-novel-import-status" class="text-sm margin0"></p>
              <div class="progress-bar">
                <div id="floating-novel-import-progress" class="progress-fill"></div>
              </div>
            </div>
            <hr class="sysHR" />
            <div class="novel-block flex-container gap5">
              <input id="floating-stop-send-btn" class="menu_button menu_button--danger" type="submit" value="停止发送" />
              <input id="floating-import-selected-btn" class="menu_button menu_button--primary" type="submit" value="导入选中章节到对话框" />
              <input id="floating-import-all-btn" class="menu_button menu_button--secondary" type="submit" value="导入全部章节到对话框" />
            </div>
          </div>
        </div>

        <!-- 模块2：知识图谱构建与合并 -->
        <div class="inline-drawer">
          <div class="inline-drawer-toggle inline-drawer-header">
            <b>2. 知识图谱构建与合并</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
          </div>
          <div class="inline-drawer-content">
            <div class="novel-block flex-container justifySpaceBetween">
              <b>图谱生成</b>
              <div class="flex-container gap5">
                <input id="floating-graph-single-btn" class="menu_button menu_button--primary" type="submit" value="生成选中章节图谱" />
                <input id="floating-graph-batch-btn" class="menu_button menu_button--secondary" type="submit" value="批量生成全章节图谱" />
              </div>
            </div>
            <div class="novel-block">
              <p id="floating-graph-generate-status" class="text-sm margin0"></p>
              <div class="progress-bar">
                <div id="floating-graph-progress" class="progress-fill"></div>
              </div>
            </div>
            <hr class="sysHR" />
            <div class="novel-block flex-container justifySpaceBetween">
              <b>全量图谱合并</b>
              <input id="floating-graph-merge-btn" class="menu_button menu_button--primary" type="submit" value="合并已生成的章节图谱" />
            </div>
            <div class="novel-block">
              <label class="form-label">合并后完整知识图谱</label>
              <textarea id="floating-merged-graph-preview" rows="6" class="form-control w100" readonly placeholder="合并后的图谱JSON将显示在这里..."></textarea>
              <div class="flex-container gap5 margin-t5">
                <input id="floating-graph-copy-btn" class="menu_button menu_button--sm" type="submit" value="复制JSON" />
                <input id="floating-graph-export-btn" class="menu_button menu_button--sm" type="submit" value="导出JSON文件" />
                <input id="floating-graph-clear-btn" class="menu_button menu_button--sm menu_button--danger" type="submit" value="清空图谱" />
              </div>
            </div>
          </div>
        </div>

        <!-- 模块3：小说续写生成 -->
        <div class="inline-drawer">
          <div class="inline-drawer-toggle inline-drawer-header">
            <b>3. 小说续写生成</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
          </div>
          <div class="inline-drawer-content">
            <div class="novel-block flex-container">
              <label for="floating-write-chapter-select" class="margin-r5">选择续写基准章节</label>
              <select id="floating-write-chapter-select" class="flex1">
                <option value="">请先解析章节</option>
              </select>
            </div>
            <div class="novel-block">
              <label class="form-label">基准章节内容（可直接编辑修改）</label>
              <textarea id="floating-write-chapter-content" rows="12" class="form-control w100" placeholder="请先选择上方的基准章节..." readonly></textarea>
            </div>
            <div class="novel-block flex-container">
              <label for="floating-write-word-count" class="margin-r5">续写字数</label>
              <input id="floating-write-word-count" type="number" min="500" max="10000" step="100" class="flex1" value="2000" />
              <span class="margin-l5 text-muted">范围：500-10000</span>
            </div>
            <hr class="sysHR" />
            <div class="novel-block flex-container gap5">
              <input id="floating-write-generate-btn" class="menu_button menu_button--primary" type="submit" value="生成续写章节" />
              <input id="floating-write-stop-btn" class="menu_button menu_button--danger" type="submit" value="停止生成" />
            </div>
            <div class="novel-block">
              <p id="floating-write-status" class="text-sm margin0"></p>
            </div>
            <hr class="sysHR" />
            <div class="novel-block">
              <label class="form-label">续写生成结果</label>
              <textarea id="floating-write-content-preview" rows="15" class="form-control w100" placeholder="生成的续写章节内容将显示在这里..."></textarea>
              <div class="flex-container gap5 margin-t5">
                <input id="floating-write-copy-btn" class="menu_button menu_button--sm" type="submit" value="复制内容" />
                <input id="floating-write-send-btn" class="menu_button menu_button--primary" type="submit" value="发送到对话框" />
                <input id="floating-write-clear-btn" class="menu_button menu_button--sm menu_button--danger" type="submit" value="清空内容" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  `;
}

// 创建悬浮球（Cola同款逻辑）
function createFloatingBall() {
  if (document.getElementById('novel-writer-floating-ball')) return;
  const ball = document.createElement('div');
  ball.id = 'novel-writer-floating-ball';
  ball.className = 'novel-writer-floating-ball';
  ball.innerHTML = FLOATING_BALL_SVG;
  document.body.appendChild(ball);
  restoreFloatingBallPosition(ball);
  bindFloatingBallEvents(ball);
  return ball;
}

// 恢复悬浮球保存的位置
function restoreFloatingBallPosition(ball) {
  const savedPos = extension_settings[extensionName]?.floatingBallPosition;
  if (savedPos && savedPos.x !== undefined && savedPos.y !== undefined) {
    const maxX = window.innerWidth - 30;
    const maxY = window.innerHeight - 30;
    floatingBallState.currentX = Math.min(Math.max(0, savedPos.x), maxX);
    floatingBallState.currentY = Math.min(Math.max(0, savedPos.y), maxY);
  } else {
    // 默认位置：右侧中间（和Cola一致）
    floatingBallState.currentX = window.innerWidth - 40;
    floatingBallState.currentY = (window.innerHeight - 30) / 2;
  }
  ball.style.left = floatingBallState.currentX + 'px';
  ball.style.top = floatingBallState.currentY + 'px';
}

// 保存悬浮球位置
function saveFloatingBallPosition() {
  if (!extension_settings[extensionName]) return;
  extension_settings[extensionName].floatingBallPosition = {
    x: floatingBallState.currentX,
    y: floatingBallState.currentY
  };
  saveSettingsDebounced();
}

// 绑定悬浮球事件
function bindFloatingBallEvents(ball) {
  // 鼠标事件
  ball.addEventListener('mousedown', onFloatingBallDragStart);
  document.addEventListener('mousemove', onFloatingBallDragMove);
  document.addEventListener('mouseup', onFloatingBallDragEnd);
  // 触摸事件（移动端适配）
  ball.addEventListener('touchstart', onFloatingBallDragStart, { passive: false });
  document.addEventListener('touchmove', onFloatingBallDragMove, { passive: false });
  document.addEventListener('touchend', onFloatingBallDragEnd);
  // 窗口大小变化时边界适配
  window.addEventListener('resize', () => {
    const maxX = window.innerWidth - 30;
    const maxY = window.innerHeight - 30;
    if (floatingBallState.currentX > maxX) {
      floatingBallState.currentX = maxX;
      ball.style.left = floatingBallState.currentX + 'px';
    }
    if (floatingBallState.currentY > maxY) {
      floatingBallState.currentY = maxY;
      ball.style.top = floatingBallState.currentY + 'px';
    }
  });
}

// 悬浮球拖拽开始
function onFloatingBallDragStart(e) {
  const ball = document.getElementById('novel-writer-floating-ball');
  if (!ball) return;
  floatingBallState.isDragging = true;
  floatingBallState.hasMoved = false;
  if (e.type === 'touchstart') {
    floatingBallState.startX = e.touches[0].clientX;
    floatingBallState.startY = e.touches[0].clientY;
    e.preventDefault();
  } else {
    floatingBallState.startX = e.clientX;
    floatingBallState.startY = e.clientY;
  }
  floatingBallState.initialX = floatingBallState.currentX;
  floatingBallState.initialY = floatingBallState.currentY;
  ball.classList.add('dragging');
}

// 悬浮球拖拽移动
function onFloatingBallDragMove(e) {
  if (!floatingBallState.isDragging) return;
  const ball = document.getElementById('novel-writer-floating-ball');
  if (!ball) return;
  let clientX, clientY;
  if (e.type === 'touchmove') {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
    e.preventDefault();
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  const deltaX = clientX - floatingBallState.startX;
  const deltaY = clientY - floatingBallState.startY;
  // 移动超过5px判定为拖拽，避免和点击冲突
  if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
    floatingBallState.hasMoved = true;
  }
  // 边界限制
  let newX = floatingBallState.initialX + deltaX;
  let newY = floatingBallState.initialY + deltaY;
  const maxX = window.innerWidth - 30;
  const maxY = window.innerHeight - 30;
  newX = Math.min(Math.max(0, newX), maxX);
  newY = Math.min(Math.max(0, newY), maxY);
  floatingBallState.currentX = newX;
  floatingBallState.currentY = newY;
  ball.style.left = newX + 'px';
  ball.style.top = newY + 'px';
}

// 悬浮球拖拽结束
function onFloatingBallDragEnd(e) {
  if (!floatingBallState.isDragging) return;
  const ball = document.getElementById('novel-writer-floating-ball');
  if (ball) ball.classList.remove('dragging');
  floatingBallState.isDragging = false;
  // 无移动判定为点击，切换悬浮窗
  if (!floatingBallState.hasMoved) {
    toggleFloatingWindow();
  } else {
    saveFloatingBallPosition();
  }
}

// 切换悬浮窗显示/隐藏
function toggleFloatingWindow() {
  const windowEl = document.getElementById('novel-writer-floating-window');
  if (!windowEl) {
    createFloatingWindow();
    return;
  }
  const isHidden = windowEl.classList.contains('hidden');
  if (isHidden) {
    windowEl.classList.remove('hidden');
    restoreFloatingWindowPosition(windowEl);
  } else {
    windowEl.classList.add('hidden');
  }
  // 持久化状态
  if (extension_settings[extensionName]) {
    extension_settings[extensionName].floatingWindowVisible = !isHidden;
    saveSettingsDebounced();
  }
}

// 创建悬浮窗
function createFloatingWindow() {
  if (document.getElementById('novel-writer-floating-window')) return;
  const windowEl = document.createElement('div');
  windowEl.id = 'novel-writer-floating-window';
  windowEl.className = 'novel-writer-floating-window';
  windowEl.innerHTML = generateFloatingWindowHTML();
  document.body.appendChild(windowEl);
  restoreFloatingWindowPosition(windowEl);
  bindFloatingWindowEvents(windowEl);
  bindFloatingWindowFunctionEvents(windowEl);
  // 同步数据到悬浮窗
  renderFloatingChapterList(currentParsedChapters);
  renderFloatingChapterSelect(currentParsedChapters);
  $('#floating-chapter-regex-input').val(extension_settings[extensionName].chapterRegex);
  $('#floating-send-template-input').val(extension_settings[extensionName].sendTemplate);
  $('#floating-send-delay-input').val(extension_settings[extensionName].sendDelay);
  $('#floating-merged-graph-preview').val(JSON.stringify(extension_settings[extensionName].mergedGraph, null, 2));
  // 持久化状态
  if (extension_settings[extensionName]) {
    extension_settings[extensionName].floatingWindowVisible = true;
    saveSettingsDebounced();
  }
  return windowEl;
}

// 恢复悬浮窗位置
function restoreFloatingWindowPosition(windowEl) {
  const savedPos = extension_settings[extensionName]?.floatingWindowPosition;
  if (savedPos && savedPos.left !== undefined && savedPos.top !== undefined) {
    const maxLeft = window.innerWidth - windowEl.offsetWidth;
    const maxTop = window.innerHeight - windowEl.offsetHeight;
    const left = Math.min(Math.max(0, savedPos.left), maxLeft);
    const top = Math.min(Math.max(0, savedPos.top), maxTop);
    windowEl.style.left = left + 'px';
    windowEl.style.top = top + 'px';
  } else {
    centerFloatingWindow(windowEl);
  }
}

// 悬浮窗居中
function centerFloatingWindow(windowEl) {
  const windowWidth = windowEl.offsetWidth || 420;
  const windowHeight = windowEl.offsetHeight || 600;
  const left = (window.innerWidth - windowWidth) / 2;
  const top = (window.innerHeight - windowHeight) / 2;
  windowEl.style.left = left + 'px';
  windowEl.style.top = top + 'px';
}

// 保存悬浮窗位置
function saveFloatingWindowPosition(windowEl) {
  if (!extension_settings[extensionName]) return;
  const rect = windowEl.getBoundingClientRect();
  extension_settings[extensionName].floatingWindowPosition = {
    left: rect.left,
    top: rect.top
  };
  saveSettingsDebounced();
}

// 绑定悬浮窗基础事件
function bindFloatingWindowEvents(windowEl) {
  const header = windowEl.querySelector('.floating-window-header');
  const minimizeBtn = windowEl.querySelector('#floating-window-minimize-btn');
  const closeBtn = windowEl.querySelector('#floating-window-close-btn');
  // 拖拽事件
  header.addEventListener('mousedown', onFloatingWindowDragStart);
  document.addEventListener('mousemove', onFloatingWindowDragMove);
  document.addEventListener('mouseup', onFloatingWindowDragEnd);
  header.addEventListener('touchstart', onFloatingWindowDragStart, { passive: false });
  document.addEventListener('touchmove', onFloatingWindowDragMove, { passive: false });
  document.addEventListener('touchend', onFloatingWindowDragEnd);
  // 最小化按钮
  minimizeBtn.addEventListener('click', () => {
    windowEl.classList.add('hidden');
    if (extension_settings[extensionName]) {
      extension_settings[extensionName].floatingWindowVisible = false;
      saveSettingsDebounced();
    }
  });
  // 关闭按钮
  closeBtn.addEventListener('click', () => {
    windowEl.remove();
    if (extension_settings[extensionName]) {
      extension_settings[extensionName].floatingWindowVisible = false;
      saveSettingsDebounced();
    }
  });
  // 窗口大小变化时居中适配
  window.addEventListener('resize', () => {
    if (!windowEl.classList.contains('hidden')) {
      centerFloatingWindow(windowEl);
    }
  });
}

// 悬浮窗拖拽开始
function onFloatingWindowDragStart(e) {
  const windowEl = document.getElementById('novel-writer-floating-window');
  if (!windowEl || !e.target.closest('.floating-window-header')) return;
  floatingWindowState.isDragging = true;
  floatingWindowState.hasMoved = false;
  const rect = windowEl.getBoundingClientRect();
  if (e.type === 'touchstart') {
    floatingWindowState.startX = e.touches[0].clientX;
    floatingWindowState.startY = e.touches[0].clientY;
    e.preventDefault();
  } else {
    floatingWindowState.startX = e.clientX;
    floatingWindowState.startY = e.clientY;
  }
  floatingWindowState.initialLeft = rect.left;
  floatingWindowState.initialTop = rect.top;
  windowEl.classList.add('dragging');
}

// 悬浮窗拖拽移动
function onFloatingWindowDragMove(e) {
  if (!floatingWindowState.isDragging) return;
  const windowEl = document.getElementById('novel-writer-floating-window');
  if (!windowEl) return;
  let clientX, clientY;
  if (e.type === 'touchmove') {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
    e.preventDefault();
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  const deltaX = clientX - floatingWindowState.startX;
  const deltaY = clientY - floatingWindowState.startY;
  if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
    floatingWindowState.hasMoved = true;
  }
  // 边界限制
  const maxLeft = window.innerWidth - windowEl.offsetWidth;
  const maxTop = window.innerHeight - windowEl.offsetHeight;
  let newLeft = floatingWindowState.initialLeft + deltaX;
  let newTop = floatingWindowState.initialTop + deltaY;
  newLeft = Math.min(Math.max(0, newLeft), maxLeft);
  newTop = Math.min(Math.max(0, newTop), maxTop);
  windowEl.style.left = newLeft + 'px';
  windowEl.style.top = newTop + 'px';
}

// 悬浮窗拖拽结束
function onFloatingWindowDragEnd(e) {
  if (!floatingWindowState.isDragging) return;
  const windowEl = document.getElementById('novel-writer-floating-window');
  if (windowEl) windowEl.classList.remove('dragging');
  floatingWindowState.isDragging = false;
  if (floatingWindowState.hasMoved && windowEl) {
    saveFloatingWindowPosition(windowEl);
  }
}

// 渲染悬浮窗章节列表
function renderFloatingChapterList(chapters) {
  const $listContainer = $('#floating-novel-chapter-list');
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};
  if (chapters.length === 0) {
    $listContainer.html('<p class="text-muted text-center">请上传小说文件并点击「解析章节」</p>');
    return;
  }
  chapters.forEach(chapter => chapter.hasGraph = !!graphMap[chapter.id]);
  const listHtml = chapters.map((chapter) => `
    <div class="chapter-item flex-container alignCenter justifySpaceBetween" data-chapter-id="${chapter.id}">
      <label class="chapter-checkbox flex-container alignCenter gap5">
        <input type="checkbox" class="floating-chapter-select" data-index="${chapter.id}" checked />
        <span class="chapter-title fontBold">${chapter.title}</span>
      </label>
      <span class="text-sm ${chapter.hasGraph ? 'text-success' : 'text-muted'}">
        ${chapter.hasGraph ? '已生成图谱' : '未生成图谱'}
      </span>
    </div>
  `).join('');
  $listContainer.html(listHtml);
}

// 渲染悬浮窗章节选择下拉框
function renderFloatingChapterSelect(chapters) {
  const $select = $('#floating-write-chapter-select');
  if (chapters.length === 0) {
    $select.html('<option value="">请先解析章节</option>');
    $('#floating-write-chapter-content').val('').prop('readonly', true);
    return;
  }
  const optionHtml = chapters.map(chapter => `<option value="${chapter.id}">${chapter.title}</option>`).join('');
  $select.html(`<option value="">请选择基准章节</option>${optionHtml}`);
  $('#floating-write-chapter-content').val('').prop('readonly', true);
}

// 获取悬浮窗选中章节
function getFloatingSelectedChapters() {
  const checkedInputs = document.querySelectorAll('.floating-chapter-select:checked');
  const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
  return selectedIndexes.map(index => currentParsedChapters.find(item => item.id === index)).filter(Boolean);
}

// 绑定悬浮窗功能事件（和原有逻辑完全一致，保证功能100%同步）
function bindFloatingWindowFunctionEvents(windowEl) {
  const $window = $(windowEl);
  // 抽屉开关事件（兼容ST原生样式）
  $window.find(".inline-drawer-toggle").on("click", function() {
    const $drawer = $(this).closest(".inline-drawer");
    $drawer.toggleClass("open");
    $drawer.find(".inline-drawer-content").slideToggle(200);
    $drawer.find(".inline-drawer-icon").toggleClass("down up");
  });
  // 解析章节
  $window.find("#floating-parse-chapter-btn").on("click", () => {
    const file = $window.find("#floating-novel-file-upload")[0].files[0];
    const regexSource = $window.find("#floating-chapter-regex-input").val().trim();
    if (!file) {
      toastr.warning('请先选择小说TXT文件', "小说续写器");
      return;
    }
    extension_settings[extensionName].chapterRegex = regexSource;
    saveSettingsDebounced();
    $("#chapter-regex-input").val(regexSource);
    const reader = new FileReader();
    reader.onload = (e) => {
      const novelText = e.target.result;
      currentParsedChapters = splitNovelIntoChapters(novelText, regexSource);
      extension_settings[extensionName].chapterList = currentParsedChapters;
      extension_settings[extensionName].chapterGraphMap = {};
      extension_settings[extensionName].mergedGraph = {};
      $('#merged-graph-preview').val('');
      $('#floating-merged-graph-preview').val('');
      saveSettingsDebounced();
      renderChapterList(currentParsedChapters);
      renderChapterSelect(currentParsedChapters);
      renderFloatingChapterList(currentParsedChapters);
      renderFloatingChapterSelect(currentParsedChapters);
    };
    reader.onerror = () => toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
    reader.readAsText(file, 'UTF-8');
  });
  // 全选/全不选
  $window.find("#floating-select-all-btn").on("click", () => $window.find(".floating-chapter-select").prop("checked", true));
  $window.find("#floating-unselect-all-btn").on("click", () => $window.find(".floating-chapter-select").prop("checked", false));
  // 保存模板和间隔设置
  $window.find("#floating-send-template-input").on("change", (e) => {
    const value = $(e.target).val().trim();
    extension_settings[extensionName].sendTemplate = value;
    saveSettingsDebounced();
    $("#send-template-input").val(value);
  });
  $window.find("#floating-send-delay-input").on("change", (e) => {
    const value = parseInt($(e.target).val()) || 100;
    extension_settings[extensionName].sendDelay = value;
    saveSettingsDebounced();
    $("#send-delay-input").val(value);
  });
  // 导入选中/全部章节
  $window.find("#floating-import-selected-btn").on("click", () => sendChaptersBatch(getFloatingSelectedChapters()));
  $window.find("#floating-import-all-btn").on("click", () => sendChaptersBatch(currentParsedChapters));
  // 停止发送
  $window.find("#floating-stop-send-btn").on("click", () => {
    if (isSending) {
      stopSending = true;
      toastr.info('已停止发送', "小说续写器");
    }
  });
  // 图谱生成
  $window.find("#floating-graph-single-btn").on("click", () => generateChapterGraphBatch(getFloatingSelectedChapters()));
  $window.find("#floating-graph-batch-btn").on("click", () => generateChapterGraphBatch(currentParsedChapters));
  // 合并图谱
  $window.find("#floating-graph-merge-btn").on("click", async () => {
    const mergedGraph = await mergeAllGraphs();
    if (mergedGraph) $('#floating-merged-graph-preview').val(JSON.stringify(mergedGraph, null, 2));
  });
  // 图谱复制/导出/清空
  $window.find("#floating-graph-copy-btn").on("click", () => {
    const graphText = $('#floating-merged-graph-preview').val();
    if (!graphText) return toastr.warning('没有可复制的图谱内容', "小说续写器");
    navigator.clipboard.writeText(graphText).then(() => toastr.success('图谱JSON已复制到剪贴板', "小说续写器")).catch(() => toastr.error('复制失败', "小说续写器"));
  });
  $window.find("#floating-graph-export-btn").on("click", () => {
    const graphText = $('#floating-merged-graph-preview').val();
    if (!graphText) return toastr.warning('没有可导出的图谱内容', "小说续写器");
    const blob = new Blob([graphText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '小说知识图谱.json';
    a.click();
    URL.revokeObjectURL(url);
    toastr.success('图谱JSON已导出', "小说续写器");
  });
  $window.find("#floating-graph-clear-btn").on("click", () => {
    extension_settings[extensionName].mergedGraph = {};
    $('#merged-graph-preview').val('');
    $('#floating-merged-graph-preview').val('');
    saveSettingsDebounced();
    toastr.success('已清空合并图谱', "小说续写器");
  });
  // 章节选择联动
  $window.find("#floating-write-chapter-select").on("change", function() {
    const selectedChapterId = $(this).val();
    if (!selectedChapterId) {
      $('#floating-write-chapter-content').val('').prop('readonly', true);
      return;
    }
    const targetChapter = currentParsedChapters.find(item => item.id == selectedChapterId);
    if (targetChapter) $('#floating-write-chapter-content').val(targetChapter.content).prop('readonly', false);
  });
  // 生成续写
  $window.find("#floating-write-generate-btn").on("click", async () => {
    const context = getContext();
    const { generateRaw } = context;
    const selectedChapterId = $('#floating-write-chapter-select').val();
    const editedChapterContent = $('#floating-write-chapter-content').val().trim();
    const wordCount = parseInt($('#floating-write-word-count').val()) || 2000;
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    if (isGeneratingWrite) return toastr.warning('正在生成续写内容中，请等待完成', "小说续写器");
    if (!selectedChapterId) return toastr.error('请先选择续写基准章节', "小说续写器");
    if (!editedChapterContent) return toastr.error('基准章节内容不能为空', "小说续写器");
    if (Object.keys(mergedGraph).length === 0) toastr.warning('未检测到合并后的知识图谱，建议先合并图谱以保证续写质量', "小说续写器");
    const systemPrompt = `
小说续写规则（100%遵守）：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC）。
2. 剧情衔接：续写内容必须和提供的基准章节内容完美衔接，逻辑自洽，没有矛盾，承接前文剧情，开启新的章节内容。
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接。
4. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话。
5. 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线。
6. 字数要求：续写约${wordCount}字，误差不超过10%。
`;
    const userPrompt = `
小说核心设定知识图谱：${JSON.stringify(mergedGraph)}
基准章节内容：${editedChapterContent}
请基于以上内容，按照规则续写后续的章节正文。
`;
    isGeneratingWrite = true;
    stopGenerateFlag = false;
    $('#floating-write-status').text('正在生成续写章节，请稍候...');
    $('#write-status').text('正在生成续写章节，请稍候...');
    try {
      const result = await generateRaw({ systemPrompt, prompt: userPrompt });
      if (!result.trim()) throw new Error('生成内容为空');
      $('#write-content-preview').val(result.trim());
      $('#floating-write-content-preview').val(result.trim());
      $('#write-status').text('续写章节生成完成！');
      $('#floating-write-status').text('续写章节生成完成！');
      toastr.success('续写章节生成完成！', "小说续写器");
    } catch (error) {
      console.error('续写生成失败:', error);
      $('#write-status').text(`生成失败: ${error.message}`);
      $('#floating-write-status').text(`生成失败: ${error.message}`);
      toastr.error(`续写生成失败: ${error.message}`, "小说续写器");
    } finally {
      isGeneratingWrite = false;
      stopGenerateFlag = false;
    }
  });
  // 停止生成
  $window.find("#floating-write-stop-btn").on("click", () => {
    if (isGeneratingWrite) {
      stopGenerateFlag = true;
      $('#write-status').text('已停止生成');
      $('#floating-write-status').text('已停止生成');
      toastr.info('已停止生成续写内容', "小说续写器");
    }
  });
  // 续写内容复制/发送/清空
  $window.find("#floating-write-copy-btn").on("click", () => {
    const writeText = $('#floating-write-content-preview').val();
    if (!writeText) return toastr.warning('没有可复制的续写内容', "小说续写器");
    navigator.clipboard.writeText(writeText).then(() => toastr.success('续写内容已复制到剪贴板', "小说续写器")).catch(() => toastr.error('复制失败', "小说续写器"));
  });
  $window.find("#floating-write-send-btn").on("click", () => {
    const context = getContext();
    const writeText = $('#floating-write-content-preview').val();
    const currentCharName = context.characters[context.characterId]?.name;
    if (!writeText) return toastr.warning('没有可发送的续写内容', "小说续写器");
    if (!currentCharName) return toastr.error('请先选择一个聊天角色', "小说续写器");
    const command = renderCommandTemplate(extension_settings[extensionName].sendTemplate, currentCharName, writeText);
    context.executeSlashCommandsWithOptions(command).then(() => toastr.success('续写内容已发送到对话框', "小说续写器")).catch((error) => toastr.error(`发送失败: ${error.message}`, "小说续写器"));
  });
  $window.find("#floating-write-clear-btn").on("click", () => {
    $('#write-content-preview').val('');
    $('#floating-write-content-preview').val('');
    $('#write-status').text('');
    $('#floating-write-status').text('');
    toastr.success('已清空续写内容', "小说续写器");
  });
}
// ====================== 原有核心逻辑完全保留，无任何修改 ======================

// ==============================================
// 基础工具函数（保留模板原有逻辑）
// ==============================================
async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  
  // 初始化默认配置
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  // 补全更新后新增的默认字段
  for (const key of Object.keys(defaultSettings)) {
    if (!Object.hasOwn(extension_settings[extensionName], key)) {
      extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
    }
  }

  // 恢复缓存数据
  currentParsedChapters = extension_settings[extensionName].chapterList || [];

  // 更新UI中的设置值
  $("#example_setting").prop("checked", extension_settings[extensionName].example_setting).trigger("input");
  $("#chapter-regex-input").val(extension_settings[extensionName].chapterRegex);
  $("#send-template-input").val(extension_settings[extensionName].sendTemplate);
  $("#send-delay-input").val(extension_settings[extensionName].sendDelay);
  $("#merged-graph-preview").val(JSON.stringify(extension_settings[extensionName].mergedGraph, null, 2));

  // 渲染章节列表与续写下拉框
  renderChapterList(currentParsedChapters);
  renderChapterSelect(currentParsedChapters);

  // 新增：初始化悬浮功能
  if (extension_settings[extensionName].floatingBallEnabled !== false) {
    createFloatingBall();
  }
  if (extension_settings[extensionName].floatingWindowVisible) {
    createFloatingWindow();
  }
}

// 模板示例功能保留
function onExampleInput(event) {
  const value = Boolean($(event.target).prop("checked"));
  extension_settings[extensionName].example_setting = value;
  saveSettingsDebounced();
}

function onButtonClick() {
  toastr.info(
    `The checkbox is ${ extension_settings[extensionName].example_setting ? "checked" : "not checked" }`,
    "Extension Example"
  );
}

// 模板变量替换
function renderCommandTemplate(template, charName, chapterContent) {
  return template
    .replace(/{{char}}/g, charName || '角色')
    .replace(/{{pipe}}/g, `"${chapterContent.replace(/"/g, '\\"').replace(/\|/g, '\\|')}"`);
}

// 进度更新函数
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

// ==============================================
// 章节管理核心函数（按要求简化章节列表）
// ==============================================
// 章节拆分逻辑
function splitNovelIntoChapters(novelText, regexSource) {
  try {
    const chapterRegex = new RegExp(regexSource, 'gm');
    const matches = [...novelText.matchAll(chapterRegex)];
    const chapters = [];

    if (matches.length === 0) {
      return [{ id: 0, title: '全文', content: novelText, hasGraph: false }];
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i][0].length;
      const end = i < matches.length - 1 ? matches[i + 1].index : novelText.length;
      const title = matches[i][0].trim();
      const content = novelText.slice(start, end).trim();
      
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

// 按要求修改：章节列表仅显示标题，不显示内容预览
function renderChapterList(chapters) {
  const $listContainer = $('#novel-chapter-list');
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};

  if (chapters.length === 0) {
    $listContainer.html('<p class="text-muted text-center">请上传小说文件并点击「解析章节」</p>');
    return;
  }

  // 更新章节图谱状态
  chapters.forEach(chapter => {
    chapter.hasGraph = !!graphMap[chapter.id];
  });

  // 仅显示标题、选择框、图谱状态，移除内容预览
  const listHtml = chapters.map((chapter) => `
    <div class="chapter-item flex-container alignCenter justifySpaceBetween" data-chapter-id="${chapter.id}">
      <label class="chapter-checkbox flex-container alignCenter gap5">
        <input type="checkbox" class="chapter-select" data-index="${chapter.id}" checked />
        <span class="chapter-title fontBold">${chapter.title}</span>
      </label>
      <span class="text-sm ${chapter.hasGraph ? 'text-success' : 'text-muted'}">
        ${chapter.hasGraph ? '已生成图谱' : '未生成图谱'}
      </span>
    </div>
  `).join('');

  $listContainer.html(listHtml);
  // 同步更新悬浮窗
  renderFloatingChapterList(chapters);
}

// 新增：渲染续写模块的章节选择下拉框
function renderChapterSelect(chapters) {
  const $select = $('#write-chapter-select');
  if (chapters.length === 0) {
    $select.html('<option value="">请先解析章节</option>');
    $('#write-chapter-content').val('').prop('readonly', true);
    return;
  }

  // 生成下拉选项
  const optionHtml = chapters.map(chapter => `
    <option value="${chapter.id}">${chapter.title}</option>
  `).join('');

  $select.html(`<option value="">请选择基准章节</option>${optionHtml}`);
  // 清空编辑框
  $('#write-chapter-content').val('').prop('readonly', true);
  // 同步更新悬浮窗
  renderFloatingChapterSelect(chapters);
}

// 批量发送章节到对话框
async function sendChaptersBatch(chapters) {
  const context = getContext();
  const settings = extension_settings[extensionName];
  
  // 前置校验
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

  // 初始化发送状态
  isSending = true;
  stopSending = false;
  let successCount = 0;

  try {
    for (let i = 0; i < chapters.length; i++) {
      if (stopSending) break;

      const chapter = chapters[i];
      const command = renderCommandTemplate(settings.sendTemplate, currentCharName, chapter.content);
      
      // 官方原生API执行斜杠命令
      await context.executeSlashCommandsWithOptions(command);
      successCount++;

      // 更新进度
      updateProgress('novel-import-progress', 'novel-import-status', i + 1, chapters.length, "发送进度");
      updateProgress('floating-novel-import-progress', 'floating-novel-import-status', i + 1, chapters.length, "发送进度");
      
      // 发送间隔（默认100ms）
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
    updateProgress('floating-novel-import-progress', 'floating-novel-import-status', 0, 0);
  }
}

// 获取选中的章节
function getSelectedChapters() {
  const checkedInputs = document.querySelectorAll('.chapter-select:checked');
  const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
  return selectedIndexes.map(index => currentParsedChapters.find(item => item.id === index)).filter(Boolean);
}

// ==============================================
// 知识图谱核心函数（保留原有逻辑，续写依赖）
// ==============================================
const graphJsonSchema = {
  name: 'NovelKnowledgeGraph',
  strict: true,
  value: {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": ["人物信息", "世界观设定", "核心剧情线", "文风特点", "实体关系网络", "逆向分析洞察"],
    "properties": {
      "人物信息": {
        "type": "array", "minItems": 3,
        "items": {
          "type": "object",
          "required": ["姓名", "别名/称号", "性格特征", "身份/背景", "核心动机", "人物关系", "人物弧光"],
          "properties": {
            "姓名": { "type": "string" },
            "别名/称号": { "type": "string" },
            "性格特征": { "type": "string" },
            "身份/背景": { "type": "string" },
            "核心动机": { "type": "string" },
            "人物关系": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["关系对象", "关系类型", "关系强度", "关系描述"],
                "properties": {
                  "关系对象": { "type": "string" },
                  "关系类型": { "type": "string" },
                  "关系强度": { "type": "number", "minimum": 0, "maximum": 1 },
                  "关系描述": { "type": "string" }
                }
              }
            },
            "人物弧光": { "type": "string" }
          }
        }
      },
      "世界观设定": {
        "type": "object",
        "required": ["时代背景", "地理区域", "力量体系/规则", "社会结构", "独特物品或生物", "隐藏设定"],
        "properties": {
          "时代背景": { "type": "string" },
          "地理区域": { "type": "string" },
          "力量体系/规则": { "type": "string" },
          "社会结构": { "type": "string" },
          "独特物品或生物": { "type": "string" },
          "隐藏设定": { "type": "string" }
        }
      },
      "核心剧情线": {
        "type": "object",
        "required": ["主线剧情描述", "关键事件列表", "剧情分支/支线", "核心冲突"],
        "properties": {
          "主线剧情描述": { "type": "string" },
          "关键事件列表": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["事件名", "参与人物", "前因", "后果", "影响"],
              "properties": {
                "事件名": { "type": "string" },
                "参与人物": { "type": "string" },
                "前因": { "type": "string" },
                "后果": { "type": "string" },
                "影响": { "type": "string" }
              }
            }
          },
          "剧情分支/支线": { "type": "string" },
          "核心冲突": { "type": "string" }
        }
      },
      "文风特点": {
        "type": "object",
        "required": ["叙事视角", "语言风格", "对话特点", "常用修辞", "节奏特点"],
        "properties": {
          "叙事视角": { "type": "string" },
          "语言风格": { "type": "string" },
          "对话特点": { "type": "string" },
          "常用修辞": { "type": "string" },
          "节奏特点": { "type": "string" }
        }
      },
      "实体关系网络": { "type": "array", "minItems": 5, "items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string" } } },
      "逆向分析洞察": { "type": "string" }
    }
  }
};

const mergeGraphJsonSchema = {
  name: 'MergedNovelKnowledgeGraph',
  strict: true,
  value: {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": ["人物信息", "世界观设定", "核心剧情线", "文风特点", "实体关系网络", "逆向分析洞察", "质量评估"],
    "properties": {
      "人物信息": { "type": "array" },
      "世界观设定": { "type": "object" },
      "核心剧情线": { "type": "object" },
      "文风特点": { "type": "object" },
      "实体关系网络": { "type": "array" },
      "逆向分析洞察": { "type": "string" },
      "质量评估": { "type": "string" }
    }
  }
};

// 生成单章节知识图谱
async function generateSingleChapterGraph(chapter) {
  const context = getContext();
  const { generateRaw } = context;

  const systemPrompt = `
触发词：构建知识图谱JSON、小说章节分析
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的小说文本分析，不引入任何外部内容
4. 严格包含所有要求的字段，不修改字段名
5. 无对应内容设为"暂无"，数组设为[]，不得留空
必填字段：人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、逆向分析洞察
`;

  const userPrompt = `小说章节标题：${chapter.title}\n小说章节内容：${chapter.content}`;

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: graphJsonSchema });
    const graphData = JSON.parse(result.trim());
    return graphData;
  } catch (error) {
    console.error(`章节${chapter.title}图谱生成失败:`, error);
    toastr.error(`章节${chapter.title}图谱生成失败`, "小说续写器");
    return null;
  }
}

// 批量生成章节图谱
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

  try {
    for (let i = 0; i < chapters.length; i++) {
      if (stopGenerateFlag) break;
      const chapter = chapters[i];
      updateProgress('graph-progress', 'graph-generate-status', i + 1, chapters.length, "图谱生成进度");
      updateProgress('floating-graph-progress', 'floating-graph-generate-status', i + 1, chapters.length, "图谱生成进度");

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
    updateProgress('floating-graph-progress', 'floating-graph-generate-status', 0, 0);
  }
}

// 合并多章节知识图谱
async function mergeAllGraphs() {
  const context = getContext();
  const { generateRaw } = context;
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};
  const graphList = Object.values(graphMap);

  if (graphList.length === 0) {
    toastr.warning('没有可合并的章节图谱，请先生成图谱', "小说续写器");
    return;
  }

  const systemPrompt = `
触发词：合并知识图谱JSON、图谱合并
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的多组图谱合并，不引入任何外部内容
4. 严格去重，同一人物/设定/事件不能重复，不同别名合并为同一条目
5. 严格包含所有要求的字段，不修改字段名
6. 无对应内容设为"暂无"，数组设为[]，不得留空
必填字段：人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、逆向分析洞察、质量评估
`;

  const userPrompt = `待合并的多组知识图谱：\n${JSON.stringify(graphList, null, 2)}`;

  try {
    toastr.info('开始合并知识图谱，请稍候...', "小说续写器");
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: mergeGraphJsonSchema });
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
  }
}

// ==============================================
// 小说续写核心函数（按要求重写，简化流程）
// ==============================================
async function generateNovelWrite() {
  const context = getContext();
  const { generateRaw } = context;
  const selectedChapterId = $('#write-chapter-select').val();
  const editedChapterContent = $('#write-chapter-content').val().trim();
  const wordCount = parseInt($('#write-word-count').val()) || 2000;
  const mergedGraph = extension_settings[extensionName].mergedGraph || {};

  // 前置校验
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
  if (Object.keys(mergedGraph).length === 0) {
    toastr.warning('未检测到合并后的知识图谱，建议先合并图谱以保证续写质量', "小说续写器");
  }

  // 构建续写prompt，严格遵守续写规则
  const systemPrompt = `
小说续写规则（100%遵守）：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC）。
2. 剧情衔接：续写内容必须和提供的基准章节内容完美衔接，逻辑自洽，没有矛盾，承接前文剧情，开启新的章节内容。
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接。
4. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话。
5. 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线。
6. 字数要求：续写约${wordCount}字，误差不超过10%。
`;

  const userPrompt = `
小说核心设定知识图谱：${JSON.stringify(mergedGraph)}
基准章节内容：${editedChapterContent}
请基于以上内容，按照规则续写后续的章节正文。
`;

  // 开始生成
  isGeneratingWrite = true;
  stopGenerateFlag = false;
  $('#write-status').text('正在生成续写章节，请稍候...');
  $('#floating-write-status').text('正在生成续写章节，请稍候...');

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt });
    if (!result.trim()) {
      throw new Error('生成内容为空');
    }

    // 更新预览
    $('#write-content-preview').val(result.trim());
    $('#floating-write-content-preview').val(result.trim());
    $('#write-status').text('续写章节生成完成！');
    $('#floating-write-status').text('续写章节生成完成！');
    toastr.success('续写章节生成完成！', "小说续写器");
  } catch (error) {
    console.error('续写生成失败:', error);
    $('#write-status').text(`生成失败: ${error.message}`);
    $('#floating-write-status').text(`生成失败: ${error.message}`);
    toastr.error(`续写生成失败: ${error.message}`, "小说续写器");
  } finally {
    isGeneratingWrite = false;
    stopGenerateFlag = false;
  }
}

// ==============================================
// 扩展入口（完全对齐官方模板结构）
// ==============================================
jQuery(async () => {
  // 与模板完全一致：加载外部HTML文件，追加到ST扩展设置面板
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);

  // 保留模板原有事件绑定
  $("#my_button").on("click", onButtonClick);
  $("#example_setting").on("input", onExampleInput);

  // ==============================================
  // 章节管理事件绑定
  // ==============================================
  // 解析章节
  $("#parse-chapter-btn").on("click", () => {
    const file = $("#novel-file-upload")[0].files[0];
    const regexSource = $("#chapter-regex-input").val().trim();

    if (!file) {
      toastr.warning('请先选择小说TXT文件', "小说续写器");
      return;
    }

    // 保存用户自定义正则
    extension_settings[extensionName].chapterRegex = regexSource;
    saveSettingsDebounced();

    // 读取文件并解析
    const reader = new FileReader();
    reader.onload = (e) => {
      const novelText = e.target.result;
      currentParsedChapters = splitNovelIntoChapters(novelText, regexSource);
      // 持久化保存
      extension_settings[extensionName].chapterList = currentParsedChapters;
      // 清空旧图谱
      extension_settings[extensionName].chapterGraphMap = {};
      extension_settings[extensionName].mergedGraph = {};
      $('#merged-graph-preview').val('');
      $('#floating-merged-graph-preview').val('');
      saveSettingsDebounced();
      // 渲染列表与下拉框
      renderChapterList(currentParsedChapters);
      renderChapterSelect(currentParsedChapters);
    };
    reader.onerror = () => {
      toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
    };
    reader.readAsText(file, 'UTF-8');
  });

  // 全选/全不选
  $("#select-all-btn").on("click", () => {
    $(".chapter-select").prop("checked", true);
  });
  $("#unselect-all-btn").on("click", () => {
    $(".chapter-select").prop("checked", false);
  });

  // 保存模板和间隔设置
  $("#send-template-input").on("change", (e) => {
    extension_settings[extensionName].sendTemplate = $(e.target).val().trim();
    saveSettingsDebounced();
    $('#floating-send-template-input').val(extension_settings[extensionName].sendTemplate);
  });
  $("#send-delay-input").on("change", (e) => {
    extension_settings[extensionName].sendDelay = parseInt($(e.target).val()) || 100;
    saveSettingsDebounced();
    $('#floating-send-delay-input').val(extension_settings[extensionName].sendDelay);
  });

  // 导入选中章节
  $("#import-selected-btn").on("click", () => {
    const selectedChapters = getSelectedChapters();
    sendChaptersBatch(selectedChapters);
  });

  // 导入全部章节
  $("#import-all-btn").on("click", () => {
    sendChaptersBatch(currentParsedChapters);
  });

  // 停止发送
  $("#stop-send-btn").on("click", () => {
    if (isSending) {
      stopSending = true;
      toastr.info('已停止发送', "小说续写器");
    }
  });

  // ==============================================
  // 知识图谱事件绑定
  // ==============================================
  $("#graph-single-btn").on("click", () => {
    const selectedChapters = getSelectedChapters();
    generateChapterGraphBatch(selectedChapters);
  });

  $("#graph-batch-btn").on("click", () => {
    generateChapterGraphBatch(currentParsedChapters);
  });

  $("#graph-merge-btn").on("click", mergeAllGraphs);

  $("#graph-copy-btn").on("click", () => {
    const graphText = $('#merged-graph-preview').val();
    if (!graphText) {
      toastr.warning('没有可复制的图谱内容', "小说续写器");
      return;
    }
    navigator.clipboard.writeText(graphText).then(() => {
      toastr.success('图谱JSON已复制到剪贴板', "小说续写器");
    }).catch(() => {
      toastr.error('复制失败', "小说续写器");
    });
  });

  $("#graph-export-btn").on("click", () => {
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

  $("#graph-clear-btn").on("click", () => {
    extension_settings[extensionName].mergedGraph = {};
    $('#merged-graph-preview').val('');
    $('#floating-merged-graph-preview').val('');
    saveSettingsDebounced();
    toastr.success('已清空合并图谱', "小说续写器");
  });

  // ==============================================
  // 续写模块事件绑定（按新需求重写）
  // ==============================================
  // 章节选择联动：选中章节后，自动填充内容到编辑框
  $("#write-chapter-select").on("change", () => {
    const selectedChapterId = $(this).val();
    if (!selectedChapterId) {
      $('#write-chapter-content').val('').prop('readonly', true);
      return;
    }

    // 找到对应章节
    const targetChapter = currentParsedChapters.find(item => item.id == selectedChapterId);
    if (targetChapter) {
      // 填充内容，取消只读
      $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
    }
  });

  // 生成续写章节按钮
  $("#write-generate-btn").on("click", generateNovelWrite);

  // 停止生成
  $("#write-stop-btn").on("click", () => {
    if (isGeneratingWrite) {
      stopGenerateFlag = true;
      $('#write-status').text('已停止生成');
      $('#floating-write-status').text('已停止生成');
      toastr.info('已停止生成续写内容', "小说续写器");
    }
  });

  // 复制续写内容
  $("#write-copy-btn").on("click", () => {
    const writeText = $('#write-content-preview').val();
    if (!writeText) {
      toastr.warning('没有可复制的续写内容', "小说续写器");
      return;
    }
    navigator.clipboard.writeText(writeText).then(() => {
      toastr.success('续写内容已复制到剪贴板', "小说续写器");
    }).catch(() => {
      toastr.error('复制失败', "小说续写器");
    });
  });

  // 发送续写内容到对话框
  $("#write-send-btn").on("click", () => {
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

    // 用指定模板发送
    const command = renderCommandTemplate(extension_settings[extensionName].sendTemplate, currentCharName, writeText);
    context.executeSlashCommandsWithOptions(command).then(() => {
      toastr.success('续写内容已发送到对话框', "小说续写器");
    }).catch((error) => {
      toastr.error(`发送失败: ${error.message}`, "小说续写器");
    });
  });

  // 清空续写内容
  $("#write-clear-btn").on("click", () => {
    $('#write-content-preview').val('');
    $('#floating-write-content-preview').val('');
    $('#write-status').text('');
    $('#floating-write-status').text('');
    toastr.success('已清空续写内容', "小说续写器");
  });

  // 抽屉开关事件（ST原生兼容）
  $(".inline-drawer-toggle").on("click", function() {
    const $drawer = $(this).closest(".inline-drawer");
    $drawer.toggleClass("open");
    $drawer.find(".inline-drawer-content").slideToggle(200);
    $drawer.find(".inline-drawer-icon").toggleClass("down up");
  });

  // 与模板完全一致：初始化加载设置
  loadSettings();

  // 新增：延迟初始化悬浮功能，确保DOM加载完成
  setTimeout(() => {
    if (extension_settings[extensionName].floatingBallEnabled !== false) {
      createFloatingBall();
    }
    if (extension_settings[extensionName].floatingWindowVisible) {
      createFloatingWindow();
    }
  }, 1000);
});
