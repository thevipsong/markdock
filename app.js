(() => {
  "use strict";

  const STORAGE_KEY = "qidian-bookmarks-v1";
  const VIEW_KEY = "qidian-view-mode-v1";
  const SORT_KEY = "qidian-sort-mode-v1";
  const COLLAPSED_KEY = "qidian-collapsed-sections-v1";
  const PAGE_SIZE = 180;
  const EXTENSION_MODE = location.protocol === "chrome-extension:";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const refs = {
    tabs: $("#tabs"), subTabsWrap: $("#subTabsWrap"), subTabs: $("#subTabs"),
    content: $("#content"), count: $("#countLine"), footerCount: $("#footerCount"),
    banner: $("#demoBanner"), search: $("#searchInput"), searchClear: $("#searchClearBtn"),
    searchHintBar: $("#searchHintBar"), searchResultNote: $("#searchResultNote"), clearSearchScopeBtn: $("#clearSearchScopeBtn"),
    file: $("#fileInput"), quickAdd: $("#quickAddButton"),
    sortBtn: $("#sortButton"), sortMenu: $("#sortMenu"), sortLabel: $("#sortLabel"),
    collapseAllBtn: $("#collapseAllButton"), collapseAllLabel: $("#collapseAllLabel"),
    actionsButton: $("#actionsButton"), actionsMenu: $("#actionsMenu"),
    addButton: $("#addButton"), importButton: $("#importButton"), demoImportButton: $("#demoImportButton"),
    exportButton: $("#exportButton"), exportMenu: $("#exportMenu"),
    duplicateButton: $("#duplicateButton"), deadLinkButton: $("#deadLinkButton"),
    shortcutsButton: $("#shortcutsButton"), shortcutsDialog: $("#shortcutsDialog"), footerShortcutsLink: $("#footerShortcutsLink"),
    appearanceButton: $("#appearanceButton"), themeToggle: $("#themeToggle"),
    syncBadge: $("#syncBadge"), syncBadgeText: $("#syncBadgeText"), toast: $("#toast"),
    dialog: $("#bookmarkDialog"), form: $("#bookmarkForm"), error: $("#formError"),
    title: $("#titleField"), url: $("#urlField"), category: $("#categoryField"),
    group: $("#groupField"), favorite: $("#favoriteField"), delete: $("#deleteButton"),
    chromeEditHint: $("#chromeEditHint"),
    targetDestWrap: $("#targetDestinationWrap"), destToggle: $("#saveDestinationToggle"),
    chromeFolderWrap: $("#chromeFolderSelectWrap"), chromeFolderSelect: $("#chromeFolderSelect"),
    localOrganizeFields: $("#localOrganizeFields"),
    moveDialog: $("#moveDialog"), moveForm: $("#moveForm"), moveTarget: $("#moveTarget"), newGroup: $("#newGroupName"),
    renameDialog: $("#renameDialog"), renameForm: $("#renameForm"), renameInput: $("#renameInput"), renameHint: $("#renameHint"),
    auditDialog: $("#auditDialog"), auditSummary: $("#auditSummary"), auditResults: $("#auditResults"),
    auditProgressWrap: $("#auditProgressWrap"), auditProgressBar: $("#auditProgressBar"), mergeButton: $("#mergeDuplicatesButton"),
    contextMenu: $("#contextMenu"), tooltip: $("#bookmarkTooltip"), contextFavoriteLabel: $("#contextFavoriteLabel")
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
    id: `sample-${index}`, title, url, category, group, path: [category, group], favorite: index < 3, icon: "", source: "local"
  }));

  const saved = loadState();
  const chromeFavorites = new Set(saved?.chromeFavorites || []);

  let savedCollapsed = [];
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]");
    if (Array.isArray(raw)) {
      savedCollapsed = raw.map((k) => (typeof k === "string" ? k.replace("\u0000", ":::") : k));
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(savedCollapsed)); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  const state = {
    mode: EXTENSION_MODE || saved ? "personal" : "demo",
    items: saved ? saved.items : (EXTENSION_MODE ? [] : samples),
    activeTab: EXTENSION_MODE || saved ? "all" : "cat:Agent",
    activeSubFolder: "",
    query: "",
    limit: PAGE_SIZE,
    editingId: null,
    targetDest: "chrome", // 'chrome' | 'local' for new bookmarks in extension
    chromeSyncStatus: EXTENSION_MODE ? "loading" : "none",
    keyboardIndex: -1,
    contextItemId: null,
    movingId: null,
    renamingSection: null, // { category, group, isChrome, chromeFolderId }
    viewMode: localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid",
    sortMode: localStorage.getItem(SORT_KEY) || "default",
    collapsedSections: new Set(Array.isArray(savedCollapsed) ? savedCollapsed : [])
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
      id: String(value.id || id()),
      title: String(value.title || hostOf(url) || url).trim().slice(0, 512),
      url, category, group, path,
      favorite: Boolean(value.favorite),
      icon: validIcon(value.icon) ? value.icon : "",
      source: value.source === "chrome" ? "chrome" : "local",
      chromeId: value.chromeId || undefined,
      parentId: value.parentId || undefined,
      dateAdded: value.dateAdded || Date.now()
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
        toast("书签已保存；因空间限制，部分本地缓存图标没有保存。");
        return true;
      } catch { return false; }
    }
  }

  function saveViewPreferences() {
    try {
      localStorage.setItem(VIEW_KEY, state.viewMode);
      localStorage.setItem(SORT_KEY, state.sortMode);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...state.collapsedSections]));
    } catch { /* storage quota */ }
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

  function normalizeUrlForDedup(rawUrl) {
    try {
      const url = new URL(rawUrl);
      let href = url.href;
      if (url.pathname.endsWith("/") && url.pathname !== "/") {
        url.pathname = url.pathname.slice(0, -1);
        href = url.href;
      }
      return href.toLowerCase();
    } catch {
      return (rawUrl || "").trim().toLowerCase().replace(/\/+$/, "");
    }
  }

  function validIcon(value) {
    return typeof value === "string" && value.length < 12000 && /^data:image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/i.test(value);
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  }

  function syncThemeButton() {
    const dark = document.documentElement.dataset.theme === "dark";
    const label = dark ? "切换浅色模式" : "切换暗黑模式";
    refs.themeToggle.setAttribute("aria-label", label);
    refs.themeToggle.title = label;
    const meta = $("meta[name='theme-color']");
    if (meta) meta.content = dark ? "#111725" : "#f6f7fb";
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("qidian-theme-v1", next); } catch { /* ignore */ }
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
    return [...new Set(state.items.map((item) => item.category).filter(Boolean))];
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

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function highlightMatch(text, queryTokens) {
    if (!queryTokens.length) return escapeHtml(text);
    const escapedText = escapeHtml(text);
    let result = escapedText;
    for (const token of queryTokens) {
      if (!token) continue;
      const regex = new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      result = result.replace(regex, `<mark class="search-highlight">$1</mark>`);
    }
    return result;
  }

  function getItemTopFolder(item) {
    if (item.category === "书签栏") {
      if (item.path && item.path.length > 1) return item.path[1];
      if (item.group && item.group !== "常用书签") return item.group.split(" / ")[0];
      return "常用书签";
    }
    return item.category || "未分类";
  }

  function getItemSubFolder(item, topFolder) {
    if (item.category === "书签栏") {
      if (item.path && item.path.length > 2) return item.path.slice(2).join(" / ");
      if (item.group && item.group.startsWith(topFolder + " / ")) {
        return item.group.slice(topFolder.length + 3);
      }
    }
    return "";
  }

  function getTopTabs() {
    const tabs = [{ id: "all", label: "全部", count: state.items.length, type: "all" }];

    // Group items in "书签栏" by top-level folder
    const bookmarkBarItems = state.items.filter((it) => it.category === "书签栏");
    if (bookmarkBarItems.length > 0) {
      const folderMap = new Map();
      for (const it of bookmarkBarItems) {
        const topFolder = getItemTopFolder(it);
        if (!folderMap.has(topFolder)) {
          folderMap.set(topFolder, { count: 0, subFolders: new Set() });
        }
        const info = folderMap.get(topFolder);
        info.count++;
        const sub = getItemSubFolder(it, topFolder);
        if (sub) info.subFolders.add(sub);
      }

      for (const [folderName, info] of folderMap) {
        tabs.push({
          id: `folder:${folderName}`,
          label: folderName,
          count: info.count,
          subFolders: [...info.subFolders],
          type: "folder"
        });
      }

      // Other categories (e.g. 移动设备书签)
      const otherCategories = categories().filter((c) => c !== "书签栏");
      for (const cat of otherCategories) {
        const catItems = state.items.filter((it) => it.category === cat);
        tabs.push({
          id: `cat:${cat}`,
          label: cat,
          count: catItems.length,
          type: "category"
        });
      }
    } else {
      for (const cat of categories()) {
        const catItems = state.items.filter((it) => it.category === cat);
        tabs.push({
          id: `cat:${cat}`,
          label: cat,
          count: catItems.length,
          type: "category"
        });
      }
    }

    const favCount = state.items.filter((it) => it.favorite).length;
    tabs.push({ id: "favorites", label: "收藏", count: favCount, type: "favorites" });
    return tabs;
  }

  function renderTabs() {
    refs.tabs.replaceChildren();
    const topTabs = getTopTabs();

    // If activeTab is no longer valid, reset to "all"
    if (!topTabs.some((t) => t.id === state.activeTab)) {
      state.activeTab = "all";
      state.activeSubFolder = "";
    }

    for (const tab of topTabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tab";
      if (state.activeTab === tab.id) button.setAttribute("aria-current", "page");

      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("class", "tab-icon");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");

      if (tab.type === "all") {
        icon.innerHTML = `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`;
      } else if (tab.type === "favorites") {
        icon.innerHTML = `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`;
      } else {
        icon.innerHTML = `<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>`;
      }

      const label = document.createElement("span");
      label.textContent = tab.label;

      const count = document.createElement("span");
      count.className = "tab-count";
      count.textContent = String(tab.count);

      button.append(icon, label, count);

      button.addEventListener("click", () => {
        state.activeTab = tab.id;
        state.activeSubFolder = "";
        state.query = "";
        state.limit = PAGE_SIZE;
        refs.search.value = "";
        refs.searchClear.hidden = true;
        if (tab.id.startsWith("folder:")) {
          const folderName = tab.id.slice(7);
          for (const k of [...state.collapsedSections]) {
            if (k.startsWith(`${folderName}:::`) || k.includes(`:::${folderName}`) || k.includes(folderName)) {
              state.collapsedSections.delete(k);
            }
          }
          saveViewPreferences();
        }
        render();
      });

      refs.tabs.append(button);
    }

    renderSubTabs();
  }

  function renderSubTabs() {
    if (!state.activeTab.startsWith("folder:")) {
      refs.subTabsWrap.hidden = true;
      refs.subTabs.replaceChildren();
      return;
    }

    const currentFolder = state.activeTab.slice(7);
    const folderItems = state.items.filter((it) => getItemTopFolder(it) === currentFolder);

    const subMap = new Map();
    for (const it of folderItems) {
      const sub = getItemSubFolder(it, currentFolder);
      if (sub) {
        subMap.set(sub, (subMap.get(sub) || 0) + 1);
      }
    }

    if (subMap.size <= 1) {
      refs.subTabsWrap.hidden = true;
      refs.subTabs.replaceChildren();
      return;
    }

    refs.subTabsWrap.hidden = false;
    refs.subTabs.replaceChildren();

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "sub-tab";
    allBtn.textContent = `全部 (${folderItems.length})`;
    if (!state.activeSubFolder) allBtn.setAttribute("aria-current", "page");
    allBtn.addEventListener("click", () => {
      state.activeSubFolder = "";
      render();
    });
    refs.subTabs.append(allBtn);

    for (const [subName, count] of subMap) {
      const subBtn = document.createElement("button");
      subBtn.type = "button";
      subBtn.className = "sub-tab";
      subBtn.textContent = `${subName} (${count})`;
      if (state.activeSubFolder === subName) subBtn.setAttribute("aria-current", "page");
      subBtn.addEventListener("click", () => {
        state.activeSubFolder = subName;
        render();
      });
      refs.subTabs.append(subBtn);
    }
  }

  function filteredItems() {
    const rawQuery = state.query.trim().toLocaleLowerCase();
    const tokens = rawQuery.split(/\s+/).filter(Boolean);
    const compactQuery = rawQuery.replace(/\s+/g, "").toUpperCase();

    let items = state.items.filter((item) => {
      if (tokens.length) return true;

      if (state.activeTab === "all") return true;
      if (state.activeTab === "favorites") return item.favorite;
      if (state.activeTab.startsWith("cat:")) {
        return item.category === state.activeTab.slice(4);
      }
      if (state.activeTab.startsWith("folder:")) {
        const topFolder = state.activeTab.slice(7);
        if (getItemTopFolder(item) !== topFolder) return false;
        if (state.activeSubFolder) {
          return getItemSubFolder(item, topFolder) === state.activeSubFolder;
        }
        return true;
      }
      return true;
    });

    if (tokens.length) {
      items = items.filter((item) => {
        const titleLower = item.title.toLocaleLowerCase();
        const urlLower = item.url.toLocaleLowerCase();
        const categoryLower = item.category.toLocaleLowerCase();
        const groupLower = item.group.toLocaleLowerCase();
        const pinyin = pinyinInitials(item.title);

        return tokens.every((token) => {
          return titleLower.includes(token)
            || urlLower.includes(token)
            || categoryLower.includes(token)
            || groupLower.includes(token)
            || (pinyin && pinyin.includes(token.toUpperCase()));
        }) || (compactQuery && pinyin.includes(compactQuery));
      });
    }

    // Sorting
    if (state.sortMode === "name") {
      items = [...items].sort((a, b) => pinyinCollator.compare(a.title, b.title));
    } else if (state.sortMode === "recent") {
      items = [...items].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
    } else if (state.sortMode === "domain") {
      items = [...items].sort((a, b) => hostOf(a.url).localeCompare(hostOf(b.url)) || pinyinCollator.compare(a.title, b.title));
    }

    return items;
  }

  function render() {
    state.keyboardIndex = -1;
    hideBookmarkTooltip();
    hideContextMenu();

    if (state.activeTab.startsWith("cat:") && !categories().includes(state.activeTab.slice(4))) {
      state.activeTab = "all";
    }

    renderTabs();
    refs.banner.hidden = state.mode !== "demo";

    const chromeCount = state.items.filter((item) => item.source === "chrome").length;
    const localCount = state.items.length - chromeCount;
    document.documentElement.dataset.mixedSources = String(chromeCount > 0 && localCount > 0);

    // Sync badge & count description
    if (EXTENSION_MODE) {
      refs.syncBadge.dataset.status = state.chromeSyncStatus;
      refs.syncBadgeText.textContent = state.chromeSyncStatus === "ready"
        ? "Chrome 已同步"
        : (state.chromeSyncStatus === "error" ? "Chrome 同步异常" : "正在读取 Chrome");
      refs.count.textContent = state.chromeSyncStatus === "error"
        ? `Chrome 书签读取失败 · 本地 ${localCount} 个书签`
        : `Chrome ${chromeCount} 个 · 本地 ${localCount} 个 · 实时同步`;
    } else {
      refs.count.textContent = state.mode === "demo"
        ? "一个安静、好找的私人网址空间"
        : `已收纳 ${state.items.length} 个书签 · 数据保存在当前浏览器`;
    }
    refs.footerCount.textContent = `${state.items.length} 个书签`;

    // Sort button label
    const sortLabels = { default: "默认", name: "按名称", recent: "最近添加", domain: "按域名" };
    refs.sortLabel.textContent = sortLabels[state.sortMode] || "默认";
    for (const opt of refs.sortMenu.querySelectorAll(".sort-option")) {
      opt.classList.toggle("is-active", opt.dataset.sort === state.sortMode);
    }

    // Search hint bar
    const rawQuery = state.query.trim();
    if (rawQuery) {
      refs.searchHintBar.hidden = false;
      refs.searchResultNote.textContent = `找到匹配项 (搜索: “${rawQuery}”)`;
      refs.searchClear.hidden = false;
    } else {
      refs.searchHintBar.hidden = true;
      refs.searchClear.hidden = true;
    }

    const filtered = filteredItems();
    refs.content.replaceChildren();

    if (!filtered.length) {
      renderEmpty();
      return;
    }

    const visible = filtered.slice(0, state.limit);
    const sections = new Map();
    for (const item of visible) {
      const key = `${item.category}:::${item.group}`;
      if (!sections.has(key)) {
        sections.set(key, { category: item.category, group: item.group, key, items: [] });
      }
      sections.get(key).items.push(item);
    }

    for (const section of sections.values()) {
      refs.content.append(buildSection(section));
    }

    if (filtered.length > visible.length) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "load-more";
      button.textContent = `继续显示 · 还有 ${filtered.length - visible.length} 个`;
      button.addEventListener("click", () => { state.limit += PAGE_SIZE; render(); });
      refs.content.append(button);
    }
    updateCollapseAllLabel();
  }

  function formatSectionTitle(section) {
    if (state.activeTab.startsWith("folder:")) {
      const topFolder = state.activeTab.slice(7);
      if (section.group.startsWith(topFolder + " / ")) {
        return section.group.slice(topFolder.length + 3);
      }
      return section.group;
    }
    if (section.category === "书签栏") {
      return section.group;
    }
    if (state.activeTab.startsWith("cat:") && !state.query) {
      return section.group;
    }
    return `${section.category} · ${section.group}`;
  }

  function buildSection(section) {
    const isCollapsed = state.collapsedSections.has(section.key);
    const element = document.createElement("section");
    element.className = `section${isCollapsed ? " is-collapsed" : ""}`;
    element.dataset.sectionKey = section.key;

    const header = document.createElement("div");
    header.className = "section-header";

    // Toggle collapse button
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "section-toggle-btn";
    toggleBtn.setAttribute("aria-label", isCollapsed ? "展开文件夹" : "折叠文件夹");
    toggleBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`;
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSectionCollapse(section.key, element);
    });

    const folderIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    folderIcon.setAttribute("class", "section-icon");
    folderIcon.setAttribute("viewBox", "0 0 24 24");
    folderIcon.innerHTML = `<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>`;

    const heading = document.createElement("h2");
    heading.textContent = formatSectionTitle(section);

    const note = document.createElement("span");
    note.className = "section-note";
    note.textContent = `${section.items.length}`;

    const divider = document.createElement("div");
    divider.className = "section-divider";

    const actions = document.createElement("div");
    actions.className = "section-actions";

    // Rename folder action button
    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "section-action-btn";
    renameBtn.title = "重命名此文件夹";
    renameBtn.textContent = "重命名";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRenameDialog(section);
    });

    // Open all action button
    const openAll = document.createElement("button");
    openAll.type = "button";
    openAll.className = "section-action-btn";
    openAll.title = `在新标签页打开本文件夹 ${section.items.length} 个书签`;
    openAll.textContent = "打开全部";
    openAll.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (section.items.length > 12 && !confirm(`将在新标签页打开本文件夹 ${section.items.length} 个书签，继续吗？`)) return;
      let opened = 0;
      for (const item of section.items) {
        try {
          if (EXTENSION_MODE) await chrome.tabs.create({ url: item.url, active: false });
          else window.open(item.url, "_blank", "noopener,noreferrer");
          opened++;
        } catch { /* ignore */ }
      }
      toast(`已在新标签页打开 ${opened} 个书签`);
    });

    actions.append(renameBtn, openAll);
    header.append(toggleBtn, folderIcon, heading, note, divider, actions);

    header.addEventListener("click", (e) => {
      if (e.target.closest(".section-action-btn")) return;
      toggleSectionCollapse(section.key, element);
    });

    const list = document.createElement("div");
    list.className = "bookmark-list";
    const queryTokens = state.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

    for (const item of section.items) {
      list.append(buildBookmark(item, queryTokens));
    }

    element.append(header, list);
    return element;
  }

  function toggleSectionCollapse(key, sectionEl = null) {
    if (state.collapsedSections.has(key)) state.collapsedSections.delete(key);
    else state.collapsedSections.add(key);
    saveViewPreferences();

    let el = sectionEl;
    if (!el) {
      for (const candidate of document.querySelectorAll(".section")) {
        if (candidate.dataset.sectionKey === key) {
          el = candidate;
          break;
        }
      }
    }

    if (el) {
      const isCollapsed = state.collapsedSections.has(key);
      el.classList.toggle("is-collapsed", isCollapsed);
      const btn = el.querySelector(".section-toggle-btn");
      if (btn) btn.setAttribute("aria-label", isCollapsed ? "展开文件夹" : "折叠文件夹");
    }
    updateCollapseAllLabel();
  }

  function toggleAllSectionsCollapse() {
    const sections = $$(".section");
    const allCollapsed = [...sections].every((el) => el.classList.contains("is-collapsed"));
    for (const el of sections) {
      const key = el.dataset.sectionKey;
      if (!key) continue;
      const willCollapse = !allCollapsed;
      if (willCollapse) state.collapsedSections.add(key);
      else state.collapsedSections.delete(key);
      el.classList.toggle("is-collapsed", willCollapse);
      const btn = el.querySelector(".section-toggle-btn");
      if (btn) btn.setAttribute("aria-label", willCollapse ? "展开文件夹" : "折叠文件夹");
    }
    updateCollapseAllLabel();
    saveViewPreferences();
  }

  function updateCollapseAllLabel() {
    if (!refs.collapseAllLabel) return;
    const sections = $$(".section");
    if (!sections.length) return;
    const allCollapsed = [...sections].every((el) => el.classList.contains("is-collapsed"));
    refs.collapseAllLabel.textContent = allCollapsed ? "展开所有文件夹" : "折叠所有文件夹";
  }

  function buildBookmark(item, queryTokens = []) {
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
    link.title = `${item.title}\n${item.url}`;

    link.addEventListener("mouseenter", () => showBookmarkTooltip(item, link));
    link.addEventListener("mouseleave", hideBookmarkTooltip);
    link.addEventListener("focus", () => showBookmarkTooltip(item, link));
    link.addEventListener("blur", hideBookmarkTooltip);

    const dot = document.createElement("span");
    dot.className = "bookmark-dot";
    dot.setAttribute("aria-hidden", "true");

    const main = document.createElement("span");
    main.className = "bookmark-main";

    const title = document.createElement("span");
    title.className = "bookmark-title";
    title.innerHTML = highlightMatch(item.title, queryTokens);
    main.append(title);

    if (item.source === "chrome") {
      const source = document.createElement("span");
      source.className = "bookmark-source";
      source.textContent = "Chrome";
      main.append(source);
    }

    const domain = document.createElement("span");
    domain.className = "bookmark-domain";
    domain.innerHTML = highlightMatch(hostOf(item.url) || item.url, queryTokens);

    link.append(dot, main, domain);

    // Row Actions
    const actions = document.createElement("span");
    actions.className = `bookmark-actions${item.favorite ? " favorite-always" : ""}`;

    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = `mini-button${item.favorite ? " is-favorite" : ""}`;
    favorite.textContent = item.favorite ? "★" : "☆";
    favorite.setAttribute("aria-label", item.favorite ? `取消收藏 ${item.title}` : `收藏 ${item.title}`);
    favorite.title = item.favorite ? "取消收藏" : "加入收藏";
    favorite.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(item);
    });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "mini-button";
    edit.textContent = "⋯";
    edit.setAttribute("aria-label", `操作菜单：${item.title}`);
    edit.title = "更多操作";
    edit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const box = edit.getBoundingClientRect();
      showContextMenu(item, box.right, box.bottom);
    });

    actions.append(favorite, edit);
    row.append(link, actions);
    return row;
  }

  function toggleFavorite(item) {
    const target = state.items.find((entry) => entry.id === item.id);
    if (!target) return;
    target.favorite = !target.favorite;
    if (target.source === "chrome" && target.chromeId) {
      if (target.favorite) chromeFavorites.add(target.chromeId);
      else chromeFavorites.delete(target.chromeId);
    }
    if (!persist()) {
      target.favorite = !target.favorite;
      if (target.source === "chrome" && target.chromeId) {
        if (target.favorite) chromeFavorites.add(target.chromeId);
        else chromeFavorites.delete(target.chromeId);
      }
      toast("收藏未保存：浏览器存储空间不足。", true);
      return;
    }
    render();
    toast(target.favorite ? `已收藏“${target.title}”` : `已取消收藏“${target.title}”`);
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
      paragraph.textContent = "请尝试缩短搜索词或检查拼写，也可点击下方按钮清空搜索。";
      button.textContent = "清空搜索条件";
      button.addEventListener("click", () => {
        refs.search.value = "";
        state.query = "";
        refs.searchClear.hidden = true;
        render();
      });
    } else if (state.activeTab === "favorites") {
      heading.textContent = "还没有收藏任何书签";
      paragraph.textContent = "点击任意书签右侧的星标 ★，常用网站就会收纳到这里。";
      button.textContent = "浏览全部书签";
      button.addEventListener("click", () => { state.activeTab = "all"; render(); });
    } else if (EXTENSION_MODE && state.chromeSyncStatus === "loading") {
      heading.textContent = "正在读取 Chrome 书签";
      paragraph.textContent = "首次读取或包含大量书签时可能需要几秒钟。";
      button.textContent = "添加本地书签";
      button.addEventListener("click", () => openDialog());
    } else if (EXTENSION_MODE && state.chromeSyncStatus === "error") {
      heading.textContent = "Chrome 书签读取失败";
      paragraph.textContent = "请在扩展管理中确认已授予书签访问权限，然后点击重试。";
      button.textContent = "重新同步";
      button.addEventListener("click", syncChromeBookmarks);
    } else {
      heading.textContent = "给书签一个清爽的归宿";
      paragraph.textContent = EXTENSION_MODE
        ? "Chrome 中还没有书签。你可以直接在此添加书签，也可以导入以前的备份。"
        : "导入浏览器导出的 HTML 书签文件，或手动添加第一个书签。";
      button.textContent = EXTENSION_MODE ? "添加书签" : "导入书签";
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

  function populateChromeFolderSelect(selectedId = "") {
    refs.chromeFolderSelect.replaceChildren();
    for (const folder of chromeFolders.values()) {
      if (folder.unmodifiable) continue;
      refs.chromeFolderSelect.add(new Option(folder.path.join(" / "), folder.id, false, folder.id === selectedId));
    }
    if (!refs.chromeFolderSelect.options.length) {
      refs.chromeFolderSelect.add(new Option("书签栏", "1", true, true));
    }
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

    const isChrome = item?.source === "chrome";
    if (item) {
      refs.targetDestWrap.hidden = true;
      refs.chromeEditHint.hidden = !isChrome;
      refs.chromeFolderWrap.hidden = !isChrome;
      refs.localOrganizeFields.hidden = isChrome;
      if (isChrome) {
        populateChromeFolderSelect(item.parentId);
      }
    } else {
      // Adding new bookmark
      if (EXTENSION_MODE) {
        refs.targetDestWrap.hidden = false;
        state.targetDest = "chrome";
        updateSaveDestToggle();
        populateChromeFolderSelect();
      } else {
        refs.targetDestWrap.hidden = true;
        refs.chromeFolderWrap.hidden = true;
        refs.localOrganizeFields.hidden = false;
      }
      refs.chromeEditHint.hidden = true;
    }

    refs.error.hidden = true;
    updateSuggestions();
    refs.dialog.showModal();
    refs.title.focus();
  }

  function updateSaveDestToggle() {
    const isChrome = state.targetDest === "chrome";
    refs.destToggle.querySelectorAll(".segment-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.dest === state.targetDest);
    });
    refs.chromeFolderWrap.hidden = !isChrome;
    refs.localOrganizeFields.hidden = isChrome;
  }

  function closeDialog() {
    refs.dialog.close();
    state.editingId = null;
  }

  async function saveForm(event) {
    event.preventDefault();
    const title = refs.title.value.trim();
    const url = safeUrl(refs.url.value);
    if (!title || !url) {
      refs.error.textContent = !title ? "请填写书签名称。" : "请输入有效的网页网址。";
      refs.error.hidden = false;
      return;
    }

    if (state.mode === "demo") activatePersonal();
    const existing = state.items.find((item) => item.id === state.editingId);

    // Editing existing Chrome bookmark
    if (existing?.source === "chrome") {
      try {
        await chrome.bookmarks.update(existing.chromeId, { title: title.slice(0, 512), url });
        const targetParentId = refs.chromeFolderSelect.value;
        if (targetParentId && targetParentId !== existing.parentId) {
          await chrome.bookmarks.move(existing.chromeId, { parentId: targetParentId });
        }
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

    // Adding NEW bookmark to Chrome in Extension Mode
    if (!existing && EXTENSION_MODE && state.targetDest === "chrome") {
      try {
        const parentId = refs.chromeFolderSelect.value || "1";
        const created = await chrome.bookmarks.create({
          parentId,
          title: title.slice(0, 512),
          url
        });
        if (refs.favorite.checked) {
          chromeFavorites.add(created.id);
          persist();
        }
        closeDialog();
        await syncChromeBookmarks();
        toast("已添加至 Chrome 书签");
      } catch (error) {
        refs.error.textContent = `添加失败：${error.message}`;
        refs.error.hidden = false;
      }
      return;
    }

    // Adding or editing Local bookmark
    const category = refs.category.value.trim() || "未分类";
    const group = refs.group.value.trim() || "常用书签";
    const previousMode = state.mode;
    const previousItems = state.items.map((item) => ({ ...item }));

    const next = {
      id: existing?.id || id(),
      title: title.slice(0, 512),
      url,
      category: category.slice(0, 50),
      group: group.slice(0, 100),
      path: [category, ...group.split(" / ").map((part) => part.trim()).filter(Boolean)],
      favorite: refs.favorite.checked,
      icon: existing?.url === url ? existing.icon : "",
      source: "local",
      dateAdded: existing?.dateAdded || Date.now()
    };

    if (existing) Object.assign(existing, next);
    else state.items.push(next);

    state.activeTab = `cat:${next.category}`;
    state.query = "";
    refs.search.value = "";
    refs.searchClear.hidden = true;

    if (!persist()) {
      state.mode = previousMode;
      state.items = previousItems;
      refs.error.textContent = "浏览器存储空间不足，未能保存。请先导出备份并清理部分本地书签。";
      refs.error.hidden = false;
      return;
    }
    closeDialog();
    render();
    toast(existing ? "书签已更新" : "书签已添加");
  }

  async function deleteCurrent() {
    const item = state.items.find((entry) => entry.id === state.editingId);
    if (!item || !confirm(`确定删除“${item.title}”吗？`)) return;

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
    if (!persist()) {
      state.items = previousItems;
      toast("删除未保存：浏览器存储空间不足。", true);
      return;
    }
    closeDialog();
    render();
    toast("书签已删除");
  }

  function chooseFile() {
    refs.file.value = "";
    refs.file.click();
  }

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
      results.push({
        id: id(),
        title: (anchor.textContent.trim() || hostOf(url) || url).slice(0, 512),
        url,
        category: category.slice(0, 50),
        group: group.slice(0, 100),
        path: folder.length ? folder : [category],
        favorite: false,
        icon,
        source: "local",
        dateAdded: Number(anchor.getAttribute("add_date")) ? Number(anchor.getAttribute("add_date")) * 1000 : Date.now()
      });
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
        // Convert all imported JSON items to valid local bookmarks so backups are never dropped
        items = raw.map((item) => {
          const sanitized = sanitizeItem(item);
          if (sanitized) sanitized.source = "local"; // imported items saved as local
          return sanitized;
        }).filter(Boolean);
      } else {
        items = parseHtmlBookmarks(text);
      }

      if (!items.length) throw new Error("文件中没有找到可导入的书签");

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
      refs.searchClear.hidden = true;

      if (!persist()) {
        state.mode = previousMode;
        state.items = previousItems;
        throw new Error("浏览器存储空间不足，请缩小文件或清理部分数据");
      }
      render();
      toast(`已成功导入 ${items.length} 个书签`);
    } catch (error) { toast(`导入失败：${error.message}`, true); }
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
    const lines = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<!-- This is an automatically generated file. -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      '<TITLE>栖点书签</TITLE>',
      '<H1>栖点书签</H1>',
      '<DL><p>'
    ];
    const writeNode = (node, depth) => {
      const indent = "    ".repeat(depth);
      for (const item of node.links) {
        const addDate = Math.floor((item.dateAdded || Date.now()) / 1000);
        lines.push(`${indent}<DT><A HREF="${escapeHtml(item.url)}" ADD_DATE="${addDate}"${item.icon ? ` ICON="${escapeHtml(item.icon)}"` : ""}>${escapeHtml(item.title)}</A>`);
      }
      for (const [name, child] of node.children) {
        lines.push(`${indent}<DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}">${escapeHtml(name)}</H3>`, `${indent}<DL><p>`);
        writeNode(child, depth + 1);
        lines.push(`${indent}</DL><p>`);
      }
    };
    writeNode(tree, 1);
    lines.push('</DL><p>');
    download("栖点书签.html", new Blob([lines.join("\n")], { type: "text/html;charset=utf-8" }));
  }

  function exportJson() {
    const payload = { version: 2, exportedAt: new Date().toISOString(), items: state.items };
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
          id: `chrome-${chromeId}`,
          chromeId,
          source: "chrome",
          title: String(node.title || hostOf(url) || url).trim().slice(0, 512),
          url, category, group, path,
          favorite: chromeFavorites.has(chromeId),
          icon: "",
          parentId: String(node.parentId),
          dateAdded: node.dateAdded || 0
        });
        return;
      }
      const nextFolders = node.parentId === undefined ? folders : [...folders, String(node.title || "未分类").trim() || "未分类"];
      if (node.parentId !== undefined) {
        chromeFolders.set(String(node.id), {
          id: String(node.id),
          parentId: String(node.parentId),
          title: String(node.title || "未分类"),
          path: nextFolders,
          unmodifiable: Boolean(node.unmodifiable)
        });
      }
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
    refs.tooltip.textContent = item.url;
    refs.tooltip.hidden = false;
  }

  function hideContextMenu() {
    refs.contextMenu.hidden = true;
    state.contextItemId = null;
  }

  function showContextMenu(item, x, y) {
    hideBookmarkTooltip();
    state.contextItemId = item.id;
    refs.contextFavoriteLabel.textContent = item.favorite ? "取消收藏" : "加入收藏";
    refs.contextMenu.hidden = false;
    const menuWidth = refs.contextMenu.offsetWidth || 184;
    const menuHeight = refs.contextMenu.offsetHeight || 220;
    refs.contextMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - menuWidth - 8))}px`;
    refs.contextMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - menuHeight - 8))}px`;
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
      for (const [key, path] of paths) {
        refs.moveTarget.add(new Option(path.join(" / "), key, false, key === JSON.stringify(item.path)));
      }
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

  // Rename Section Feature
  function openRenameDialog(section) {
    const isChromeSection = section.items.every((it) => it.source === "chrome");
    const chromeParentId = isChromeSection && section.items.length ? section.items[0].parentId : null;

    state.renamingSection = {
      category: section.category,
      group: section.group,
      key: section.key,
      isChrome: isChromeSection,
      chromeParentId
    };
    refs.renameInput.value = section.group;
    refs.renameHint.textContent = isChromeSection
      ? "此分组来自 Chrome 文件夹，重命名将同步写回 Chrome。"
      : "重命名将更新此分组下的所有本地书签。";
    refs.renameDialog.showModal();
    refs.renameInput.focus();
    refs.renameInput.select();
  }

  async function saveRenameSection(event) {
    event.preventDefault();
    const newName = refs.renameInput.value.trim();
    if (!newName) return;
    const current = state.renamingSection;
    if (!current) return;

    try {
      if (current.isChrome && current.chromeParentId) {
        await chrome.bookmarks.update(current.chromeParentId, { title: newName });
        await syncChromeBookmarks();
      } else {
        const oldGroup = current.group;
        for (const item of state.items) {
          if (item.source !== "chrome" && item.category === current.category && item.group === oldGroup) {
            item.group = newName;
            if (item.path && item.path.length > 1) {
              item.path[item.path.length - 1] = newName;
            }
          }
        }
        persist();
        render();
      }
      refs.renameDialog.close();
      state.renamingSection = null;
      toast(`分组已重命名为“${newName}”`);
    } catch (error) {
      toast(`重命名失败：${error.message}`, true);
    }
  }

  // Duplicates Logic
  function duplicateGroups() {
    const byNormalizedUrl = new Map();
    for (const item of state.items) {
      const norm = normalizeUrlForDedup(item.url);
      if (!byNormalizedUrl.has(norm)) byNormalizedUrl.set(norm, []);
      byNormalizedUrl.get(norm).push(item);
    }
    return [...byNormalizedUrl.values()].filter((group) => group.length > 1);
  }

  function showDuplicates() {
    const groups = duplicateGroups();
    $("#auditTitle").textContent = "重复书签清理";
    refs.auditProgressWrap.hidden = true;
    const redundantCount = groups.reduce((sum, group) => sum + group.length - 1, 0);

    refs.auditSummary.textContent = groups.length
      ? `发现 ${groups.length} 组完整网址相同的书签，合计 ${redundantCount} 个冗余项。你可以逐条选择删除，或一键自动合并。`
      : `已检查 ${state.items.length} 个书签，没有发现完全重复的网址。`;

    refs.auditResults.replaceChildren();

    for (const group of groups) {
      const card = document.createElement("div");
      card.className = "audit-group-card";

      const urlLink = document.createElement("a");
      urlLink.className = "audit-group-url";
      urlLink.href = group[0].url;
      urlLink.target = "_blank";
      urlLink.rel = "noopener noreferrer";
      urlLink.textContent = group[0].url;
      card.append(urlLink);

      for (let i = 0; i < group.length; i++) {
        const item = group[i];
        const row = document.createElement("div");
        row.className = "audit-item-row";

        const info = document.createElement("div");
        info.className = "audit-item-info";
        const title = document.createElement("div");
        title.className = "audit-item-title";
        title.textContent = item.title;
        const meta = document.createElement("div");
        meta.className = "audit-item-meta";
        meta.textContent = `${item.source === "chrome" ? "Chrome" : "本地"} · ${item.path.join(" / ")}`;
        info.append(title, meta);

        const actions = document.createElement("div");
        actions.className = "audit-item-actions";

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "button button-danger";
        delBtn.textContent = "删除此项";
        delBtn.addEventListener("click", async () => {
          if (!confirm(`确定删除“${item.title}”？`)) return;
          try {
            if (item.source === "chrome") {
              await chrome.bookmarks.remove(item.chromeId);
              chromeFavorites.delete(item.chromeId);
              await syncChromeBookmarks();
            } else {
              state.items = state.items.filter((e) => e.id !== item.id);
              persist();
              render();
            }
            showDuplicates();
            toast("重复项已删除");
          } catch (e) { toast(`删除失败：${e.message}`, true); }
        });

        actions.append(delBtn);
        row.append(info, actions);
        card.append(row);
      }
      refs.auditResults.append(card);
    }
    refs.mergeButton.hidden = groups.length === 0;
    refs.auditDialog.showModal();
  }

  async function mergeDuplicates() {
    const groups = duplicateGroups();
    const removeCount = groups.reduce((sum, group) => sum + group.length - 1, 0);
    if (!removeCount || !confirm(`将保留每组中的一个书签，删除 ${removeCount} 个网址重复项。栖点会先自动导出 JSON 备份。继续吗？`)) return;

    exportJson();
    let removed = 0;
    let failed = 0;

    for (const group of groups) {
      // Sort: keep Chrome items first, older items first
      const ordered = [...group].sort((a, b) =>
        (a.source === "chrome" ? -1 : 1) - (b.source === "chrome" ? -1 : 1) || (a.dateAdded || 0) - (b.dateAdded || 0)
      );
      const keeper = ordered[0];
      const hasFavorite = group.some((it) => it.favorite);
      if (hasFavorite && !keeper.favorite) {
        keeper.favorite = true;
        if (keeper.source === "chrome" && keeper.chromeId) chromeFavorites.add(keeper.chromeId);
      }

      for (const item of ordered.slice(1)) {
        try {
          if (item.source === "chrome") {
            await chrome.bookmarks.remove(item.chromeId);
            chromeFavorites.delete(item.chromeId);
          } else {
            state.items = state.items.filter((entry) => entry.id !== item.id);
          }
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

  // Dead Links Check
  async function checkOneLink(item) {
    if (!/^https?:/i.test(item.url)) return { item, kind: "skip", detail: "非网页链接" };

    if (!EXTENSION_MODE) {
      // In local web mode, call serve.py endpoint /api/check
      try {
        const res = await fetch(`/api/check?url=${encodeURIComponent(item.url)}`);
        if (res.ok) {
          const data = await res.json();
          return { item, kind: data.kind || "uncertain", detail: data.detail || `HTTP ${data.status}` };
        }
      } catch { /* fallback to browser fetch */ }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      let response = await fetch(item.url, {
        method: "HEAD",
        redirect: "follow",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });
      if ([405, 501, 404, 410].includes(response.status)) {
        response = await fetch(item.url, {
          method: "GET",
          redirect: "follow",
          credentials: "omit",
          cache: "no-store",
          headers: { Range: "bytes=0-0" },
          signal: controller.signal
        });
      }
      response.body?.cancel();
      if (response.status === 404 || response.status === 410) {
        return { item, kind: "dead", detail: `HTTP ${response.status}` };
      }
      if (response.ok) return { item, kind: "ok", detail: `HTTP ${response.status}` };
      return { item, kind: "uncertain", detail: `HTTP ${response.status}` };
    } catch (error) {
      return { item, kind: "uncertain", detail: error.name === "AbortError" ? "连接超时" : "网络或权限限制" };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function checkDeadLinks() {
    $("#auditTitle").textContent = "失效链接检查";
    refs.mergeButton.hidden = true;
    refs.auditResults.replaceChildren();
    refs.auditProgressWrap.hidden = false;
    refs.auditProgressBar.style.width = "0%";
    refs.auditSummary.textContent = "正在准备检查…";
    refs.auditDialog.showModal();

    if (EXTENSION_MODE) {
      let granted = false;
      try {
        granted = await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] });
      } catch (error) {
        refs.auditSummary.textContent = `权限请求失败：${error.message}`;
        refs.auditProgressWrap.hidden = true;
        return;
      }
      if (!granted) {
        refs.auditSummary.textContent = "未取得网站访问权限，无法检查链接。你可以随时重试。";
        refs.auditProgressWrap.hidden = true;
        return;
      }
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
        const pct = Math.round((done / items.length) * 100);
        refs.auditProgressBar.style.width = `${pct}%`;
        refs.auditSummary.textContent = `正在检查 ${done} / ${items.length} 个网址 (${pct}%)…`;
      }
    }

    await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));

    const dead = results.filter((result) => result.kind === "dead");
    const uncertain = results.filter((result) => result.kind === "uncertain");
    refs.auditProgressWrap.hidden = true;
    refs.auditSummary.textContent = `共检查 ${items.length} 个网址：明确返回 404/410 的 ${dead.length} 个，待复查 ${uncertain.length} 个。`;

    if (!dead.length && !uncertain.length) {
      const emptyNote = document.createElement("p");
      emptyNote.style.padding = "20px";
      emptyNote.style.textAlign = "center";
      emptyNote.style.color = "var(--text-muted)";
      emptyNote.textContent = "恭喜，所有书签链接均正常响应！";
      refs.auditResults.append(emptyNote);
      return;
    }

    for (const result of [...dead, ...uncertain]) {
      const card = document.createElement("div");
      card.className = "audit-group-card";

      const row = document.createElement("div");
      row.className = "audit-item-row";

      const info = document.createElement("div");
      info.className = "audit-item-info";

      const titleWrap = document.createElement("div");
      titleWrap.style.display = "flex";
      titleWrap.style.alignItems = "center";
      titleWrap.style.gap = "8px";

      const pill = document.createElement("span");
      pill.className = `pill-badge ${result.kind === "dead" ? "pill-dead" : "pill-uncertain"}`;
      pill.textContent = `${result.kind === "dead" ? "失效" : "待复查"} · ${result.detail}`;

      const title = document.createElement("span");
      title.className = "audit-item-title";
      title.textContent = result.item.title;

      titleWrap.append(pill, title);

      const urlLink = document.createElement("a");
      urlLink.className = "audit-group-url";
      urlLink.style.marginTop = "4px";
      urlLink.href = result.item.url;
      urlLink.target = "_blank";
      urlLink.rel = "noopener noreferrer";
      urlLink.textContent = result.item.url;

      info.append(titleWrap, urlLink);

      const actions = document.createElement("div");
      actions.className = "audit-item-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "button button-quiet";
      editBtn.textContent = "编辑";
      editBtn.addEventListener("click", () => {
        refs.auditDialog.close();
        openDialog(result.item);
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "button button-danger";
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", async () => {
        if (!confirm(`确定删除“${result.item.title}”？`)) return;
        try {
          if (result.item.source === "chrome") {
            await chrome.bookmarks.remove(result.item.chromeId);
            chromeFavorites.delete(result.item.chromeId);
            await syncChromeBookmarks();
          } else {
            state.items = state.items.filter((e) => e.id !== result.item.id);
            persist();
            render();
          }
          card.remove();
          toast("书签已删除");
        } catch (e) { toast(`删除失败：${e.message}`, true); }
      });

      actions.append(editBtn, delBtn);
      row.append(info, actions);
      card.append(row);
      refs.auditResults.append(card);
    }
  }

  // Bind Event Listeners
  if (EXTENSION_MODE) {
    refs.addButton.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> 添加书签`;
    refs.importButton.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg> 导入本地书签`;
  }

  refs.quickAdd.addEventListener("click", () => openDialog());
  refs.addButton.addEventListener("click", () => {
    refs.actionsMenu.hidden = true;
    refs.actionsButton.setAttribute("aria-expanded", "false");
    openDialog();
  });

  // Save destination toggle in bookmark form
  refs.destToggle.addEventListener("click", (event) => {
    const btn = event.target.closest(".segment-btn");
    if (!btn) return;
    state.targetDest = btn.dataset.dest;
    updateSaveDestToggle();
  });

  // Sort dropdown
  refs.sortBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    refs.sortMenu.hidden = !refs.sortMenu.hidden;
    refs.sortBtn.setAttribute("aria-expanded", String(!refs.sortMenu.hidden));
  });
  refs.sortMenu.addEventListener("click", (e) => {
    const btn = e.target.closest(".sort-option");
    if (!btn) return;
    state.sortMode = btn.dataset.sort;
    saveViewPreferences();
    refs.sortMenu.hidden = true;
    refs.sortBtn.setAttribute("aria-expanded", "false");
    render();
  });

  // Collapse all
  refs.collapseAllBtn.addEventListener("click", () => {
    refs.actionsMenu.hidden = true;
    refs.actionsButton.setAttribute("aria-expanded", "false");
    toggleAllSectionsCollapse();
  });

  // Actions menu toggle
  refs.actionsButton.addEventListener("click", (e) => {
    e.stopPropagation();
    refs.actionsMenu.hidden = !refs.actionsMenu.hidden;
    refs.actionsButton.setAttribute("aria-expanded", String(!refs.actionsMenu.hidden));
  });

  // Shortcuts dialog
  refs.shortcutsButton.addEventListener("click", () => {
    refs.actionsMenu.hidden = true;
    refs.shortcutsDialog.showModal();
  });
  refs.footerShortcutsLink.addEventListener("click", () => refs.shortcutsDialog.showModal());

  refs.themeToggle.addEventListener("click", toggleTheme);
  refs.importButton.addEventListener("click", () => {
    refs.actionsMenu.hidden = true;
    chooseFile();
  });
  refs.demoImportButton.addEventListener("click", chooseFile);
  refs.file.addEventListener("change", importFile);

  // Search input & clear button
  refs.search.addEventListener("input", () => {
    state.query = refs.search.value;
    state.limit = PAGE_SIZE;
    render();
  });
  refs.searchClear.addEventListener("click", () => {
    refs.search.value = "";
    state.query = "";
    refs.searchClear.hidden = true;
    render();
    refs.search.focus();
  });
  refs.clearSearchScopeBtn.addEventListener("click", () => {
    refs.search.value = "";
    state.query = "";
    refs.searchClear.hidden = true;
    render();
  });

  // Dialog forms
  refs.form.addEventListener("submit", saveForm);
  $("#closeDialogButton").addEventListener("click", closeDialog);
  $("#cancelDialogButton").addEventListener("click", closeDialog);
  refs.delete.addEventListener("click", deleteCurrent);
  refs.moveForm.addEventListener("submit", moveBookmark);
  refs.renameForm.addEventListener("submit", saveRenameSection);

  refs.duplicateButton.addEventListener("click", () => {
    refs.actionsMenu.hidden = true;
    showDuplicates();
  });
  refs.deadLinkButton.addEventListener("click", () => {
    refs.actionsMenu.hidden = true;
    checkDeadLinks();
  });
  refs.mergeButton.addEventListener("click", mergeDuplicates);

  // Export buttons
  refs.exportButton.addEventListener("click", (e) => {
    e.stopPropagation();
    refs.exportMenu.hidden = !refs.exportMenu.hidden;
    refs.exportButton.setAttribute("aria-expanded", String(!refs.exportMenu.hidden));
  });
  refs.exportMenu.addEventListener("click", (event) => {
    const type = event.target.closest("[data-export]")?.dataset.export;
    if (type === "html") exportHtml();
    if (type === "json") exportJson();
    refs.exportMenu.hidden = true;
    refs.exportButton.setAttribute("aria-expanded", "false");
    refs.actionsMenu.hidden = true;
    refs.actionsButton.setAttribute("aria-expanded", "false");
  });

  // Close dialog buttons
  $$("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => $("#" + button.dataset.closeDialog).close());
  });

  // Context Menu Actions
  refs.contextMenu.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    const item = state.items.find((entry) => entry.id === state.contextItemId);
    hideContextMenu();
    if (!item || !action) return;

    if (action === "open") {
      if (EXTENSION_MODE) chrome.tabs.create({ url: item.url });
      else window.open(item.url, "_blank", "noopener,noreferrer");
    } else if (action === "open-window") {
      if (EXTENSION_MODE && chrome.windows) {
        chrome.windows.create({ url: item.url });
      } else {
        window.open(item.url, "_blank", "noopener,noreferrer,popup=no");
      }
    } else if (action === "copy-url") {
      try {
        await navigator.clipboard.writeText(item.url);
        toast("网址已复制到剪贴板");
      } catch { toast("复制失败", true); }
    } else if (action === "copy-title") {
      try {
        await navigator.clipboard.writeText(item.title);
        toast("名称已复制到剪贴板");
      } catch { toast("复制失败", true); }
    } else if (action === "toggle-favorite") {
      toggleFavorite(item);
    } else if (action === "edit") {
      openDialog(item);
    } else if (action === "move") {
      openMoveDialog(item);
    } else if (action === "delete") {
      state.editingId = item.id;
      deleteCurrent();
    }
  });

  // Click outside listener for menus
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".actions-wrap")) {
      refs.exportMenu.hidden = true;
      refs.exportButton.setAttribute("aria-expanded", "false");
      refs.actionsMenu.hidden = true;
      refs.actionsButton.setAttribute("aria-expanded", "false");
    }
    if (!event.target.closest(".sort-wrap")) {
      refs.sortMenu.hidden = true;
      refs.sortBtn.setAttribute("aria-expanded", "false");
    }
    if (!event.target.closest("#contextMenu") && !event.target.closest(".bookmark-actions")) {
      hideContextMenu();
    }
  });

  window.addEventListener("scroll", () => {
    hideContextMenu();
    hideBookmarkTooltip();
  }, { passive: true });

  // Global Keyboard Shortcuts
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideContextMenu();
      hideBookmarkTooltip();
      if (refs.search.value && document.activeElement === refs.search) {
        refs.search.value = "";
        state.query = "";
        refs.searchClear.hidden = true;
        render();
      }
      return;
    }

    // Don't intercept when dialogs are open
    if (refs.dialog.open || refs.moveDialog.open || refs.renameDialog.open
      || refs.auditDialog.open || refs.shortcutsDialog.open || $("#appearanceDialog").open
      || !refs.contextMenu.hidden || !refs.actionsMenu.hidden) return;

    // Don't intercept when typing in text fields
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
      || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "/") {
      event.preventDefault();
      refs.search.focus();
      refs.search.select();
      return;
    }

    if (event.key === "?" || (event.shiftKey && event.key === "/")) {
      event.preventDefault();
      refs.shortcutsDialog.showModal();
      return;
    }

    // Keyboard selection navigation
    const rows = [...$$(".bookmark")];
    if (!rows.length) return;

    if (event.key === "j" || event.key === "ArrowDown" || event.key === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = (event.key === "j" || event.key === "ArrowDown") ? 1 : -1;
      state.keyboardIndex = Math.max(0, Math.min(rows.length - 1, state.keyboardIndex + step));
      rows.forEach((row, index) => row.classList.toggle("is-keyboard-current", index === state.keyboardIndex));
      rows[state.keyboardIndex].scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }

    if (state.keyboardIndex >= 0 && state.keyboardIndex < rows.length) {
      const currentRow = rows[state.keyboardIndex];
      const bookmarkId = currentRow.dataset.bookmarkId;
      const item = state.items.find((it) => it.id === bookmarkId);
      if (!item) return;

      if (event.key === "Enter") {
        event.preventDefault();
        currentRow.querySelector(".bookmark-link")?.click();
      } else if (event.key === "e") {
        event.preventDefault();
        openDialog(item);
      } else if (event.key === "f") {
        event.preventDefault();
        toggleFavorite(item);
      } else if (event.key === "m") {
        event.preventDefault();
        openMoveDialog(item);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        state.editingId = item.id;
        deleteCurrent();
      }
    }
  });

  // Initialization
  syncThemeButton();
  render();
  if (EXTENSION_MODE) startChromeSync();
})();
