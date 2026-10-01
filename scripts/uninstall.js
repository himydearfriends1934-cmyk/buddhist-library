/**
 * 佛学文化资料阅览网站 - 一键卸载脚本
 * 跨平台兼容 (Windows / macOS / Linux)
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const root = path.resolve(__dirname, "..");

console.log("=================================================");
console.log("   佛学文化资料阅览网站 - 一键卸载向导");
console.log("=================================================\n");

const args = process.argv.slice(2);
const isForce = args.includes("--force") || args.includes("-f");
const purgeAll = args.includes("--all");

function cleanFiles(removeAllData = false) {
  console.log("\n正在执行卸载清理...");

  // 1. 清理依赖与锁文件
  const nodeModulesDir = path.join(root, "node_modules");
  const lockFile = path.join(root, "package-lock.json");
  if (fs.existsSync(nodeModulesDir)) {
    fs.rmSync(nodeModulesDir, { recursive: true, force: true });
    console.log("✓ 清理 node_modules/");
  }
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
    console.log("✓ 清理 package-lock.json");
  }

  // 2. 清理临时缓存文件与日志
  const tmpFiles = [
    path.join(root, ".env.tmp"),
    path.join(root, "data", ".site-data.json.tmp")
  ];
  tmpFiles.forEach((file) => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`✓ 清理临时文件: ${path.basename(file)}`);
    }
  });

  // 清理 data 目录下的 *.tmp*
  const dataDir = path.join(root, "data");
  if (fs.existsSync(dataDir)) {
    fs.readdirSync(dataDir).forEach((item) => {
      if (item.includes(".tmp")) {
        fs.unlinkSync(path.join(dataDir, item));
        console.log(`✓ 清理临时缓存: data/${item}`);
      }
    });
  }

  // 3. 彻底卸载时，清理上传资料和个人配置
  if (removeAllData) {
    const uploadDir = path.join(root, "public", "uploads");
    const dataFile = path.join(root, "data", "site-data.json");
    const envFile = path.join(root, ".env");

    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
      console.log("✓ 清理所有已上传资料目录: public/uploads/");
    }
    if (fs.existsSync(dataFile)) {
      fs.unlinkSync(dataFile);
      console.log("✓ 清理网站数据配置: data/site-data.json");
    }
    if (fs.existsSync(envFile)) {
      fs.unlinkSync(envFile);
      console.log("✓ 清理环境变量密码配置: .env");
    }
    console.log("\n✓ 彻底卸载清理完成（已清除所有运行数据与资料）。");
  } else {
    console.log("\n✓ 卸载清理完成！");
    console.log("ℹ️ 已为您保留以下珍贵个人资料与配置文件：");
    console.log("   - public/uploads/ (已上传的 PDF 经书与资料包)");
    console.log("   - data/site-data.json (您编辑的经书列表与留言)");
    console.log("   - .env (密码与端口配置)");
    console.log("   （若日后需要重新启动，直接运行 install 脚本即可恢复）");
  }

  console.log("=================================================\n");
}

if (isForce) {
  cleanFiles(purgeAll);
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("请选择卸载模式：");
console.log("  [1] 标准卸载：清理运行时依赖与临时缓存（推荐，保留已上传经书与 .env 配置）");
console.log("  [2] 完全卸载：清除全部数据、已上传经书文件和账号密码配置");
console.log("  [q] 取消退出");

rl.question("\n请输入选项 [1/2/q] (默认 1): ", (answer) => {
  const choice = (answer || "1").trim().toLowerCase();
  rl.close();

  if (choice === "q") {
    console.log("已取消卸载。");
    process.exit(0);
  } else if (choice === "2") {
    cleanFiles(true);
  } else {
    cleanFiles(false);
  }
});
