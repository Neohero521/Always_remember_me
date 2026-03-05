export async function importNovelFile(file) {
  if (!file) {
    toast.warning('请选择有效的小说文件');
    return null;
  }
  if (!file.name.endsWith('.txt')) {
    toast.warning('仅支持TXT格式的小说文件');
    return null;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      resolve(text);
    };
    reader.onerror = () => {
      toast.error('文件读取失败');
      resolve(null);
    };
    reader.readAsText(file, 'utf-8');
  });
}
