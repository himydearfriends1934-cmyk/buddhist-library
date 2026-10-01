const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const publicDir = path.join(root, "public");
const dataFile = path.join(root, "data", "site-data.json");
const uploadDir = path.join(publicDir, "uploads");
const port = Number(process.env.PORT || 4173);
const adminUser = process.env.ADMIN_USER || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;if (!adminPassword) throw new Error("Set ADMIN_PASSWORD before starting the server.");
const sessions = new Set();

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
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar"
};

function send(res, status, body, type = "application/json; charset=utf-8", headers = {}) {
  res.writeHead(status, { "Content-Type": type, ...headers });
  res.end(body);
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

function readData() {
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
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
  return sessions.has(getSession(req));
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
  const base = path.basename(name || "file", path.extname(name || "")).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${base || "file"}${ext || ".bin"}`;
}

function handleStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(publicDir, requestPath));
  if (!filePath.startsWith(publicDir)) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");

  fs.readFile(filePath, (error, content) => {
    if (error) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    send(res, 200, content, mimeTypes[path.extname(filePath)] || "application/octet-stream");
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/data") {
    return send(res, 200, JSON.stringify(readData()));
  }

  if (req.method === "POST" && url.pathname === "/api/messages") {
    const body = await readJsonBody(req);
    const content = String(body.content || "").trim();
    if (!content) return send(res, 400, JSON.stringify({ ok: false, message: "请填写留言内容" }));
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
    const body = await readJsonBody(req);
    if (body.username === adminUser && body.password === adminPassword) {
      const session = crypto.randomBytes(24).toString("hex");
      sessions.add(session);
      return send(res, 200, JSON.stringify({ ok: true }), undefined, {
        "Set-Cookie": `session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
      });
    }
    return send(res, 401, JSON.stringify({ ok: false, message: "账号或密码错误" }));
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    sessions.delete(getSession(req));
    return send(res, 200, JSON.stringify({ ok: true }), undefined, {
      "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
  }

  if (!isAuthed(req)) return send(res, 401, JSON.stringify({ ok: false, message: "请先登录后台" }));

  if (req.method === "GET" && url.pathname === "/api/admin/data") {
    return send(res, 200, JSON.stringify(readData()));
  }

  if (req.method === "PUT" && url.pathname === "/api/admin/data") {
    const body = await readJsonBody(req);
    const current = readData();
    const next = {
      settings: {
        title: String(body.settings?.title || current.settings.title),
        subtitle: String(body.settings?.subtitle || current.settings.subtitle),
        notice: String(body.settings?.notice || current.settings.notice)
      },
      important: Array.isArray(body.important) ? body.important.map(cleanItem).filter((item) => item.title) : current.important,
      smallMantras: Array.isArray(body.smallMantras) ? body.smallMantras.map(cleanItem).filter((item) => item.title).slice(0, 5) : current.smallMantras,
      scriptures: Array.isArray(body.scriptures) ? body.scriptures.map(cleanItem).filter((item) => item.title) : current.scriptures,
      downloads: Array.isArray(body.downloads) ? body.downloads.map(cleanItem).filter((item) => item.title) : current.downloads
    };
    next.messages = Array.isArray(body.messages) ? body.messages.map(cleanMessage).filter((item) => item.content) : (current.messages || []);
    writeData(next);
    return send(res, 200, JSON.stringify({ ok: true, data: next }));
  }

  if (req.method === "POST" && url.pathname === "/api/admin/upload") {
    const body = await readJsonBody(req, 512 * 1024 * 1024);
    const originalName = String(body.filename || "file.bin");
    const base64 = String(body.contentBase64 || "");
    if (!base64) return send(res, 400, JSON.stringify({ ok: false, message: "请选择要上传的文件" }));

    const fileName = safeUploadName(originalName);
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    return send(res, 200, JSON.stringify({
      ok: true,
      filename: fileName,
      url: `/uploads/${fileName}`
    }));
  }

  if (req.method === "POST" && url.pathname === "/api/admin/upload-raw") {
    const headerName = String(req.headers["x-filename"] || "file.bin");
    const originalName = decodeURIComponent(headerName);
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

  send(res, 404, JSON.stringify({ ok: false, message: "接口不存在" }));
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
  console.log("Admin credentials are supplied via environment variables.");
});
