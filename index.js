import { pluginName, pluginDisplayName, pluginVersion } from './config.js';
import { initPlugin, registerSettings, registerCommands, registerPanel } from './main.js';
import { toast } from './toast.js';

(function () {
  'use strict';

  $(document).ready(async function () {
    try {
      console.log(`[${pluginName}] 正在加载插件 v${pluginVersion}`);
      
      await registerSettings();
      await registerCommands();
      await registerPanel();
      await initPlugin();

      toast.success(`${pluginDisplayName} 插件加载成功！`);
      console.log(`[${pluginName}] 插件加载完成 v${pluginVersion}`);
    } catch (error) {
      console.error(`[${pluginName}] 插件加载失败`, error);
      toast.error(`${pluginDisplayName} 插件加载失败：${error.message}`);
    }
  });
})();
