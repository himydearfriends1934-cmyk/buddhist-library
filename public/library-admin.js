let state = null;
let activeKind = "scriptures";

const $ = (selector) => document.querySelector(selector);

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

function viewUrl(item) {
  const url = item.readUrl || item.downloadUrl || "#";
  const type = String(item.type || "").toLowerCase();
  if (url === "#") return "#";
  if (type === "pdf" || /\.pdf$/i.test(item.title || "") || /\.pdf(?:$|\?)/i.test(url)) {
    return `/reader.html?${new URLSearchParams({ file: url, title: item.title || "PDF 阅读" }).toString()}`;
  }
  return url;
}

async function saveData() {
  await request("/api/admin/data", {
    method: "PUT",
    body: JSON.stringify(state)
  });
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
  for (const url of urls) await deleteUploadFile(url);
}

function render() {
  const list = state?.[activeKind] || [];
  $("#libraryCount").textContent = `${activeKind === "scriptures" ? "常用经书" : "资料下载包"}：${list.length} 个`;
  $("#selectAll").checked = false;

  if (!list.length) {
    $("#libraryList").innerHTML = `<div class="empty">暂无资料</div>`;
    return;
  }

  $("#libraryList").innerHTML = list.map((item, index) => `
    <article class="file-row" data-index="${index}">
      <input type="checkbox" class="row-check">
      <input type="text" class="title-input" value="${escapeHtml(item.title)}" aria-label="文件名">
      <span class="file-type">${escapeHtml(item.type || "")}</span>
      <span class="file-size">${escapeHtml(item.size || "")}</span>
      <div class="file-actions">
        <a href="${viewUrl(item)}" target="_blank">查看</a>
        <button data-action="rename">重命名</button>
        <button class="danger" data-action="delete">删除</button>
      </div>
    </article>
  `).join("");
}

async function renameRow(row) {
  const index = Number(row.dataset.index);
  const title = row.querySelector(".title-input").value.trim();
  if (!title) {
    showToast("文件名不能为空");
    return;
  }
  state[activeKind][index].title = title;
  await saveData();
  showToast("已重命名");
  render();
}

async function deleteRows(indexes) {
  const list = state[activeKind];
  const sorted = [...indexes].sort((a, b) => b - a);
  for (const index of sorted) {
    const item = list[index];
    if (!item) continue;
    await deleteItemFiles(item);
    list.splice(index, 1);
  }
  await saveData();
  showToast(`已删除 ${indexes.length} 个`);
  render();
}

$(".library-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-kind]");
  if (!button) return;
  activeKind = button.dataset.kind;
  document.querySelectorAll(".library-tabs button").forEach((item) => item.classList.toggle("active", item === button));
  render();
});

$("#selectAll").addEventListener("change", (event) => {
  document.querySelectorAll(".row-check").forEach((checkbox) => {
    checkbox.checked = event.target.checked;
  });
});

$("#libraryList").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest(".file-row");
  if (button.dataset.action === "rename") await renameRow(row);
  if (button.dataset.action === "delete") await deleteRows([Number(row.dataset.index)]);
});

$("#batchDeleteBtn").addEventListener("click", async () => {
  const indexes = Array.from(document.querySelectorAll(".file-row"))
    .filter((row) => row.querySelector(".row-check").checked)
    .map((row) => Number(row.dataset.index));
  if (!indexes.length) {
    showToast("请先选择文件");
    return;
  }
  await deleteRows(indexes);
});

request("/api/admin/data")
  .then((data) => {
    state = data;
    render();
  })
  .catch(() => {
    $("#inlineLogin").classList.remove("hidden");
    $("#libraryList").innerHTML = `<div class="empty">登录后显示资料库</div>`;
  });

$("#loginBtn").addEventListener("click", async () => {
  try {
    await request("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#loginUser").value,
        password: $("#loginPass").value
      })
    });
    $("#inlineLogin").classList.add("hidden");
    state = await request("/api/admin/data");
    render();
  } catch (error) {
    showToast(error.message);
  }
});
