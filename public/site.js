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

let globalSiteData = null;

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
  if (/^(?:https?:\/\/|\/)/i.test(u)) return u;
  return "";
}

function isAudioItem(item) {
  const url = String(item.readUrl || item.downloadUrl || "").toLowerCase();
  const type = String(item.type || "").toLowerCase();
  return type === "mp3" || type === "audio" || /\.mp3(?:$|\?)/i.test(url);
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

function dedupeDownloads(list) {
  const seen = new Set();
  return (list || []).filter((item) => {
    const key = `${item.title}-${item.downloadUrl}-${item.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function actionLinks(item, textMode = false) {
  const readUrl = readerUrl(item);
  const downUrl = sanitizeUrl(item.downloadUrl);
  const isAudio = isAudioItem(item);
  const audioUrl = sanitizeUrl(item.readUrl || item.downloadUrl);

  const audioBtn = isAudio && audioUrl ? `<button class="action-btn listen-btn" type="button" onclick="playAudio('${escapeHtml(audioUrl)}', '${escapeHtml(item.title)}')">🎵 诵听</button>` : "";

  if (textMode) {
    return `
      <div class="row-actions-group">
        ${audioBtn}
        ${readUrl ? `<a class="action-btn read-pill" href="${escapeHtml(readUrl)}">阅读</a>` : ""}
        ${downUrl ? `<a class="action-btn down-pill" href="${escapeHtml(downUrl)}" download>下载</a>` : ""}
      </div>
    `;
  }
  return `
    <div class="actions">
      ${audioBtn}
      ${readUrl ? `<a class="action-pill" href="${escapeHtml(readUrl)}">▣ 在线阅读</a>` : ""}
    </div>
  `;
}

function resourceCard(item) {
  const icon = iconSvg[item.icon] || iconSvg.lotus;
  return `
    <article class="resource-card">
      <div class="mark">${icon}</div>
      <div class="card-body">
        <h3 title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
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
      <div class="item-body">
        <h3 title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
        <p class="meta">${metaText(item)}</p>
        ${actionLinks(item)}
      </div>
    </article>
  `;
}

function bookRow(item, index, textMode = false) {
  const title = escapeHtml(item.title);
  if (textMode) {
    return `
      <div class="book-row">
        <span class="num">${index + 1}.</span>
        <span class="book-title" title="${title}">${title}</span>
        ${actionLinks(item, true)}
      </div>
    `;
  }
  const readUrl = readerUrl(item);
  const isAudio = isAudioItem(item);
  const audioUrl = sanitizeUrl(item.readUrl || item.downloadUrl);

  let op = `<span class="file-type">${escapeHtml(item.type || "PDF")}</span>`;
  if (isAudio && audioUrl) {
    op = `<button class="action-btn listen-pill" type="button" onclick="playAudio('${escapeHtml(audioUrl)}', '${title}')">🎵 诵听</button>`;
  } else if (readUrl) {
    op = `<a class="action-btn read-pill" href="${escapeHtml(readUrl)}">在线阅读</a>`;
  }

  return `
    <div class="book-row">
      <div class="book-left">
        <span class="num">${index + 1}</span>
        <span class="book-title" title="${title}">${title}</span>
      </div>
      <div class="book-right">
        ${op}
      </div>
    </div>
  `;
}

function downloadRow(item, compact = false) {
  const kind = (item.type || "PDF").toLowerCase();
  const downUrl = sanitizeUrl(item.downloadUrl);
  const title = escapeHtml(item.title);
  const isAudio = isAudioItem(item);

  if (compact) {
    const readUrl = readerUrl(item);
    const audioBtn = isAudio && downUrl ? `<button class="action-btn listen-btn" type="button" onclick="playAudio('${escapeHtml(downUrl)}', '${title}')">🎵</button>` : "";
    return `
      <div class="archive-row">
        <span class="archive-icon">📦</span>
        <span class="archive-title" title="${title}">${title}</span>
        <div class="archive-actions">
          ${audioBtn}
          ${readUrl ? `<a class="action-btn read-pill" href="${escapeHtml(readUrl)}">阅读</a>` : ""}
          ${downUrl ? `<a class="action-btn down-pill" href="${escapeHtml(downUrl)}" download>下载</a>` : ""}
        </div>
      </div>
    `;
  }

  const audioBtn = isAudio && downUrl ? `<button class="action-btn listen-pill" type="button" onclick="playAudio('${escapeHtml(downUrl)}', '${title}')">🎵 播放</button>` : "";

  return `
    <div class="download-row">
      <span class="file-icon ${escapeHtml(kind)}">${escapeHtml((item.type || "PDF").slice(0, 4))}</span>
      <span class="download-title" title="${title}">${title}</span>
      <span class="file-type">${escapeHtml(item.type || "PDF")}${item.size ? ` · ${escapeHtml(item.size)}` : ""}</span>
      <div class="download-right">
        ${audioBtn}
        ${downUrl ? `<a class="download-action" href="${escapeHtml(downUrl)}" download>↓ 下载</a>` : `<span class="download-action disabled">无文件</span>`}
      </div>
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

// ==================== 首页新增板块：继续阅读 / 精选推荐 / 梵呗诵听 ====================
const PROGRESS_PREFIX = "buddhist_read_prog_";

// 扫描阅读器写入本机的阅读进度（buddhist_read_prog_<文件>），按最近阅读排序
function collectProgressEntries() {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PROGRESS_PREFIX)) continue;
      let file = "";
      try { file = decodeURIComponent(key.slice(PROGRESS_PREFIX.length)); } catch (e) { continue; }
      const page = parseInt(localStorage.getItem(key) || "0", 10);
      if (!file || !(page > 0)) continue;
      const enc = encodeURIComponent(file);
      const total = parseInt(localStorage.getItem(`buddhist_read_total_${enc}`) || "0", 10);
      const at = parseInt(localStorage.getItem(`buddhist_read_at_${enc}`) || "0", 10);
      entries.push({ file, page, total: total > 0 ? total : 0, at });
    }
  } catch (e) { /* localStorage 不可用（隐私模式等）时静默跳过 */ }
  entries.sort((a, b) => (b.at || 0) - (a.at || 0) || b.page - a.page);
  return entries;
}

function findItemByFile(data, file) {
  const all = [
    ...(data.important || []), ...(data.smallMantras || []),
    ...(data.scriptures || []), ...(data.downloads || [])
  ];
  return all.find((item) => sanitizeUrl(item.readUrl || item.downloadUrl) === file) || null;
}

function resumeCard(entry, item) {
  const title = item ? item.title : (entry.file.split("/").pop() || "经书");
  const readHref = (item && readerUrl(item))
    || `/reader.html?file=${encodeURIComponent(entry.file)}&title=${encodeURIComponent(title)}`;
  const percent = entry.total ? Math.min(100, Math.round((entry.page / entry.total) * 100)) : 0;
  const progressText = entry.total
    ? `读到第 ${entry.page} / ${entry.total} 页 · 已读 ${percent}%`
    : `上次读到第 ${entry.page} 页`;
  return `
    <article class="resource-card resume-card">
      <div class="mark">${iconSvg[(item && item.icon) || "book"] || iconSvg.book}</div>
      <div class="card-body">
        <h3 title="${escapeHtml(title)}">${escapeHtml(title)}</h3>
        <p class="meta">${progressText}</p>
        ${entry.total ? `<div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>` : ""}
        <div class="actions"><a class="action-pill" href="${escapeHtml(readHref)}">▣ 继续阅读</a></div>
      </div>
    </article>
  `;
}

function renderContinueReading(data) {
  const section = $("#continueSection");
  const grid = $("#resumeGrid");
  if (!section || !grid) return;
  const entries = collectProgressEntries().slice(0, 4);
  if (!entries.length) {
    section.classList.add("hidden");
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = entries.map((entry) => resumeCard(entry, findItemByFile(data, entry.file))).join("");
  section.classList.remove("hidden");
}

function renderFeatured(data) {
  const section = $("#featuredSection");
  const strip = $("#featuredStrip");
  if (!section || !strip) return;
  const seen = new Set();
  const featured = [];
  for (const list of [data.important, data.scriptures, data.downloads, data.smallMantras]) {
    for (const item of list || []) {
      if (!item.featured) continue;
      const key = `${item.title}|${item.readUrl || item.downloadUrl || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      featured.push(item);
    }
  }
  if (!featured.length) {
    section.classList.add("hidden");
    strip.innerHTML = "";
    return;
  }
  strip.innerHTML = featured.map((item) =>
    resourceCard(item).replace('class="resource-card"', 'class="resource-card featured-card"')
  ).join("");
  section.classList.remove("hidden");
}

function audioRow(item) {
  const audioUrl = sanitizeUrl(item.readUrl || item.downloadUrl);
  const title = escapeHtml(item.title);
  return `
    <div class="audio-row">
      <span class="audio-row-icon" aria-hidden="true">🎵</span>
      <div class="audio-row-body">
        <span class="audio-row-title" title="${title}">${title}</span>
        <span class="audio-row-meta">${metaText(item)}</span>
      </div>
      <button class="action-btn listen-pill" type="button" onclick="playAudio('${escapeHtml(audioUrl)}', '${title}')">▶ 播放</button>
    </div>
  `;
}

function renderAudioZone(data) {
  const section = $("#audioSection");
  const list = $("#audioList");
  if (!section || !list) return;
  const seen = new Set();
  const audios = [];
  for (const coll of [data.important, data.smallMantras, data.scriptures, data.downloads]) {
    for (const item of coll || []) {
      if (!isAudioItem(item)) continue;
      const url = sanitizeUrl(item.readUrl || item.downloadUrl);
      if (!url) continue;
      const key = `${item.title}|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      audios.push(item);
    }
  }
  if (!audios.length) {
    section.classList.add("hidden");
    list.innerHTML = "";
    return;
  }
  list.innerHTML = audios.map(audioRow).join("");
  section.classList.remove("hidden");
}

async function loadData() {
  try {
    const response = await fetch("/api/data");
    if (!response.ok) throw new Error("加载数据失败");
    const data = await response.json();
    globalSiteData = data;
    return data;
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

  // 渲染平台说明 / 修学寄语
  const noticeBanner = $("#noticeBanner");
  const noticeText = $("#siteNoticeText");
  if (noticeBanner && noticeText) {
    const notice = String(settings.notice || "").trim();
    if (notice) {
      noticeText.textContent = notice;
      noticeBanner.classList.remove("hidden");
    } else {
      noticeBanner.classList.add("hidden");
    }
  }

  // 新增板块：继续阅读 / 精选推荐 / 梵呗诵听（无内容时各自隐藏）
  renderContinueReading(data);
  renderFeatured(data);
  renderAudioZone(data);

  if ($("#importantGrid")) $("#importantGrid").innerHTML = (data.important || []).map(resourceCard).join("");
  if ($("#smallGrid")) $("#smallGrid").innerHTML = (data.smallMantras || []).slice(0, 5).map(smallItem).join("");
  if ($("#scripturePreview")) $("#scripturePreview").innerHTML = (data.scriptures || []).slice(0, 12).map((item, index) => bookRow(item, index)).join("");

  // 常用下载区去重
  const dedupedDownloads = dedupeDownloads(data.downloads || []);
  if ($("#downloadPreview")) $("#downloadPreview").innerHTML = dedupedDownloads.slice(0, 6).map((item) => downloadRow(item)).join("");
  if ($("#messageList")) $("#messageList").innerHTML = (data.messages || []).slice(0, 5).map(messageRow).join("");
}

function renderScriptures(data) {
  const scriptures = Array.isArray(data.scriptures) ? data.scriptures : [];
  const columnSize = 25;
  const totalCount = scriptures.length;
  const numColumns = Math.max(1, Math.ceil(totalCount / columnSize));
  const columns = [];

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
    const downloads = dedupeDownloads(data.downloads || []);
    if (downloads.length === 0) {
      archiveList.innerHTML = `<div style="text-align: center; color: #888; padding: 1.5rem;">暂无下载资料包</div>`;
    } else {
      archiveList.innerHTML = downloads.map((item, index) => {
        return downloadRow({ ...item, title: `${index + 1}. ${item.title}` }, true);
      }).join("");
    }
  }
}

// ==================== 站内实时搜索功能 ====================
function handleSearch(keyword) {
  const term = String(keyword || "").trim().toLowerCase();
  const clearBtn = $("#clearSearchBtn");
  const hint = $("#searchResultHint");

  if (clearBtn) clearBtn.classList.toggle("hidden", !term);

  if (!globalSiteData) return;

  if (!term) {
    if (hint) hint.classList.add("hidden");
    renderHome(globalSiteData);
    return;
  }

  // 搜索状态下隐藏继续阅读/精选/梵呗板块，避免展示与关键词无关的聚合内容
  ["#continueSection", "#featuredSection", "#audioSection"].forEach((sel) => {
    const el = $(sel);
    if (el) el.classList.add("hidden");
  });

  const filterFn = (item) => {
    const t = String(item.title || "").toLowerCase();
    const s = String(item.subtitle || "").toLowerCase();
    return t.includes(term) || s.includes(term);
  };

  const filteredImportant = (globalSiteData.important || []).filter(filterFn);
  const filteredSmall = (globalSiteData.smallMantras || []).filter(filterFn);
  const filteredScriptures = (globalSiteData.scriptures || []).filter(filterFn);
  const filteredDownloads = dedupeDownloads(globalSiteData.downloads || []).filter(filterFn);

  const totalMatches = filteredImportant.length + filteredSmall.length + filteredScriptures.length + filteredDownloads.length;

  if (hint) {
    hint.textContent = `共检索到 ${totalMatches} 项与 “${keyword}” 相关的资料经卷：`;
    hint.classList.remove("hidden");
  }

  if ($("#importantGrid")) {
    $("#importantGrid").innerHTML = filteredImportant.length
      ? filteredImportant.map(resourceCard).join("")
      : `<div class="search-empty">无匹配重点经咒</div>`;
  }
  if ($("#smallGrid")) {
    $("#smallGrid").innerHTML = filteredSmall.length
      ? filteredSmall.map(smallItem).join("")
      : `<div class="search-empty">无匹配小咒</div>`;
  }
  if ($("#scripturePreview")) {
    $("#scripturePreview").innerHTML = filteredScriptures.length
      ? filteredScriptures.map((item, index) => bookRow(item, index)).join("")
      : `<div class="search-empty">无匹配常用经书</div>`;
  }
  if ($("#downloadPreview")) {
    $("#downloadPreview").innerHTML = filteredDownloads.length
      ? filteredDownloads.map((item) => downloadRow(item)).join("")
      : `<div class="search-empty">无匹配下载区文件</div>`;
  }
}

const searchInput = $("#siteSearchInput");
if (searchInput) {
  searchInput.addEventListener("input", (e) => handleSearch(e.target.value));
}

const clearSearchBtn = $("#clearSearchBtn");
if (clearSearchBtn) {
  clearSearchBtn.addEventListener("click", () => {
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
    handleSearch("");
  });
}

// ==================== 全局浮动音频播放器 ====================
let isAudioLoop = false;

window.playAudio = function(url, title) {
  const bar = $("#audioPlayerBar");
  const audio = $("#globalAudio");
  const titleEl = $("#audioTitle");
  const playBtn = $("#audioPlayBtn");

  if (!bar || !audio) return;

  bar.classList.remove("hidden");
  if (titleEl) titleEl.textContent = title || "梵呗诵持";

  if (audio.src !== url && !audio.src.endsWith(url)) {
    audio.src = url;
  }

  audio.play().then(() => {
    if (playBtn) playBtn.textContent = "⏸";
  }).catch((err) => {
    console.warn("音频播放失败:", err);
  });
};

const audioEl = $("#globalAudio");
if (audioEl) {
  const playBtn = $("#audioPlayBtn");
  const loopBtn = $("#audioLoopBtn");
  const progress = $("#audioProgress");
  const timeEl = $("#audioTime");
  const closeBtn = $("#audioCloseBtn");

  function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  playBtn?.addEventListener("click", () => {
    if (audioEl.paused) {
      audioEl.play();
      playBtn.textContent = "⏸";
    } else {
      audioEl.pause();
      playBtn.textContent = "▶";
    }
  });

  loopBtn?.addEventListener("click", () => {
    isAudioLoop = !isAudioLoop;
    audioEl.loop = isAudioLoop;
    loopBtn.classList.toggle("active", isAudioLoop);
  });

  audioEl.addEventListener("timeupdate", () => {
    if (audioEl.duration && progress) {
      progress.value = Math.floor((audioEl.currentTime / audioEl.duration) * 100);
      if (timeEl) timeEl.textContent = `${formatTime(audioEl.currentTime)} / ${formatTime(audioEl.duration)}`;
    }
  });

  progress?.addEventListener("input", (e) => {
    if (audioEl.duration) {
      audioEl.currentTime = (Number(e.target.value) / 100) * audioEl.duration;
    }
  });

  audioEl.addEventListener("ended", () => {
    if (!isAudioLoop && playBtn) playBtn.textContent = "▶";
  });

  closeBtn?.addEventListener("click", () => {
    audioEl.pause();
    $("#audioPlayerBar")?.classList.add("hidden");
  });
}

// 首次加载数据
loadData().then((data) => {
  if ($("#importantGrid")) renderHome(data);
  if ($("#scriptureColumns")) renderScriptures(data);
});

// 留言表单提交
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
