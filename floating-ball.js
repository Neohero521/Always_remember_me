import { getExtensionSettings, saveExtensionSettings } from "./utils.js";

let isDragging = false;
let panelToggleCallback = null;

// 初始化悬浮球
export const initFloatingBall = (toggleCallback) => {
  // 避免重复创建
  if ($('#novel-writer-ball').length > 0) return;
  
  panelToggleCallback = toggleCallback;

  // 创建悬浮球DOM
  const ballHtml = `
    <div id="novel-writer-ball" class="novel-writer-ball" title="小说续写器">
      <i class="fa-solid fa-book-open"></i>
    </div>
  `;
  $('body').append(ballHtml);

  // 绑定事件
  bindBallEvents();
  // 恢复位置
  updateBallPosition();

  console.log(`[小说续写器] 悬浮球初始化完成`);
};

// 绑定拖拽事件
const bindBallEvents = () => {
  const $ball = $('#novel-writer-ball');
  const settings = getExtensionSettings();
  let startX, startY, originX, originY;

  // 开始拖拽
  $ball.on('mousedown touchstart', (e) => {
    isDragging = true;
    $ball.addClass('dragging');
    const event = e.type === 'touchstart' ? e.touches[0] : e;
    startX = event.clientX;
    startY = event.clientY;
    originX = settings.ballPosition.x;
    originY = settings.ballPosition.y;
    e.preventDefault();
    e.stopPropagation();
  });

  // 拖拽中
  $(document).on('mousemove touchmove', (e) => {
    if (!isDragging) return;
    const event = e.type === 'touchmove' ? e.touches[0] : e;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    // 边界限制
    let newX = Math.max(20, Math.min(window.innerWidth - 60, originX + deltaX));
    let newY = Math.max(20, Math.min(window.innerHeight - 60, originY + deltaY));

    settings.ballPosition.x = newX;
    settings.ballPosition.y = newY;
    updateBallPosition();
  });

  // 结束拖拽
  $(document).on('mouseup touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    $('#novel-writer-ball').removeClass('dragging');
    saveExtensionSettings();
  });

  // 点击切换面板
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

// 窗口大小变化适配
window.addEventListener('resize', () => {
  const settings = getExtensionSettings();
  settings.ballPosition.x = Math.max(20, Math.min(window.innerWidth - 60, settings.ballPosition.x));
  settings.ballPosition.y = Math.max(20, Math.min(window.innerHeight - 60, settings.ballPosition.y));
  updateBallPosition();
  saveExtensionSettings();
});
