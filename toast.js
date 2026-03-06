export const toast = {
  success: (message) => {
    if (window.toast) {
      window.toast.success(message);
    } else {
      console.log(`[SUCCESS] ${message}`);
      alert(message);
    }
  },
  error: (message) => {
    if (window.toast) {
      window.toast.error(message);
    } else {
      console.error(`[ERROR] ${message}`);
      alert(`错误：${message}`);
    }
  },
  info: (message) => {
    if (window.toast) {
      window.toast.info(message);
    } else {
      console.log(`[INFO] ${message}`);
      alert(message);
    }
  },
  warning: (message) => {
    if (window.toast) {
      window.toast.warning(message);
    } else {
      console.warn(`[WARNING] ${message}`);
      alert(`警告：${message}`);
    }
  }
};
