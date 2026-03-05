// modules/storageManager.js
const STORAGE_KEY = 'always_remember_me_novel_data';

class StorageManager {
    constructor() {
        this.initStorage();
    }

    initStorage() {
        if (!localStorage.getItem(STORAGE_KEY)) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                novels: [],
                currentNovelId: null,
                currentChapterId: null,
                knowledgeGraphs: {}
            }));
        }
    }

    getData() {
        return JSON.parse(localStorage.getItem(STORAGE_KEY));
    }

    saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    addNovel(novel) {
        const data = this.getData();
        const novelId = Date.now().toString();
        data.novels.push({
            id: novelId,
            ...novel,
            createTime: Date.now(),
            updateTime: Date.now()
        });
        this.saveData(data);
        return novelId;
    }

    getNovel(novelId) {
        const data = this.getData();
        return data.novels.find(novel => novel.id === novelId) || null;
    }

    getAllNovels() {
        const data = this.getData();
        return data.novels;
    }

    updateNovel(novelId, updates) {
        const data = this.getData();
        const index = data.novels.findIndex(novel => novel.id === novelId);
        if (index !== -1) {
            data.novels[index] = {
                ...data.novels[index],
                ...updates,
                updateTime: Date.now()
            };
            this.saveData(data);
        }
    }

    deleteNovel(novelId) {
        const data = this.getData();
        data.novels = data.novels.filter(novel => novel.id !== novelId);
        delete data.knowledgeGraphs[novelId];
        if (data.currentNovelId === novelId) {
            data.currentNovelId = null;
            data.currentChapterId = null;
        }
        this.saveData(data);
    }

    setCurrentNovel(novelId) {
        const data = this.getData();
        data.currentNovelId = novelId;
        data.currentChapterId = null;
        this.saveData(data);
    }

    setCurrentChapter(chapterId) {
        const data = this.getData();
        data.currentChapterId = chapterId;
        this.saveData(data);
    }

    getCurrentNovel() {
        const data = this.getData();
        return this.getNovel(data.currentNovelId);
    }

    getCurrentChapter() {
        const data = this.getData();
        const novel = this.getCurrentNovel();
        if (!novel) return null;
        return novel.chapters.find(chapter => chapter.id === data.currentChapterId) || null;
    }

    saveChapterGraph(novelId, chapterId, graph) {
        const data = this.getData();
        if (!data.knowledgeGraphs[novelId]) {
            data.knowledgeGraphs[novelId] = {};
        }
        data.knowledgeGraphs[novelId][chapterId] = graph;
        this.saveData(data);
    }

    getChapterGraph(novelId, chapterId) {
        const data = this.getData();
        return data.knowledgeGraphs[novelId]?.[chapterId] || null;
    }

    getNovelAllGraphs(novelId) {
        const data = this.getData();
        return data.knowledgeGraphs[novelId] || {};
    }

    saveMergedGraph(novelId, mergedGraph) {
        const data = this.getData();
        if (!data.knowledgeGraphs[novelId]) {
            data.knowledgeGraphs[novelId] = {};
        }
        data.knowledgeGraphs[novelId].merged = mergedGraph;
        this.saveData(data);
    }

    getMergedGraph(novelId) {
        const data = this.getData();
        return data.knowledgeGraphs[novelId]?.merged || null;
    }
}

export default new StorageManager();
