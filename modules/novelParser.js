export function scoreDecodedString(str) {
    if (!str || str.length === 0) return -Infinity;
    let chinese = 0, asciiLetter = 0, digit = 0, punctuation = 0, replacement = 0;
    const total = str.length;
    for (let i = 0; i < total; i++) {
        const c = str[i];
        const code = str.charCodeAt(i);
        if (c === '�') replacement++;
        else if (code >= 0x4e00 && code <= 0x9fff) chinese++;
        else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) asciiLetter++;
        else if (code >= 0x30 && code <= 0x39) digit++;
        else if ('.。,，!！?？:：;；"“”‘\''.includes(c)) punctuation++;
    }
    return chinese * 3 + asciiLetter + digit + punctuation - replacement * 20;
}

export function detectBestEncoding(buffer) {
    const encodings = ['utf-8', 'gb18030', 'big5', 'shift-jis', 'utf-16le', 'utf-16be'];
    const sampleSize = Math.min(4 * 1024 * 1024, buffer.length);
    const sample = buffer.slice(0, sampleSize);
    let bestEncoding = 'utf-8';
    let bestScore = -Infinity;
    for (const enc of encodings) {
        try {
            const decoder = new TextDecoder(enc, { fatal: false });
            const decoded = decoder.decode(sample);
            const score = scoreDecodedString(decoded);
            if (score > bestScore) {
                bestScore = score;
                bestEncoding = enc;
            }
        } catch (e) {}
    }
    return bestScore < 0 ? 'utf-8' : bestEncoding;
}

export function preprocessNovelContent(content) {
    if (!content) return '';
    content = content.replace(/^\uFEFF/, '');
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const adPatterns = [
        /https?:\/\/[^\s]+/g, /www\.[^\s]+/g, /【.*?】.*?正版.*?/g,
        /本书首发.*?/g, /最新章节.*?/g, /请记住本站.*?/g
    ];
    adPatterns.forEach(pattern => { content = content.replace(pattern, ''); });
    content = content.replace(/[ \t\u3000]+/g, ' ');
    content = content.replace(/\n{3,}/g, '\n\n');
    return content.trim();
}

export async function readTxtFile(file) {
    return new Promise((resolve, reject) => {
        if (file.size > 50 * 1024 * 1024) {
            reject(new Error('文件过大，请上传小于50MB的TXT文件'));
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const arrayBuffer = e.target.result;
                const uint8Array = new Uint8Array(arrayBuffer);
                const bestGuess = detectBestEncoding(uint8Array);
                const candidateList = [...new Set([bestGuess, 'gb18030', 'utf-8', 'big5', 'utf-16le', 'utf-16be', 'shift-jis'])];
                let bestContent = '';
                let minReplacement = Infinity;
                for (const enc of candidateList) {
                    try {
                        const decoder = new TextDecoder(enc, { fatal: false });
                        const content = decoder.decode(uint8Array);
                        const replacementCount = (content.match(/�/g) || []).length;
                        if (replacementCount < minReplacement) {
                            minReplacement = replacementCount;
                            bestContent = content;
                        }
                        if (replacementCount === 0) break;
                    } catch (e) {}
                }
                if (!bestContent) throw new Error('所有编码均无法解码文件');
                const processedContent = preprocessNovelContent(bestContent);
                resolve(processedContent);
            } catch (err) {
                reject(new Error('文件解码失败：' + err.message));
            }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsArrayBuffer(file);
    });
}

export async function readEpubFile(file) {
    return new Promise((resolve, reject) => {
        if (file.size > 100 * 1024 * 1024) {
            reject(new Error('文件过大，请上传小于100MB的EPUB文件'));
            return;
        }
        const url = URL.createObjectURL(file);
        const book = ePub(url);
        let fullContent = '';
        book.ready.then(() => book.loaded.navigation)
            .then(() => {
                const spineItems = book.spine.items.filter(item => item.href);
                const promises = spineItems.map(item => 
                    book.getChapter(item.href).then(chapter => chapter.textContent || '').catch(() => '')
                );
                return Promise.all(promises);
            })
            .then(chapters => {
                fullContent = chapters.filter(c => c.trim()).join('\n\n');
                URL.revokeObjectURL(url);
                if (!fullContent.trim()) {
                    reject(new Error('EPUB文件内容为空'));
                    return;
                }
                const processedContent = preprocessNovelContent(fullContent);
                resolve(processedContent);
            })
            .catch(err => {
                URL.revokeObjectURL(url);
                reject(new Error('EPUB解析失败：' + err.message));
            });
    });
}

export function splitChapters(novelContent) {
    if (!novelContent.trim()) throw new Error('小说内容为空');
    const patterns = [
        /^[\s　]*第[0-9一二三四五六七八九十百千万零壹贰叁肆伍陆柒捌玖拾佰仟]+[章回节卷部集篇][\s　]*/gm,
        /^[\s　]*[卷部篇集][0-9一二三四五六七八九十百千万零壹贰叁肆伍陆柒捌玖拾佰仟]*[\s　]*[章回节][\s　]*/gm,
        /^[\s　]*[0-9]+[.．、][\s　]*/gm,
        /^[\s　]*[一二三四五六七八九十]+[.．、][\s　]*/gm,
        /^[\s　]*(楔子|序章|引子|前言|序言|尾声|番外|后记|附录)[\s　]*/gim
    ];
    const lines = novelContent.split('\n');
    const chapterMarkers = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        for (const pattern of patterns) {
            pattern.lastIndex = 0;
            if (pattern.test(line)) {
                chapterMarkers.push({ index: i, title: line, rawLine: lines[i] });
                break;
            }
        }
    }
    if (chapterMarkers.length === 0) return splitByFixedLength(novelContent);
    const chapters = [];
    if (chapterMarkers[0].index > 0) {
        const prefaceContent = lines.slice(0, chapterMarkers[0].index).join('\n').trim();
        if (prefaceContent) {
            chapters.push({ id: 0, title: '前言/楔子', originalContent: prefaceContent, editContent: prefaceContent, continueContent: '', fullContent: prefaceContent });
        }
    }
    for (let i = 0; i < chapterMarkers.length; i++) {
        const current = chapterMarkers[i];
        const nextIndex = i < chapterMarkers.length - 1 ? chapterMarkers[i + 1].index : lines.length;
        const contentLines = lines.slice(current.index + 1, nextIndex);
        const content = contentLines.join('\n').trim();
        const title = current.title;
        const fullContent = title + '\n' + content;
        const chapterId = (chapters.length > 0 && chapters[0].title === '前言/楔子') ? i + 1 : i;
        chapters.push({ id: chapterId, title, originalContent: content, editContent: fullContent, continueContent: '', fullContent });
    }
    return chapters;
}

export function splitByFixedLength(novelContent, wordPerChapter = 8000) {
    const chapters = [];
    const totalLength = novelContent.length;
    const chapterCount = Math.ceil(totalLength / wordPerChapter);
    for (let i = 0; i < chapterCount; i++) {
        const start = i * wordPerChapter;
        const end = Math.min((i + 1) * wordPerChapter, totalLength);
        const content = novelContent.slice(start, end).trim();
        const title = `第${i + 1}章`;
        const fullContent = `${title}\n${content}`;
        chapters.push({ id: i, title, originalContent: content, editContent: fullContent, continueContent: '', fullContent });
    }
    return chapters;
}
