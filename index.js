// SillyTavern Novel Importer Plugin with Floating Window UI
export const info = {
    id: 'novel-importer',
    name: 'Novel Importer',
    description: '用于导入TXT小说的插件（中文）'
};

export async function init(router) {
    // Create floating window with purple gradient background
    const floatingWindow = document.createElement('div');
    floatingWindow.style.background = 'linear-gradient(to right, purple, violet)';
    floatingWindow.style.width = '300px';
    floatingWindow.style.padding = '20px';
    floatingWindow.style.borderRadius = '10px';
    floatingWindow.style.position = 'fixed';
    floatingWindow.style.top = '50%';
    floatingWindow.style.left = '50%';
    floatingWindow.style.transform = 'translate(-50%, -50%)';
    floatingWindow.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';

    // Title bar with close button
    const titleBar = document.createElement('div');
    titleBar.innerText = 'Novel Importer';
    titleBar.style.display = 'flex';
    titleBar.style.justifyContent = 'space-between';
    titleBar.style.alignItems = 'center';
    titleBar.style.cursor = 'move';

    const closeButton = document.createElement('button');
    closeButton.innerText = 'X';
    closeButton.onclick = () => floatingWindow.remove();
    titleBar.appendChild(closeButton);
    floatingWindow.appendChild(titleBar);

    // Buttons for uploading files and other functionalities
    const uploadBtn = createButton('Upload TXT', handleUpload);
    const parseBtn = createButton('Parse Chapters', parseChapters);
    const generateBtn = createButton('Generate Commands', generateCommands);
    const sendBtn = createButton('Send to Chat', sendToChat);
    const clearBtn = createButton('Clear Data', clearData);

    floatingWindow.append(uploadBtn, parseBtn, generateBtn, sendBtn, clearBtn);

    // Status display area
    const statusDisplay = document.createElement('div');
    statusDisplay.style.marginTop = '20px';
    floatingWindow.appendChild(statusDisplay);

    // Hidden file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt';
    fileInput.style.display = 'none';
    floatingWindow.appendChild(fileInput);

    document.body.appendChild(floatingWindow);

    // Initialize function for button click events
    function handleUpload() {
        fileInput.click();
    }

    function createButton(text, onClick) {
        const button = document.createElement('button');
        button.innerText = text;
        button.onclick = onClick;
        button.style.margin = '5px';
        return button;
    }

    function parseChapters() {
        // Parsing logic here
    }

    function generateCommands() {
        // Command generation logic here
    }

    function sendToChat() {
        // Logic to send to chat here
    }

    function clearData() {
        // Logic to clear data here
    }
}

export async function exit() {
    // Cleanup logic here
}