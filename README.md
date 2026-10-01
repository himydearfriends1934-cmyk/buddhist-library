# 佛学文化资料阅览网站

经典经文、电子书籍与佛学文化学习资料的浏览与管理站点。

服务端采用 **Node.js 原生核心模块（零外部 npm 生产依赖）** 驱动，前端内嵌 **Mozilla PDF.js** 离线阅读器，轻量、安全、开箱即用。

---

## 快速导航与脚本命令

| 功能 | Windows (双击或终端) | Linux / macOS (终端) | npm 命令 |
| :--- | :--- | :--- | :--- |
| **一键安装 / 更新** | 双击 `install.bat` | `chmod +x *.sh && ./install.sh` | `npm run install:app` |
| **一键卸载** | 双击 `uninstall.bat` | `./uninstall.sh` | `npm run uninstall:app` |
| **卸载/清理依赖** | 双击 `uninstall-deps.bat` | `./uninstall-deps.sh` | `npm run uninstall:deps` |
| **启动服务** | `npm start` | `npm start` | `node server.js` |

---

## 1. 一键安装 / 更新

无需手动创建文件夹或查找繁琐的复制命令，直接运行安装向导即可：

* **Windows 用户**：直接双击项目根目录下的 **`install.bat`**；
* **Linux / macOS 用户**：在终端运行 **`./install.sh`**；
* **npm 方式**：运行 **`npm run install:app`**。

### 脚本自动执行的操作：
1. **环境检测**：检查 Node.js 运行环境与版本兼容性。
2. **依赖管理（零依赖架构）**：
   * 本项目服务端原生零外部 npm 依赖，开箱即跑；
   * 若 `package.json` 未来声明了扩展包，脚本会自动运行 `npm install` 安装/更新依赖。
3. **版本更新**：若当前目录为 Git 仓库，自动执行 `git pull origin main` 同步云端最新版本代码。
4. **自动初始化配置**：
   * 自动创建 `public/uploads/` 上传资料目录；
   * 自动从 `.env.example` 生成 `.env` 配置文件（如不存在）；
   * 自动从 `data/site-data.example.json` 复制生成初始经书数据。

---

## 2. 一键卸载

提供安全、防误删的卸载向导：

* **Windows 用户**：直接双击根目录下的 **`uninstall.bat`**；
* **Linux / macOS 用户**：在终端运行 **`./uninstall.sh`**；
* **npm 方式**：运行 **`npm run uninstall:app`**。

### 卸载模式选项：
* **[1] 标准卸载（默认推荐）**：清理运行时依赖缓存、锁文件与临时数据，**保留您已上传的 PDF 经书（`public/uploads/`）、数据配置文件（`data/site-data.json`）与密码配置（`.env`）**，以便随时重新安装恢复。
* **[2] 完全卸载**：清除全部运行数据、已上传经书资料以及所有配置信息。

---

## 3. 卸载依赖与项目依赖架构标明

若需要清理外部包或了解本项目的依赖构成，可运行依赖卸载脚本：

* **Windows 用户**：双击 **`uninstall-deps.bat`**；
* **Linux / macOS 用户**：运行 **`./uninstall-deps.sh`**；
* **npm 方式**：运行 **`npm run uninstall:deps`**。

### 本项目依赖构成标明：
1. **服务端后端 (Backend)**：
   * **外部 npm 依赖数：0 个**（零依赖纯原生架构，无供应链安全风险）。
   * 运行时完全基于 Node.js 官方核心模块：
     * `http`：HTTP Web 服务器与 RESTful API 路由处理；
     * `fs`：文件读写、HTTP 206 字节分片流传输、原子写入；
     * `path`：跨平台路径规范化与安全校验；
     * `crypto`：恒定时间安全密码比对、哈希生成与 Session 管理。
2. **浏览器前端 (Frontend)**：
   * 界面与交互：原生 ES6+ JavaScript + 响应式 CSS3；
   * **第三方静态库：Mozilla PDF.js**（本地离线版本，位于 `public/vendor/pdfjs/`）：
     * 包含 `pdf.min.js`、`pdf.worker.min.js`、WASM 解码器、字体与 CMap 资源；
     * 作用：在浏览器端完全离线安全渲染经书 PDF，支持分页、缩放与自适应排版。
3. **依赖卸载动作**：
   * 脚本会自动清理残留的 `node_modules/` 目录与 `package-lock.json`，确保项目保持最精简纯净的零依赖运行状态；
   * 安全保留前端离线必须的 `public/vendor/pdfjs` 静态库文件，保证脱网环境下经书阅读器正常可用。

---

## 4. 后台页面在线更新

除了使用终端脚本，管理员也可以直接在**管理后台界面一键更新系统**：

1. 浏览器打开后台管理页：`http://localhost:4173/admin.html` 并登录；
2. 点击顶部操作栏的 **【检查更新】** 按钮；
3. 系统将自动检测 Git 远端仓库：
   * 若有新版本发布，会弹出更新卡片并列出新提交内容；
   * 点击 **【立即更新】**，服务器将自动在后台拉取最新代码并热重载，更新完成后页面自动刷新生效。

---

## 5. 手动配置与启动

如需手动配置与启动：

1. 在项目根目录创建或编辑 `.env` 文件：
   ```env
   ADMIN_USER=admin
   ADMIN_PASSWORD=your-secure-password
   PORT=4173
   ```
2. 启动服务：
   ```bash
   npm start
   ```
3. 打开浏览器访问：
   * 前台首页：`http://localhost:4173/`
   * 常用经书：`http://localhost:4173/scriptures.html`
   * 后台管理：`http://localhost:4173/admin.html`
   * 资料库编辑：`http://localhost:4173/library-admin.html`

---

## 6. 功能特性

- **首页重点展示**：重点经咒、常用小咒、常用经书速览与常用下载包。
- **经书离线阅读器**：基于 PDF.js 深度定制的翻页阅读器，支持适屏阅读、翻页动画与 HTTP 206 分片流式加载。
- **动态列自适应**：经书列表动态自适应排版，支持海量经书完整展示不截断。
- **安全加固**：
  * 全流程 XSS 防护与非法伪协议 URL 净化过滤；
  * 文件上传白名单限制（仅允许 PDF、EPUB、音视频及压缩包，拦截脚本与危险文件）；
  * 密码恒定时间比较（防时序侧信道攻击）与连续登录失败自动锁定频控；
  * 留言接口防刷保护（429 限流）；
  * 数据文件写入采用临时文件原子替换（Atomic Write），杜绝并发写入损坏。
