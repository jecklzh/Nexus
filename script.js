// 文件名: script.js

// --- DOM 元素选择 ---
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');

// --- 配置与状态 ---
// !!! 关键步骤 !!!
// 部署完 Cloudflare Worker 后，将获得的 URL 粘贴到这里
const API_ENDPOINT = 'https://nexusapi.stevel.eu.org'; 

let conversationHistory = []; // 存储对话历史

// --- 核心函数 ---

/**
 * 将消息添加到 UI 界面上
 * @param {string} text - 消息内容
 * @param {string} sender - 发送者 ('user' 或 'assistant')
 * @returns {HTMLElement} - 创建的消息元素
 */
function addMessageToUI(text, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    messageElement.textContent = text;
    chatMessages.appendChild(messageElement);
    
    // 自动滚动到最新消息
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 0);

    return messageElement;
}

/**
 * 发送消息到后端并处理流式响应
 */
async function sendMessage() {
    const messageText = chatInput.value.trim();
    if (messageText === '') return;

    // 1. 在 UI 和历史记录中处理用户消息
    addMessageToUI(messageText, 'user');
    conversationHistory.push({ role: 'user', content: messageText });
    
    chatInput.value = '';
    sendButton.disabled = true;

    // 2. 为 Nexus 的回复创建一个空的 UI 元素，并显示打字光标
    const assistantMessageElement = addMessageToUI('', 'assistant');
    assistantMessageElement.innerHTML = '<span class="blinking-cursor"></span>';

    try {
        // 3. 发送请求到 Cloudflare Worker
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: conversationHistory }),
        });

        if (!response.ok) throw new Error(`API 请求失败，状态码: ${response.status}`);

        // 4. 准备接收和处理数据流
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullReply = '';

        assistantMessageElement.innerHTML = ''; // 移除光标，准备接收文字

        // 5. 循环读取数据流，实现打字机效果
        while (true) {
            const { done, value } = await reader.read();
            if (done) break; // 数据流结束

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 保留可能不完整的最后一行

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const content = line.substring(6);
                    if (content.trim() === '[DONE]') continue;
                    try {
                        const json = JSON.parse(content);
                        const textChunk = json.choices[0].delta?.content || '';
                        if (textChunk) {
                            fullReply += textChunk;
                            assistantMessageElement.textContent = fullReply; // 实时更新 UI
                            chatMessages.scrollTop = chatMessages.scrollHeight; // 实时滚动
                        }
                    } catch (error) { /* 忽略无法解析的行 */ }
                }
            }
        }
        
        // 6. 流结束后，将完整的回复添加到对话历史中
        if(fullReply){
            conversationHistory.push({ role: 'assistant', content: fullReply });
        }

    } catch (error) {
        console.error('获取聊天响应时出错:', error);
        assistantMessageElement.textContent = '连接中断... 无法建立与 Nexus 的链接。';
    } finally {
        sendButton.disabled = false;
        chatInput.focus();
    }
}

// --- 事件监听 ---
sendButton.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (event) => {
    // 按下 Enter 键也发送消息
    if (event.key === 'Enter') {
        sendMessage();
    }
});

// 页面加载后自动聚焦到输入框
window.addEventListener('DOMContentLoaded', () => {
    chatInput.focus();
});