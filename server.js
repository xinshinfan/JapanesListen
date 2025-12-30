const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const VOICEVOX_URL = 'http://127.0.0.1:50021';


app.use(cors());
app.use(express.json());

// 跳过ngrok警告页面的中间件
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'any');
    next();
});

// 设置CORS和响应头
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ngrok-skip-browser-warning');
    next();
});

app.use(express.static(path.join(__dirname, '.')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'japanese_blog_player.html'));
});

app.get('/api/speakers', async (req, res) => {
    try {
        const response = await fetch(`${VOICEVOX_URL}/speakers`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('获取语音角色列表失败:', error);
        res.status(500).json({ error: '无法连接到VOICEVOX引擎' });
    }
});

app.post('/api/audio_query', async (req, res) => {
    try {
        const { text, speaker } = req.query;
        const response = await fetch(`${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json'
            }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('获取音频参数失败:', error);
        res.status(500).json({ error: '无法连接到VOICEVOX引擎' });
    }
});

app.post('/api/synthesis', async (req, res) => {
    try {
        const { speaker } = req.query;
        const response = await fetch(`${VOICEVOX_URL}/synthesis?speaker=${speaker}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        
        const buffer = await response.buffer();
        res.set('Content-Type', 'audio/wav');
        res.send(buffer);
    } catch (error) {
        console.error('语音合成失败:', error);
        res.status(500).json({ error: '无法连接到VOICEVOX引擎' });
    }
});

app.get('/api/files', (req, res) => {
    try {
        const files = fs.readdirSync(__dirname)
            .filter(file => file.endsWith('.txt'))
            .sort();
        res.json(files);
    } catch (error) {
        console.error('获取文件列表失败:', error);
        res.status(500).json({ error: '无法获取文件列表' });
    }
});

app.get('/api/file/:filename', (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        const filePath = path.join(__dirname, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ content: content });
    } catch (error) {
        console.error('读取文件失败:', error);
        res.status(500).json({ error: '无法读取文件' });
    }
});

app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`请确保VOICEVOX引擎运行在 ${VOICEVOX_URL}`);
});