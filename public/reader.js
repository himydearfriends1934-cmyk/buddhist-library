pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";

const params = new URLSearchParams(location.search);
const file = params.get("file") || "";
const title = params.get("title") || "PDF 阅读";

const reader = document.querySelector("#bookReader");
const stage = document.querySelector("#bookStage");
const loading = document.querySelector("#pageLoading");
const empty = document.querySelector("#readerEmpty");
const prevButton = document.querySelector("#prevPage");
const nextButton = document.querySelector("#nextPage");
const firstButton = document.querySelector("#firstPage");
const lastButton = document.querySelector("#lastPage");
const readModeButton = document.querySelector("#readMode");
const zoomOutButton = document.querySelector("#zoomOut");
const zoomInButton = document.querySelector("#zoomIn");
const fitPageButton = document.querySelector("#fitPage");
const pageNumber = document.querySelector("#pageNumber");
const pageCount = document.querySelector("#pageCount");

let pdfDocument = null;
let currentPage = 1;
let currentCanvas = document.querySelector("#pageCanvas");
let nextCanvas = document.querySelector("#nextCanvas");
let textPage = null;
let turning = false;
let textMode = false;
let zoomLevel = 1;
let fitMode = true;
let resizeTimer = null;
let touchStartX = 0;
let touchStartY = 0;

function sanitizePdfUrl(rawUrl) {
  const u = String(rawUrl || "").trim();
  if (/^(?:https?:\/\/|\/)/i.test(u)) return u;
  return "";
}

const safeFile = sanitizePdfUrl(file);

document.title = `${title} - PDF 阅读`;
document.querySelector("#readerTitle").textContent = title;
document.querySelector("#downloadLink").href = safeFile || "#";
if (!safeFile) {
  document.querySelector("#downloadLink").style.display = "none";
}

function showError(message) {
  reader.hidden = true;
  document.querySelector(".reader-controls").hidden = true;
  empty.textContent = message;
  empty.classList.add("show");
}

function updateControls() {
  const total = pdfDocument?.numPages || 0;
  pageNumber.textContent = String(total ? currentPage : 0);
  pageCount.textContent = String(total);
  prevButton.disabled = currentPage <= 1;
  firstButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= total;
  lastButton.disabled = currentPage >= total;
  readModeButton.textContent = textMode ? "原版页面" : "适配阅读";
  readModeButton.classList.toggle("active", textMode);
  zoomOutButton.disabled = textMode || zoomLevel <= 0.55;
  zoomInButton.disabled = textMode || zoomLevel >= 2.15;
  fitPageButton.disabled = textMode;
  fitPageButton.classList.toggle("active", fitMode && !textMode);

  // 保存当前阅读进度
  if (safeFile && currentPage > 0) {
    try {
      localStorage.setItem(`buddhist_read_prog_${encodeURIComponent(safeFile)}`, String(currentPage));
    } catch (e) {}
  }
}

function ensureTextPage() {
  if (textPage) return textPage;
  textPage = document.createElement("article");
  textPage.className = "text-page";
  textPage.setAttribute("aria-label", "适配阅读文字页");
  stage.appendChild(textPage);
  return textPage;
}

function textFontSize() {
  const width = window.innerWidth;
  if (width <= 380) return 18;
  if (width <= 700) return 19;
  return 21;
}

function normalizeTextItems(items) {
  const lines = [];
  let current = [];
  let lastY = null;
  const sorted = items
    .filter((item) => String(item.str || "").trim())
    .sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 2) return yDiff;
      return a.transform[4] - b.transform[4];
    });

  sorted.forEach((item) => {
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 7) {
      lines.push(current.join(""));
      current = [];
    }
    current.push(String(item.str || "").trim());
    lastY = y;
  });
  if (current.length) lines.push(current.join(""));

  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function renderTextPage(pageIndex) {
  const page = await pdfDocument.getPage(pageIndex);
  const content = await page.getTextContent();
  const text = normalizeTextItems(content.items);
  const element = ensureTextPage();
  element.style.fontSize = `${textFontSize()}px`;
  element.innerHTML = "";

  if (!text) {
    element.innerHTML = `<p class="text-empty">本页未提取到文字排版层，建议点击“原版页面”以图像模式阅读。</p>`;
    return;
  }

  text.split(/\n{1,}/).forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    element.appendChild(p);
  });
}

function setReaderMode(nextMode) {
  textMode = nextMode;
  stage.classList.toggle("text-mode", textMode);
  stage.classList.toggle("zoomed", !textMode && !fitMode);
  currentCanvas.style.display = textMode ? "none" : "";
  nextCanvas.style.display = textMode ? "none" : "";
  if (textPage) textPage.hidden = !textMode;
  updateControls();
}

function basePageScale(baseViewport) {
  const isMobile = window.matchMedia("(max-width: 700px)").matches;
  const isPortraitPhone = isMobile && window.innerHeight > window.innerWidth * 1.2;
  const availableWidth = Math.max(240, stage.clientWidth - (isMobile ? 8 : 24));
  const availableHeight = Math.max(240, stage.clientHeight - (isMobile ? 8 : 24));
  const widthScale = availableWidth / baseViewport.width;
  const heightScale = availableHeight / baseViewport.height;
  return isPortraitPhone ? widthScale : Math.min(widthScale, heightScale);
}

async function renderPage(pageIndex, canvas) {
  const page = await pdfDocument.getPage(pageIndex);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = basePageScale(baseViewport) * zoomLevel;
  const viewport = page.getViewport({ scale });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const context = canvas.getContext("2d", { alpha: false });

  canvas.width = Math.floor(viewport.width * pixelRatio);
  canvas.height = Math.floor(viewport.height * pixelRatio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  stage.classList.toggle("zoomed", !fitMode && !textMode);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, viewport.width, viewport.height);

  await page.render({
    canvasContext: context,
    viewport,
    intent: "print"
  }).promise;
}

async function showPage(pageIndex, direction = 0) {
  if (!pdfDocument || turning || pageIndex < 1 || pageIndex > pdfDocument.numPages) return;
  turning = true;
  loading.classList.add("show");

  try {
    if (textMode) {
      await renderTextPage(pageIndex);
      currentPage = pageIndex;
      updateControls();
      return;
    }

    if (!direction) {
      await renderPage(pageIndex, currentCanvas);
      currentPage = pageIndex;
      updateControls();
      return;
    }

    await renderPage(pageIndex, nextCanvas);
    nextCanvas.className = `book-page next-page flip-in-${direction > 0 ? "next" : "prev"}`;
    currentCanvas.className = `book-page current-page flip-out-${direction > 0 ? "next" : "prev"}`;
    await new Promise((resolve) => setTimeout(resolve, 520));

    currentCanvas.className = "book-page next-page";
    nextCanvas.className = "book-page current-page";
    [currentCanvas, nextCanvas] = [nextCanvas, currentCanvas];
    currentPage = pageIndex;
    updateControls();
  } catch (error) {
    showError("经书页面加载失败，请检查文件是否存在。");
    console.error(error);
  } finally {
    loading.classList.remove("show");
    turning = false;
  }
}

function turnBy(offset) {
  showPage(currentPage + offset, offset);
}

prevButton.addEventListener("click", () => turnBy(-1));
nextButton.addEventListener("click", () => turnBy(1));
firstButton.addEventListener("click", () => showPage(1, currentPage > 1 ? -1 : 0));
lastButton.addEventListener("click", () => showPage(pdfDocument?.numPages || 1, currentPage < (pdfDocument?.numPages || 1) ? 1 : 0));
readModeButton.addEventListener("click", async () => {
  if (!pdfDocument || turning) return;
  setReaderMode(!textMode);
  await showPage(currentPage);
});

zoomOutButton.addEventListener("click", async () => {
  if (!pdfDocument || turning || textMode) return;
  fitMode = false;
  zoomLevel = Math.max(0.55, Number((zoomLevel - 0.15).toFixed(2)));
  await showPage(currentPage);
});

zoomInButton.addEventListener("click", async () => {
  if (!pdfDocument || turning || textMode) return;
  fitMode = false;
  zoomLevel = Math.min(2.15, Number((zoomLevel + 0.15).toFixed(2)));
  await showPage(currentPage);
});

fitPageButton.addEventListener("click", async () => {
  if (!pdfDocument || turning || textMode) return;
  fitMode = true;
  zoomLevel = 1;
  await showPage(currentPage);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "PageUp") turnBy(-1);
  if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") turnBy(1);
});

stage.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

stage.addEventListener("touchend", (event) => {
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
    turnBy(deltaX < 0 ? 1 : -1);
  }
}, { passive: true });

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => showPage(currentPage), 180);
});

// ==================== 护眼与夜间色彩模式 ====================
function initTheme() {
  const savedTheme = localStorage.getItem("buddhist_reader_theme") || "white";
  applyTheme(savedTheme);

  document.querySelectorAll("#themePicker .theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      localStorage.setItem("buddhist_reader_theme", theme);
    });
  });
}

function applyTheme(theme) {
  document.body.classList.remove("theme-white", "theme-sepia", "theme-dark");
  document.body.classList.add(`theme-${theme}`);
  document.querySelectorAll("#themePicker .theme-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
}

initTheme();

// ==================== 目录大纲抽屉 (TOC) ====================
const tocDrawer = document.querySelector("#tocDrawer");
const tocBackdrop = document.querySelector("#tocBackdrop");
const tocToggleBtn = document.querySelector("#tocToggleBtn");
const closeTocBtn = document.querySelector("#closeTocBtn");
const tocList = document.querySelector("#tocList");

function toggleToc(show) {
  if (!tocDrawer || !tocBackdrop) return;
  const willShow = typeof show === "boolean" ? show : tocDrawer.classList.contains("hidden");
  tocDrawer.classList.toggle("hidden", !willShow);
  tocBackdrop.classList.toggle("hidden", !willShow);
}

tocToggleBtn?.addEventListener("click", () => toggleToc(true));
closeTocBtn?.addEventListener("click", () => toggleToc(false));
tocBackdrop?.addEventListener("click", () => toggleToc(false));

async function renderOutline(outline, container) {
  if (!outline || !outline.length) {
    container.innerHTML = `<div class="toc-empty">此本经书未包含内置目录大纲</div>`;
    return;
  }

  container.innerHTML = "";
  const ul = document.createElement("ul");
  ul.className = "toc-tree";

  for (const item of outline) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.textContent = item.title;
    link.href = "#";

    link.addEventListener("click", async (e) => {
      e.preventDefault();
      toggleToc(false);
      try {
        let dest = item.dest;
        if (typeof dest === "string") {
          dest = await pdfDocument.getDestination(dest);
        }
        if (Array.isArray(dest)) {
          const pageRef = dest[0];
          const pageIndex = await pdfDocument.getPageIndex(pageRef);
          showPage(pageIndex + 1);
        }
      } catch (err) {
        console.warn("目录跳转失败:", err);
      }
    });

    li.appendChild(link);
    if (item.items && item.items.length) {
      const subUl = document.createElement("ul");
      await renderOutline(item.items, subUl);
      li.appendChild(subUl);
    }
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

// ==================== 全屏沉浸阅读 ====================
const fullscreenBtn = document.querySelector("#fullscreenBtn");
if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      fullscreenBtn.textContent = "✕";
    } else {
      document.exitFullscreen().catch(() => {});
      fullscreenBtn.textContent = "⛶";
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      fullscreenBtn.textContent = "⛶";
    }
  });
}

// ==================== 加载 PDF 与阅读进度记忆 ====================
async function loadPdf() {
  if (!safeFile) {
    showError("未找到合法的经书文件链接");
    return;
  }

  try {
    loading.classList.add("show");
    const task = pdfjsLib.getDocument({
      url: safeFile,
      disableRange: false,
      disableStream: false,
      cMapUrl: "/vendor/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/vendor/pdfjs/standard_fonts/"
    });
    pdfDocument = await task.promise;
    pageCount.textContent = String(pdfDocument.numPages);

    // 尝试解析经书大纲目录
    try {
      const outline = await pdfDocument.getOutline();
      if (tocList) renderOutline(outline, tocList);
    } catch (e) {
      if (tocList) tocList.innerHTML = `<div class="toc-empty">此经书无目录大纲</div>`;
    }

    // 检测是否有上次阅读记录
    let targetPage = 1;
    const lastPageKey = `buddhist_read_prog_${encodeURIComponent(safeFile)}`;
    const savedPage = parseInt(localStorage.getItem(lastPageKey) || "1", 10);

    if (savedPage > 1 && savedPage <= pdfDocument.numPages) {
      const toast = document.querySelector("#resumeToast");
      const pageNumEl = document.querySelector("#resumePageNum");
      const goBtn = document.querySelector("#resumeGoBtn");
      const dismissBtn = document.querySelector("#resumeDismissBtn");

      if (toast && pageNumEl) {
        pageNumEl.textContent = String(savedPage);
        toast.classList.remove("hidden");

        goBtn?.addEventListener("click", () => {
          toast.classList.add("hidden");
          showPage(savedPage);
        });

        dismissBtn?.addEventListener("click", () => {
          toast.classList.add("hidden");
        });

        // 5秒后自动淡出提示
        setTimeout(() => toast.classList.add("hidden"), 6000);
      }
    }

    await showPage(targetPage);
  } catch (error) {
    showError("经书加载失败，请检查文件是否存在。");
    console.error(error);
  } finally {
    loading.classList.remove("show");
  }
}

loadPdf();
