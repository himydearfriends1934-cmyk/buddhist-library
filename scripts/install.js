/**
 * 佛学文化资料阅览网站 - 一键安装/更新脚本
 * 跨平台兼容 (Windows / macOS / Linux)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");

console.log("=================================================");
console.log("   佛学文化资料阅览网站 - 一键安装与更新向导");
console.log("=================================================\n");

// 1. 检查 Node.js 版本
const nodeVersion = process.versions.node;
console.log(`[1/5] 检查运行环境... Node.js ${nodeVersion}`);
const major = parseInt(nodeVersion.split(".")[0], 10);
if (major < 16) {
  console.warn("⚠️ 建议使用 Node.js v16 或更高版本以获得最佳体验与性能。");
} else {
  console.log("✓ Node.js 运行环境正常。");
}

// 2. 检查依赖状态与自动安装/更新依赖
console.log("\n[2/5] 依赖管理检测 (Dependency Management)...");
console.log("-------------------------------------------------");
console.log("• 本项目服务端采用 Node.js 原生内置模块 (http, fs, path, crypto)");
console.log("• 架构定位：生产环境【零第三方 npm 外部依赖】(Zero-dependencies)");
console.log("• 前端阅读器内嵌第三方库：PDF.js (本地静态位于 public/vendor/pdfjs)");
console.log("-------------------------------------------------");

const pkgPath = path.join(root, "package.json");
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const depsCount = Object.keys(pkg.dependencies || {}).length;
    if (depsCount > 0) {
      console.log(`检测到 package.json 声明了 ${depsCount} 个依赖项，正在自动执行 npm install...`);
      execSync("npm install", { cwd: root, stdio: "inherit" });
      console.log("✓ 依赖安装/更新完成。");
    } else {
      console.log("✓ 当前项目为零外部 npm 依赖，无需网络下载，启动速度极致轻快。");
    }
  } catch (err) {
    console.warn("读取 package.json 失败:", err.message);
  }
}

// 3. Git 仓库代码检查与一键更新
console.log("\n[3/5] 检测 Git 版本与代码更新...");
const gitDir = path.join(root, ".git");
if (fs.existsSync(gitDir)) {
  try {
    console.log("正在从 Git 远程仓库检查并拉取最新更新 (git pull)...");
    const pullOut = execSync("git pull origin main", { cwd: root, encoding: "utf8", timeout: 30000 });
    console.log(pullOut.trim());
    console.log("✓ 代码已同步至最新版本。");
  } catch (err) {
    console.log("ℹ️ 提示: 离线模式或无网络，保留本地当前版本继续运行。");
  }
} else {
  console.log("ℹ️ 未检测到 .git 目录，以独立文件夹包模式运行。");
}

// 4. 数据目录与配置文件初始化
console.log("\n[4/5] 初始化必要数据目录与配置...");
const uploadDir = path.join(root, "public", "uploads");
const dataDir = path.join(root, "data");
const envFile = path.join(root, ".env");
const envExample = path.join(root, ".env.example");
const dataFile = path.join(root, "data", "site-data.json");
const dataExample = path.join(root, "data", "site-data.example.json");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("✓ 创建上传目录: public/uploads");
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 初始化 .env 配置文件：管理员口令自动生成随机强口令，绝不沿用示例占位值
if (!fs.existsSync(envFile)) {
  const crypto = require("crypto");
  const generatedPassword = crypto.randomBytes(18).toString("base64").replace(/[+/=]/g, "").slice(0, 24);
  if (fs.existsSync(envExample)) {
    const example = fs.readFileSync(envExample, "utf8");
    const replaced = example.replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${generatedPassword}`);
    fs.writeFileSync(envFile, replaced.includes("ADMIN_PASSWORD=")
      ? replaced
      : `${replaced.trimEnd()}\nADMIN_PASSWORD=${generatedPassword}\n`, "utf8");
    console.log("✓ 已从 .env.example 生成初始配置文件 .env（口令已随机生成）");
  } else {
    fs.writeFileSync(envFile, `ADMIN_USER=admin\nADMIN_PASSWORD=${generatedPassword}\nPORT=4173\n`, "utf8");
    console.log("✓ 生成默认 .env 配置文件（口令已随机生成）");
  }
  console.log("=================================================");
  console.log(`🔑 您的管理员口令（已写入 .env，请妥善保存）: ${generatedPassword}`);
  console.log("   登录后台后如需修改，请直接编辑 .env 中的 ADMIN_PASSWORD 并重启服务。");
  console.log("=================================================");
} else {
  console.log("✓ 配置文件 .env 已存在，保留现有配置。");
}

// 初始化 site-data.json
if (!fs.existsSync(dataFile)) {
  if (fs.existsSync(dataExample)) {
    fs.copyFileSync(dataExample, dataFile);
    console.log("✓ 已初始化数据文件: data/site-data.json (来源于示例数据)");
  }
} else {
  console.log("✓ 数据文件 data/site-data.json 已就绪。");
}

// 5. 完成提示
console.log("\n[5/5] 安装/更新完成！");
console.log("=================================================");
console.log("启动服务方式：");
console.log("  npm start   或者   node server.js");
console.log("\n默认访问入口：");
console.log("  前台首页：  http://localhost:4173/");
console.log("  后台管理：  http://localhost:4173/admin.html");
console.log("=================================================\n");
