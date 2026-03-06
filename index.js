:root {
  --novel-primary: var(--SmartTheme-EmphasisColor, #5b86e5);
  --novel-bg: var(--SmartTheme-BodyBgColor, #1a1a1a);
  --novel-card-bg: var(--SmartTheme-InputBgColor, #252525);
  --novel-border: var(--SmartTheme-BorderColor, #3a3a3a);
  --novel-text: var(--SmartTheme-TextColor, #ffffff);
  --novel-text-muted: var(--SmartTheme-TextMutedColor, #aaaaaa);
  --novel-hover: var(--SmartTheme-HoverColor, #2f2f2f);
  --novel-success: var(--SmartTheme-SuccessColor, #4ade80);
  --novel-danger: var(--SmartTheme-DangerColor, #f87171);
  --novel-radius-sm: 4px;
  --novel-radius-md: 8px;
  --novel-radius-lg: 12px;
  --novel-radius-full: 50%;
  --novel-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.25);
  --novel-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.35);
}

/* 全局样式重置 */
.novel-writer-inner * {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* 表单通用样式 */
.novel-writer-inner .form-group {
  margin-bottom: 16px;
  width: 100%;
}

.novel-writer-inner .form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.novel-writer-inner .form-row .flex-1 {
  flex: 1;
  min-width: 120px;
}

.novel-writer-inner .form-row .flex-2 {
  flex: 2;
  min-width: 200px;
}

.novel-writer-inner .form-label {
  display: block;
  font-weight: 600;
  color: var(--novel-text);
  font-size: 0.9rem;
  margin-bottom: 6px;
}

.novel-writer-inner .form-control {
  width: 100%;
  background: var(--novel-card-bg);
  border: 1px solid var(--novel-border);
  border-radius: var(--novel-radius-sm);
  padding: 8px 12px;
  color: var(--novel-text);
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.novel-writer-inner .form-control:focus {
  outline: none;
  border-color: var(--novel-primary);
  box-shadow: 0 0 0 2px rgba(91, 134, 229, 0.2);
}

.novel-writer-inner .form-control::placeholder {
  color: var(--novel-text-muted);
}

.novel-writer-inner .form-hint {
  font-size: 0.8rem;
  color: var(--novel-text-muted);
  margin: 4px 0 0 0;
}

.novel-writer-inner .action-row {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  width: 100%;
}

.novel-writer-inner .action-row.gap-10 {
  gap: 10px;
}

.novel-writer-inner .action-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.novel-writer-inner .action-group.mt-8 {
  margin-top: 8px;
}

.novel-writer-inner .list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.novel-writer-inner .list-title {
  font-weight: 600;
  color: var(--novel-text);
  font-size: 0.95rem;
}

.novel-writer-inner .empty-tip {
  text-align: center;
  color: var(--novel-text-muted);
  padding: 20px 0;
  font-size: 0.9rem;
  margin: 0;
}

.novel-writer-inner .drawer-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.novel-writer-inner .drawer-icon {
  color: var(--novel-primary);
  font-size: 1rem;
}

.novel-writer-inner .inline-drawer-header {
  padding: 12px 16px;
  border-radius: var(--novel-radius-sm);
  transition: background 0.2s ease;
}

.novel-writer-inner .inline-drawer-header:hover {
  background: var(--novel-hover);
}

.novel-writer-inner .inline-drawer-content {
  padding: 12px 16px;
}

/* ==============================================
   悬浮球核心样式
   ============================================== */
.novel-writer-ball {
  position: fixed !important;
  width: 56px;
  height: 56px;
  border-radius: var(--novel-radius-full);
  background: linear-gradient(135deg, var(--novel-primary), #3664d9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999999 !important;
  cursor: pointer;
  box-shadow: var(--novel-shadow-md);
  transition: all 0.3s ease;
  user-select: none;
}

.novel-writer-ball:hover {
  transform: scale(1.1);
  box-shadow: var(--novel-shadow-lg);
}

.novel-writer-ball.dragging {
  transition: none;
  opacity: 0.8;
  transform: scale(0.95);
}

.novel-writer-ball i {
  font-size: 22px;
  color: #ffffff;
}

/* ==============================================
   全局面板核心样式
   ============================================== */
.novel-writer-panel {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 999990 !important;
  pointer-events: none !important;
  transition: opacity 0.3s ease !important;
  opacity: 0 !important;
}

.novel-writer-panel.open {
  opacity: 1 !important;
  pointer-events: all !important;
}

.panel-mask {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background: rgba(0, 0, 0, 0.6) !important;
  backdrop-filter: blur(4px) !important;
  z-index: 1 !important;
}

.panel-content {
  position: absolute !important;
  top: 20px !important;
  right: 20px !important;
  width: 440px !important;
  max-width: calc(100vw - 40px) !important;
  height: calc(100vh - 40px) !important;
  background: var(--novel-bg) !important;
  border: 1px solid var(--novel-border) !important;
  border-radius: var(--novel-radius-lg) !important;
  box-shadow: var(--novel-shadow-lg) !important;
  transform: translateX(calc(100% + 40px)) !important;
  transition: transform 0.4s ease !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  z-index: 2 !important;
}

.novel-writer-panel.open .panel-content {
  transform: translateX(0) !important;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--novel-border);
  flex-shrink: 0;
}

.panel-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-title-icon {
  color: var(--novel-primary);
  font-size: 1.2rem;
}

.panel-header h2 {
  margin: 0;
  font-size: 1.15rem;
  color: var(--novel-text);
  font-weight: 600;
}

.panel-close-btn {
  background: var(--novel-card-bg);
  border: 1px solid var(--novel-border);
  border-radius: var(--novel-radius-sm);
  font-size: 1rem;
  color: var(--novel-text);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.panel-close-btn:hover {
  background: var(--novel-hover);
  border-color: var(--novel-danger);
  color: var(--novel-danger);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.panel-body::-webkit-scrollbar {
  width: 6px;
}

.panel-body::-webkit-scrollbar-track {
  background: transparent;
}

.panel-body::-webkit-scrollbar-thumb {
  background: var(--novel-border);
  border-radius: var(--novel-radius-full);
}

/* ==============================================
   章节列表样式
   ============================================== */
.chapter-list-container {
  max-height: 280px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--novel-border);
  border-radius: var(--novel-radius-sm);
  background: var(--novel-card-bg);
  margin-bottom: 16px;
}

.chapter-item {
  padding: 10px 12px;
  border: 1px solid var(--novel-border);
  border-radius: var(--novel-radius-sm);
  background: var(--novel-bg);
  margin-bottom: 8px;
  transition: all 0.2s ease;
}

.chapter-item:last-child {
  margin-bottom: 0;
}

.chapter-item:hover {
  border-color: var(--novel-primary);
  background: var(--novel-hover);
}

.chapter-item-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chapter-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
  color: var(--novel-text);
}

.chapter-title {
  font-size: 0.9rem;
}

/* ==============================================
   进度条样式
   ============================================== */
.progress-group {
  margin-bottom: 16px;
}

.progress-text {
  font-size: 0.85rem;
  color: var(--novel-text);
  margin: 0 0 6px 0;
  text-align: center;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: var(--novel-card-bg);
  border-radius: var(--novel-radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--novel-primary), #3664d9);
  border-radius: var(--novel-radius-full);
  transition: width 0.3s ease;
}

/* ==============================================
   手机端适配
   ============================================== */
@media (max-width: 768px) {
  .panel-content {
    width: 100% !important;
    max-width: 100vw !important;
    top: 0 !important;
    right: 0 !important;
    height: 100vh !important;
    border-radius: 0 !important;
  }

  .novel-writer-ball {
    width: 50px;
    height: 50px;
  }

  .novel-writer-inner .form-row {
    flex-direction: column;
    gap: 12px;
  }

  .novel-writer-inner .form-row .flex-1,
  .novel-writer-inner .form-row .flex-2 {
    width: 100%;
    min-width: 100%;
  }
}
