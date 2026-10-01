const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");

const root = __dirname;
const publicDir = path.join(root, "public");
const dataFile = path.join(root, "data", "site-data.json");
const uploadDir = path.join(publicDir, "uploads");

// 自动加载根目录 .env 文件 (无需第三方依赖)
function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.error("加载 .env 文件失败:", err);
  }
}
loadEnv();

const port = Number(process.env.PORT || 4173);
const adminUser = process.env.ADMIN_USER || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  throw new Error("请在启动服务前配置环境变量 ADMIN_PASSWORD 或在 .env 文件中设置。");
}

const sessions = new Set();
const loginFailures = new Map(); // IP -> { count, resetTime }
const messageRateLimits = new Map(); // IP -> lastMessageTime

fs.mkdirSync(uploadDir, { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4"
};

const ALLOWED_UPLOAD_EXTS = new Set([
  ".pdf", ".epub", ".zip", ".rar", ".7z",
  ".doc", ".docx", ".txt",
  ".png", ".jpg", ".jpeg", ".webp",
  ".mp3", ".mp4"
]);

function send(res, status, body, type = "application/json; charset=utf-8", headers = {}) {
  res.writeHead(status, { "Content-Type": type, ...headers });
  res.end(body);
}

function getClientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function readJsonBody(req, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error("请求内容过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function ensureDataFile() {
  const dataDir = path.dirname(dataFile);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dataFile)) {
    const exampleFile = path.join(root, "data", "site-data.example.json");
    if (fs.existsSync(exampleFile)) {
      fs.copyFileSync(exampleFile, dataFile);
    } else {
      const initialData = {
        settings: {
          title: "佛学文化资料阅览",
          subtitle: "经典经文、电子书籍与佛学文化学习资料",
          notice: ""
        },
        important: [],
        smallMantras: [],
        scriptures: [],
        downloads: [],
        messages: []
      };
      fs.writeFileSync(dataFile, JSON.stringify(initialData, null, 2), "utf8");
    }
  }
}

function readData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch (err) {
    const exampleFile = path.join(root, "data", "site-data.example.json");
    if (fs.existsSync(exampleFile)) {
      return JSON.parse(fs.readFileSync(exampleFile, "utf8"));
    }
    return {
      settings: { title: "佛学文化资料阅览", subtitle: "经典经文、电子书籍与佛学文化学习资料", notice: "" },
      important: [],
      smallMantras: [],
      scriptures: [],
      downloads: [],
      messages: []
    };
  }
}

function writeData(data) {
  ensureDataFile();
  const tmpFile = `${dataFile}.tmp.${Date.now()}.${crypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpFile, dataFile);
}

function readRawBodyToFile(req, filePath, maxBytes = 2 * 1024 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const stream = fs.createWriteStream(filePath);
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        stream.destroy();
        fs.rm(filePath, { force: true }, () => {});
        reject(new Error("文件过大"));
        req.destroy();
        return;
      }
      stream.write(chunk);
    });
    req.on("end", () => {
      stream.end(() => resolve(received));
    });
    req.on("error", (error) => {
      stream.destroy();
      fs.rm(filePath, { force: true }, () => {});
      reject(error);
    });
  });
}

function getSession(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : "";
}

function isAuthed(req) {
  const session = getSession(req);
  return Boolean(session && sessions.has(session));
}

function cleanItem(item, fallback = {}) {
  return {
    id: String(item.id || crypto.randomUUID()),
    title: String(item.title || fallback.title || "").trim(),
    subtitle: String(item.subtitle || ""),
    type: String(item.type || fallback.type || "PDF").trim(),
    size: String(item.size || ""),
    pages: String(item.pages || ""),
    icon: String(item.icon || fallback.icon || "lotus").trim(),
    readUrl: String(item.readUrl || "#").trim(),
    downloadUrl: String(item.downloadUrl || "#").trim(),
    fileId: String(item.fileId || "").trim(),
    featured: Boolean(item.featured)
  };
}

function cleanMessage(message) {
  return {
    id: String(message.id || crypto.randomUUID()),
    name: String(message.name || "善友").trim().slice(0, 24) || "善友",
    content: String(message.content || "").trim().slice(0, 300),
    reply: String(message.reply || "").trim().slice(0, 300),
    createdAt: String(message.createdAt || new Date().toISOString())
  };
}

function safeUploadName(name) {
  const ext = path.extname(name || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!ALLOWED_UPLOAD_EXTS.has(ext)) {
    throw new Error(`不支持的文件格式 (${ext || "无扩展名"})，仅允许常见图书、文档、音视频及压缩包`);
  }
  const base = path.basename(name || "file", path.extname(name || ""))
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${base || "file"}${ext}`;
}

function handleStatic(req, res) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);
  const requestPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(publicDir, requestPath));
  
  if (!filePath.startsWith(publicDir)) {
    return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      return send(res, 404, "Not found", "text/plain; charset=utf-8");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const totalSize = stats.size;
    const range = req.headers.range;

    // 支持 HTTP 206 Partial Content (分片加载，供 PDF.js 及音视频边下边播)
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (isNaN(start) || isNaN(end) || start >= totalSize || end >= totalSize || start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${totalSize}` });
        return res.end();
      }

      const chunkSize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": totalSize,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes"
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

async function handleApi(req, res) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);
  const clientIp = getClientIp(req);

  if (req.method === "GET" && url.pathname === "/api/data") {
    return send(res, 200, JSON.stringify(readData()));
  }

  if (req.method === "POST" && url.pathname === "/api/messages") {
    // 防刷限流：单 IP 10 秒内限 1 条
    const now = Date.now();
    const lastMsgTime = messageRateLimits.get(clientIp) || 0;
    if (now - lastMsgTime < 10000) {
      return send(res, 429, JSON.stringify({ ok: false, message: "留言过于频繁，请稍候再试" }));
    }

    const body = await readJsonBody(req);
    const content = String(body.content || "").trim();
    if (!content) return send(res, 400, JSON.stringify({ ok: false, message: "请填写留言内容" }));

    messageRateLimits.set(clientIp, now);
    const data = readData();
    data.messages = Array.isArray(data.messages) ? data.messages : [];
    const message = cleanMessage({
      name: body.name,
      content,
      createdAt: new Date().toISOString()
    });
    data.messages.unshift(message);
    data.messages = data.messages.slice(0, 80);
    writeData(data);
    return send(res, 200, JSON.stringify({ ok: true, message }));
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    // 登录暴力破解防护
    const failureRecord = loginFailures.get(clientIp);
    const now = Date.now();
    if (failureRecord && failureRecord.count >= 5 && now < failureRecord.resetTime) {
      const waitMin = Math.ceil((failureRecord.resetTime - now) / 60000);
      return send(res, 429, JSON.stringify({ ok: false, message: `登录尝试次数过多，请 ${waitMin} 分钟后再试` }));
    }

    const body = await readJsonBody(req);
    const isUserOk = safeCompare(String(body.username || ""), adminUser);
    const isPassOk = safeCompare(String(body.password || ""), adminPassword);

    if (isUserOk && isPassOk) {
      loginFailures.delete(clientIp);
      const session = crypto.randomBytes(32).toString("hex");
      sessions.add(session);
      return send(res, 200, JSON.stringify({ ok: true }), undefined, {
        "Set-Cookie": `session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
      });
    }

    const currentCount = failureRecord && now < failureRecord.resetTime ? failureRecord.count + 1 : 1;
    loginFailures.set(clientIp, {
      count: currentCount,
      resetTime: now + 5 * 60 * 1000 // 锁定 5 分钟
    });

    return send(res, 401, JSON.stringify({ ok: false, message: "账号或密码错误" }));
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    sessions.delete(getSession(req));
    return send(res, 200, JSON.stringify({ ok: true }), undefined, {
      "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
  }

  if (!isAuthed(req)) {
    return send(res, 401, JSON.stringify({ ok: false, message: "请先登录后台" }));
  }

  if (req.method === "GET" && url.pathname === "/api/admin/data") {
    return send(res, 200, JSON.stringify(readData()));
  }

  if (req.method === "PUT" && url.pathname === "/api/admin/data") {
    const body = await readJsonBody(req);
    const current = readData();
    const next = {
      settings: {
        title: String(body.settings?.title ?? current.settings?.title ?? "佛学文化资料阅览"),
        subtitle: String(body.settings?.subtitle ?? current.settings?.subtitle ?? ""),
        notice: String(body.settings?.notice ?? current.settings?.notice ?? "")
      },
      important: Array.isArray(body.important) ? body.important.map(cleanItem).filter((item) => item.title) : (current.important || []),
      smallMantras: Array.isArray(body.smallMantras) ? body.smallMantras.map(cleanItem).filter((item) => item.title).slice(0, 5) : (current.smallMantras || []),
      scriptures: Array.isArray(body.scriptures) ? body.scriptures.map(cleanItem).filter((item) => item.title) : (current.scriptures || []),
      downloads: Array.isArray(body.downloads) ? body.downloads.map(cleanItem).filter((item) => item.title) : (current.downloads || [])
    };

    // 智能合并留言：如果前端没有提交 messages 列表，保留当前存储中的留言，防止保存设置时清空/覆盖最新留言
    if (Array.isArray(body.messages)) {
      next.messages = body.messages.map(cleanMessage).filter((item) => item.content);
    } else {
      next.messages = current.messages || [];
    }

    writeData(next);
    return send(res, 200, JSON.stringify({ ok: true, data: next }));
  }

  // Base64 上传限制在 15MB 内，防止大文件解析打满 V8 内存 OOM
  if (req.method === "POST" && url.pathname === "/api/admin/upload") {
    const body = await readJsonBody(req, 15 * 1024 * 1024);
    const originalName = String(body.filename || "file.bin");
    const base64 = String(body.contentBase64 || "");
    if (!base64) return send(res, 400, JSON.stringify({ ok: false, message: "请选择要上传的文件" }));

    try {
      const fileName = safeUploadName(originalName);
      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
      return send(res, 200, JSON.stringify({
        ok: true,
        filename: fileName,
        url: `/uploads/${fileName}`
      }));
    } catch (err) {
      return send(res, 400, JSON.stringify({ ok: false, message: err.message }));
    }
  }

  // 流式上传接口，支持超大文件
  if (req.method === "POST" && url.pathname === "/api/admin/upload-raw") {
    const headerName = String(req.headers["x-filename"] || "file.bin");
    const originalName = decodeURIComponent(headerName);
    try {
      const fileName = safeUploadName(originalName);
      const filePath = path.join(uploadDir, fileName);
      const size = await readRawBodyToFile(req, filePath);
      return send(res, 200, JSON.stringify({
        ok: true,
        originalName,
        filename: fileName,
        size,
        url: `/uploads/${fileName}`
      }));
    } catch (err) {
      return send(res, 400, JSON.stringify({ ok: false, message: err.message }));
    }
  }

  if (req.method === "POST" && url.pathname === "/api/admin/delete-upload") {
    const body = await readJsonBody(req);
    const uploadUrl = String(body.url || "");
    if (!uploadUrl.startsWith("/uploads/")) {
      return send(res, 400, JSON.stringify({ ok: false, message: "只能删除上传目录内的文件" }));
    }
    const fileName = path.basename(uploadUrl);
    const filePath = path.join(uploadDir, fileName);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(uploadDir))) {
      return send(res, 400, JSON.stringify({ ok: false, message: "文件路径不合法" }));
    }
    fs.rmSync(resolved, { force: true });
    return send(res, 200, JSON.stringify({ ok: true }));
  }

  // 检查版本更新接口
  if (req.method === "GET" && url.pathname === "/api/admin/check-update") {
    const headResult = await runGitCommand('git log -1 --format="%h%x09%ci%x09%s"');
    if (!headResult.ok) {
      return send(res, 200, JSON.stringify({
        ok: true,
        isGit: false,
        message: "当前目录未检测到 Git 版本库或没有安装 Git，无法自动拉取更新。"
      }));
    }

    const [currentHash, commitDate, commitSubject] = (headResult.stdout || "").split("\t");

    const fetchResult = await runGitCommand("git fetch origin main");
    if (!fetchResult.ok) {
      return send(res, 200, JSON.stringify({
        ok: true,
        isGit: true,
        hasUpdate: false,
        current: { hash: currentHash, date: commitDate, subject: commitSubject },
        warning: "远程分支连接受限，暂无法比对远端版本",
        message: `当前版本：${currentHash} (${commitSubject || "最新"})`
      }));
    }

    const diffResult = await runGitCommand("git log HEAD..origin/main --oneline");
    const hasUpdate = Boolean(diffResult.stdout);
    const updates = hasUpdate ? diffResult.stdout.split("\n").filter(Boolean) : [];

    return send(res, 200, JSON.stringify({
      ok: true,
      isGit: true,
      hasUpdate,
      current: { hash: currentHash, date: commitDate, subject: commitSubject },
      updates,
      message: hasUpdate ? `检测到 ${updates.length} 个新提交` : "当前已是最新版本"
    }));
  }

  // 执行在线一键更新接口 (git pull origin main)
  if (req.method === "POST" && url.pathname === "/api/admin/update") {
    const pullResult = await runGitCommand("git pull origin main");
    if (!pullResult.ok) {
      return send(res, 500, JSON.stringify({
        ok: false,
        message: `更新失败: ${pullResult.stderr || pullResult.error || "合并冲突或网络超时"}`
      }));
    }

    const newHeadResult = await runGitCommand('git log -1 --format="%h%x09%ci%x09%s"');
    const [newHash, newDate, newSubject] = (newHeadResult.stdout || "").split("\t");

    return send(res, 200, JSON.stringify({
      ok: true,
      message: "项目代码已成功更新至最新版本！",
      details: pullResult.stdout,
      current: { hash: newHash, date: newDate, subject: newSubject }
    }));
  }

  send(res, 404, JSON.stringify({ ok: false, message: "接口不存在" }));
}

function runGitCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: root, timeout: 45000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error ? error.code : 0,
        stdout: (stdout || "").trim(),
        stderr: (stderr || "").trim(),
        error: error ? error.message : null
      });
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch((error) => {
      send(res, 500, JSON.stringify({ ok: false, message: error.message }));
    });
    return;
  }
  handleStatic(req, res);
});

server.listen(port, () => {
  console.log(`佛学文化资料阅览网站已启动: http://localhost:${port}`);
  console.log(`后台管理员账号: ${adminUser}`);
});
