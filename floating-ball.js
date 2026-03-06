import { getExtensionSettings, saveExtensionSettings } from "./utils.js";

// 全局状态
let isDragging = false;
let ballElement = null;
let panelToggleCallback = null;

// 初始化悬浮球
export const initFloatingBall = (togglePanelCallback) => {
  // 避免重复创建
  if ($('#novel-writer-ball').length > 0) {
    ballElement = $('#novel-writer-ball')[0];
    return;
  }

  // 保存面板切换回调
  panelToggleCallback = togglePanelCallback;

  // 创建悬浮球DOM（和Cola一致的结构）
  const ballHtml = `
    <div id="novel-writer-ball" class="novel-writer-ball" title="小说续写器">
      <i class="fa-solid fa-book-open"></i>
    </div>
  `;
  $('body').append(ballHtml);
  ballElement = $('#novel-writer-ball')[0];

  // 绑定事件
  bindBallEvents();
  // 恢复保存的位置
  updateBallPosition();

  console.log(`[小说续写器] 悬浮球初始化完成，初始位置和Cola一致`);
};

// 绑定悬浮球事件
const bindBallEvents = () => {
  const $ball = $('#novel-writer-ball');
  const settings = getExtensionSettings();
  let startX, startY, originX, originY;

  // 鼠标按下/触摸开始：启动拖拽
  $ball.on('mousedown touchstart', (e) => {
    isDragging = true;
    $ball.addClass('dragging');
    
    // 获取初始坐标
    const event = e.type === 'touchstart' ? e.touches[0] : e;
    startX = event.clientX;
    startY = event.clientY;
    originX = settings.ballPosition.x;
    originY = settings.ballPosition.y;

    e.preventDefault();
    e.stopPropagation();
  });

  // 鼠标移动/触摸移动：拖拽中
  $(document).on('mousemove touchmove', (e) => {
    if (!isDragging) return;

    const event = e.type === 'touchmove' ? e.touches[0] : e;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    // 边界限制，不超出屏幕
    let newX = originX + deltaX;
    let newY = originY + deltaY;
    newX = Math.max(20, Math.min(window.innerWidth - 60, newX));
    newY = Math.max(20, Math.min(window.innerHeight - 60, newY));

    // 更新位置
    settings.ballPosition.x = newX;
    settings.ballPosition.y = newY;
    updateBallPosition();
  });

  // 鼠标松开/触摸结束：结束拖拽
  $(document).on('mouseup touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    $('#novel-writer-ball').removeClass('dragging');
    // 保存位置
    saveExtensionSettings();
  });

  // 点击悬浮球：切换面板（拖拽时不触发）
  $ball.on('click', (e) => {
    if (isDragging) return;
    if (panelToggleCallback) panelToggleCallback();
    e.preventDefault();
    e.stopPropagation();
  });
};

// 更新悬浮球位置
export const updateBallPosition = () => {
  const settings = getExtensionSettings();
  $('#novel-writer-ball').css({
    left: `${settings.ballPosition.x}px`,
    top: `${settings.ballPosition.y}px`,
  });
};

// 窗口大小变化时重新限制边界
window.addEventListener('resize', () => {
  const settings = getExtensionSettings();
  // 重新限制位置在屏幕内
  settings.ballPosition.x = Math.max(20, Math.min(window.innerWidth - 60, settings.ballPosition.x));
  settings.ballPosition.y = Math.max(20, Math.min(window.innerHeight - 60, settings.ballPosition.y));
  updateBallPosition();
  saveExtensionSettings();
});
