# 佛学文化资料阅览网站

经典经文、电子书籍与佛学文化学习资料的浏览与管理站点。

## 本地启动

需要 Node.js。先配置后台账号密码，再启动：

```bash
export ADMIN_USER=admin
export ADMIN_PASSWORD='replace-with-a-strong-unique-password'
npm start
```

Windows PowerShell：

```powershell
$env:ADMIN_USER = "admin"
$env:ADMIN_PASSWORD = "replace-with-a-strong-unique-password"
npm start
```

打开 `http://localhost:4173/`。管理页位于 `/admin.html`。

`ADMIN_PASSWORD` 为必填项；服务不会使用内置默认密码，也不会把凭据写入启动日志。生产部署请使用 HTTPS，并通过服务管理器的环境配置或安全的 `.env` 文件提供凭据。

## 首次运行数据

运行时数据和上传资料不包含在公开仓库中。首次启动前创建数据目录并复制示例：

```bash
mkdir -p data public/uploads
cp data/site-data.example.json data/site-data.json
```

再通过管理页上传需要展示的 PDF、ZIP 等资料。真实的 `data/site-data.json`、上传文件、留言和 `.env` 都由 `.gitignore` 排除。

## 功能

- 首页展示重点经咒、小咒、常用经书和下载区
- 经书列表和在线阅读器
- 管理端维护网站资料并上传文件
- PDF.js 本地静态资源用于浏览器内阅读

第三方 PDF.js 资源附带其原有许可证文件。
