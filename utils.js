export function loadUtils() {
  console.log('[Novel-Continuation-Plugin] 工具模块加载完成');
}

export function validateGraphJSON(jsonObj, requiredFields) {
  if (typeof jsonObj !== 'object' || jsonObj === null || Array.isArray(jsonObj)) return false;
  for (const field of requiredFields) {
    if (!(field in jsonObj)) return false;
  }
  return true;
}

export function cleanText(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function getChineseWordCount(text) {
  const chineseMatch = text.match(/[\u4e00-\u9fa5]/g);
  return chineseMatch ? chineseMatch.length : 0;
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
