const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec, spawn } = require("child_process");

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
// 拒绝示例占位口令：安装脚本复制 .env.example 时若未替换，任何人都能猜中
const PLACEHOLDER_PASSWORDS = new Set([
  "replace-with-a-strong-unique-password",
  "your-secure-password",
  "change-to-your-secure-password"
]);
if (PLACEHOLDER_PASSWORDS.has(adminPassword)) {
  throw new Error("ADMIN_PASSWORD 仍为示例占位密码（任何人可从公开的 .env.example 猜到），请在 .env 中改为您自己的强密码后再启动。");
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
  ".mp4": "video/mp4",
  ".webmanifest": "application/manifest+json; charset=utf-8"
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
  // 仅当明确运行在可信反向代理之后（TRUST_PROXY=1）时才信任 X-Forwarded-For，
  // 否则攻击者可随意伪造该请求头绕过登录锁定与留言限流
  if (process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true") {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return String(req.socket.remoteAddress || "");
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
    hidden: Boolean(message.hidden),
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
  let requestPath;
  try {
    requestPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  } catch (err) {
    // 畸形百分号编码（如 /%E0%A4%A）会让 decodeURIComponent 抛 URIError，
    // 未捕获将导致整个进程退出，单请求即可打崩全站
    return send(res, 400, "Bad Request", "text/plain; charset=utf-8");
  }
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
    const data = readData();
    const publicData = {
      ...data,
      messages: (data.messages || []).filter((item) => !item.hidden)
    };
    return send(res, 200, JSON.stringify(publicData));
  }

  // 当前版本（公开，供更新后前端轮询确认服务已带新版本恢复）
  if (req.method === "GET" && url.pathname === "/api/version") {
    const head = await runGitCommand('git log -1 --format="%h%x09%ci%x09%s"');
    if (!head.ok) {
      return send(res, 200, JSON.stringify({ ok: true, isGit: false, hash: "", subject: "" }));
    }
    const [hash, date, subject] = (head.stdout || "").split("\t");
    return send(res, 200, JSON.stringify({ ok: true, isGit: true, hash, date, subject }));
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
    // 登录暴力破解防护：10 分钟窗口内失败 5 次锁定 5 分钟；
    // 锁定截止时间在触发时固定，后续失败不得顺延，避免攻击者持续刷新
    // 锁定让真正的管理员永远无法登录（对管理员的拒绝服务）
    const now = Date.now();
    let failureRecord = loginFailures.get(clientIp);
    if (failureRecord && failureRecord.lockedUntil) {
      if (now < failureRecord.lockedUntil) {
        const waitMin = Math.ceil((failureRecord.lockedUntil - now) / 60000);
        return send(res, 429, JSON.stringify({ ok: false, message: `登录尝试次数过多，请 ${waitMin} 分钟后再试` }));
      }
      loginFailures.delete(clientIp); // 锁定期已过，重新计数
      failureRecord = undefined;
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

    if (!failureRecord || now >= failureRecord.windowEnd) {
      failureRecord = { count: 0, windowEnd: now + 10 * 60 * 1000, lockedUntil: 0 };
    }
    failureRecord.count += 1;
    if (failureRecord.count >= 5 && !failureRecord.lockedUntil) {
      failureRecord.lockedUntil = now + 5 * 60 * 1000; // 触发即固定，不再顺延
    }
    loginFailures.set(clientIp, failureRecord);

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

  // 导出数据备份 (JSON)
  if (req.method === "GET" && url.pathname === "/api/admin/export-data") {
    const dataStr = JSON.stringify(readData(), null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    return send(res, 200, dataStr, "application/json; charset=utf-8", {
      "Content-Disposition": `attachment; filename="buddhist-library-backup-${dateStr}.json"`
    });
  }

  // 导入数据备份 (JSON)
  if (req.method === "POST" && url.pathname === "/api/admin/import-data") {
    const body = await readJsonBody(req, 20 * 1024 * 1024);
    if (!body || typeof body !== "object" || !body.settings) {
      return send(res, 400, JSON.stringify({ ok: false, message: "备份数据无效，缺少必要的 settings 结构" }));
    }

    // 自动对现有数据建立快照备份
    if (fs.existsSync(dataFile)) {
      const snapFile = `${dataFile}.bak.${Date.now()}`;
      try { fs.copyFileSync(dataFile, snapFile); } catch (e) {}
    }

    const current = readData();
    const next = {
      settings: {
        title: String(body.settings?.title ?? current.settings?.title ?? "佛学文化资料阅览"),
        subtitle: String(body.settings?.subtitle ?? current.settings?.subtitle ?? ""),
        notice: String(body.settings?.notice ?? current.settings?.notice ?? "")
      },
      important: Array.isArray(body.important) ? body.important.map(cleanItem).filter((i) => i.title) : (current.important || []),
      smallMantras: Array.isArray(body.smallMantras) ? body.smallMantras.map(cleanItem).filter((i) => i.title).slice(0, 5) : (current.smallMantras || []),
      scriptures: Array.isArray(body.scriptures) ? body.scriptures.map(cleanItem).filter((i) => i.title) : (current.scriptures || []),
      downloads: Array.isArray(body.downloads) ? body.downloads.map(cleanItem).filter((i) => i.title) : (current.downloads || []),
      messages: Array.isArray(body.messages) ? body.messages.map(cleanMessage).filter((i) => i.content) : (current.messages || [])
    };

    writeData(next);
    return send(res, 200, JSON.stringify({ ok: true, message: "数据还原成功！", data: next }));
  }

  // 检查版本更新接口：返回当前/最新版本结构化信息与逐条变更清单
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
    const current = { hash: currentHash, date: commitDate, subject: commitSubject };

    const fetchResult = await runGitCommand("git fetch origin main");
    if (!fetchResult.ok) {
      return send(res, 200, JSON.stringify({
        ok: true,
        isGit: true,
        hasUpdate: false,
        current,
        warning: "远程分支连接受限，暂无法比对远端版本",
        message: `当前版本：${currentHash} (${commitSubject || "最新"})`
      }));
    }

    const remoteHead = await runGitCommand('git log -1 origin/main --format="%h%x09%ci%x09%s"');
    const [latestHash, latestDate, latestSubject] = (remoteHead.stdout || "").split("\t");
    const latest = { hash: latestHash, date: latestDate, subject: latestSubject };

    // 逐条变更清单（哈希 + 时间 + 说明），前端据此让管理员明确知道升级内容
    const logResult = await runGitCommand('git log HEAD..origin/main --format="%h%x09%ci%x09%s"');
    const updates = (logResult.stdout || "")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, date, subject] = line.split("\t");
        return { hash, date, subject };
      });
    const hasUpdate = updates.length > 0;

    // 变更文件与是否触及后端（决定更新后是否需要重启服务才生效）
    let changedFiles = [];
    let includesBackend = false;
    if (hasUpdate) {
      const diffResult = await runGitCommand("git diff --name-only HEAD..origin/main");
      changedFiles = (diffResult.stdout || "").split("\n").filter(Boolean);
      includesBackend = changedFiles.some(
        (f) => f === "server.js" || f === "package.json" || f.startsWith("scripts/")
      );
    }

    // 工作区是否有未提交修改（可能与更新冲突，提前提示）
    const statusResult = await runGitCommand("git status --porcelain");
    const dirty = Boolean((statusResult.stdout || "").trim());

    return send(res, 200, JSON.stringify({
      ok: true,
      isGit: true,
      hasUpdate,
      current,
      latest,
      updates,
      changedFiles,
      includesBackend,
      dirty,
      message: hasUpdate ? `检测到 ${updates.length} 个新提交` : "当前已是最新版本"
    }));
  }

  // 执行在线一键更新接口 (git pull origin main)，代码有变化时自动重启使后端生效
  if (req.method === "POST" && url.pathname === "/api/admin/update") {
    const beforeHead = await runGitCommand('git log -1 --format="%h%x09%ci%x09%s"');
    const [beforeHash] = (beforeHead.stdout || "").split("\t");

    const pullResult = await runGitCommand("git pull origin main");
    if (!pullResult.ok) {
      return send(res, 500, JSON.stringify({
        ok: false,
        message: `更新失败: ${pullResult.stderr || pullResult.error || "合并冲突或网络超时"}`
      }));
    }

    const newHeadResult = await runGitCommand('git log -1 --format="%h%x09%ci%x09%s"');
    const [newHash, newDate, newSubject] = (newHeadResult.stdout || "").split("\t");

    // 本次实际应用的提交清单（供更新完成弹窗回显）
    let applied = [];
    if (beforeHash && newHash && beforeHash !== newHash) {
      const appliedLog = await runGitCommand(
        `git log ${beforeHash}..${newHash} --format="%h%x09%ci%x09%s"`);
      applied = (appliedLog.stdout || "")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, date, subject] = line.split("\t");
          return { hash, date, subject };
        });
    }

    const changed = Boolean(beforeHash && newHash && beforeHash !== newHash);

    send(res, 200, JSON.stringify({
      ok: true,
      message: changed ? "项目代码已成功更新至最新版本！" : "已是最新版本，无代码变化",
      details: pullResult.stdout,
      current: { hash: newHash, date: newDate, subject: newSubject },
      applied,
      restarting: changed
    }));

    // 代码变了才重启：先让响应送达，再拉起新进程接管（会话为内存态，重启后需重新登录）
    if (changed) {
      setTimeout(restartSelf, 700);
    }
    return;
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

// 在线更新后的自重启：拉起一个脱离父进程的“重启器”，稍候启动新版 server.js，
// 然后本进程退出让出端口。新进程带 BUDDHIST_AUTO_RESTART 标记，遇端口未释放会重试监听。
function restartSelf() {
  try {
    const restarterScript = `
      setTimeout(() => {
        const { spawn } = require("child_process");
        const child = spawn(process.execPath, ["server.js"], {
          cwd: ${JSON.stringify(root)},
          detached: true,
          stdio: "ignore",
          env: { ...process.env, BUDDHIST_AUTO_RESTART: "1" }
        });
        child.unref();
      }, 1200);
    `;
    const restarter = spawn(process.execPath, ["-e", restarterScript], {
      cwd: root,
      detached: true,
      stdio: "ignore"
    });
    restarter.unref();
    console.log("在线更新完成，服务即将自动重启以使新版生效...");
  } catch (err) {
    console.error("自动重启失败，请手动重启服务:", err);
  }
  setTimeout(() => process.exit(0), 200);
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

// 自重启的新进程：旧进程可能尚未完全释放端口，短时重试监听直至接管成功
let listenRetries = 0;
server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE" && process.env.BUDDHIST_AUTO_RESTART === "1" && listenRetries < 15) {
    listenRetries += 1;
    setTimeout(() => server.listen(port), 1000);
    return;
  }
  throw err;
});
