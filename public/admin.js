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
  $("#messageRows").innerHTML = messages.map((message, index) => `
    <tr data-message-index="${index}">
      <td>${escapeHtml(message.name || "善友")}</td>
      <td><div class="message-content">${escapeHtml(message.content || "")}</div></td>
      <td><textarea data-message-key="reply" placeholder="填写回复">${escapeHtml(message.reply || "")}</textarea></td>
      <td>${message.createdAt ? new Date(message.createdAt).toLocaleString("zh-CN") : ""}</td>
      <td>
        <div class="row-actions">
          <button class="danger" data-message-action="delete">删除</button>
        </div>
      </td>
    </tr>
  `).join("");
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
  input.accept = ".pdf,.epub,.zip,.rar,.doc,.docx,.txt,.png,.jpg,.jpeg,.mp3,.mp4,application/pdf,application/zip";
  return new Promise((resolve, reject) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const contentBase64 = await fileToBase64(file);
        const result = await request("/api/admin/upload", {
          method: "POST",
          body: JSON.stringify({ filename: file.name, contentBase64 })
        });
        resolve({ file, result });
      } catch (error) {
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

loadAdminData().then(() => {
  $("#loginBox").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
}).catch(() => {});
