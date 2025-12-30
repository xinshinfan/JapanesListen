# 日语博客语音播放器 - 服务器部署指南

## 问题说明

当应用发布到ngrok后，浏览器无法直接访问`http://127.0.0.1:50021`，因为这是服务器本地的地址，不是用户本地的地址。

## 解决方案

已创建Node.js服务器来代理前端请求到本地VOICEVOX引擎。

## 使用方法

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
npm start
```

服务器将在`http://localhost:3000`上运行。

### 3. 使用ngrok发布

```bash
ngrok http 3000
```

## 工作原理

- 前端通过`/api/*`路径访问API
- Node.js服务器接收请求并转发到本地VOICEVOX引擎（`http://127.0.0.1:50021`）
- 服务器将响应返回给前端

## 注意事项

1. 确保VOICEVOX引擎在服务器上运行在`http://127.0.0.1:50021`
2. 确保服务器已安装Node.js和npm
3. 确保服务器防火墙允许3000端口访问

## 文件说明

- `server.js`: Node.js服务器文件，处理API代理
- `package.json`: 项目依赖配置
- `blog_player.js`: 前端JavaScript代码，已修改为使用代理API
- `japanese_blog_player.html`: 前端HTML页面