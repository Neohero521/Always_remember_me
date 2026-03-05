import { loadNovelUI, registerNovelButton } from './novel-ui.js';
import { initUtils } from './utils.js';

// 插件初始化入口（和参考案例入口逻辑对齐）
(function () {
  const pluginName = "小说续写助手";

  // 插件加载完成钩子
  $(document).on('tavern:ready', async function () {
    try {
      console.log(`[${pluginName}] 插件加载中...`);
      
      // 初始化工具模块
      initUtils();
      // 加载UI面板
      loadNovelUI();
      // 注册侧边栏功能按钮
      registerNovelButton();

      console.log(`[${pluginName}] 插件加载成功`);
    } catch (error) {
      console.error(`[${pluginName}] 插件加载失败`, error);
      toastr.error(`小说续写助手加载失败: ${error.message}`, "插件错误");
    }
  });
})();
