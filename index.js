// SillyTavern Server Plugin for Importing TXT Novel Files

const fs = require('fs');
const path = require('path');

class NovelImporter {
    constructor(directory) {
        this.directory = directory;
    }

    parseChapter(content) {
        // Basic implementation to split chapters by a specific pattern
        return content.split(/\n\s*Chapter \d+/).filter(chapter => chapter.trim() !== '').map(ch => ch.trim());
    }

    importNovels() {
        const files = fs.readdirSync(this.directory);
        const novels = {};

        files.forEach(file => {
            if (path.extname(file) === '.txt') {
                const content = fs.readFileSync(path.join(this.directory, file), 'utf-8');
                const chapters = this.parseChapter(content);
                novels[file] = chapters;
            }
        });

        return novels;
    }

    sendChapters(chatInterface, novelName) {
        const novels = this.importNovels();
        const chapters = novels[novelName];

        if (!chapters) {
            chatInterface.sendMessage(`Novel ${novelName} not found!`);
            return;
        }

        chapters.forEach((chapter, index) => {
            chatInterface.sendMessage(`/sendas chapter ${index + 1}: ${chapter}`);
        });
    }
}

module.exports = NovelImporter;