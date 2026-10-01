(() => {
  "use strict";

  const STORAGE_KEY = "qidian-bookmarks-v1";
  const PAGE_SIZE = 180;
  const EXTENSION_MODE = location.protocol === "chrome-extension:";
  const $ = (selector) => document.querySelector(selector);
  const refs = {
    tabs: $("#tabs"), content: $("#content"), count: $("#countLine"), footerCount: $("#footerCount"),
    banner: $("#demoBanner"), search: $("#searchInput"), file: $("#fileInput"),
    dialog: $("#bookmarkDialog"), form: $("#bookmarkForm"), error: $("#formError"),
    title: $("#titleField"), url: $("#urlField"), category: $("#categoryField"),
    group: $("#groupField"), favorite: $("#favoriteField"), delete: $("#deleteButton"),
    toast: $("#toast"), exportButton: $("#exportButton"), exportMenu: $("#exportMenu"),
    themeToggle: $("#themeToggle"), syncBadge: $("#syncBadge"), syncBadgeText: $("#syncBadgeText"),
    actionsButton: $("#actionsButton"), actionsMenu: $("#actionsMenu"), contextMenu: $("#contextMenu"),
    tooltip: $("#bookmarkTooltip"), moveDialog: $("#moveDialog"), moveForm: $("#moveForm"),
    moveTarget: $("#moveTarget"), newGroup: $("#newGroupName"), auditDialog: $("#auditDialog"),
    auditSummary: $("#auditSummary"), auditResults: $("#auditResults"), mergeButton: $("#mergeDuplicatesButton")
  };

  const samples = [
    ["Claude", "https://claude.ai", "Agent", "聊天与创作"],
    ["ChatGPT", "https://chatgpt.com", "Agent", "聊天与创作"],
    ["Gemini", "https://gemini.google.com", "Agent", "聊天与创作"],
    ["Grok", "https://grok.com", "Agent", "聊天与创作"],
    ["Perplexity", "https://www.perplexity.ai", "Agent", "聊天与创作"],
    ["NotebookLM", "https://notebooklm.google.com", "Agent", "聊天与创作"],
    ["Cursor", "https://cursor.com", "Agent", "编码助手"],
    ["GitHub Copilot", "https://github.com/features/copilot", "Agent", "编码助手"],
    ["Windsurf", "https://windsurf.com", "Agent", "编码助手"],
    ["OpenAI", "https://platform.openai.com", "Agent", "模型平台"],
    ["Anthropic", "https://console.anthropic.com", "Agent", "模型平台"],
    ["Google AI Studio", "https://aistudio.google.com", "Agent", "模型平台"],
    ["Hugging Face", "https://huggingface.co", "Agent", "模型平台"],
    ["OpenRouter", "https://openrouter.ai", "Agent", "模型平台"],
    ["Ollama", "https://ollama.com", "Agent", "模型平台"],
    ["GitHub", "https://github.com", "开发", "代码与协作"],
    ["GitLab", "https://gitlab.com", "开发", "代码与协作"],
    ["Stack Overflow", "https://stackoverflow.com", "开发", "代码与协作"],
    ["Vercel", "https://vercel.com", "开发", "部署与云服务"],
    ["Cloudflare", "https://cloudflare.com", "开发", "部署与云服务"],
    ["Supabase", "https://supabase.com", "开发", "部署与云服务"],
    ["Figma", "https://figma.com", "设计", "设计工具"],
    ["Iconify", "https://iconify.design", "设计", "设计工具"],
    ["Coolors", "https://coolors.co", "设计", "设计工具"],
    ["Dribbble", "https://dribbble.com", "设计", "灵感收藏"],
    ["Awwwards", "https://awwwards.com", "设计", "灵感收藏"],
    ["Unsplash", "https://unsplash.com", "设计", "灵感收藏"]
  ].map(([title, url, category, group], index) => ({
    id: `sample-${index}`, title, url, category, group, path: [category, group], favorite: index < 3, icon: ""
  }));

  const saved = loadState();
  const chromeFavorites = new Set(saved?.chromeFavorites || []);
  const state = {
    mode: EXTENSION_MODE || saved ? "personal" : "demo",
    items: saved ? saved.items : (EXTENSION_MODE ? [] : samples),
    activeTab: EXTENSION_MODE || saved ? "all" : "cat:Agent",
    query: "",
    limit: PAGE_SIZE,
    editingId: null,
    chromeSyncStatus: EXTENSION_MODE ? "loading" : "none",
    keyboardIndex: -1,
    contextItemId: null,
    movingId: null
  };
  let toastTimer;
  let chromeFolders = new Map();
  const pinyinCollator = new Intl.Collator("zh-u-co-pinyin");
  const pinyinAnchors = [..."阿八擦搭蛾发噶哈击喀垃妈拿哦啪七然仨塌挖夕压匝"];
  const pinyinLetters = [..."ABCDEFGHJKLMNOPQRSTWXYZ"];

  function id() {
    return globalThis.crypto?.randomUUID?.() || `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.items)) return null;
      return {
        items: parsed.items.filter((item) => item?.source !== "chrome").map(sanitizeItem).filter(Boolean),
        chromeFavorites: Array.isArray(parsed.chromeFavorites) ? parsed.chromeFavorites.filter((value) => typeof value === "string") : []
      };
    } catch { return null; }
  }

  function sanitizeItem(value) {
    if (!value || typeof value !== "object") return null;
    const url = safeUrl(value.url);
    if (!url) return null;
    const category = String(value.category || "未分类").trim().slice(0, 50) || "未分类";
    const group = String(value.group || "常用书签").trim().slice(0, 100) || "常用书签";
    const path = Array.isArray(value.path) && value.path.length
      ? value.path.map((part) => String(part).trim()).filter(Boolean).slice(0, 12)
      : [category, ...group.split(" / ").filter(Boolean)];
    return {
      id: String(value.id || id()), title: String(value.title || hostOf(url) || url).trim().slice(0, 512),
      url, category, group, path, favorite: Boolean(value.favorite),
      icon: validIcon(value.icon) ? value.icon : "", source: "local"
    };
  }

  function persist() {
    if (state.mode === "demo") return true;
    const localItems = state.items.filter((item) => item.source !== "chrome");
    const payload = (items) => JSON.stringify({ version: 2, items, chromeFavorites: [...chromeFavorites] });
    try {
      localStorage.setItem(STORAGE_KEY, payload(localItems));
      return true;
    } catch {
      const withoutIcons = localItems.map((item) => ({ ...item, icon: "" }));
      try {
        localStorage.setItem(STORAGE_KEY, payload(withoutIcons));
        state.items = [...state.items.filter((item) => item.source === "chrome"), ...withoutIcons];
        toast("书签已保存；因空间限制，部分图标没有保存。");
        return true;
      } catch { return false; }
    }
  }

  function safeUrl(input) {
    if (typeof input !== "string") return "";
    let value = input.trim();
    if (!value) return "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
    try {
      const url = new URL(value);
      return ["http:", "https:", "mailto:", "file:", "chrome:", "edge:", "about:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function validIcon(value) {
    return typeof value === "string" && value.length < 12000 && /^data:image\/(png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon);base64,/i.test(value);
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  }

  function fallbackColors(title) {
    const palette = [
      ["#eeeaff", "#7754c9"], ["#e5f4ee", "#398a69"], ["#fff0e8", "#c77c51"],
      ["#e8f0ff", "#4e76be"], ["#fff0f3", "#bf6380"], ["#e9eef0", "#657a87"]
    ];
    let number = 0;
    for (const char of title) number = (number * 31 + char.charCodeAt(0)) >>> 0;
    return palette[number % palette.length];
  }

  function iconSources(item) {
    const sources = [];
    try {
      const url = new URL(item.url);
      if (["http:", "https:"].includes(url.protocol)) {
        if (EXTENSION_MODE) {
          const chromeIcon = new URL(chrome.runtime.getURL("/_favicon/"));
          chromeIcon.searchParams.set("pageUrl", item.url);
          chromeIcon.searchParams.set("size", "64");
          sources.push(chromeIcon.href);
        } else sources.push(`/api/icon?url=${encodeURIComponent(item.url)}`);
        if (item.icon) sources.push(item.icon);
        sources.push(`${url.origin}/favicon.ico`);
      } else if (item.icon) sources.push(item.icon);
    } catch { /* use a letter icon */ }
    return sources;
  }

  function syncThemeButton() {
    const dark = document.documentElement.dataset.theme === "dark";
    const label = dark ? "切换浅色模式" : "切换暗黑模式";
    refs.themeToggle.setAttribute("aria-label", label);
    refs.themeToggle.title = label;
    $("meta[name='theme-color']").content = dark ? "#111725" : "#f6f7fb";
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("qidian-theme-v1", next); } catch { /* theme still works for this visit */ }
    syncThemeButton();
  }

  function toast(message, isError = false) {
    clearTimeout(toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.toggle("error", isError);
    refs.toast.classList.add("show");
    toastTimer = setTimeout(() => refs.toast.classList.remove("show"), 3200);
  }

  function activatePersonal() {
    if (state.mode !== "demo") return;
    state.mode = "personal";
    state.items = [];
    state.activeTab = "all";
  }

  function categories() {
    return [...new Set(state.items.map((item) => item.category))];
  }

  const initialsCache = new Map();
  function pinyinInitials(title) {
    if (initialsCache.has(title)) return initialsCache.get(title);
    const result = [...title].map((character) => {
      if (/[a-z0-9]/i.test(character)) return character.toUpperCase();
      if (!/\p{Script=Han}/u.test(character)) return "";
      let index = 0;
      for (let i = 0; i < pinyinAnchors.length; i++) {
        if (pinyinCollator.compare(character, pinyinAnchors[i]) >= 0) index = i;
        else break;
      }
      return pinyinLetters[index] || "";
    }).join("");
    initialsCache.set(title, result);
    return result;
  }

  function renderTabs() {
    refs.tabs.replaceChildren();
    const definitions = [["all", "全部"], ...categories().map((category) => [`cat:${category}`, category]), ["favorites", "收藏"]];
    for (const [value, label] of definitions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tab";
      button.textContent = label;
      if (state.activeTab === value) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => {
        state.activeTab = value;
        state.query = "";
        state.limit = PAGE_SIZE;
        refs.search.value = "";
        render();
      });
      refs.tabs.append(button);
    }
  }

  function filteredItems() {
    const query = state.query.trim().toLocaleLowerCase();
    const compactQuery = query.replace(/\s+/g, "").toUpperCase();
    return state.items.filter((item) => {
      const inTab = query || state.activeTab === "all"
        || (state.activeTab === "favorites" ? item.favorite : item.category === state.activeTab.slice(4));
      if (!inTab) return false;
      return !query || [item.title, item.url, item.category, item.group].some((part) => part.toLocaleLowerCase().includes(query))
        || pinyinInitials(item.title).includes(compactQuery);
    });
  }

  function render() {
    state.keyboardIndex = -1;
    hideBookmarkTooltip();
    if (state.activeTab.startsWith("cat:") && !categories().includes(state.activeTab.slice(4))) state.activeTab = "all";
    renderTabs();
    refs.banner.hidden = state.mode !== "demo";
    const chromeCount = state.items.filter((item) => item.source === "chrome").length;
    const localCount = state.items.length - chromeCount;
    document.documentElement.dataset.mixedSources = String(chromeCount > 0 && localCount > 0);
    if (EXTENSION_MODE) {
      refs.syncBadge.dataset.status = state.chromeSyncStatus;
      refs.syncBadgeText.textContent = state.chromeSyncStatus === "ready" ? "Chrome 已同步" : state.chromeSyncStatus === "error" ? "Chrome 同步失败" : "正在同步 Chrome";
      refs.count.textContent = state.chromeSyncStatus === "error"
        ? `Chrome 书签读取失败 · 本地 ${localCount} 个书签`
        : `Chrome ${chromeCount} 个 · 本地 ${localCount} 个 · 在 Chrome 中修改后自动更新`;
    } else refs.count.textContent = state.mode === "demo" ? "一个安静、好找的私人网址空间" : `已收纳 ${state.items.length} 个书签 · 数据保存在当前浏览器`;
    refs.footerCount.textContent = `${state.items.length} 个书签`;
    const filtered = filteredItems();
    refs.content.replaceChildren();
    if (!filtered.length) {
      renderEmpty();
      return;
    }
    const visible = filtered.slice(0, state.limit);
    const sections = new Map();
    for (const item of visible) {
      const key = `${item.category}\u0000${item.group}`;
      if (!sections.has(key)) sections.set(key, { category: item.category, group: item.group, items: [] });
      sections.get(key).items.push(item);
    }
    for (const section of sections.values()) refs.content.append(buildSection(section));
    if (filtered.length > visible.length) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "load-more";
      button.textContent = `继续显示 · 还有 ${filtered.length - visible.length} 个`;
      button.addEventListener("click", () => { state.limit += PAGE_SIZE; render(); });
      refs.content.append(button);
    }
  }

  function buildSection(section) {
    const element = document.createElement("section");
    element.className = "section";
    const header = document.createElement("div");
    header.className = "section-header";
    const heading = document.createElement("h2");
    heading.textContent = state.activeTab.startsWith("cat:") && !state.query ? section.group : `${section.category} · ${section.group}`;
    const note = document.createElement("span");
    note.className = "section-note";
    note.textContent = `${section.items.length} 个链接`;
    const openAll = document.createElement("button");
    openAll.type = "button";
    openAll.className = "section-open";
    openAll.textContent = "打开本组全部";
    openAll.title = `在新标签页打开本组 ${section.items.length} 个书签`;
    openAll.addEventListener("click", async () => {
      if (section.items.length > 12 && !confirm(`将在新标签页打开本组 ${section.items.length} 个书签，继续吗？`)) return;
      let opened = 0;
      for (const item of section.items) {
        try {
          if (EXTENSION_MODE) await chrome.tabs.create({ url: item.url, active: false });
          else window.open(item.url, "_blank", "noopener,noreferrer");
          opened++;
        } catch { /* unsupported browser-internal URLs stay closed */ }
      }
      toast(`已打开 ${opened} 个书签`);
    });
    header.append(heading, note, openAll);
    const grid = document.createElement("div");
    grid.className = "bookmark-grid";
    for (const item of section.items) grid.append(buildBookmark(item));
    element.append(header, grid);
    return element;
  }

  function buildBookmark(item) {
    const row = document.createElement("div");
    row.className = "bookmark";
    row.dataset.bookmarkId = item.id;
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showContextMenu(item, event.clientX, event.clientY);
    });
    const link = document.createElement("a");
    link.className = "bookmark-link";
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `${item.title}，${item.url}`);
    link.addEventListener("mouseenter", () => showBookmarkTooltip(item, link));
    link.addEventListener("mouseleave", hideBookmarkTooltip);
    link.addEventListener("focus", () => showBookmarkTooltip(item, link));
    link.addEventListener("blur", hideBookmarkTooltip);
    const icon = document.createElement("span");
    icon.className = "bookmark-icon";
    const [background, foreground] = fallbackColors(item.title);
    icon.style.setProperty("--icon-bg", background);
    icon.style.setProperty("--icon-fg", foreground);
    const first = [...item.title][0] || "◆";
    icon.textContent = first;
    const sources = iconSources(item);
    if (sources.length) {
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.style.opacity = "0";
      let index = 0;
      image.addEventListener("error", () => {
        if (index < sources.length) image.src = sources[index++];
        else image.remove();
      });
      image.addEventListener("load", () => {
        icon.textContent = "";
        image.style.opacity = "1";
        icon.append(image);
      }, { once: true });
      icon.append(image);
      image.src = sources[index++];
    }
    const title = document.createElement("span");
    title.className = "bookmark-title";
    title.textContent = item.title;
    link.append(icon, title);
    const source = document.createElement("span");
    source.className = "bookmark-source";
    source.textContent = item.source === "chrome" ? "Chrome" : "本地";
    link.append(source);
    const actions = document.createElement("span");
    actions.className = `bookmark-actions${item.favorite ? " favorite-always" : ""}`;
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = `mini-button${item.favorite ? " is-favorite" : ""}`;
    favorite.textContent = item.favorite ? "★" : "☆";
    favorite.setAttribute("aria-label", item.favorite ? `取消收藏 ${item.title}` : `收藏 ${item.title}`);
    favorite.addEventListener("click", () => {
      const target = state.items.find((entry) => entry.id === item.id);
      if (target) {
        target.favorite = !target.favorite;
        if (target.source === "chrome") {
          if (target.favorite) chromeFavorites.add(target.chromeId);
          else chromeFavorites.delete(target.chromeId);
        }
        if (!persist()) {
          target.favorite = !target.favorite;
          if (target.source === "chrome") {
            if (target.favorite) chromeFavorites.add(target.chromeId);
            else chromeFavorites.delete(target.chromeId);
          }
          toast("收藏未保存：浏览器存储空间不足。", true);
        }
        render();
      }
    });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "mini-button";
    edit.textContent = "⋯";
    edit.setAttribute("aria-label", `更多操作：${item.title}`);
    edit.title = "更多操作";
    edit.addEventListener("click", (event) => {
      const box = edit.getBoundingClientRect();
      showContextMenu(item, box.right, box.bottom);
      event.stopPropagation();
    });
    actions.append(favorite, edit);
    row.append(link, actions);
    return row;
  }

  function renderEmpty() {
    const wrap = document.createElement("div");
    wrap.className = "empty-state";
    const symbol = document.createElement("div");
    symbol.className = "empty-icon";
    symbol.textContent = "⌑";
    const heading = document.createElement("h2");
    const paragraph = document.createElement("p");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-primary";
    if (state.query) {
      heading.textContent = "没有找到匹配的书签";
      paragraph.textContent = "换个关键词试试，或清空搜索。";
      button.textContent = "清空搜索";
      button.addEventListener("click", () => { refs.search.value = ""; state.query = ""; render(); });
    } else if (state.activeTab === "favorites") {
      heading.textContent = "还没有收藏";
      paragraph.textContent = "点击书签旁的星标，常用网址就会出现在这里。";
      button.textContent = "浏览全部";
      button.addEventListener("click", () => { state.activeTab = "all"; render(); });
    } else if (EXTENSION_MODE && state.chromeSyncStatus === "loading") {
      heading.textContent = "正在读取 Chrome 书签";
      paragraph.textContent = "首次打开可能需要一点时间。";
      button.textContent = "添加本地书签";
      button.addEventListener("click", () => openDialog());
    } else if (EXTENSION_MODE && state.chromeSyncStatus === "error") {
      heading.textContent = "Chrome 书签暂时无法读取";
      paragraph.textContent = "请检查扩展的书签权限，然后重试。你的本地书签仍然保留。";
      button.textContent = "重新同步";
      button.addEventListener("click", syncChromeBookmarks);
    } else {
      heading.textContent = "从这里开始收纳";
      paragraph.textContent = EXTENSION_MODE ? "Chrome 中还没有可展示的书签。你也可以在这里添加本地书签。" : "导入浏览器导出的 HTML 文件，或手动添加第一个书签。";
      button.textContent = EXTENSION_MODE ? "添加本地书签" : "导入书签";
      button.addEventListener("click", EXTENSION_MODE ? () => openDialog() : chooseFile);
    }
    wrap.append(symbol, heading, paragraph, button);
    refs.content.append(wrap);
  }

  function updateSuggestions() {
    const list = $("#categorySuggestions");
    list.replaceChildren(...categories().map((category) => {
      const option = document.createElement("option");
      option.value = category;
      return option;
    }));
  }

  function openDialog(item = null) {
    state.editingId = item?.id || null;
    $("#dialogTitle").textContent = item ? "编辑书签" : "添加书签";
    refs.title.value = item?.title || "";
    refs.url.value = item?.url || "";
    refs.category.value = item?.category || (state.activeTab.startsWith("cat:") ? state.activeTab.slice(4) : "");
    refs.group.value = item?.group || "";
    refs.favorite.checked = Boolean(item?.favorite);
    refs.delete.hidden = !item || state.mode === "demo";
    const chromeItem = item?.source === "chrome";
    refs.category.disabled = chromeItem;
    refs.group.disabled = chromeItem;
    $("#chromeEditHint").hidden = !chromeItem;
    refs.error.hidden = true;
    updateSuggestions();
    refs.dialog.showModal();
    refs.title.focus();
  }

  function closeDialog() { refs.dialog.close(); state.editingId = null; }

  async function saveForm(event) {
    event.preventDefault();
    const title = refs.title.value.trim();
    const url = safeUrl(refs.url.value);
    if (!title || !url) {
      refs.error.textContent = !title ? "请填写书签名称。" : "请输入有效的网址。";
      refs.error.hidden = false;
      return;
    }
    const category = refs.category.value.trim() || "未分类";
    const group = refs.group.value.trim() || "常用书签";
    const previousMode = state.mode;
    const previousItems = state.items.map((item) => ({ ...item }));
    if (state.mode === "demo") activatePersonal();
    const existing = state.items.find((item) => item.id === state.editingId);
    if (existing?.source === "chrome") {
      try {
        await chrome.bookmarks.update(existing.chromeId, { title: title.slice(0, 512), url });
        if (refs.favorite.checked) chromeFavorites.add(existing.chromeId);
        else chromeFavorites.delete(existing.chromeId);
        persist();
        closeDialog();
        await syncChromeBookmarks();
        toast("Chrome 书签已更新");
      } catch (error) {
        refs.error.textContent = `更新失败：${error.message}`;
        refs.error.hidden = false;
      }
      return;
    }
    const next = {
      id: existing?.id || id(), title: title.slice(0, 512), url,
      category: category.slice(0, 50), group: group.slice(0, 100),
      path: [category, ...group.split(" / ").map((part) => part.trim()).filter(Boolean)],
      favorite: refs.favorite.checked,
      icon: existing?.url === url ? existing.icon : "", source: "local"
    };
    if (existing) Object.assign(existing, next);
    else state.items.push(next);
    state.activeTab = `cat:${next.category}`;
    state.query = "";
    refs.search.value = "";
    if (!persist()) {
      state.mode = previousMode;
      state.items = previousItems;
      refs.error.textContent = "浏览器存储空间不足，未能保存。请先导出备份并清理部分书签。";
      refs.error.hidden = false;
      return;
    }
    closeDialog();
    render();
    toast(existing ? "书签已更新" : "书签已添加");
  }

  async function deleteCurrent() {
    const item = state.items.find((entry) => entry.id === state.editingId);
    if (!item || !confirm(`删除“${item.title}”？`)) return;
    if (item.source === "chrome") {
      try {
        await chrome.bookmarks.remove(item.chromeId);
        chromeFavorites.delete(item.chromeId);
        persist();
        closeDialog();
        await syncChromeBookmarks();
        toast("Chrome 书签已删除");
      } catch (error) { toast(`删除失败：${error.message}`, true); }
      return;
    }
    const previousItems = state.items;
    state.items = state.items.filter((entry) => entry.id !== item.id);
    if (!persist()) { state.items = previousItems; toast("删除未保存：浏览器存储空间不足。", true); return; }
    closeDialog();
    render();
    toast("书签已删除");
  }

  function chooseFile() { refs.file.value = ""; refs.file.click(); }

  function parseHtmlBookmarks(source) {
    const doc = new DOMParser().parseFromString(source, "text/html");
    const root = doc.querySelector("dl");
    if (!root) return [];
    const results = [];
    let iconBudget = 500000;
    const direct = (element, tag) => [...element.children].find((child) => child.tagName === tag);
    const addAnchor = (anchor, path) => {
      const url = safeUrl(anchor.getAttribute("href"));
      if (!url) return;
      const folder = path.filter(Boolean);
      const category = folder[0] || "未分类";
      const group = folder.length > 1 ? folder.slice(1).join(" / ") : "常用书签";
      const possibleIcon = anchor.getAttribute("icon") || "";
      const icon = validIcon(possibleIcon) && possibleIcon.length <= iconBudget ? possibleIcon : "";
      iconBudget -= icon.length;
      results.push({ id: id(), title: (anchor.textContent.trim() || hostOf(url) || url).slice(0, 512), url,
        category: category.slice(0, 50), group: group.slice(0, 100), path: folder.length ? folder : [category], favorite: false, icon });
    };
    const walk = (container, path) => {
      let nextFolder = null;
      for (const child of container.children) {
        if (child.tagName === "DT") {
          const anchor = direct(child, "A");
          if (anchor) addAnchor(anchor, path);
          const heading = direct(child, "H3");
          const nested = direct(child, "DL");
          if (heading) {
            nextFolder = heading.textContent.trim();
            if (nested) { walk(nested, [...path, nextFolder]); nextFolder = null; }
          } else if (nested) walk(nested, path);
        } else if (child.tagName === "DL") {
          walk(child, nextFolder ? [...path, nextFolder] : path);
          nextFolder = null;
        } else if (child.tagName === "A") addAnchor(child, path);
        else if (child.tagName === "H3") nextFolder = child.textContent.trim();
        else if (child.children.length) walk(child, path);
      }
    };
    walk(root, []);
    return results;
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const isJson = file.name.toLowerCase().endsWith(".json");
      let items;
      if (isJson) {
        const parsed = JSON.parse(text);
        const raw = Array.isArray(parsed) ? parsed : parsed.items;
        if (!Array.isArray(raw)) throw new Error("JSON 文件里没有书签列表");
        items = raw.filter((item) => !EXTENSION_MODE || item?.source !== "chrome").map(sanitizeItem).filter(Boolean);
      } else items = parseHtmlBookmarks(text);
      if (!items.length) throw new Error(EXTENSION_MODE && isJson ? "文件中的 Chrome 书签已自动同步，没有需要导入的本地书签" : "没有找到可导入的书签");
      const chromeItems = state.items.filter((item) => item.source === "chrome");
      const localCount = state.items.length - chromeItems.length;
      if (state.mode === "personal" && localCount && !confirm(`将当前 ${localCount} 个本地书签替换为文件中的 ${items.length} 个书签？建议先导出备份。`)) return;
      const previousMode = state.mode;
      const previousItems = state.items;
      state.mode = "personal";
      state.items = [...chromeItems, ...items];
      state.activeTab = "all";
      state.query = "";
      state.limit = PAGE_SIZE;
      refs.search.value = "";
      if (!persist()) {
        state.mode = previousMode;
        state.items = previousItems;
        throw new Error("浏览器存储空间不足，请缩小文件或清理浏览器数据");
      }
      render();
      toast(`已导入 ${items.length} 个本地书签`);
    } catch (error) { toast(`导入失败：${error.message}`, true); }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
  }

  function exportHtml() {
    const tree = { links: [], children: new Map() };
    for (const item of state.items) {
      let node = tree;
      const path = item.path?.length ? item.path : [item.category, ...item.group.split(" / ")];
      for (const part of path) {
        if (!node.children.has(part)) node.children.set(part, { links: [], children: new Map() });
        node = node.children.get(part);
      }
      node.links.push(item);
    }
    const lines = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>栖点书签</TITLE>', '<H1>栖点书签</H1>', '<DL><p>'];
    const writeNode = (node, depth) => {
      const indent = "    ".repeat(depth);
      for (const item of node.links) lines.push(`${indent}<DT><A HREF="${escapeHtml(item.url)}"${item.icon ? ` ICON="${escapeHtml(item.icon)}"` : ""}>${escapeHtml(item.title)}</A>`);
      for (const [name, child] of node.children) {
        lines.push(`${indent}<DT><H3>${escapeHtml(name)}</H3>`, `${indent}<DL><p>`);
        writeNode(child, depth + 1);
        lines.push(`${indent}</DL><p>`);
      }
    };
    writeNode(tree, 1);
    lines.push('</DL><p>');
    download("栖点书签.html", new Blob([lines.join("\n")], { type: "text/html;charset=utf-8" }));
  }

  function exportJson() {
    const payload = { version: 1, exportedAt: new Date().toISOString(), items: state.items };
    download("栖点书签.json", new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  }

  function download(name, blob) {
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    toast("文件已导出");
  }

  function flattenChromeTree(nodes) {
    const items = [];
    chromeFolders = new Map();
    const walk = (node, folders) => {
      if (node.url) {
        const url = safeUrl(node.url);
        if (!url) return;
        const path = folders.length ? folders.slice(0, 12) : ["未分类"];
        const category = path[0].slice(0, 50) || "未分类";
        const group = path.length > 1 ? path.slice(1).join(" / ").slice(0, 100) : "常用书签";
        const chromeId = String(node.id);
        items.push({
          id: `chrome-${chromeId}`, chromeId, source: "chrome",
          title: String(node.title || hostOf(url) || url).trim().slice(0, 512),
          url, category, group, path, favorite: chromeFavorites.has(chromeId), icon: "",
          parentId: node.parentId, dateAdded: node.dateAdded || 0
        });
        return;
      }
      const nextFolders = node.parentId === undefined ? folders : [...folders, String(node.title || "未分类").trim() || "未分类"];
      if (node.parentId !== undefined) chromeFolders.set(String(node.id), {
        id: String(node.id), parentId: String(node.parentId), title: String(node.title || "未分类"),
        path: nextFolders, unmodifiable: Boolean(node.unmodifiable)
      });
      for (const child of node.children || []) walk(child, nextFolders);
    };
    for (const node of nodes) walk(node, []);
    return items;
  }

  let chromeSyncTimer;
  let chromeSyncRequest = 0;

  async function syncChromeBookmarks() {
    const request = ++chromeSyncRequest;
    try {
      const tree = await chrome.bookmarks.getTree();
      if (request !== chromeSyncRequest) return;
      state.items = [...flattenChromeTree(tree), ...state.items.filter((item) => item.source !== "chrome")];
      state.chromeSyncStatus = "ready";
      render();
    } catch (error) {
      if (request !== chromeSyncRequest) return;
      state.chromeSyncStatus = "error";
      render();
      console.error("Chrome 书签同步失败", error);
    }
  }

  function scheduleChromeSync() {
    clearTimeout(chromeSyncTimer);
    chromeSyncTimer = setTimeout(syncChromeBookmarks, 120);
  }

  function startChromeSync() {
    if (!chrome?.bookmarks?.getTree) {
      state.chromeSyncStatus = "error";
      render();
      return;
    }
    for (const name of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered", "onImportEnded"]) {
      chrome.bookmarks[name]?.addListener(scheduleChromeSync);
    }
    window.addEventListener("focus", scheduleChromeSync);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scheduleChromeSync();
    });
    syncChromeBookmarks();
  }

  function hideBookmarkTooltip() { refs.tooltip.hidden = true; }

  function showBookmarkTooltip(item, anchor) {
    if (!anchor.isConnected || !refs.contextMenu.hidden) return;
    refs.tooltip.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = item.title;
    const url = document.createElement("small");
    url.textContent = item.url;
    refs.tooltip.append(title, url);
    refs.tooltip.hidden = false;
    const box = anchor.getBoundingClientRect();
    const width = refs.tooltip.offsetWidth;
    const height = refs.tooltip.offsetHeight;
    refs.tooltip.style.left = `${Math.max(12, Math.min(box.left, innerWidth - width - 12))}px`;
    refs.tooltip.style.top = `${box.bottom + height + 8 < innerHeight ? box.bottom + 6 : box.top - height - 6}px`;
  }

  function hideContextMenu() {
    refs.contextMenu.hidden = true;
    state.contextItemId = null;
  }

  function showContextMenu(item, x, y) {
    hideBookmarkTooltip();
    state.contextItemId = item.id;
    refs.contextMenu.hidden = false;
    refs.contextMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - refs.contextMenu.offsetWidth - 8))}px`;
    refs.contextMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - refs.contextMenu.offsetHeight - 8))}px`;
    refs.contextMenu.querySelector("button")?.focus();
  }

  function openMoveDialog(item) {
    state.movingId = item.id;
    refs.newGroup.value = "";
    refs.moveTarget.replaceChildren();
    if (item.source === "chrome") {
      for (const folder of chromeFolders.values()) {
        if (folder.unmodifiable) continue;
        refs.moveTarget.add(new Option(folder.path.join(" / "), folder.id, false, folder.id === item.parentId));
      }
    } else {
      const paths = new Map();
      for (const entry of state.items.filter((value) => value.source !== "chrome")) {
        const path = entry.path?.length ? entry.path : [entry.category, ...entry.group.split(" / ")];
        paths.set(JSON.stringify(path), path);
      }
      if (!paths.size) paths.set(JSON.stringify(["未分类"]), ["未分类"]);
      for (const [key, path] of paths) refs.moveTarget.add(new Option(path.join(" / "), key, false, key === JSON.stringify(item.path)));
    }
    refs.moveDialog.showModal();
    refs.moveTarget.focus();
  }

  async function moveBookmark(event) {
    event.preventDefault();
    const item = state.items.find((entry) => entry.id === state.movingId);
    if (!item) return;
    const newName = refs.newGroup.value.trim();
    try {
      if (item.source === "chrome") {
        let parentId = refs.moveTarget.value;
        if (!parentId) throw new Error("请选择目标分组");
        if (newName) {
          const folder = await chrome.bookmarks.create({ parentId, title: newName });
          parentId = folder.id;
        }
        if (parentId !== item.parentId) await chrome.bookmarks.move(item.chromeId, { parentId });
        await syncChromeBookmarks();
      } else {
        const previous = { path: [...item.path], category: item.category, group: item.group };
        const path = JSON.parse(refs.moveTarget.value);
        if (newName) path.push(newName);
        item.path = path.slice(0, 12);
        item.category = item.path[0] || "未分类";
        item.group = item.path.length > 1 ? item.path.slice(1).join(" / ") : "常用书签";
        if (!persist()) {
          Object.assign(item, previous);
          throw new Error("浏览器存储空间不足");
        }
        render();
      }
      refs.moveDialog.close();
      state.movingId = null;
      toast("书签已移动");
    } catch (error) { toast(`移动失败：${error.message}`, true); }
  }

  function duplicateGroups() {
    const byUrl = new Map();
    for (const item of state.items) {
      if (!byUrl.has(item.url)) byUrl.set(item.url, []);
      byUrl.get(item.url).push(item);
    }
    return [...byUrl.values()].filter((group) => group.length > 1);
  }

  function auditRow(item, detail = "") {
    const row = document.createElement("div");
    row.className = "audit-row";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.url;
    const note = document.createElement("small");
    note.textContent = detail;
    row.append(title, link, note);
    return row;
  }

  function showDuplicates() {
    const groups = duplicateGroups();
    $("#auditTitle").textContent = "重复书签";
    refs.auditSummary.textContent = groups.length
      ? `发现 ${groups.length} 组完整网址相同的书签，合计 ${groups.reduce((sum, group) => sum + group.length - 1, 0)} 个冗余项。`
      : `已检查 ${state.items.length} 个书签，没有发现完整网址相同的重复项。`;
    refs.auditResults.replaceChildren();
    for (const group of groups) {
      const row = auditRow(group[0], group.map((item) => `${item.source === "chrome" ? "Chrome" : "本地"} · ${item.path.join(" / ")}`).join("；"));
      refs.auditResults.append(row);
    }
    refs.mergeButton.hidden = groups.length === 0;
    refs.auditDialog.showModal();
  }

  async function mergeDuplicates() {
    const groups = duplicateGroups();
    const removeCount = groups.reduce((sum, group) => sum + group.length - 1, 0);
    if (!removeCount || !confirm(`将保留每组中的一个书签，删除 ${removeCount} 个完整网址重复项，并写回 Chrome。栖点会先导出 JSON 备份。继续吗？`)) return;
    exportJson();
    let removed = 0;
    let failed = 0;
    for (const group of groups) {
      const ordered = [...group].sort((a, b) => (a.source === "chrome" ? -1 : 1) - (b.source === "chrome" ? -1 : 1) || (a.dateAdded || 0) - (b.dateAdded || 0));
      for (const item of ordered.slice(1)) {
        try {
          if (item.source === "chrome") await chrome.bookmarks.remove(item.chromeId);
          else state.items = state.items.filter((entry) => entry.id !== item.id);
          removed++;
        } catch { failed++; }
      }
    }
    persist();
    if (EXTENSION_MODE) await syncChromeBookmarks();
    else render();
    refs.auditDialog.close();
    toast(`已合并 ${removed} 个重复项${failed ? `，${failed} 个失败` : ""}`, Boolean(failed));
  }

  async function checkOneLink(item) {
    if (!/^https?:/i.test(item.url)) return { item, kind: "skip", detail: "非网页链接" };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      let response = await fetch(item.url, { method: "HEAD", redirect: "follow", credentials: "omit", cache: "no-store", signal: controller.signal });
      if (response.status === 405 || response.status === 501 || response.status === 404 || response.status === 410) response = await fetch(item.url, { method: "GET", redirect: "follow", credentials: "omit", cache: "no-store", headers: { Range: "bytes=0-0" }, signal: controller.signal });
      response.body?.cancel();
      if (response.status === 404 || response.status === 410) return { item, kind: "dead", detail: `HTTP ${response.status}` };
      if (response.ok) return { item, kind: "ok", detail: `HTTP ${response.status}` };
      return { item, kind: "uncertain", detail: `HTTP ${response.status}` };
    } catch (error) { return { item, kind: "uncertain", detail: error.name === "AbortError" ? "连接超时" : "网络或权限限制" }; }
    finally { clearTimeout(timeout); }
  }

  async function checkDeadLinks() {
    $("#auditTitle").textContent = "失效链接检查";
    refs.mergeButton.hidden = true;
    refs.auditResults.replaceChildren();
    refs.auditSummary.textContent = "正在准备检查…";
    refs.auditDialog.showModal();
    if (!EXTENSION_MODE) {
      refs.auditSummary.textContent = "此功能需要在 Chrome 扩展页面使用。";
      return;
    }
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] }); }
    catch (error) { refs.auditSummary.textContent = `权限请求失败：${error.message}`; return; }
    if (!granted) {
      refs.auditSummary.textContent = "未取得网站访问权限，无法检查链接。可随时重试。";
      return;
    }
    const items = state.items.filter((item) => /^https?:/i.test(item.url));
    const results = [];
    let cursor = 0;
    let done = 0;
    async function worker() {
      while (cursor < items.length) {
        const item = items[cursor++];
        const result = await checkOneLink(item);
        results.push(result);
        done++;
        refs.auditSummary.textContent = `正在检查 ${done} / ${items.length} 个网址…`;
      }
    }
    await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
    const dead = results.filter((result) => result.kind === "dead");
    const uncertain = results.filter((result) => result.kind === "uncertain");
    refs.auditSummary.textContent = `检查 ${items.length} 个网址：明确返回 404/410 的 ${dead.length} 个，无法确认的 ${uncertain.length} 个。不会自动删除。`;
    for (const result of [...dead, ...uncertain]) refs.auditResults.append(auditRow(result.item, `${result.kind === "dead" ? "疑似失效" : "待复查"} · ${result.detail}`));
    if (!dead.length && !uncertain.length) refs.auditResults.textContent = "没有发现异常响应。";
  }

  if (EXTENSION_MODE) {
    $("#addButton").lastChild.textContent = " 添加本地书签";
    $("#importButton").textContent = "导入本地";
  }
  refs.actionsButton.addEventListener("click", () => {
    refs.actionsMenu.hidden = !refs.actionsMenu.hidden;
    refs.actionsButton.setAttribute("aria-expanded", String(!refs.actionsMenu.hidden));
  });
  $("#addButton").addEventListener("click", () => openDialog());
  refs.themeToggle.addEventListener("click", toggleTheme);
  $("#importButton").addEventListener("click", chooseFile);
  $("#demoImportButton").addEventListener("click", chooseFile);
  refs.file.addEventListener("change", importFile);
  refs.search.addEventListener("input", () => { state.query = refs.search.value; state.limit = PAGE_SIZE; render(); });
  refs.form.addEventListener("submit", saveForm);
  $("#closeDialogButton").addEventListener("click", closeDialog);
  $("#cancelDialogButton").addEventListener("click", closeDialog);
  refs.delete.addEventListener("click", deleteCurrent);
  refs.moveForm.addEventListener("submit", moveBookmark);
  $("#duplicateButton").addEventListener("click", () => { refs.actionsMenu.hidden = true; showDuplicates(); });
  $("#deadLinkButton").addEventListener("click", () => { refs.actionsMenu.hidden = true; checkDeadLinks(); });
  refs.mergeButton.addEventListener("click", mergeDuplicates);
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $("#" + button.dataset.closeDialog).close()));
  refs.contextMenu.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    const item = state.items.find((entry) => entry.id === state.contextItemId);
    hideContextMenu();
    if (!item || !action) return;
    if (action === "open") {
      if (EXTENSION_MODE) chrome.tabs.create({ url: item.url });
      else window.open(item.url, "_blank", "noopener,noreferrer");
    }
    if (action === "edit") openDialog(item);
    if (action === "move") openMoveDialog(item);
    if (action === "delete") { state.editingId = item.id; deleteCurrent(); }
  });
  refs.exportButton.addEventListener("click", () => {
    refs.exportMenu.hidden = !refs.exportMenu.hidden;
    refs.exportButton.setAttribute("aria-expanded", String(!refs.exportMenu.hidden));
  });
  refs.exportMenu.addEventListener("click", (event) => {
    const type = event.target.closest("[data-export]")?.dataset.export;
    if (type === "html") exportHtml();
    if (type === "json") exportJson();
    refs.exportMenu.hidden = true;
    refs.exportButton.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".actions-wrap")) {
      refs.exportMenu.hidden = true;
      refs.exportButton.setAttribute("aria-expanded", "false");
      refs.actionsMenu.hidden = true;
      refs.actionsButton.setAttribute("aria-expanded", "false");
    }
    if (!event.target.closest("#contextMenu") && !event.target.closest(".bookmark-actions")) hideContextMenu();
  });
  window.addEventListener("scroll", () => { hideContextMenu(); hideBookmarkTooltip(); }, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { hideContextMenu(); hideBookmarkTooltip(); return; }
    if (refs.dialog.open || refs.moveDialog.open || refs.auditDialog.open || $("#appearanceDialog").open || !refs.contextMenu.hidden || !refs.actionsMenu.hidden) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "/") {
      event.preventDefault(); refs.search.focus();
    }
    if (event.key === "j" || event.key === "k") {
      const rows = [...document.querySelectorAll(".bookmark")];
      if (!rows.length) return;
      event.preventDefault();
      state.keyboardIndex = Math.max(0, Math.min(rows.length - 1, state.keyboardIndex + (event.key === "j" ? 1 : -1)));
      rows.forEach((row, index) => row.classList.toggle("is-keyboard-current", index === state.keyboardIndex));
      rows[state.keyboardIndex].scrollIntoView({ block: "nearest" });
    }
    if (event.key === "Enter" && state.keyboardIndex >= 0) {
      const row = document.querySelectorAll(".bookmark")[state.keyboardIndex];
      if (row) { event.preventDefault(); row.querySelector(".bookmark-link")?.click(); }
    }
  });
  syncThemeButton();
  render();
  if (EXTENSION_MODE) startChromeSync();
})();
