const fs = require('fs');
const path = require('path');

// Function to read chapters from a TXT file
function readChapters(filePath) {
    const data = fs.readFileSync(filePath, 'utf-8');
    const chapters = data.split(/Chapter \d+/).filter(chapter => chapter.trim()); // Assuming chapters start with "Chapter X"
    return chapters.map((chapter, index) => ({
        chapterNumber: index + 1,
        content: chapter.trim()
    }));
}

// Function to send chapters as chat messages
function sendChatMessages(chapters) {
    chapters.forEach(chapter => {
        // Simulating sending chat message
        console.log(`Chapter ${chapter.chapterNumber}:`);
        console.log(chapter.content);
        console.log('---'); // Separator for messages
    });
}

// Main function to execute chapter parsing and message sending
function main() {
    const filePath = path.join(__dirname, 'novel.txt'); // Assuming the novel is in the same directory as this script
    const chapters = readChapters(filePath);
    sendChatMessages(chapters);
}

// Execute the main function
main();
