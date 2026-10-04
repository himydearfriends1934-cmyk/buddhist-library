const sectionLabels = {
  important: ["重点经咒", "首页顶部重点卡片内容。"],
  smallMantras: ["小咒", "首页小咒固定展示 5 个，可编辑它们的名称和资料。"],
  scriptures: ["常用经书", "这里作为文件库；其他栏目可以直接选择这里的文件。"],
  downloads: ["常用下载区", "首页下载区和第二页右侧下载包列表。"],
  messages: ["留言管理", "查看留言并填写回复。"]
};

let state = null;
let activeSection = "important";

const $ = (selector) => document.querySelector(selector);

function makeId(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "请求失败");
  return data;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function blankItem() {
  return {
    id: makeId("item"),
    title: "",
    subtitle: "",
    type: "PDF",
    size: "",
    pages: "",
    icon: activeSection === "downloads" ? "pdf" : "book",
    readUrl: "#",
    downloadUrl: "#"
  };
}

function fileSizeText(bytes) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fileTitle(name) {
  return String(name || "新资料");
}

function fileType(name) {
  const ext = String(name || "").split(".").pop();
  return ext ? ext.toUpperCase() : "FILE";
}

function field(key, value) {
  return `<input data-key="${key}" value="${escapeHtml(value)}">`;
}

function scriptureOptions(selectedId) {
  const options = [`<option value="">请选择文件</option>`];
  state.scriptures.forEach((item) => {
    options.push(`<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.title)}</option>`);
  });
  return options.join("");
}

function findBoundScripture(item) {
  return state.scriptures.find((scripture) => {
    if (item.fileId && scripture.id === item.fileId) return true;
    if (item.readUrl && item.readUrl !== "#" && scripture.readUrl === item.readUrl) return true;
    if (item.downloadUrl && item.downloadUrl !== "#" && scripture.downloadUrl === item.downloadUrl) return true;
    return false;
  });
}

function fileCell(item) {
  if (activeSection === "scriptures") {
    const label = item.readUrl && item.readUrl !== "#" ? "更换文件" : "上传文件";
    const current = item.readUrl && item.readUrl !== "#" ? `<span class="file-current">${escapeHtml(item.readUrl)}</span>` : `<span class="file-current muted">未上传</span>`;
    return `
      <div class="file-picker">
        <button data-upload="both">${label}</button>
        ${current}
      </div>
    `;
  }

  const bound = findBoundScripture(item);
  return `
    <select data-file-select>
      ${scriptureOptions(bound?.id || item.fileId || "")}
    </select>
  `;
}

function renderRows() {
  const isMessages = activeSection === "messages";
  document.querySelector(".editor-card").classList.toggle("hidden", isMessages);
  $("#messageEditor").classList.toggle("hidden", !isMessages);
  $("#addItemBtn").classList.toggle("hidden", isMessages);
  if (isMessages) {
    renderMessageRows();
    return;
  }

  const [title, hint] = sectionLabels[activeSection];
  $("#sectionTitle").textContent = title;
  $("#sectionHint").textContent = hint;
  $("#addItemBtn").disabled = activeSection === "smallMantras" && state.smallMantras.length >= 5;
  $("#addItemBtn").textContent = $("#addItemBtn").disabled ? "已满 5 个" : "新增资料";

  $("#itemRows").innerHTML = state[activeSection].map((item, index) => `
    <tr data-index="${index}">
      <td>${field("title", item.title)}</td>
      <td>${field("subtitle", item.subtitle)}</td>
      <td>${field("size", item.size)}</td>
      <td>${field("pages", item.pages)}</td>
      <td>${fileCell(item)}</td>
      <td>
        <div class="row-actions">
          <button data-action="up">上移</button>
          <button data-action="down">下移</button>
          <button class="danger" data-action="delete">删除</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderMessageRows() {
  const messages = Array.isArray(state.messages) ? state.messages : [];
  $("#messageRows").innerHTML = messages.map((message, index) => {
    const isHidden = Boolean(message.hidden);
    const statusText = isHidden ? "🙈 已隐藏" : "👁️ 公开中";
    const statusClass = isHidden ? "ghost" : "secondary";
    return `
      <tr data-message-index="${index}">
        <td>${escapeHtml(message.name || "善友")}</td>
        <td><div class="message-content">${escapeHtml(message.content || "")}</div></td>
        <td><textarea data-message-key="reply" placeholder="填写回复">${escapeHtml(message.reply || "")}</textarea></td>
        <td>
          <button class="${statusClass}" data-message-action="toggle-visibility" type="button" title="点击切换前台显示状态">${statusText}</button>
        </td>
        <td>${message.createdAt ? new Date(message.createdAt).toLocaleString("zh-CN") : ""}</td>
        <td>
          <div class="row-actions">
            <button class="danger" data-message-action="delete">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function pickAndUploadFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.epub,.zip,.rar,.7z,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp,.mp3,.mp4";
  return new Promise((resolve, reject) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        setUploadProgress(0, 1, `正在上传：${file.name}`);
        const result = await uploadRawFile(file, (loaded) => {
          setUploadByteProgress(loaded, file.size, `正在上传：${file.name}`, 0, 1);
        });
        setUploadProgress(1, 1, `已上传：${file.name}`);
        hideUploadProgressLater();
        resolve({ file, result });
      } catch (error) {
        $("#uploadProgress")?.classList.remove("hidden");
        if ($("#uploadProgressText")) $("#uploadProgressText").textContent = `上传失败：${error.message}`;
        reject(error);
      }
    });
    input.click();
  });
}

async function uploadFiles(files) {
  const uploaded = [];
  const total = files.length;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const loadedBytes = new Array(files.length).fill(0);
  setUploadProgress(0, total, "准备上传");
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    setUploadProgress(index, total, `正在上传：${file.name}`);
    const result = await uploadRawFile(file, (loaded) => {
      loadedBytes[index] = loaded;
      const doneBytes = loadedBytes.reduce((sum, value) => sum + value, 0);
      setUploadByteProgress(doneBytes, totalBytes, `正在上传：${file.name}`, index, total);
    });
    uploaded.push({ file, result });
    loadedBytes[index] = file.size;
    setUploadProgress(index + 1, total, `已上传：${file.name}`);
  }
  return uploaded;
}

function uploadRawFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/upload-raw");
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(result);
        } else {
          reject(new Error(result.message || `上传失败：${xhr.status}`));
        }
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("上传失败，请检查网络"));
    xhr.send(file);
  });
}

function setUploadProgress(done, total, label) {
  const progress = $("#uploadProgress");
  const text = $("#uploadProgressText");
  const bar = $("#uploadProgressBar");
  if (!progress || !text || !bar) return;
  progress.classList.remove("hidden");
  const percent = total ? Math.round((done / total) * 100) : 0;
  text.textContent = `${label}（${done}/${total}，${percent}%）`;
  bar.style.width = `${percent}%`;
}

function setUploadByteProgress(doneBytes, totalBytes, label, fileIndex, totalFiles) {
  const progress = $("#uploadProgress");
  const text = $("#uploadProgressText");
  const bar = $("#uploadProgressBar");
  if (!progress || !text || !bar) return;
  progress.classList.remove("hidden");
  const percent = totalBytes ? Math.min(100, Math.round((doneBytes / totalBytes) * 100)) : 0;
  text.textContent = `${label}（${fileIndex + 1}/${totalFiles}，${percent}%）`;
  bar.style.width = `${percent}%`;
}

function hideUploadProgressLater() {
  setTimeout(() => {
    $("#uploadProgress")?.classList.add("hidden");
    if ($("#uploadProgressBar")) $("#uploadProgressBar").style.width = "0";
  }, 2200);
}

async function deleteUploadFile(url) {
  if (!url || url === "#" || !url.startsWith("/uploads/")) return;
  await request("/api/admin/delete-upload", {
    method: "POST",
    body: JSON.stringify({ url })
  });
}

async function deleteItemFiles(item) {
  const urls = new Set([item.readUrl, item.downloadUrl].filter(Boolean));
  for (const url of urls) {
    await deleteUploadFile(url);
  }
}

function bindScriptureFile(item, scriptureId) {
  const scripture = state.scriptures.find((entry) => entry.id === scriptureId);
  item.fileId = scriptureId || "";
  if (!scripture) {
    item.readUrl = "#";
    item.downloadUrl = "#";
    return;
  }
  item.readUrl = scripture.readUrl || "#";
  item.downloadUrl = scripture.downloadUrl || scripture.readUrl || "#";
  item.type = scripture.type || item.type || "PDF";
  if (!item.size) item.size = scripture.size || "";
  if (!item.pages) item.pages = scripture.pages || "";
}

function syncSettingsFromState() {
  $("#settingTitle").value = state.settings.title;
  $("#settingSubtitle").value = state.settings.subtitle;
  $("#settingNotice").value = state.settings.notice;
}

function syncStateFromForm() {
  state.settings.title = $("#settingTitle").value;
  state.settings.subtitle = $("#settingSubtitle").value;
  state.settings.notice = $("#settingNotice").value;

  if (activeSection === "messages") {
    document.querySelectorAll("#messageRows tr").forEach((tr) => {
      const item = state.messages[Number(tr.dataset.messageIndex)];
      tr.querySelectorAll("[data-message-key]").forEach((input) => {
        item[input.dataset.messageKey] = input.value;
      });
    });
    return;
  }

  document.querySelectorAll("#itemRows tr").forEach((tr) => {
    const item = state[activeSection][Number(tr.dataset.index)];
    tr.querySelectorAll("[data-key]").forEach((input) => {
      item[input.dataset.key] = input.value;
    });
    const selector = tr.querySelector("[data-file-select]");
    if (selector) bindScriptureFile(item, selector.value);
  });
}

async function loadAdminData() {
  state = await request("/api/admin/data");
  syncSettingsFromState();
  renderRows();
}

async function saveAllData() {
  syncStateFromForm();
  await persistData();
}

async function persistData() {
  await request("/api/admin/data", {
    method: "PUT",
    body: JSON.stringify(state)
  });
}

$("#loginBtn").addEventListener("click", async () => {
  $("#loginMessage").textContent = "";
  try {
    await request("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#username").value,
        password: $("#password").value
      })
    });
    $("#loginBox").classList.add("hidden");
    $("#dashboard").classList.remove("hidden");
    await loadAdminData();
  } catch (error) {
    $("#loginMessage").textContent = error.message;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await request("/api/logout", { method: "POST", body: "{}" });
  location.reload();
});

$("#tabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-section]");
  if (!button) return;
  syncStateFromForm();
  activeSection = button.dataset.section;
  document.querySelectorAll("#tabs button").forEach((item) => item.classList.toggle("active", item === button));
  renderRows();
});

$("#itemRows").addEventListener("input", syncStateFromForm);
$("#itemRows").addEventListener("change", syncStateFromForm);

$("#messageRows").addEventListener("input", syncStateFromForm);

$("#messageRows").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-message-action]");
  if (!button) return;
  syncStateFromForm();
  const index = Number(button.closest("tr").dataset.messageIndex);
  if (button.dataset.messageAction === "delete") {
    state.messages.splice(index, 1);
    renderMessageRows();
    await persistData();
    showToast("留言已删除");
  }
  if (button.dataset.messageAction === "toggle-visibility") {
    state.messages[index].hidden = !state.messages[index].hidden;
    renderMessageRows();
    await persistData();
    showToast(state.messages[index].hidden ? "已隐藏此留言（前台不展示）" : "已公开此留言（前台正常展示）");
  }
});

$("#itemRows").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  syncStateFromForm();
  const index = Number(button.closest("tr").dataset.index);
  const list = state[activeSection];
  if (button.dataset.action === "delete") {
    const item = list[index];
    if ((activeSection === "scriptures" || activeSection === "downloads") && item) {
      try {
        await deleteItemFiles(item);
      } catch (error) {
        showToast(`文件删除失败：${error.message}`);
        return;
      }
    }
    list.splice(index, 1);
    await saveAllData();
    showToast("已删除资料和对应文件");
  }
  if (button.dataset.action === "up" && index > 0) [list[index - 1], list[index]] = [list[index], list[index - 1]];
  if (button.dataset.action === "down" && index < list.length - 1) [list[index], list[index + 1]] = [list[index + 1], list[index]];
  renderRows();
});

$("#itemRows").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-upload]");
  if (!button) return;
  syncStateFromForm();
  const index = Number(button.closest("tr").dataset.index);

  try {
    const uploaded = await pickAndUploadFile();
    if (!uploaded) return;
    const item = state[activeSection][index];
    item.readUrl = uploaded.result.url;
    item.downloadUrl = uploaded.result.url;
    if (!item.title || item.title === "新资料") item.title = fileTitle(uploaded.file.name);
    item.type = fileType(uploaded.file.name);
    if (!item.size) item.size = fileSizeText(uploaded.file.size);
    renderRows();
    await saveAllData();
    showToast("文件已上传并保存");
  } catch (error) {
    showToast(error.message);
  }
});

$("#bulkUploadBtn").addEventListener("click", async () => {
  syncStateFromForm();
  $("#bulkFileInput").value = "";
  $("#bulkFileInput").click();
});

$("#bulkFileInput").addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  try {
    let scriptureCount = 0;
    let downloadCount = 0;
    const total = files.length;
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const loadedBytes = new Array(files.length).fill(0);
    setUploadProgress(0, total, "准备上传");

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setUploadProgress(index, total, `正在上传：${file.name}`);
      const result = await uploadRawFile(file, (loaded) => {
        loadedBytes[index] = loaded;
        const doneBytes = loadedBytes.reduce((sum, value) => sum + value, 0);
        setUploadByteProgress(doneBytes, totalBytes, `正在上传：${file.name}`, index, total);
      });
      loadedBytes[index] = file.size;
      const type = fileType(file.name);
      const item = {
        id: makeId("upload"),
        title: fileTitle(result.originalName || file.name),
        subtitle: "",
        type,
        size: fileSizeText(file.size),
        pages: "",
        icon: type === "PDF" ? "book" : type.toLowerCase(),
        readUrl: result.url,
        downloadUrl: result.url
      };
      if (type === "PDF") {
        state.scriptures.push(item);
        scriptureCount += 1;
      } else {
        state.downloads.push(item);
        downloadCount += 1;
      }
      activeSection = type === "PDF" ? "scriptures" : "downloads";
      document.querySelectorAll("#tabs button").forEach((button) => button.classList.toggle("active", button.dataset.section === activeSection));
      renderRows();
      await saveAllData();
      setUploadProgress(index + 1, total, `已保存：${file.name}`);
    }

    showToast(`已上传并保存：常用经书 ${scriptureCount} 个，资料下载包 ${downloadCount} 个`);
    hideUploadProgressLater();
  } catch (error) {
    const message = error.message || "上传失败，请检查文件大小或网络";
    showToast(message);
    $("#uploadProgress")?.classList.remove("hidden");
    $("#uploadProgressText").textContent = `上传失败：${message}`;
  }
});

$("#addItemBtn").addEventListener("click", () => {
  syncStateFromForm();
  if (activeSection === "smallMantras" && state.smallMantras.length >= 5) {
    showToast("小咒区固定 5 个");
    return;
  }
  state[activeSection].push(blankItem());
  renderRows();
});

$("#saveBtn").addEventListener("click", async () => {
  await saveAllData();
  showToast("已保存");
});

// ==================== 页面在线更新功能（弹窗版） ====================
let updateInfo = null;   // 最近一次检查更新的结果
let updateBusy = false;  // 更新/重启进行中时禁止关闭弹窗

function setUpdateModal(bodyHtml, footerHtml, closable = true) {
  const body = $("#updateModalBody");
  const footer = $("#updateModalFooter");
  const closeBtn = $("#updateModalClose");
  if (body) body.innerHTML = bodyHtml;
  if (footer) footer.innerHTML = footerHtml;
  if (closeBtn) closeBtn.disabled = !closable;
}

function closeUpdateModal() {
  if (updateBusy) return; // 更新或重启中不可关闭，避免误以为可离开
  $("#updateModal")?.classList.add("hidden");
}

function versionLine(v) {
  if (!v || !v.hash) return "-";
  return `<code>${escapeHtml(v.hash)}</code> ${escapeHtml(v.subject || "")}`;
}

function changelogHtml(updates) {
  if (!updates || !updates.length) return "";
  const items = updates.map((c) => `
    <li>
      <code>${escapeHtml(c.hash || "")}</code>
      <span class="changelog-subject">${escapeHtml(c.subject || "")}</span>
      <time>${escapeHtml(String(c.date || "").slice(0, 10))}</time>
    </li>`).join("");
  return `<ul class="changelog">${items}</ul>`;
}

function bindModalButtons() {
  $("#updateCloseBtn")?.addEventListener("click", closeUpdateModal);
  $("#updateRetryBtn")?.addEventListener("click", runUpdateCheck);
  $("#startUpdateBtn")?.addEventListener("click", doOnlineUpdate);
  $("#updateDoneBtn")?.addEventListener("click", () => location.reload());
}

async function runUpdateCheck() {
  updateBusy = false;
  setUpdateModal(
    `<p class="update-loading">正在连接远程仓库，比对最新版本...</p>`,
    `<button class="ghost" id="updateCloseBtn" type="button">关闭</button>`,
    true
  );
  bindModalButtons();

  try {
    const res = await request("/api/admin/check-update");
    updateInfo = res;

    if (!res.isGit) {
      setUpdateModal(
        `<p>${escapeHtml(res.message || "未检测到 Git 仓库，无法自动更新。")}</p>
         <p class="update-note">建议从 GitHub 下载最新版本覆盖更新，或使用一键安装脚本更新。</p>`,
        `<button class="primary" id="updateCloseBtn" type="button">知道了</button>`,
        true
      );
      bindModalButtons();
      return;
    }

    if (res.warning) {
      setUpdateModal(
        `<p>当前版本：${versionLine(res.current)}</p>
         <p class="update-note">${escapeHtml(res.warning)}，请稍后重试。</p>`,
        `<button class="ghost" id="updateRetryBtn" type="button">重新检查</button>
         <button class="primary" id="updateCloseBtn" type="button">关闭</button>`,
        true
      );
      bindModalButtons();
      return;
    }

    if (!res.hasUpdate) {
      setUpdateModal(
        `<p class="update-done">✅ 当前已是最新版本，无需升级。</p>
         <p>当前版本：${versionLine(res.current)}</p>`,
        `<button class="primary" id="updateCloseBtn" type="button">关闭</button>`,
        true
      );
      bindModalButtons();
      return;
    }

    const notes = [
      "点击「立即更新」将自动拉取新代码并重启服务（约数秒），重启后登录状态失效，刷新后请重新登录。"
    ];
    if (res.includesBackend) {
      notes.push("本次更新包含后端代码（server.js 等），必须重启后才生效，已包含在自动流程中。");
    }
    if (res.dirty) {
      notes.push("⚠ 检测到服务器本地有未提交的修改，更新可能失败或产生冲突，建议先处理本地修改再更新。");
    }

    setUpdateModal(
      `<div class="version-compare">
         <div><span>当前版本</span>${versionLine(res.current)}</div>
         <div class="version-arrow">→</div>
         <div><span>最新版本</span>${versionLine(res.latest)}</div>
       </div>
       <p>共 <strong>${res.updates.length}</strong> 个新提交，本次升级内容如下：</p>
       ${changelogHtml(res.updates)}
       ${notes.map((n) => `<p class="update-note">${escapeHtml(n)}</p>`).join("")}`,
      `<button class="ghost" id="updateCloseBtn" type="button">稍后再说</button>
       <button class="primary" id="startUpdateBtn" type="button">立即更新</button>`,
      true
    );
    bindModalButtons();
  } catch (err) {
    setUpdateModal(
      `<p class="update-error">❌ 检查更新失败：${escapeHtml(err.message)}</p>`,
      `<button class="ghost" id="updateRetryBtn" type="button">重新检查</button>
       <button class="primary" id="updateCloseBtn" type="button">关闭</button>`,
      true
    );
    bindModalButtons();
  }
}

// 更新后轮询 /api/version，直到服务带着新版本恢复（重启窗口内请求会失败，属正常）
async function waitForNewVersion(expectedHash) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const v = await request("/api/version");
      if (v && v.isGit && v.hash && (!expectedHash || v.hash === expectedHash)) return true;
    } catch (e) { /* 服务重启中，继续等待 */ }
  }
  return false;
}

async function doOnlineUpdate() {
  if (!updateInfo || !updateInfo.hasUpdate) return;
  updateBusy = true;
  setUpdateModal(
    `<p class="update-loading">正在拉取最新代码并应用更新，请勿关闭本窗口...</p>`,
    "",
    false
  );

  try {
    const res = await request("/api/admin/update", { method: "POST", body: "{}" });

    if (!res.restarting) {
      updateBusy = false;
      setUpdateModal(
        `<p class="update-done">✅ ${escapeHtml(res.message || "更新完成")}</p>
         <p>当前版本：${versionLine(res.current)}</p>`,
        `<button class="primary" id="updateDoneBtn" type="button">完成并刷新页面</button>`,
        true
      );
      bindModalButtons();
      return;
    }

    setUpdateModal(
      `<p class="update-loading">代码已更新到 <code>${escapeHtml(res.current?.hash || "")}</code>，服务正在自动重启，等待新版上线...</p>`,
      "",
      false
    );

    const back = await waitForNewVersion(res.current?.hash);
    updateBusy = false;
    if (back) {
      setUpdateModal(
        `<p class="update-done">✅ 更新完成，服务已重启并运行新版本。</p>
         <p>新版本：${versionLine(res.current)}</p>
         ${res.applied && res.applied.length ? `<p>本次应用 ${res.applied.length} 个提交：</p>${changelogHtml(res.applied)}` : ""}
         <p class="update-note">服务重启后登录状态已失效，刷新页面后请重新登录。</p>`,
        `<button class="primary" id="updateDoneBtn" type="button">完成并刷新页面</button>`,
        true
      );
    } else {
      setUpdateModal(
        `<p class="update-done">代码已更新到 <code>${escapeHtml(res.current?.hash || "")}</code>，但等待服务恢复超时。</p>
         <p class="update-note">请手动刷新页面确认；若长时间无法访问，请在服务器上重新启动服务（npm start）。</p>`,
        `<button class="primary" id="updateDoneBtn" type="button">刷新页面</button>`,
        true
      );
    }
    bindModalButtons();
  } catch (err) {
    updateBusy = false;
    setUpdateModal(
      `<p class="update-error">❌ 更新失败：${escapeHtml(err.message)}</p>
       <p class="update-note">常见原因：本地有未提交修改与更新冲突、服务器无法访问 GitHub。可以先在服务器上手动 git pull 查看具体报错。</p>`,
      `<button class="ghost" id="updateRetryBtn" type="button">重新检查</button>
       <button class="primary" id="updateCloseBtn" type="button">关闭</button>`,
      true
    );
    bindModalButtons();
  }
}

function openUpdateModal() {
  const modal = $("#updateModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  runUpdateCheck();
}

$("#checkUpdateBtn")?.addEventListener("click", openUpdateModal);
$("#updateModalClose")?.addEventListener("click", closeUpdateModal);
$("#updateModal")?.addEventListener("click", (e) => {
  if (e.target.id === "updateModal") closeUpdateModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeUpdateModal();
});

// ==================== 数据备份与导入恢复 ====================
$("#exportDataBtn")?.addEventListener("click", () => {
  showToast("正在导出全站数据备份...");
  window.location.href = "/api/admin/export-data";
});

$("#importDataBtn")?.addEventListener("click", () => {
  const fileInput = $("#importFileInput");
  if (fileInput) {
    fileInput.value = "";
    fileInput.click();
  }
});

$("#importFileInput")?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!confirm(`确定要从备份文件【${file.name}】恢复全站数据吗？\n当前系统会自动保留一份快照，但现有设置将被覆盖。`)) {
    return;
  }

  showToast("正在导入备份数据...");
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const res = await request("/api/admin/import-data", {
      method: "POST",
      body: JSON.stringify(parsed)
    });
    showToast(res.message || "数据还原成功！");
    state = res.data;
    syncSettingsFromState();
    renderRows();
  } catch (err) {
    alert(`恢复数据失败: ${err.message}`);
    showToast(`导入失败: ${err.message}`);
  }
});

loadAdminData().then(() => {
  $("#loginBox").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
}).catch(() => {});
