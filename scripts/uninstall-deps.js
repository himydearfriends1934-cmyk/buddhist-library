/**
 * 佛学文化资料阅览网站 - 依赖卸载与说明脚本
 * 跨平台兼容 (Windows / macOS / Linux)
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

console.log("=================================================");
console.log("   佛学文化资料阅览网站 - 依赖架构说明与清理");
console.log("=================================================\n");

console.log("【项目依赖详细说明】");
console.log("-------------------------------------------------");
console.log("1. 服务端后端 (Backend):");
console.log("   • 外部 npm 依赖数: 0 个 (Zero Dependencies)");
console.log("   • 运行时库: 完全依赖 Node.js 官方核心内置库:");
console.log("     - http   : 负责提供 Web 服务与 RESTful API 路由");
console.log("     - fs     : 负责文件读写、分片流传输与原子持久化");
console.log("     - path   : 负责跨平台文件与目录路径规范化");
console.log("     - crypto : 负责密码恒定时间安全比对、随机 UUID 与 Session 令牌");
console.log("");
console.log("2. 浏览器前端 (Frontend):");
console.log("   • 核心交互: 原生现代 JavaScript (ES6+) + CSS3");
console.log("   • 第三方静态库: Mozilla PDF.js (v4 本地离线版本)");
console.log("     - 存放位置: public/vendor/pdfjs/");
console.log("     - 组成文件: pdf.min.js、pdf.worker.min.js、标准字体库及 cmaps");
console.log("     - 作用: 在浏览器端纯前端安全离线解析并渲染高清经书 PDF");
console.log("");
console.log("3. 开发与缓存依赖 (Dev & Cache):");
console.log("   • node_modules/ 目录 (若曾执行 npm install 生成的辅助依赖)");
console.log("   • package-lock.json (锁定文件)");
console.log("-------------------------------------------------\n");

// 执行清理 node_modules 和 package-lock.json
console.log("【开始清理外部与临时依赖...】");

const nodeModulesDir = path.join(root, "node_modules");
if (fs.existsSync(nodeModulesDir)) {
  try {
    fs.rmSync(nodeModulesDir, { recursive: true, force: true });
    console.log("✓ 已成功删除外部依赖目录: node_modules/");
  } catch (err) {
    console.error("✗ 删除 node_modules 失败:", err.message);
  }
} else {
  console.log("✓ 未发现 node_modules/ 目录，无残留 npm 依赖。");
}

const lockFile = path.join(root, "package-lock.json");
if (fs.existsSync(lockFile)) {
  try {
    fs.unlinkSync(lockFile);
    console.log("✓ 已清理锁定文件: package-lock.json");
  } catch (err) {
    console.error("✗ 删除 package-lock.json 失败:", err.message);
  }
}

console.log("\n-------------------------------------------------");
console.log("ℹ️ 说明：前端内置的 public/vendor/pdfjs 属于离线经书阅读的核心静态资源，");
console.log("   不会占用任何 npm 或系统后台资源，已予以安全保留以确保离线阅读器正常可用。");
console.log("✓ 依赖清理完成，项目保持最精简的纯原生零依赖状态！");
console.log("=================================================\n");
