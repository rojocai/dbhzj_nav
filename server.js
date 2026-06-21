const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data.json');
const USER_FILE = path.join(__dirname, 'users.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const PORT = 5001;

// ===== 用户管理 =====
const SALT = 'nav_site_salt_2026';

function hashPassword(password) {
    return crypto.createHash('sha256').update(password + SALT).digest('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function readUsers() {
    try {
        if (!fs.existsSync(USER_FILE)) {
            const defaultUsers = {
                users: [{ id: 1, username: 'admin', password: hashPassword('admin123'), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
                tokens: {}
            };
            writeUsers(defaultUsers);
            return defaultUsers;
        }
        return JSON.parse(fs.readFileSync(USER_FILE, 'utf-8'));
    } catch (e) {
        return { users: [], tokens: {} };
    }
}

function writeUsers(data) {
    fs.writeFileSync(USER_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function verifyToken(token) {
    if (!token) return null;
    const users = readUsers();
    return users.tokens[token] || null;
}

// ===== 网站配置管理 =====
function readConfig() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            const def = {
                site_title: '六零导航',
                site_subtitle: '上网从这里开始 · 收录精品网站',
                site_logo: '',
                site_background: '',
                site_background_mobile: '',
                site_keywords: '导航,网址导航,六零导航,实用工具',
                site_description: '六零导航 - 上网从这里开始，收录精品网站',
                site_footer: '🧭 六零导航 · 上网从这里开始',
                site_icp: '',
                site_custom_css: '',
                site_custom_js: '',
                bg_type: 'gradient',  // gradient, image, color
                bg_color: '#0f0c29',
                bg_gradient: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
                card_opacity: 0.03,
                accent_color: '#667eea'
            };
            writeConfig(def);
            return def;
        }
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) {
        return {};
    }
}

function writeConfig(data) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ===== 导航数据管理 =====
function readData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (e) {
        return null;
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { resolve(null); }
        });
    });
}

function sendJSON(res, code, data) {
    res.writeHead(code, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
    const ext = path.extname(filePath);
    const mime = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2'
    };
    try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, {
            'Content-Type': mime[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=86400'
        });
        res.end(content);
    } catch (e) {
        sendJSON(res, 404, { error: 'File not found' });
    }
}

function parseCookies(req) {
    const cookieHeader = req.headers.cookie || '';
    const cookies = {};
    cookieHeader.split(';').forEach(c => {
        const parts = c.trim().split('=');
        if (parts.length >= 2) cookies[parts[0].trim()] = parts.slice(1).join('=');
    });
    return cookies;
}

function getTokenFromReq(req) {
    const cookies = parseCookies(req);
    const authHeader = req.headers.authorization;
    return cookies.nav_token || (authHeader && authHeader.replace('Bearer ', ''));
}

// ===== 文件上传 =====
function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        if (!boundary) return reject('No boundary');

        let raw = Buffer.alloc(0);
        req.on('data', chunk => raw = Buffer.concat([raw, chunk]));
        req.on('end', () => {
            const parts = [];
            const bufStr = raw.toString('binary');
            const sep = '--' + boundary;
            const blocks = bufStr.split(sep).filter(b => b.includes('Content-Disposition'));

            blocks.forEach(block => {
                const headerEnd = block.indexOf('\r\n\r\n');
                if (headerEnd === -1) return;
                const headers = block.substring(0, headerEnd);
                const content = block.substring(headerEnd + 4);
                const nameMatch = headers.match(/name="([^"]+)"/);
                const filenameMatch = headers.match(/filename="([^"]+)"/);
                const name = nameMatch ? nameMatch[1] : '';
                const filename = filenameMatch ? filenameMatch[1] : '';

                if (filename) {
                    // 文件字段 - 去掉尾部的 \r\n--\r\n
                    let fileData = block.substring(headerEnd + 4);
                    fileData = fileData.replace(/\r\n--\r\n$/, '').replace(/\r\n--$/, '');
                    parts.push({ name, filename, data: Buffer.from(fileData, 'binary') });
                } else {
                    parts.push({ name, value: content.replace(/\r\n$/, '') });
                }
            });
            resolve(parts);
        });
    });
}

// ===== 上传文件保存 =====
const UPLOAD_DIR = path.join(__dirname, 'uploads');

function ensureUploadDir() {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
}

function saveUploadedFile(filename, buffer) {
    ensureUploadDir();
    const ext = path.extname(filename) || '.png';
    const safeName = Date.now() + ext;
    const filePath = path.join(UPLOAD_DIR, safeName);
    fs.writeFileSync(filePath, buffer);
    return '/uploads/' + safeName;
}

// ===== 路由 =====
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
    }

    // ---- 认证 API ----
    if (pathname === '/api/login' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!body) { sendJSON(res, 400, { error: '请求数据无效' }); return; }
        const { username, password } = body;
        if (!username || !password) { sendJSON(res, 400, { error: '请输入用户名和密码' }); return; }

        const users = readUsers();
        const user = users.users.find(u => u.username === username);
        if (!user || user.password !== hashPassword(password)) {
            sendJSON(res, 401, { error: '用户名或密码错误' });
            return;
        }

        const token = generateToken();
        users.tokens[token] = username;
        writeUsers(users);

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Set-Cookie': `nav_token=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`
        });
        res.end(JSON.stringify({ success: true, token, user: { username } }));
        return;
    }

    if (pathname === '/api/verify' && req.method === 'GET') {
        const token = getTokenFromReq(req);
        const username = verifyToken(token);
        if (username) sendJSON(res, 200, { success: true, user: { username } });
        else sendJSON(res, 401, { error: '未登录' });
        return;
    }

    if (pathname === '/api/change-password' && req.method === 'POST') {
        const token = getTokenFromReq(req);
        const username = verifyToken(token);
        if (!username) { sendJSON(res, 401, { error: '未登录' }); return; }

        const body = await parseBody(req);
        if (!body) { sendJSON(res, 400, { error: '请求数据无效' }); return; }

        const { oldPassword, newPassword } = body;
        if (!oldPassword || !newPassword) { sendJSON(res, 400, { error: '请填写旧密码和新密码' }); return; }
        if (newPassword.length < 6) { sendJSON(res, 400, { error: '新密码至少6位' }); return; }

        const users = readUsers();
        const user = users.users.find(u => u.username === username);
        if (!user || user.password !== hashPassword(oldPassword)) {
            sendJSON(res, 401, { error: '旧密码错误' });
            return;
        }

        if (body.newUsername && body.newUsername.trim()) {
            const newUsername = body.newUsername.trim();
            const existing = users.users.find(u => u.username === newUsername && u.username !== username);
            if (existing) { sendJSON(res, 400, { error: '用户名已存在' }); return; }
            user.username = newUsername;
            Object.keys(users.tokens).forEach(t => {
                if (users.tokens[t] === username) users.tokens[t] = newUsername;
            });
        }

        user.password = hashPassword(newPassword);
        user.updated_at = new Date().toISOString();
        writeUsers(users);
        sendJSON(res, 200, { success: true, message: '密码修改成功', username: user.username });
        return;
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
        const token = getTokenFromReq(req);
        if (token) {
            const users = readUsers();
            delete users.tokens[token];
            writeUsers(users);
        }
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Set-Cookie': 'nav_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
        });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // ---- 导航数据 API ----
    if (pathname === '/api/data' && req.method === 'GET') {
        const data = readData();
        if (data) sendJSON(res, 200, data);
        else sendJSON(res, 500, { error: 'Failed to read data' });
        return;
    }

    if (pathname === '/api/data' && req.method === 'POST') {
        const token = getTokenFromReq(req);
        if (!verifyToken(token)) { sendJSON(res, 401, { error: '未登录' }); return; }
        const body = await parseBody(req);
        if (body) { writeData(body); sendJSON(res, 200, { success: true }); }
        else sendJSON(res, 400, { error: 'Invalid JSON' });
        return;
    }

    // ---- 网站配置 API ----
    if (pathname === '/api/config' && req.method === 'GET') {
        sendJSON(res, 200, readConfig());
        return;
    }

    if (pathname === '/api/config' && req.method === 'POST') {
        const token = getTokenFromReq(req);
        if (!verifyToken(token)) { sendJSON(res, 401, { error: '未登录' }); return; }
        const body = await parseBody(req);
        if (body) { writeConfig(body); sendJSON(res, 200, { success: true }); }
        else sendJSON(res, 400, { error: 'Invalid JSON' });
        return;
    }

    // ---- 文件上传 API (POST /api/upload) ----
    if (pathname === '/api/upload' && req.method === 'POST') {
        const token = getTokenFromReq(req);
        if (!verifyToken(token)) { sendJSON(res, 401, { error: '未登录' }); return; }

        try {
            const parts = await parseMultipart(req);
            const filePart = parts.find(p => p.filename && p.data);
            if (!filePart) { sendJSON(res, 400, { error: '没有上传文件' }); return; }

            const url = saveUploadedFile(filePart.filename, filePart.data);
            sendJSON(res, 200, { success: true, url });
        } catch (e) {
            sendJSON(res, 400, { error: '上传失败: ' + e.message });
        }
        return;
    }

    // ---- 静态文件 ----
    // 上传的文件
    if (pathname.startsWith('/uploads/')) {
        sendFile(res, path.join(UPLOAD_DIR, path.basename(pathname)));
        return;
    }

    if (pathname === '/' || pathname === '/index.html') {
        sendFile(res, path.join(__dirname, 'index.html'));
        return;
    }

    if (pathname === '/admin.html' || pathname === '/admin') {
        sendFile(res, path.join(__dirname, 'admin.html'));
        return;
    }

    if (pathname === '/data.json') {
        sendFile(res, DATA_FILE);
        return;
    }

    sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`API server running on http://0.0.0.0:${PORT}`);
});
