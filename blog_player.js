// 日语博客语音播放器核心代码

// DOM元素引用（将在DOM加载完成后获取）
let blogUrlInput;
let fetchBtn;
let statusElement;
let articleContent;
let prevBtn;
let playPauseBtn;
let nextBtn;
let currentSentenceElement;
let progressElement;
let speakerSelect;

// 全局变量
let articleText = '';
let sentences = [];
let currentSentenceIndex = 0;
let isPlaying = false;
let audio = null;

// ----------------------- VITS/VOICEVOX API 配置 -----------------------
const VOICEVOX_URL = "http://127.0.0.1:50021";
// SPEAKER_ID 3 对应四国めたん (Shikoku Metan)
const VOICEVOX_SPEAKER_ID = 3;
const MAX_RETRIES = 3;

// 初始化事件监听器
document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素引用
    blogUrlInput = document.getElementById('blog-url');
    fetchBtn = document.getElementById('fetch-btn');
    statusElement = document.getElementById('status');
    articleContent = document.getElementById('article-content');
    prevBtn = document.getElementById('prev-btn');
    playPauseBtn = document.getElementById('play-pause-btn');
    nextBtn = document.getElementById('next-btn');
    currentSentenceElement = document.getElementById('current-sentence');
    progressElement = document.getElementById('progress');
    speakerSelect = document.getElementById('speaker-select');
    
    // 基本功能元素检查
    if (!blogUrlInput || !fetchBtn || !statusElement || !articleContent) {
        console.error('基本功能元素缺失，无法正常工作');
        return;
    }
    
    // 添加事件监听器
    if (fetchBtn) {
        fetchBtn.addEventListener('click', fetchBlogContent);
    }
    if (blogUrlInput) {
        blogUrlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                fetchBlogContent();
            }
        });
    }
    
    // 填充语音角色下拉框（如果元素存在）
    if (speakerSelect) {
        populateSpeakerDropdown();
    }
    
    // 添加播放器按钮事件监听器（如果存在）
    if (prevBtn) {
        prevBtn.addEventListener('click', playPreviousSentence);
    }
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', togglePlayPause);
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', playNextSentence);
    }
    
    // 添加键盘快捷键支持
    document.addEventListener('keydown', function(e) {
        // 如果焦点在输入框中，不处理快捷键
        if (document.activeElement === blogUrlInput || document.activeElement === speakerSelect) {
            return;
        }
        
        // 只有当播放器按钮存在时才处理快捷键
        if (playPauseBtn) {
            switch(e.key) {
                case ' ':
                    // 空格键：播放/暂停
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'ArrowLeft':
                    // 左箭头：上一句
                    e.preventDefault();
                    playPreviousSentence();
                    break;
                case 'ArrowRight':
                    // 右箭头：下一句
                    e.preventDefault();
                    playNextSentence();
                    break;
            }
        }
    });
});

// 更新状态信息
function updateStatus(message, type = 'info') {
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
    }
}

// ----------------------- VITS/VOICEVOX API 工具函数 -----------------------

/**
 * 带有指数退避的 Fetch (用于提高本地连接稳定性)
 */
async function fetchWithBackoff(url, options = {}, retries = MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) {
                return response;
            }
            // 对于 4xx 或 5xx 错误，在最后一次尝试之前进行重试
            if (i < retries - 1) {
                const delay = Math.pow(2, i) * 100; // 100ms, 200ms, 400ms...
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw new Error(`API 请求失败，状态码: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            if (i < retries - 1) {
                console.warn(`API 连接失败，正在重试... (${i + 1}/${retries})`);
                const delay = Math.pow(2, i) * 100;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw new Error(`API 连接失败，请检查 VOICEVOX 引擎是否运行在 ${VOICEVOX_URL}: ${error.message}`);
            }
        }
    }
}

/**
 * 获取可用的语音角色列表
 */
async function fetchSpeakers() {
    try {
        const response = await fetchWithBackoff(`${VOICEVOX_URL}/speakers`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        return await response.json();
    } catch (error) {
        console.error("获取语音角色列表失败:", error);
        updateStatus(`无法加载语音角色列表: ${error.message}`, 'error');
        return [];
    }
}

/**
 * 填充语音角色下拉选择框
 */
async function populateSpeakerDropdown() {
    const speakers = await fetchSpeakers();
    speakerSelect.innerHTML = '';
    
    if (speakers.length === 0) {
        speakerSelect.innerHTML = '<option value="">无法加载语音角色</option>';
        return;
    }
    
    // 遍历所有speaker及其风格
    speakers.forEach(speaker => {
        if (speaker.styles && speaker.styles.length > 0) {
            // 为每个speaker添加分组
            const optgroup = document.createElement('optgroup');
            optgroup.label = speaker.name;
            speakerSelect.appendChild(optgroup);
            
            // 添加该speaker的所有风格
            speaker.styles.forEach(style => {
                const option = document.createElement('option');
                option.value = style.id;
                option.textContent = style.name;
                
                // 设置默认选中的speaker ID
                if (style.id == VOICEVOX_SPEAKER_ID) {
                    option.selected = true;
                }
                
                optgroup.appendChild(option);
            });
        } else {
            // 简单格式的speaker数据
            const option = document.createElement('option');
            option.value = speaker.id;
            option.textContent = speaker.name;
            
            if (speaker.id == VOICEVOX_SPEAKER_ID) {
                option.selected = true;
            }
            
            speakerSelect.appendChild(option);
        }
    });
}

/**
 * VOICEVOX 步骤 1: 获取音频参数
 */
async function getAudioQuery(text, speaker) {
    const url = new URL(`${VOICEVOX_URL}/audio_query`);
    url.searchParams.append("text", text);
    url.searchParams.append("speaker", speaker);

    try {
        const response = await fetchWithBackoff(url.toString(), {
            method: 'POST',
            headers: { 'Accept': 'application/json' }
        });
        return await response.json();
    } catch (e) {
        console.error("步骤 1 (audio_query) 失败:", e);
        updateStatus(`获取音频参数失败: ${e.message}`, 'error');
        return null;
    }
}

/**
 * VOICEVOX 步骤 2: 合成音频
 */
async function synthesizeSpeechAPI(audioQueryJson, speaker) {
    const url = new URL(`${VOICEVOX_URL}/synthesis`);
    url.searchParams.append("speaker", speaker);

    try {
        const response = await fetchWithBackoff(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(audioQueryJson)
        });
        return await response.blob(); // 返回 Blob 数据
    } catch (e) {
        console.error("步骤 2 (synthesis) 失败:", e);
        updateStatus(`语音合成失败: ${e.message}`, 'error');
        return null;
    }
}

/**
 * 检测输入是否为有效的URL
 */
function isURL(input) {
    try {
        new URL(input);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * 检测输入是否包含日语内容
 */
function containsJapanese(input) {
    // 匹配日语平假名、片假名和汉字
    const japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
    return japaneseRegex.test(input);
}

// 获取博客内容
async function fetchBlogContent() {
    const input = blogUrlInput.value.trim();
    
    if (!input) {
        updateStatus('请输入有效的博客网址或日语内容', 'error');
        return;
    }
    
    updateStatus('正在处理内容...', 'loading');
    
    try {
        let text;
        
        if (isURL(input)) {
            // 处理URL输入：爬取网页内容
            updateStatus('正在提取博客内容...', 'loading');
            
            // 使用CORS代理处理跨域问题
            // 尝试使用更可靠的代理服务
            const proxyUrl = 'https://api.codetabs.com/v1/proxy?quest=';
            const response = await fetch(proxyUrl + encodeURIComponent(input));
            
            if (!response.ok) {
                throw new Error(`HTTP错误! 状态码: ${response.status}`);
            }
            
            // 检查响应内容类型
            const contentType = response.headers.get('content-type');
            let html;
            
            if (contentType && contentType.includes('application/json')) {
                // 如api.allorigins.win返回JSON格式
                const data = await response.json();
                html = data.contents || '';
            } else {
                // 如api.codetabs.com直接返回HTML
                html = await response.text();
            }
            
            // 解析HTML获取文章内容
            text = extractArticleContent(html);
        } else if (containsJapanese(input)) {
            // 处理直接输入的日语文本
            updateStatus('正在处理输入的日语内容...', 'loading');
            text = input;
        } else {
            // 无效输入
            updateStatus('请输入有效的博客网址或包含日语的内容', 'error');
            return;
        }
        
        articleText = text;
        
        // 分割句子
        sentences = splitJapaneseSentences(text);
        
        if (sentences.length === 0) {
            updateStatus('未检测到有效的日语句子', 'error');
            return;
        }
        
        // 显示文章内容
        displayArticleContent(sentences);
        
        updateStatus(`成功处理 ${sentences.length} 个句子`, 'success');
        
        // 重置播放器状态
        resetPlayer();
        
    } catch (error) {
        updateStatus('处理内容失败: ' + error.message, 'error');
        console.error('处理内容出错:', error);
    }
}

// 从HTML中提取文章内容
function extractArticleContent(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 尝试提取主要内容区域 - 这里使用常见的博客内容选择器
    const contentSelectors = [
        '.article-content',
        '.post-content',
        '.entry-content',
        '.main-content',
        '#content',
        'article',
        'main'
    ];
    
    let contentElement = null;
    for (const selector of contentSelectors) {
        contentElement = doc.querySelector(selector);
        if (contentElement) {
            break;
        }
    }
    
    // 如果没有找到特定的内容区域，尝试获取body文本
    if (!contentElement) {
        contentElement = doc.body;
    }
    
    // 确保contentElement有效
    if (!contentElement) {
        return '';
    }
    
    // 移除不需要的元素
    const elementsToRemove = [
        'script', 'style', 'nav', 'header', 'footer', 'aside',
        '.comments', '.sidebar', '.widget', '.ad', '.advertisement'
    ];
    
    elementsToRemove.forEach(selector => {
        try {
            const elements = contentElement.querySelectorAll(selector);
            elements.forEach(el => el.remove());
        } catch (e) {
            console.error(`Failed to remove elements with selector ${selector}:`, e);
        }
    });
    
    // 获取文本内容并清理
    let text = contentElement.textContent || contentElement.innerText || '';
    
    // 清理文本 - 保留换行符
    text = text.replace(/[ \t]+/g, ' ').trim(); // 只合并空格和制表符，保留换行符
    text = text.replace(/\[.*?\]/g, ''); // 移除方括号内容
    text = text.replace(/\(.*?\)/g, ''); // 移除圆括号内容
    
    return text;
}

// 分割日语句子
function splitJapaneseSentences(text) {
    if (!text) return [];
    
    // 首先按段落分割（换行符）
    const paragraphs = text.split(/\n+/);
    
    // 日语句子通常以句号(。)、感叹号(！)或问号(？)结尾
    const sentenceEndings = /([。！？])/g;
    
    const result = [];
    
    paragraphs.forEach(paragraph => {
        if (!paragraph.trim()) return;
        
        // 在段落内分割句子
        let sentences = paragraph.split(sentenceEndings);
        
        // 重新组合句子
        for (let i = 0; i < sentences.length; i += 2) {
            if (sentences[i] && sentences[i].trim()) {
                const sentence = sentences[i] + (sentences[i + 1] || '');
                result.push(sentence.trim());
            }
        }
        
        // 在段落之间添加一个空字符串作为段落分隔符
        result.push('');
    });
    
    // 移除最后一个空字符串（如果存在）
    if (result[result.length - 1] === '') {
        result.pop();
    }
    
    return result;
}

// 显示文章内容
function displayArticleContent(sentences) {
    articleContent.innerHTML = '';
    
    sentences.forEach((sentence, index) => {
        if (sentence === '') {
            // 处理段落分隔符
            const paragraphBreak = document.createElement('div');
            paragraphBreak.className = 'paragraph-break';
            articleContent.appendChild(paragraphBreak);
        } else {
            // 处理普通句子
            const sentenceElement = document.createElement('div');
            sentenceElement.className = 'sentence';
            
            // 安全地转换换行符为<br>标签
            const formattedSentence = sentence
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/\n/g, '<br>');
            
            sentenceElement.innerHTML = formattedSentence;
            sentenceElement.dataset.index = index;
            
            // 添加点击事件，点击句子时播放
            sentenceElement.addEventListener('click', () => {
                playSentence(index);
            });
            
            articleContent.appendChild(sentenceElement);
        }
    });
}

// 重置播放器
function resetPlayer() {
    currentSentenceIndex = 0;
    isPlaying = false;
    updatePlayPauseButton();
    updateCurrentSentenceDisplay();
    updateProgress();
    highlightSentence(currentSentenceIndex);
}

// 播放指定句子
async function playSentence(index) {
    if (index < 0 || index >= sentences.length) return;
    
    // 停止当前播放
    if (audio) {
        audio.pause();
        audio = null;
    }
    
    // 更新当前句子索引
    currentSentenceIndex = index;
    updateCurrentSentenceDisplay();
    updateProgress();
    highlightSentence(index);
    
    // 获取句子文本
    const sentence = sentences[index];
    
    try {
        updateStatus('正在合成语音...', 'loading');
        
        // 调用本地语音合成接口
        const audioData = await synthesizeSpeech(sentence);
        
        // 创建音频对象并播放
        audio = new Audio(audioData);
        
        audio.onplay = () => {
            isPlaying = true;
            updatePlayPauseButton();
            updateStatus('正在播放语音', 'success');
        };
        
        audio.onended = () => {
            isPlaying = false;
            updatePlayPauseButton();
            updateStatus('播放完成', 'success');
            
            // 自动播放下一句
            if (currentSentenceIndex < sentences.length - 1) {
                setTimeout(() => playNextSentence(), 500);
            }
        };
        
        audio.onerror = (error) => {
            isPlaying = false;
            updatePlayPauseButton();
            updateStatus('语音播放错误', 'error');
            console.error('音频播放错误:', error);
        };
        
        await audio.play();
        
    } catch (error) {
        updateStatus('语音合成失败: ' + error.message, 'error');
        console.error('语音合成出错:', error);
    }
}

// 语音合成接口
async function synthesizeSpeech(text) {
    try {
        // 获取当前选择的speaker ID
        const selectedSpeakerId = speakerSelect.value;
        if (!selectedSpeakerId) {
            updateStatus('请先选择一个语音角色', 'error');
            return null;
        }
        
        // 第一步：获取音频参数
        const audioQuery = await getAudioQuery(text, selectedSpeakerId);
        if (!audioQuery) {
            return null;
        }
        
        // 第二步：合成音频
        const audioBlob = await synthesizeSpeechAPI(audioQuery, selectedSpeakerId);
        if (!audioBlob) {
            return null;
        }
        
        // 将音频数据转换为Blob URL
        const audioUrl = URL.createObjectURL(audioBlob);
        console.log('本地API合成成功，音频Blob大小:', audioBlob.size);
        console.log('音频Blob类型:', audioBlob.type);
        updateStatus('本地语音合成成功', 'success');
        return audioUrl;
        
    } catch (error) {
        console.error('本地语音合成接口调用失败:', error);
        console.error('错误堆栈:', error.stack);
        
        // 不再回退到系统语音，只使用用户指定的本地接口
        updateStatus(`本地语音合成失败: ${error.message}`, 'error');
        throw error;
    }
}

// 播放上一句
function playPreviousSentence() {
    if (currentSentenceIndex > 0) {
        playSentence(currentSentenceIndex - 1);
    }
}

// 播放下一句
function playNextSentence() {
    if (currentSentenceIndex < sentences.length - 1) {
        playSentence(currentSentenceIndex + 1);
    }
}

// 切换播放/暂停
function togglePlayPause() {
    if (sentences.length === 0) {
        updateStatus('请先提取博客内容', 'error');
        return;
    }
    
    if (isPlaying) {
        // 暂停播放
        if (audio) {
            audio.pause();
            isPlaying = false;
            updatePlayPauseButton();
            updateStatus('已暂停', 'success');
        }
    } else {
        // 开始播放
        playSentence(currentSentenceIndex);
    }
}

// 更新播放/暂停按钮
function updatePlayPauseButton() {
    if (!playPauseBtn) return;
    
    const button = playPauseBtn;
    const icon = button.querySelector('span');
    
    if (isPlaying) {
        button.className = 'btn control pause';
        icon.textContent = '⏸️';
        button.title = '暂停';
    } else {
        button.className = 'btn control play';
        icon.textContent = '▶️';
        button.title = '播放';
    }
}

// 更新当前句子显示
function updateCurrentSentenceDisplay() {
    if (currentSentenceElement) {
        currentSentenceElement.textContent = `句子 ${currentSentenceIndex + 1} / ${sentences.length}`;
    }
}

// 更新进度条
function updateProgress() {
    if (!progressElement) return;
    
    if (sentences.length === 0) {
        progressElement.style.width = '0%';
        return;
    }
    
    const progress = ((currentSentenceIndex + 1) / sentences.length) * 100;
    progressElement.style.width = `${progress}%`;
}

// 高亮当前句子
function highlightSentence(index) {
    if (!articleContent) return;
    
    // 移除所有句子的高亮
    document.querySelectorAll('.sentence').forEach(sentenceEl => {
        sentenceEl.classList.remove('active');
    });
    
    // 高亮当前句子
    const currentSentenceEl = document.querySelector(`.sentence[data-index="${index}"]`);
    if (currentSentenceEl) {
        currentSentenceEl.classList.add('active');
        
        // 滚动到当前句子
        currentSentenceEl.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
}