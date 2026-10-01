const iconSvg = {
  lotus: `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M60 84C41 68 38 45 60 17c22 28 19 51 0 67Z"/><path d="M45 86C25 80 14 62 18 36c24 9 34 26 27 50Z"/><path d="M75 86c20-6 31-24 27-50-24 9-34 26-27 50Z"/><path d="M60 86c-20-3-37-13-50-31 25 1 42 9 50 31Z"/><path d="M60 86c20-3 37-13 50-31-25 1-42 9-50 31Z"/><path d="M18 88h84"/></svg>`,
  buddha: `<svg viewBox="0 0 120 100" aria-hidden="true"><circle cx="60" cy="30" r="15"/><path d="M42 35c-6 3-10 8-11 16m47-16c6 3 10 8 11 16"/><path d="M38 82c1-25 11-38 22-38s21 13 22 38"/><path d="M30 83h60"/><path d="M42 64c-11 2-20 8-26 18h88c-6-10-15-16-26-18"/><path d="M46 14c8-8 20-8 28 0"/><path d="M50 22h20"/></svg>`,
  wheel: `<svg viewBox="0 0 120 100" aria-hidden="true"><circle cx="60" cy="50" r="33"/><circle cx="60" cy="50" r="10"/><path d="M60 8v84M18 50h84M30 20l60 60M90 20 30 80"/><path d="M60 2l7 10h-14Zm0 96-7-10h14ZM12 50l10-7v14Zm96 0-10 7V43Z"/></svg>`,
  knot: `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M38 14 60 36 82 14l14 14-22 22 22 22-14 14-22-22-22 22-14-14 22-22-22-22Z"/><path d="M60 36 38 58l22 22 22-22Z"/><path d="M38 14 24 28l22 22-22 22 14 14M82 14l14 14-22 22 22 22-14 14"/></svg>`,
  pagoda: `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M60 8v13"/><path d="M47 23h26l-7 8H54Z"/><path d="M39 37h42l-9 9H48Z"/><path d="M30 55h60l-12 10H42Z"/><path d="M21 77h78l-15 11H36Z"/><path d="M53 31v6M67 31v6M50 46v9M70 46v9M46 65v12M74 65v12"/><path d="M60 23v65"/></svg>`,
  hand: `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M39 47V24c0-6 9-6 9 0v23"/><path d="M49 47V16c0-6 10-6 10 0v31"/><path d="M60 47V19c0-6 10-6 10 0v31"/><path d="M71 51V30c0-6 9-6 9 0v30c0 18-11 30-28 30-12 0-21-7-28-20l-7-15c-3-7 6-11 10-5l10 14"/><path d="M38 72h45"/></svg>`,
  book: `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M28 18c14 0 24 4 32 12 8-8 18-12 32-12v65c-14 0-24 4-32 12-8-8-18-12-32-12Z"/><path d="M60 30v65"/><path d="M38 32h12M38 46h13M38 60h12M70 32h12M70 46h13M70 60h12"/><path d="M23 23v65c14 0 25 3 37 7M97 23v65c-14 0-25 3-37 7"/></svg>`,
  pdf: `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M36 10h34l18 18v62H36Z"/><path d="M70 10v18h18"/><path d="M28 46h48v24H28Z"/><text x="35" y="63">PDF</text></svg>`,
  epub: `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M32 16h56v68H32Z"/><path d="M44 32h32M44 46h32M44 60h24"/><text x="37" y="77">EPUB</text></svg>`,
  zip: `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M36 10h34l18 18v62H36Z"/><path d="M70 10v18h18"/><path d="M51 18h12M51 28h12M51 38h12M51 48h12"/><text x="45" y="78">ZIP</text></svg>`
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeUrl(url) {
  const u = String(url || "").trim();
  if (!u || u === "#") return "";
  // 严格只允许以 http://, https://, / 开头的安全链接，阻止 javascript: 等伪协议
  if (/^(?:https?:\/\/|\/)/i.test(u)) return u;
  return "";
}

function metaText(item) {
  return [item.subtitle, item.size, item.pages].filter(Boolean).map(escapeHtml).join(" · ");
}

function readerUrl(item) {
  const rawUrl = item.readUrl || item.downloadUrl || "";
  const safeUrl = sanitizeUrl(rawUrl);
  if (!safeUrl) return "";

  const type = String(item.type || "").toLowerCase();
  const isPdf = type === "pdf" || /\.pdf(?:$|\?)/i.test(safeUrl) || /\.pdf$/i.test(item.title || "");
  if (!isPdf) return "";

  const params = new URLSearchParams({ file: safeUrl, title: item.title || "PDF 阅读" });
  return `/reader.html?${params.toString()}`;
}

function actionLinks(item, textMode = false) {
  const readUrl = readerUrl(item);
  const downUrl = sanitizeUrl(item.downloadUrl);
  if (textMode) {
    return `
      ${readUrl ? `<a class="read-text" href="${escapeHtml(readUrl)}">阅读</a>` : ""}
      ${downUrl ? `<a class="down-text" href="${escapeHtml(downUrl)}" download>下载</a>` : ""}
    `;
  }
  return `
    <div class="actions">
      ${readUrl ? `<a href="${escapeHtml(readUrl)}">▣ 在线阅读</a>` : ""}
    </div>
  `;
}

function resourceCard(item) {
  const icon = iconSvg[item.icon] || iconSvg.lotus;
  return `
    <article class="resource-card">
      <div class="mark">${icon}</div>
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="meta">${metaText(item)}</p>
        ${actionLinks(item)}
      </div>
    </article>
  `;
}

function smallItem(item) {
  const icon = iconSvg[item.icon] || iconSvg.lotus;
  return `
    <article class="small-item">
      <div class="mark">${icon}</div>
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="meta">${metaText(item)}</p>
        ${actionLinks(item)}
      </div>
    </article>
  `;
}

function bookRow(item, index, textMode = false) {
  if (textMode) {
    return `
      <div class="book-row">
        <span class="num">${index + 1}.</span>
        <span>${escapeHtml(item.title)}</span>
        ${actionLinks(item, true)}
      </div>
    `;
  }
  const readUrl = readerUrl(item);
  return `
    <div class="book-row">
      <span class="num">${index + 1}</span>
      <span>${escapeHtml(item.title)}</span>
      ${readUrl ? `<a class="read-text" href="${escapeHtml(readUrl)}">在线阅读</a>` : `<span class="file-type">${escapeHtml(item.type || "PDF")}</span>`}
    </div>
  `;
}

function downloadRow(item, compact = false) {
  const kind = (item.type || "PDF").toLowerCase();
  const downUrl = sanitizeUrl(item.downloadUrl);
  if (compact) {
    const readUrl = readerUrl(item);
    return `
      <div class="archive-row">
        <span></span>
        <span>${escapeHtml(item.title)}</span>
        ${readUrl ? `<a class="read-text" href="${escapeHtml(readUrl)}">阅读</a>` : "<span></span>"}
        ${downUrl ? `<a class="down-text" href="${escapeHtml(downUrl)}" download>下载</a>` : "<span></span>"}
      </div>
    `;
  }
  return `
    <div class="download-row">
      <span class="file-icon ${escapeHtml(kind)}">${escapeHtml((item.type || "PDF").slice(0, 4))}</span>
      <span>${escapeHtml(item.title)}</span>
      <span class="file-type">${escapeHtml(item.type || "PDF")} · ${escapeHtml(item.size || "")}</span>
      ${downUrl ? `<a class="download-action" href="${escapeHtml(downUrl)}" download>↓ 下载</a>` : `<span class="download-action disabled">无文件</span>`}
    </div>
  `;
}

function messageRow(item) {
  const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString("zh-CN") : "";
  const reply = item.reply ? `<div class="message-reply"><span>回复</span><p>${escapeHtml(item.reply)}</p></div>` : "";
  return `
    <article class="message-item">
      <div>
        <strong>${escapeHtml(item.name || "善友")}</strong>
        <time>${date}</time>
      </div>
      <p>${escapeHtml(item.content || "")}</p>
      ${reply}
    </article>
  `;
}

async function loadData() {
  try {
    const response = await fetch("/api/data");
    if (!response.ok) throw new Error("加载数据失败");
    return await response.json();
  } catch (err) {
    console.error("加载数据异常:", err);
    return {
      settings: { title: "佛学文化资料阅览", subtitle: "经典经文、电子书籍与佛学文化学习资料" },
      important: [],
      smallMantras: [],
      scriptures: [],
      downloads: [],
      messages: []
    };
  }
}

function renderHome(data) {
  const settings = data.settings || {};
  if ($("#siteTitle")) $("#siteTitle").textContent = settings.title || "佛学文化资料阅览";
  if ($("#siteSubtitle")) $("#siteSubtitle").textContent = settings.subtitle || "";
  if ($("#importantGrid")) $("#importantGrid").innerHTML = (data.important || []).map(resourceCard).join("");
  if ($("#smallGrid")) $("#smallGrid").innerHTML = (data.smallMantras || []).slice(0, 5).map(smallItem).join("");
  if ($("#scripturePreview")) $("#scripturePreview").innerHTML = (data.scriptures || []).slice(0, 12).map((item, index) => bookRow(item, index)).join("");
  if ($("#downloadPreview")) $("#downloadPreview").innerHTML = (data.downloads || []).slice(0, 6).map((item) => downloadRow(item)).join("");
  if ($("#messageList")) $("#messageList").innerHTML = (data.messages || []).slice(0, 5).map(messageRow).join("");
}

function renderScriptures(data) {
  const scriptures = Array.isArray(data.scriptures) ? data.scriptures : [];
  const columnSize = 25;
  const totalCount = scriptures.length;
  const numColumns = Math.max(1, Math.ceil(totalCount / columnSize));
  const columns = [];

  // 修复经书超过 75 本被截断丢失的 Bug：动态根据经书总量自适应切分列
  for (let i = 0; i < numColumns; i++) {
    columns.push(scriptures.slice(i * columnSize, (i + 1) * columnSize));
  }

  const scriptureCols = $("#scriptureColumns");
  if (scriptureCols) {
    if (totalCount === 0) {
      scriptureCols.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #888; padding: 2rem;">暂无经书资料</div>`;
    } else {
      scriptureCols.innerHTML = columns.map((items, columnIndex) => {
        const rows = items.map((item, rowIndex) => {
          const globalIndex = columnIndex * columnSize + rowIndex;
          return bookRow(item, globalIndex, true);
        }).join("");
        return `<div class="scripture-column">${rows}</div>`;
      }).join("");
    }
  }

  const archiveList = $("#archiveList");
  if (archiveList) {
    const downloads = Array.isArray(data.downloads) ? data.downloads : [];
    if (downloads.length === 0) {
      archiveList.innerHTML = `<div style="text-align: center; color: #888; padding: 1.5rem;">暂无下载资料包</div>`;
    } else {
      archiveList.innerHTML = downloads.map((item, index) => {
        return downloadRow({ ...item, title: `${index + 1}. ${item.title}` }, true);
      }).join("");
    }
  }
}

loadData().then((data) => {
  if ($("#importantGrid")) renderHome(data);
  if ($("#scriptureColumns")) renderScriptures(data);
});

if ($("#messageForm")) {
  $("#messageForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const nameInput = $("#messageName");
    const contentInput = $("#messageContent");
    const status = $("#messageStatus");
    const name = nameInput ? nameInput.value.trim() : "";
    const content = contentInput ? contentInput.value.trim() : "";
    status.textContent = "";

    if (!content) {
      status.textContent = "请填写留言内容";
      return;
    }

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "提交失败");
      if (contentInput) contentInput.value = "";
      status.textContent = "已提交留言";
      const data = await loadData();
      renderHome(data);
    } catch (error) {
      status.textContent = error.message;
    }
  });
}
