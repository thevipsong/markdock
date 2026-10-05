(() => {
  "use strict";

  const STORAGE_KEY = "qidian-bookmarks-v1";
  const VIEW_KEY = "qidian-view-mode-v1";
  const SORT_KEY = "qidian-sort-mode-v1";
  const DENSITY_KEY = "qidian-density-mode-v1";
  const SIDEBAR_COLLAPSED_KEY = "qidian-sidebar-collapsed-v1";
  const SOURCE_FILTER_KEY = "qidian-source-filter-v1";
  const NAV_TREE_KEY = "qidian-expanded-navigation-v1";
  const PAGE_SIZE = 180;
  const MAX_ICON_DATA_URL_CHARS = 128_000;
  const MAX_IMPORT_ICON_CHARS = 750_000;
  const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_FAVICON_DIMENSION = 2048;
  const MAX_FAVICON_PIXELS = 1_048_576;
  const HIGH_RESOLUTION_FAVICON_PATHS = [
    "favicon-512x512.png",
    "android-chrome-512x512.png",
    "favicon-192x192.png",
    "android-chrome-192x192.png",
    "apple-touch-icon.png",
    "apple-touch-icon-precomposed.png",
    "favicon.svg",
    "favicon-96x96.png",
    "favicon-64x64.png",
    "favicon-48x48.png",
    "favicon-32x32.png",
    "favicon.ico"
  ];
  const MIN_HIGH_RESOLUTION_FAVICON_SIZE = 32;
  const PREFERRED_HIGH_RESOLUTION_FAVICON_SIZE = 96;
  const highResolutionFaviconCache = new Map();
  const MAX_HIGH_RESOLUTION_FAVICON_CACHE_ENTRIES = 512;
  const MAX_CONCURRENT_HIGH_RESOLUTION_LOOKUPS = 4;
  let activeHighResolutionLookups = 0;
  const queuedHighResolutionLookups = [];
  let highResolutionIconGeneration = 0;
  const EXTENSION_MODE = location.protocol === "chrome-extension:";
  const chromeBookmarksBarNames = new Set([
    "书签栏",
    "書籤列",
    "bookmarks bar",
    "bookmarks toolbar",
    "favorites bar",
    "barre de favoris",
    "lesezeichenleiste",
    "barra de marcadores",
    "barra de favoritos",
    "barra dei preferiti",
    "bladwijzerbalk",
    "pasek zakładek",
    "панель закладок",
    "yer işaretleri çubuğu",
    "bokmärkesfält",
    "bogmærkelinje",
    "kirjanmerkkipalkki",
    "lišta záložek",
    "ブックマーク バー",
    "북마크바"
  ]);
  const isChromeBookmarksBar = (name) => chromeBookmarksBarNames.has(String(name || "").trim().toLocaleLowerCase());
  const isChromeBookmarksBarFolder = (folder) => {
    if (folder?.parentId !== "0") return false;
    return folder.folderType
      ? folder.folderType === "bookmarks-bar"
      : isChromeBookmarksBar(folder.title);
  };
  const isChromeBookmarksBarItem = (item) => {
    if (item?.source !== "chrome") return false;
    const rootFolder = getChromeFolderNodes(item)[0];
    return rootFolder ? isChromeBookmarksBarFolder(rootFolder) : isChromeBookmarksBar(item.category);
  };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  function readPreference(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  const refs = {
    tabs: $("#tabs"), subTabsWrap: $("#subTabsWrap"), subTabs: $("#subTabs"),
    content: $("#content"), contentAnnouncement: $("#contentAnnouncement"), count: $("#countLine"), footerCount: $("#footerCount"),
    banner: $("#demoBanner"), search: $("#searchInput"), searchClear: $("#searchClearBtn"),
    searchHintBar: $("#searchHintBar"), searchResultNote: $("#searchResultNote"), clearSearchScopeBtn: $("#clearSearchScopeBtn"),
    file: $("#fileInput"), quickAdd: $("#quickAddButton"),
    collapseAllBtn: $("#collapseAllButton"), collapseAllLabel: $("#collapseAllLabel"),
    actionsButton: $("#actionsButton"), actionsMenu: $("#actionsMenu"), syncNowButton: $("#syncNowButton"),
    importButton: $("#importButton"), demoImportButton: $("#demoImportButton"),
    exportButton: $("#exportButton"), exportMenu: $("#exportMenu"),
    duplicateButton: $("#duplicateButton"), deadLinkButton: $("#deadLinkButton"),
    shortcutsButton: $("#shortcutsButton"), shortcutsDialog: $("#shortcutsDialog"), footerShortcutsLink: $("#footerShortcutsLink"),
    themeToggle: $("#themeToggle"), appearanceMenuItem: $("#appearanceMenuItem"),
    sidebarStorageStatus: $("#sidebarStorageStatus"),
    syncBadge: $("#syncBadge"), syncBadgeText: $("#syncBadgeText"), toast: $("#toast"),
    dialog: $("#bookmarkDialog"), form: $("#bookmarkForm"), error: $("#formError"),
    title: $("#titleField"), url: $("#urlField"), category: $("#categoryField"),
    group: $("#groupField"), favorite: $("#favoriteField"), delete: $("#deleteButton"),
    chromeEditHint: $("#chromeEditHint"),
    targetDestWrap: $("#targetDestinationWrap"), destToggle: $("#saveDestinationToggle"),
    chromeFolderWrap: $("#chromeFolderSelectWrap"), chromeFolderSelect: $("#chromeFolderSelect"),
    localOrganizeFields: $("#localOrganizeFields"),
    moveDialog: $("#moveDialog"), moveForm: $("#moveForm"), moveTarget: $("#moveTarget"), newGroup: $("#newGroupName"),
    renameDialog: $("#renameDialog"), renameForm: $("#renameForm"), renameInput: $("#renameInput"), renameHint: $("#renameHint"), renameError: $("#renameError"),
    auditDialog: $("#auditDialog"), auditSummary: $("#auditSummary"), auditResults: $("#auditResults"),
    auditCancelButton: $("#cancelAuditButton"),
    auditProgressWrap: $("#auditProgressWrap"), auditProgressBar: $("#auditProgressBar"), mergeButton: $("#mergeDuplicatesButton"),
    contextMenu: $("#contextMenu"), tooltip: $("#bookmarkTooltip"), contextFavoriteLabel: $("#contextFavoriteLabel"),
    sidebarCollapseButton: $("#sidebarCollapseButton"),
    selectionToolbar: $("#selectionToolbar"), selectionCount: $("#selectionCount"),
    selectAllResultsButton: $("#selectAllResultsButton"), clearSelectionButton: $("#clearSelectionButton"),
    selectionMoveButton: $("#selectionMoveButton"), selectionFavoriteButton: $("#selectionFavoriteButton"),
    selectionDeleteButton: $("#selectionDeleteButton"), selectionExitButton: $("#selectionExitButton"),
    commandDialog: $("#commandDialog"), commandInput: $("#commandInput"), commandResults: $("#commandResults"),
    closeCommandButton: $("#closeCommandButton"), toastMessage: $("#toastMessage"), toastAction: $("#toastAction")
  };

  // Group headings are sticky below the floating titlebar. Measure the actual
  // titlebar instead of relying on a fixed height, since it becomes two rows
  // on narrow windows and can change height when controls wrap.
  const titlebar = $(".titlebar");
  const syncBookmarkGroupStickyOffset = () => {
    if (!titlebar) return;
    const height = Math.ceil(titlebar.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--bookmark-group-sticky-top", `${height + 8}px`);
  };
  if (titlebar) {
    syncBookmarkGroupStickyOffset();
    if ("ResizeObserver" in window) {
      new ResizeObserver(syncBookmarkGroupStickyOffset).observe(titlebar);
    }
  }

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
  const chromeIconOverrides = new Map(saved?.chromeIconOverrides || []);
  const savedViewMode = readPreference(VIEW_KEY, "grid");
  const savedSortMode = readPreference(SORT_KEY, "default");
  const savedDensityMode = readPreference(DENSITY_KEY, "comfortable");
  const savedSidebarCollapsed = readPreference(SIDEBAR_COLLAPSED_KEY, "false") === "true";
  try { localStorage.removeItem(SOURCE_FILTER_KEY); } catch { /* ignore */ }

  let savedNavigation = { expanded: [], collapsed: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(NAV_TREE_KEY) || "{}");
    savedNavigation = {
      expanded: Array.isArray(raw.expanded) ? raw.expanded : [],
      collapsed: Array.isArray(raw.collapsed) ? raw.collapsed : []
    };
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
    renamingSection: null, // { path, renameChrome, renameLocal, chromeFolderId }
    viewMode: savedViewMode === "list" ? "list" : "grid",
    densityMode: savedDensityMode === "compact" ? "compact" : "comfortable",
    sidebarCollapsed: savedSidebarCollapsed,
    quickSourceFilter: "all",
    selectionMode: false,
    selectedBookmarkIds: new Set(),
    movingIds: [],
    sortMode: ["default", "name", "recent", "domain"].includes(savedSortMode)
      ? savedSortMode
      : "default",
    expandedNavNodes: new Set(savedNavigation.expanded),
    collapsedNavNodes: new Set(savedNavigation.collapsed),
    contextFolderNode: null
  };

  let toastTimer;
  let toastActionHandler = null;
  let lastBulkDelete = null;
  let commandOptions = [];
  let commandActiveIndex = 0;
  let tooltipHideTimer;
  let searchRenderTimer;
  let announcementTimer;
  let persistenceIconWarningPending = 0;
  let activeDeadLinkCheck = null;
  let importInProgress = false;
  let mergeInProgress = false;
  let editingSnapshot = null;
  let chromeFolders = new Map();
  let chromeBarRootAlternateLabel = "";
  let contextMenuReturnFocus = null;
  const dialogFocusReturns = new WeakMap();
  const pinyinCollator = new Intl.Collator("zh-u-co-pinyin");
  const pinyinAnchors = [..."阿八擦搭蛾发噶哈击喀垃妈拿哦啪七然仨塌挖夕压匝"];
  const pinyinLetters = [..."ABCDEFGHJKLMNOPQRSTWXYZ"];
  const commonPolyphonicInitials = new Map(Object.entries({
    "长": "CZ", "重": "CZ", "行": "XH", "乐": "LY", "厦": "XS",
    "曾": "ZC", "单": "DSC", "区": "QO", "仇": "CQ", "解": "JX",
    "藏": "CZ", "秘": "MB", "朝": "CZ", "强": "QJ", "省": "SX",
    "降": "JX", "盛": "SC", "便": "BP", "传": "CZ", "率": "SL",
    "调": "TD", "假": "JX", "种": "ZC", "恶": "EW", "宿": "SX",
    "卡": "KQ", "贾": "JG"
  }));

  function id() {
    return globalThis.crypto?.randomUUID?.() || `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function normalizeLocalItemIds(items, reservedIds = []) {
    const seen = new Set(reservedIds.map(String));
    let changed = false;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const itemId = String(item.id || "");
      if (item.source === "chrome") {
        seen.add(itemId);
        continue;
      }
      if (!itemId || itemId.startsWith("chrome-") || seen.has(itemId)) {
        let nextId;
        do { nextId = `local-${id()}`; }
        while (seen.has(nextId));
        item.id = nextId;
        changed = true;
      }
      seen.add(String(item.id));
    }
    return changed;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.items)) return null;
      const items = parsed.items.filter((item) => item?.source !== "chrome").map(sanitizeItem).filter(Boolean);
      normalizeLocalItemIds(items);
      return {
        items,
        chromeFavorites: Array.isArray(parsed.chromeFavorites) ? parsed.chromeFavorites.filter((value) => typeof value === "string") : [],
        chromeIconOverrides: sanitizeChromeIconOverrides(parsed.chromeIconOverrides)
      };
    } catch { return null; }
  }

  function sanitizeItem(value) {
    if (!value || typeof value !== "object") return null;
    const url = storedBookmarkUrl(value.url);
    if (!url) return null;
    const category = String(value.category || "未分类").trim().slice(0, 50) || "未分类";
    const group = String(value.group || "常用书签").trim().slice(0, 100) || "常用书签";
    const path = Array.isArray(value.path) && value.path.length
      ? value.path.map((part) => String(part).trim()).filter(Boolean)
      : [category, ...group.split(" / ").filter(Boolean)];
    const rawDateAdded = value.dateAdded;
    const parsedDateAdded = typeof rawDateAdded === "number"
      ? rawDateAdded
      : (typeof rawDateAdded === "string" && rawDateAdded.trim() ? Number(rawDateAdded) : NaN);
    const dateAdded = Number.isSafeInteger(parsedDateAdded)
      && parsedDateAdded >= 0
      && parsedDateAdded <= 8_640_000_000_000_000
      ? parsedDateAdded
      : Date.now();
    return {
      id: String(value.id || id()),
      title: bookmarkTitle(value.title, url),
      url, category, group, path,
      favorite: Boolean(value.favorite),
      icon: validIcon(value.icon) ? value.icon : "",
      source: value.source === "chrome" ? "chrome" : "local",
      chromeId: value.chromeId == null || value.chromeId === "" ? undefined : String(value.chromeId),
      parentId: value.parentId == null || value.parentId === "" ? undefined : String(value.parentId),
      dateAdded
    };
  }

  function persist() {
    if (state.mode === "demo") return true;
    const localItems = state.items.filter((item) => item.source !== "chrome");
    const payload = (items, iconOverrides = [...chromeIconOverrides]) => JSON.stringify({
      version: 2,
      items,
      chromeFavorites: [...chromeFavorites],
      chromeIconOverrides: iconOverrides
    });
    const applySavedItems = (save) => {
      let localIndex = 0;
      state.items = state.items.map((item) => {
        if (item.source === "chrome") {
          const chromeId = String(item.chromeId || item.id);
          return save.removedChromeIds.has(chromeId) ? { ...item, icon: "" } : item;
        }
        return save.items[localIndex++];
      });
      if (save.removedChromeIds.size) {
        chromeIconOverrides.clear();
        save.iconOverrides.forEach(([chromeId, override]) => chromeIconOverrides.set(chromeId, override));
      }
      persistenceIconWarningPending += save.removedCount;
    };
    try {
      localStorage.setItem(STORAGE_KEY, payload(localItems));
      return true;
    } catch {
      // Bookmark icons are disposable cache data. Reclaim the largest icon
      // payloads across both local bookmarks and Chrome overrides before
      // rejecting a bookmark or favorite update for quota reasons.
      const iconEntries = [
        ...localItems.map((item, index) => ({ kind: "local", index, order: index, size: item.icon?.length || 0 })),
        ...[...chromeIconOverrides].map(([chromeId, override], index) => ({
          kind: "chrome",
          chromeId,
          order: localItems.length + index,
          size: override?.icon?.length || 0
        }))
      ]
        .filter((entry) => entry.size > 0)
        .sort((a, b) => b.size - a.size || a.order - b.order);
      if (!iconEntries.length) return false;

      let lower = 1;
      let upper = iconEntries.length;
      let bestSave = null;
      let lastSuccessfulSave = null;
      while (lower <= upper) {
        const removeCount = Math.floor((lower + upper) / 2);
        const removedEntries = iconEntries.slice(0, removeCount);
        const removedIndexes = new Set(removedEntries
          .filter((entry) => entry.kind === "local")
          .map((entry) => entry.index));
        const removedChromeIds = new Set(removedEntries
          .filter((entry) => entry.kind === "chrome")
          .map((entry) => entry.chromeId));
        const candidateItems = localItems.map((item, index) => removedIndexes.has(index)
          ? { ...item, icon: "" }
          : item);
        const candidateIconOverrides = [...chromeIconOverrides]
          .filter(([chromeId]) => !removedChromeIds.has(chromeId));
        const candidate = {
          items: candidateItems,
          iconOverrides: candidateIconOverrides,
          removedCount: removeCount,
          removedChromeIds
        };
        try {
          localStorage.setItem(STORAGE_KEY, payload(candidateItems, candidateIconOverrides));
          bestSave = candidate;
          lastSuccessfulSave = candidate;
          upper = removeCount - 1;
        } catch {
          lower = removeCount + 1;
        }
      }

      const save = bestSave || lastSuccessfulSave;
      if (!save) return false;
      try {
        localStorage.setItem(STORAGE_KEY, payload(save.items, save.iconOverrides));
      } catch {
        // Keep the last candidate that was already written successfully.
        if (!lastSuccessfulSave) return false;
        applySavedItems(lastSuccessfulSave);
        return true;
      }
      applySavedItems(save);
      return true;
    }
  }

  function saveViewPreferences() {
    try {
      localStorage.setItem(VIEW_KEY, state.viewMode);
      localStorage.setItem(SORT_KEY, state.sortMode);
      localStorage.setItem(DENSITY_KEY, state.densityMode);
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(state.sidebarCollapsed));
      localStorage.setItem(NAV_TREE_KEY, JSON.stringify({
        expanded: [...state.expandedNavNodes],
        collapsed: [...state.collapsedNavNodes]
      }));
    } catch { /* storage quota */ }
  }

  function safeUrl(input) {
    if (typeof input !== "string") return "";
    let value = input.trim();
    if (!value) return "";
    // A bare IPv6 literal starts with hexadecimal characters followed by a
    // colon, so the generic scheme detector below would mistake it for a URL
    // scheme (for example, `fd00::1` would be read as `fd00:`). Validate it as
    // an address first, then add the brackets required by URL syntax.
    const bareIpv6 = value.match(/^([0-9a-f:.]+)(?=$|[/?#])/i);
    if (bareIpv6?.[1].includes(":")) {
      const address = bareIpv6[1];
      try {
        new URL(`https://[${address}]/`);
        const suffix = value.slice(address.length);
        const protocol = isLocalBookmarkHost(address) ? "http" : "https";
        value = `${protocol}://[${address}]${suffix}`;
      } catch { /* Let the normal URL validation report invalid input. */ }
    }
    const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() || "";
    const protocolRelative = value.startsWith("//");
    const hostPort = value.match(/^(\[[^\]]+\]|[^:/?#\s]+):(\d{1,5})(?=$|[/?#])/u);
    const likelyHostPort = Boolean(hostPort && (
      hostPort[1].includes(".") || hostPort[1].includes(":") || isLocalBookmarkHost(hostPort[1])
    ));
    if (!scheme || protocolRelative || likelyHostPort) {
      const hostInput = protocolRelative ? value.slice(2) : value;
      const host = hostInput.match(/^(\[[^\]]+\]|[^:/?#\s]+)(?::\d{1,5})?(?=$|[/?#])/u)?.[1] || "";
      value = `${isLocalBookmarkHost(host) ? "http" : "https"}://${hostInput}`;
    }
    try {
      const url = new URL(value);
      // Only web pages are directly navigable from the gallery. Browser-internal,
      // local-file and external-handler schemes remain stored, but their behavior
      // depends on Chrome privileges or OS handlers and cannot be promised here.
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function isLocalBookmarkHost(hostname) {
    let host = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
    if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
    if (!host) return false;
    if (["localhost", "nas", "qnap", "synology", "unraid", "router", "pve", "proxmox", "homeassistant"].includes(host)
      || [".localhost", ".local", ".lan", ".internal", ".test", ".home.arpa"].some((suffix) => host.endsWith(suffix))) return true;
    if (host.includes(":")) {
      return host === "::1" || /^(?:fc|fd|fe[89ab])/i.test(host);
    }
    // Single-label names such as "intranet" are commonly resolved by local DNS.
    // Match the web-mode checker so a bare local host defaults to HTTP in both modes.
    if (!host.includes(".")) return true;
    const octets = host.split(".");
    if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
    const [first, second] = octets.map(Number);
    return first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      // Tailscale and other overlays commonly use RFC 6598 shared space.
      || (first === 100 && second >= 64 && second <= 127);
  }

  function storedBookmarkUrl(input) {
    if (typeof input !== "string") return "";
    const value = input.trim();
    if (!value) return "";
    const openableUrl = safeUrl(value);
    if (openableUrl) return openableUrl;
    // Chrome can store bookmarklets and other explicit URL schemes. Keep
    // syntactically valid values in the model so sync, search, edit and export
    // remain lossless; callers must still use safeUrl() before navigating.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";
    try {
      new URL(value);
      return value;
    } catch { return ""; }
  }

  function webPageUrl(input) {
    const value = safeUrl(input);
    if (!value) return "";
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function restrictedBookmarkLabel(input) {
    const scheme = String(input || "").match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
    return scheme === "javascript"
      ? "脚本书签 · 请在 Chrome 书签中使用"
      : `${scheme ? `${scheme.toUpperCase()} 网址` : "特殊网址"} · 请在 Chrome 中使用`;
  }

  function restrictedBookmarkMessage(input) {
    const scheme = String(input || "").match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
    return scheme === "javascript"
      ? "栖屿不会执行书签脚本。可右键复制网址，再到 Chrome 书签中使用。"
      : "为安全起见，栖屿不会直接打开此类型网址。可右键复制网址，再到 Chrome 中使用。";
  }

  function bookmarkTitle(input, url) {
    const supplied = String(input ?? "").trim();
    if (supplied) return supplied.slice(0, 512);
    const host = hostOf(url);
    if (host) return host.slice(0, 512);
    const scheme = String(url || "").match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
    if (scheme === "javascript") return "脚本书签";
    if (!safeUrl(url) && scheme) return `特殊网址（${scheme}）`;
    return String(url || "书签").trim().slice(0, 512) || "书签";
  }

  function normalizeUrlForDedup(rawUrl) {
    try {
      // URL normalizes the scheme, hostname and default port. Keep the path,
      // query and fragment case-sensitive: servers and client routers may treat
      // those as distinct resources, and merging them could delete a valid link.
      return new URL(rawUrl).href;
    } catch {
      return (rawUrl || "").trim();
    }
  }

  function validIcon(value) {
    return typeof value === "string"
      && value.length <= MAX_ICON_DATA_URL_CHARS
      && /^data:image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/i.test(value);
  }

  function sanitizeChromeIconOverrides(value) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return [];
      const chromeId = String(entry[0] || "");
      const override = entry[1];
      const url = safeUrl(override?.url);
      if (!chromeId || !url || !validIcon(override?.icon)) return [];
      return [[chromeId, { url, icon: override.icon }]];
    });
  }

  function chromeIconForBookmark(chromeId, url) {
    const override = chromeIconOverrides.get(String(chromeId || ""));
    if (!override || normalizeUrlForDedup(override.url) !== normalizeUrlForDedup(url)) return "";
    return validIcon(override.icon) ? override.icon : "";
  }

  function setChromeIconOverride(item, icon) {
    if (!item?.chromeId || !validIcon(icon)) return false;
    const url = safeUrl(item.url);
    if (!url) return false;
    chromeIconOverrides.set(String(item.chromeId), { url, icon });
    return true;
  }

  function hostOf(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");
      return parsed.port ? `${host}:${parsed.port}` : host;
    } catch { return ""; }
  }

  function decodeUrlText(value) {
    const text = String(value || "");
    try { return decodeURIComponent(text.replace(/\+/g, " ")); }
    catch { return text; }
  }

  function searchableUrl(rawUrl) {
    const value = String(rawUrl || "");
    return `${value} ${decodeUrlText(value)}`.toLocaleLowerCase();
  }

  function releaseHighResolutionLookupSlot() {
    activeHighResolutionLookups = Math.max(0, activeHighResolutionLookups - 1);
    while (activeHighResolutionLookups < MAX_CONCURRENT_HIGH_RESOLUTION_LOOKUPS
      && queuedHighResolutionLookups.length) {
      const queued = queuedHighResolutionLookups.shift();
      if (!queued.isNeeded()) {
        queued.resolve(null);
        continue;
      }
      activeHighResolutionLookups++;
      queued.resolve(createHighResolutionSlotRelease());
    }
  }

  function createHighResolutionSlotRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      releaseHighResolutionLookupSlot();
    };
  }

  function acquireHighResolutionLookupSlot(isNeeded) {
    if (!isNeeded()) return Promise.resolve(null);
    if (activeHighResolutionLookups < MAX_CONCURRENT_HIGH_RESOLUTION_LOOKUPS) {
      activeHighResolutionLookups++;
      return Promise.resolve(createHighResolutionSlotRelease());
    }
    return new Promise((resolve) => {
      queuedHighResolutionLookups.push({ isNeeded, resolve });
    });
  }

  function urlPathPreview(rawUrl, queryTokens) {
    let parsed;
    try { parsed = new URL(rawUrl); }
    catch { return hostOf(rawUrl) || rawUrl; }

    const host = `${parsed.hostname.replace(/^www\./, "")}${parsed.port ? `:${parsed.port}` : ""}`;
    const encodedTail = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const decodedTail = decodeUrlText(encodedTail);
    const tail = queryTokens.some((token) => encodedTail.toLocaleLowerCase().includes(token))
      ? encodedTail
      : decodedTail;
    const lowerTail = tail.toLocaleLowerCase();
    if (!queryTokens.some((token) => lowerTail.includes(token))) return host;

    const label = `${host}${tail}`;
    if (label.length <= 48) return label;
    const matchAt = Math.min(...queryTokens
      .map((token) => label.toLocaleLowerCase().indexOf(token))
      .filter((index) => index >= 0));
    const start = Math.max(0, Math.min(matchAt - 12, label.length - 48));
    const end = start + 48;
    return `${start ? "…" : ""}${label.slice(start, end)}${end < label.length ? "…" : ""}`;
  }

  function faviconDirectoryForUrl(parsed) {
    const pathname = parsed.pathname || "/";
    if (pathname.endsWith("/")) return `${parsed.origin}${pathname}`;
    const lastSlash = pathname.lastIndexOf("/");
    const lastSegment = pathname.slice(lastSlash + 1);
    const directoryPath = /\.[a-z\d]{1,12}$/i.test(lastSegment)
      ? `${pathname.slice(0, lastSlash + 1) || "/"}`
      : `${pathname}/`;
    return `${parsed.origin}${directoryPath}`;
  }

  function findHighResolutionFavicon(rawUrl, isConsumerActive = () => true) {
    let bookmarkDirectory;
    let faviconDirectories;
    try {
      const parsed = new URL(rawUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) return Promise.resolve(null);
      // Resolve icons relative to the bookmarked app directory. A NAS or
      // reverse proxy can host unrelated apps on one origin; sharing a root
      // favicon cache entry makes those bookmarks display the wrong brand.
      bookmarkDirectory = faviconDirectoryForUrl(parsed);
      // Many sites keep their only high-resolution icon at the origin root,
      // even when the bookmark points into a nested app or a route without an
      // explicit file extension. Prefer a scoped icon when present, then use
      // the root icon as a fallback instead of silently keeping a tiny favicon.
      faviconDirectories = [...new Set([bookmarkDirectory, `${parsed.origin}/`])];
    } catch {
      return Promise.resolve(null);
    }
    const cached = highResolutionFaviconCache.get(bookmarkDirectory);
    if (cached && (cached.expiresAt === Infinity || cached.expiresAt > Date.now())) {
      // Map insertion order doubles as an LRU list, so visiting a frequently
      // used app directory keeps its pending/result entry while old entries can go.
      if (cached.expiresAt === Infinity) cached.consumers.add(isConsumerActive);
      highResolutionFaviconCache.delete(bookmarkDirectory);
      highResolutionFaviconCache.set(bookmarkDirectory, cached);
      return cached.promise;
    }
    if (cached) highResolutionFaviconCache.delete(bookmarkDirectory);

    const entry = { expiresAt: Infinity, promise: null, consumers: new Set([isConsumerActive]) };
    const hasActiveConsumer = () => {
      for (const isActive of entry.consumers) {
        try {
          if (isActive()) return true;
        } catch { /* detached cards are no longer active consumers */ }
        entry.consumers.delete(isActive);
      }
      return false;
    };
    const lookup = (async () => {
      const releaseSlot = await acquireHighResolutionLookupSlot(hasActiveConsumer);
      if (!releaseSlot) return null;
      try {
        const deadline = Date.now() + 4_000;
        for (const [directoryIndex, directory] of faviconDirectories.entries()) {
          let bestIcon = null;
          let bestSize = 0;
          for (const [pathIndex, path] of HIGH_RESOLUTION_FAVICON_PATHS.entries()) {
            if (!hasActiveConsumer()) return null;
            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            const pathsRemainingInDirectory = HIGH_RESOLUTION_FAVICON_PATHS.length - pathIndex;
            const directoriesRemaining = faviconDirectories.length - directoryIndex - 1;
            const probesRemaining = pathsRemainingInDirectory
              + directoriesRemaining * HIGH_RESOLUTION_FAVICON_PATHS.length;
            const probeTimeout = Math.min(500, remaining / probesRemaining);
            const source = new URL(path, directory).href;
            const candidate = await new Promise((resolve) => {
              const image = new Image();
              let settled = false;
              const finish = (value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                image.onload = null;
                image.onerror = null;
                if (value === null) image.removeAttribute("src");
                resolve(value);
              };
              // Share the four-second budget across both scoped and root paths,
              // so a slow missing icon cannot starve later fallbacks.
              const timer = setTimeout(() => finish(null), probeTimeout);
              image.decoding = "async";
              image.referrerPolicy = "no-referrer";
              image.onload = () => {
                const width = image.naturalWidth || 0;
                const height = image.naturalHeight || 0;
                const withinDecodeBudget = width > 0 && height > 0
                  && width <= MAX_FAVICON_DIMENSION
                  && height <= MAX_FAVICON_DIMENSION
                  && width * height <= MAX_FAVICON_PIXELS;
                finish(withinDecodeBudget ? {
                  url: source,
                  size: Math.min(width, height)
                } : null);
              };
              image.onerror = () => finish(null);
              try { image.src = source; } catch { finish(null); }
            });
            if (!hasActiveConsumer()) return null;
            if (candidate?.size >= MIN_HIGH_RESOLUTION_FAVICON_SIZE && candidate.size > bestSize) {
              bestIcon = candidate;
              bestSize = candidate.size;
            }
            // Favicons render at roughly 20px in cards; 96px is already a sharp
            // source for high-density displays, so avoid probing every fallback
            // path once a suitably detailed image has been found.
            if (bestSize >= PREFERRED_HIGH_RESOLUTION_FAVICON_SIZE) break;
          }
          // A path-specific icon belongs to the bookmarked app. Only consult
          // the origin-wide icon when the app directory had no usable artwork.
          if (bestIcon) return bestIcon;
        }
        return null;
      } finally {
        releaseSlot();
      }
    })().catch(() => null);
    entry.promise = lookup;
    highResolutionFaviconCache.set(bookmarkDirectory, entry);
    while (highResolutionFaviconCache.size > MAX_HIGH_RESOLUTION_FAVICON_CACHE_ENTRIES) {
      const oldestDirectory = highResolutionFaviconCache.keys().next().value;
      if (oldestDirectory === undefined) break;
      highResolutionFaviconCache.delete(oldestDirectory);
    }
    lookup.then((source) => {
      if (highResolutionFaviconCache.get(bookmarkDirectory) !== entry) return;
      const hasLiveConsumer = hasActiveConsumer();
      entry.consumers.clear();
      if (!source && !hasLiveConsumer) {
        highResolutionFaviconCache.delete(bookmarkDirectory);
        return;
      }
      // Keep successful matches for the current browsing session, but retry a
      // failed lookup later so a temporary offline or timeout result is not
      // cached until the extension page is reloaded.
      entry.expiresAt = Date.now() + (source ? 10 * 60_000 : 15_000);
    });
    return lookup;
  }

  function adaptFaviconSurface(favicon, wrapper) {
    delete wrapper.dataset.iconMark;
    if (!favicon?.naturalWidth || !favicon.naturalHeight) {
      wrapper.dataset.iconContrast = "unknown";
      return true;
    }
    if (favicon.naturalWidth > MAX_FAVICON_DIMENSION
      || favicon.naturalHeight > MAX_FAVICON_DIMENSION
      || favicon.naturalWidth * favicon.naturalHeight > MAX_FAVICON_PIXELS) {
      return false;
    }
    delete wrapper.dataset.iconSurface;
    delete wrapper.dataset.iconContrast;
    try {
      const size = 24;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        wrapper.dataset.iconContrast = "unknown";
        return true;
      }
      context.drawImage(favicon, 0, 0, size, size);

      const pixels = context.getImageData(0, 0, size, size).data;
      let transparentPixels = 0;
      let alphaMass = 0;
      let darkMass = 0;
      let lightMass = 0;
      let neutralDarkMass = 0;
      let neutralLightMass = 0;
      let nearBlackMass = 0;
      let nearWhiteMass = 0;
      let cornerOpaqueMass = 0;
      let cornerLuminanceMass = 0;
      let cornerRelativeLuminanceMass = 0;
      let cornerRedMass = 0;
      let cornerGreenMass = 0;
      let cornerBlueMass = 0;
      let cornerSampleMass = 0;
      let cornerDarkMass = 0;
      let cornerLightMass = 0;
      const linearizeChannel = (channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      const relativeLuminance = (red, green, blue) =>
        0.2126 * linearizeChannel(red)
        + 0.7152 * linearizeChannel(green)
        + 0.0722 * linearizeChannel(blue);
      for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3] / 255;
        if (alpha < 0.08) {
          transparentPixels++;
          continue;
        }
        alphaMass += alpha;
        const luminance = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        if (luminance < 128) darkMass += alpha;
        if (luminance > 220) lightMass += alpha;
        const channelRange = Math.max(pixels[i], pixels[i + 1], pixels[i + 2])
          - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
        const pixel = i / 4;
        const x = pixel % size;
        const y = Math.floor(pixel / size);
        const inCorner = (x < 3 || x >= size - 3) && (y < 3 || y >= size - 3);
        if (inCorner && alpha > 0.78 && channelRange <= 34) {
          cornerOpaqueMass += alpha;
          cornerLuminanceMass += luminance * alpha;
          cornerRelativeLuminanceMass += relativeLuminance(pixels[i], pixels[i + 1], pixels[i + 2]) * alpha;
          cornerRedMass += pixels[i] * alpha;
          cornerGreenMass += pixels[i + 1] * alpha;
          cornerBlueMass += pixels[i + 2] * alpha;
          cornerSampleMass += alpha;
          if (luminance > 218) cornerLightMass += alpha;
          if (luminance < 42) cornerDarkMass += alpha;
        }
        if (channelRange <= 30) {
          // Include subdued gray marks too. Many browser favicons are rasterized
          // with antialiasing that turns an otherwise white/black logo into a
          // medium gray at 24px; the stricter cutoffs left those marks on the
          // default pale tile in light mode.
          if (luminance < 128) neutralDarkMass += alpha;
          if (luminance > 164) neutralLightMass += alpha;
        }
        // Transparent monochrome glyphs are not a dark/light *canvas*. Keep
        // their ink tone separate so white marks can be recolored on light
        // cards and black marks can be lifted on dark cards without touching
        // colored brand artwork.
        if (channelRange <= 24 && Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) < 28) {
          nearBlackMass += alpha;
        }
        if (channelRange <= 24 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 228) {
          nearWhiteMass += alpha;
        }
      }

      const transparentRatio = transparentPixels / (size * size);
      if (!alphaMass) return false;
      if (transparentRatio > 0.98) {
        // A small but valid mark can occupy very few pixels (for example a
        // thin monogram). Keep it and add a contrasting surface instead of
        // discarding it as an empty image.
        wrapper.dataset.iconContrast = "unknown";
        return true;
      }
      const darkRatio = darkMass / alphaMass;
      const lightRatio = lightMass / alphaMass;
      const neutralDarkRatio = neutralDarkMass / alphaMass;
      const neutralLightRatio = neutralLightMass / alphaMass;
      const nearBlackRatio = nearBlackMass / alphaMass;
      const nearWhiteRatio = nearWhiteMass / alphaMass;

      // Chrome's cached favicons often contain a transparent white or black
      // glyph (for example a monochrome GitHub mark). Treating that glyph as
      // the icon's surface leaves it with almost no contrast in one theme.
      if (transparentRatio > 0.18) {
        if (nearWhiteRatio > 0.72 && nearBlackRatio < 0.08) {
          wrapper.dataset.iconMark = "light";
        } else if (nearBlackRatio > 0.72 && nearWhiteRatio < 0.08) {
          wrapper.dataset.iconMark = "dark";
        }
      }

      // For opaque favicons, trust a neutral corner as the site's own canvas
      // before judging the logo pixels. This preserves white-backed brand marks
      // on the light surface instead of placing the whole icon on a dark tile.
      if (transparentRatio < 0.18) {
        if (cornerOpaqueMass > 0) {
          const lightBackgroundRatio = cornerLightMass / cornerOpaqueMass;
          const darkBackgroundRatio = cornerDarkMass / cornerOpaqueMass;
          if (lightBackgroundRatio > 0.66) wrapper.dataset.iconSurface = "light";
          else if (darkBackgroundRatio > 0.66) wrapper.dataset.iconSurface = "dark";
        }
        // A nearly monochrome mark that fills the image has no separate canvas
        // to preserve, so give it a contrasting neutral tile on the other theme.
        if (!wrapper.dataset.iconSurface) {
          if (darkRatio > 0.92 && neutralDarkRatio > 0.88) wrapper.dataset.iconSurface = "light";
          else if (lightRatio > 0.92 && neutralLightRatio > 0.88) wrapper.dataset.iconSurface = "dark";
        }
        // Solid mid-gray or mixed-color marks have no reliable intrinsic
        // surface classification. Use a restrained neutral plate and outline.
        if (!wrapper.dataset.iconSurface) wrapper.dataset.iconContrast = "unknown";

        // A pale canvas with almost no darker or saturated detail looks blank
        // on the light theme even though its image request technically loaded.
        // Prefer the readable letter fallback for that near-empty mark. Real
        // white-backed logos with a visible dark or colored mark pass this test.
        if (wrapper.dataset.iconSurface === "light" && cornerSampleMass > 0
          && cornerLuminanceMass / cornerSampleMass > 210) {
          let distinctDetailMass = 0;
          const backgroundLuminance = cornerRelativeLuminanceMass / cornerSampleMass;
          const backgroundRed = cornerRedMass / cornerSampleMass;
          const backgroundGreen = cornerGreenMass / cornerSampleMass;
          const backgroundBlue = cornerBlueMass / cornerSampleMass;
          for (let i = 0; i < pixels.length; i += 4) {
            const alpha = pixels[i + 3] / 255;
            if (alpha < 0.2) continue;
            const pixel = i / 4;
            const x = pixel % size;
            const y = Math.floor(pixel / size);
            if ((x < 3 || x >= size - 3) && (y < 3 || y >= size - 3)) continue;
            const sourceLuminance = relativeLuminance(pixels[i], pixels[i + 1], pixels[i + 2]);
            const pixelLuminance = sourceLuminance * alpha + backgroundLuminance * (1 - alpha);
            const contrastRatio = (Math.max(pixelLuminance, backgroundLuminance) + 0.05)
              / (Math.min(pixelLuminance, backgroundLuminance) + 0.05);
            const redDifference = Math.abs(pixels[i] * alpha + backgroundRed * (1 - alpha) - backgroundRed);
            const greenDifference = Math.abs(pixels[i + 1] * alpha + backgroundGreen * (1 - alpha) - backgroundGreen);
            const blueDifference = Math.abs(pixels[i + 2] * alpha + backgroundBlue * (1 - alpha) - backgroundBlue);
            if (contrastRatio >= 2.2 || Math.max(redDifference, greenDifference, blueDifference) >= 72) {
              distinctDetailMass += alpha;
            }
          }
          if (distinctDetailMass / alphaMass < 0.025) return false;
        }
        return true;
      }
      if (darkRatio > 0.84 || neutralDarkRatio > 0.64) {
        wrapper.dataset.iconSurface = "light";
      } else if (lightRatio > 0.84 || neutralLightRatio > 0.64) {
        wrapper.dataset.iconSurface = "dark";
      } else if (Math.max(neutralDarkRatio, neutralLightRatio) > 0.3) {
        // Monochrome marks with mixed light/dark pixels need a neutral plate too.
        wrapper.dataset.iconContrast = "unknown";
      }
      return true;
    } catch {
      // Chrome's favicon service can taint the canvas. Outline the mark so
      // transparent white or dark favicons remain visible in either theme.
      wrapper.dataset.iconContrast = "unknown";
      return true;
    }
  }

  function syncThemeButton() {
    const dark = document.documentElement.dataset.theme === "dark";
    const label = dark ? "切换白色模式" : "切换暗黑模式";
    if (refs.themeToggle) {
      refs.themeToggle.setAttribute("aria-label", label);
      refs.themeToggle.title = label;
    }
    const meta = $("meta[name='theme-color']");
    if (meta) meta.content = dark ? "#101014" : "#f4f4f6";
  }

  function toggleTheme() {
    if (window.qidianSkin && typeof window.qidianSkin.toggleTheme === "function") {
      window.qidianSkin.toggleTheme();
    } else {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      document.documentElement.dataset.skin = next === "dark" ? "midnight" : "ivory";
      try { localStorage.setItem("qidian-theme-v1", next); } catch { /* ignore */ }
    }
    syncThemeButton();
  }
  window.addEventListener("qidian:skinchange", syncThemeButton);

  function toast(message, isError = false, action = null) {
    const persistenceNotice = consumePersistenceIconWarning();
    if (persistenceNotice) message += `；${persistenceNotice}`;
    clearTimeout(toastTimer);
    refs.toastMessage.textContent = message;
    toastActionHandler = typeof action?.onActivate === "function" ? action.onActivate : null;
    refs.toastAction.hidden = !toastActionHandler;
    refs.toastAction.textContent = toastActionHandler ? String(action.label || "撤销") : "";
    refs.toast.classList.toggle("error", isError);
    refs.toast.classList.add("show");
    toastTimer = setTimeout(() => {
      refs.toast.classList.remove("show");
      refs.toastAction.hidden = true;
      toastActionHandler = null;
    }, toastActionHandler ? 9000 : 3200);
  }

  function consumePersistenceIconWarning() {
    if (!persistenceIconWarningPending) return "";
    const removedCount = persistenceIconWarningPending;
    persistenceIconWarningPending = 0;
    return `因本地存储空间限制，已清除 ${removedCount} 个书签的图标缓存`;
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
  const initialsChoicesCache = new Map();
  const MAX_PINYIN_CACHE_ENTRIES = 8192;
  function pinyinInitials(title) {
    const value = String(title || "");
    if (initialsCache.has(value)) {
      const cached = initialsCache.get(value);
      initialsCache.delete(value);
      initialsCache.set(value, cached);
      return cached;
    }
    // Keep each Han character's pinyin initial, but treat Latin words as
    // words too. This makes “Windows desktop” searchable as “WD” and keeps
    // camel-case boundaries such as “GitHub” searchable as “GH”.
    const tokens = value.match(/\p{Script=Han}|[A-Z]+(?=[A-Z][a-z]|\b)|[A-Z]?[a-z]+|\d+/gu) || [];
    const result = tokens.map((token) => {
      if (/\p{Script=Han}/u.test(token)) {
        const character = token;
        let index = 0;
        for (let i = 0; i < pinyinAnchors.length; i++) {
          if (pinyinCollator.compare(character, pinyinAnchors[i]) >= 0) index = i;
          else break;
        }
        return pinyinLetters[index] || "";
      }
      if (/^[A-Z]+$/.test(token)) return token;
      return token[0]?.toUpperCase() || "";
    }).join("");
    if (initialsCache.size >= MAX_PINYIN_CACHE_ENTRIES) {
      const oldestValue = initialsCache.keys().next().value;
      if (oldestValue !== undefined) initialsCache.delete(oldestValue);
    }
    initialsCache.set(value, result);
    return result;
  }

  function pinyinInitialChoices(title) {
    const value = String(title || "");
    if (initialsChoicesCache.has(value)) {
      const cached = initialsChoicesCache.get(value);
      initialsChoicesCache.delete(value);
      initialsChoicesCache.set(value, cached);
      return cached;
    }
    const tokens = value.match(/\p{Script=Han}|[A-Z]+(?=[A-Z][a-z]|\b)|[A-Z]?[a-z]+|\d+/gu) || [];
    const choices = [];
    for (const token of tokens) {
      if (/\p{Script=Han}/u.test(token)) {
        const primary = pinyinInitials(token);
        const alternatives = commonPolyphonicInitials.get(token) || primary;
        choices.push([...new Set([primary, ...alternatives])].filter(Boolean));
      } else if (/^[A-Z]+$/.test(token)) {
        for (const letter of token) choices.push([letter]);
      } else if (token[0]) {
        choices.push([token[0].toUpperCase()]);
      }
    }
    if (initialsChoicesCache.size >= MAX_PINYIN_CACHE_ENTRIES) {
      const oldestValue = initialsChoicesCache.keys().next().value;
      if (oldestValue !== undefined) initialsChoicesCache.delete(oldestValue);
    }
    initialsChoicesCache.set(value, choices);
    return choices;
  }

  function pinyinInitialMatches(title, query) {
    const target = String(query || "").replace(/\s+/g, "").toUpperCase();
    if (!target) return false;
    if (pinyinInitials(title).includes(target)) return true;
    const choices = pinyinInitialChoices(title);
    for (let start = 0; start <= choices.length - target.length; start++) {
      let matches = true;
      for (let offset = 0; offset < target.length; offset++) {
        if (!choices[start + offset].includes(target[offset])) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }
    return false;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function highlightMatch(text, queryTokens) {
    const value = String(text);
    const tokens = [...new Set(queryTokens.filter(Boolean))];
    if (!tokens.length) return escapeHtml(value);
    const alternatives = tokens
      .sort((a, b) => b.length - a.length)
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const matcher = new RegExp(alternatives.join("|"), "giu");
    let cursor = 0;
    let result = "";
    for (const match of value.matchAll(matcher)) {
      const start = match.index ?? cursor;
      result += escapeHtml(value.slice(cursor, start));
      result += `<mark class="search-highlight">${escapeHtml(match[0])}</mark>`;
      cursor = start + match[0].length;
    }
    return result + escapeHtml(value.slice(cursor));
  }

  function getNavigationPath(item) {
    const storedPath = Array.isArray(item.path) ? item.path.filter(Boolean) : [];
    if (isChromeBookmarksBarItem(item)) {
      return storedPath.length > 1 ? storedPath.slice(1) : [chromeBarRootNavigationLabel()];
    }
    if (storedPath.length) return storedPath;
    return [item.category || "未分类", ...(item.group ? item.group.split(" / ").filter(Boolean) : [])];
  }

  function navigationNodeId(path) {
    return `node:${JSON.stringify(path)}`;
  }

  function expandNavigationPath(path) {
    if (!Array.isArray(path) || path.length < 2) return;
    for (let depth = 1; depth < path.length; depth++) {
      const parentId = navigationNodeId(path.slice(0, depth));
      state.collapsedNavNodes.delete(parentId);
      state.expandedNavNodes.add(parentId);
    }
    saveViewPreferences();
  }

  function buildNavigationTree() {
    const roots = [];
    const rootMap = new Map();
    const ensurePath = (path) => {
      let siblings = roots;
      let lookup = rootMap;
      let parent = null;
      const pathNodes = [];
      for (let index = 0; index < path.length; index++) {
        const segment = path[index];
        if (!lookup.has(segment)) {
          const node = {
            id: navigationNodeId(path.slice(0, index + 1)),
            label: segment,
            path: path.slice(0, index + 1),
            count: 0,
            items: [],
            children: [],
            childMap: new Map(),
            parent,
            folderId: null
          };
          lookup.set(segment, node);
          siblings.push(node);
        }
        const node = lookup.get(segment);
        pathNodes.push(node);
        parent = node;
        siblings = node.children;
        lookup = node.childMap;
      }
      return pathNodes;
    };

    for (const item of state.items) {
      for (const node of ensurePath(getNavigationPath(item))) {
        node.count++;
        node.items.push(item);
      }
    }

    const chromeFoldersByPath = new Map();
    for (const folder of chromeFolders.values()) {
      let path = folder.path || [];
      // The bookmarks-bar root is a Chrome storage container, not a user
      // category. Remove its path segment from every descendant folder too;
      // otherwise empty folder nodes recreate a zero-count "书签栏" wrapper
      // beside the real, already-visible bookmark categories.
      const folderChain = getChromeFolderNodes({ parentId: folder.id });
      if (folderChain.length && isChromeBookmarksBarFolder(folderChain[0])) {
        path = path.slice(1);
      }
      if (path.length) {
        ensurePath(path);
        chromeFoldersByPath.set(JSON.stringify(path), folder.id);
      }
    }
    const visit = (nodes) => {
      for (const node of nodes) {
        node.folderId = chromeFoldersByPath.get(JSON.stringify(node.path)) || null;
        visit(node.children);
      }
    };
    visit(roots);
    return roots;
  }

  function navigationNodeAtPath(path) {
    if (!Array.isArray(path) || !path.length) return null;
    let siblings = buildNavigationTree();
    let match = null;
    for (const segment of path) {
      match = siblings.find((node) => node.label === segment) || null;
      if (!match) return null;
      siblings = match.children;
    }
    return match;
  }

  function flattenNavigationTree(nodes, result = []) {
    for (const node of nodes) {
      result.push(node);
      flattenNavigationTree(node.children, result);
    }
    return result;
  }

  function isNavigationNodeExpanded(node, depth) {
    return !state.collapsedNavNodes.has(node.id)
      && (state.expandedNavNodes.has(node.id)
        || (depth === 0 && !window.matchMedia("(max-width: 900px)").matches));
  }

  function restoreNavigationFocus(id, selector) {
    for (const button of refs.tabs.querySelectorAll(selector)) {
      if (button.dataset.navigationId === id) {
        button.focus({ preventScroll: true });
        return;
      }
    }
  }

  function selectNavigationTab(id, node = null) {
    const shouldRestoreFocus = refs.tabs.contains(document.activeElement);
    state.activeTab = id;
    state.activeSubFolder = "";
    state.query = "";
    state.limit = PAGE_SIZE;
    refs.search.value = "";
    refs.searchClear.hidden = true;
    if (node) {
      for (let current = node; current; current = current.parent) {
        state.collapsedNavNodes.delete(current.id);
        state.expandedNavNodes.add(current.id);
      }
    }
    saveViewPreferences();
    render();
    if (shouldRestoreFocus) {
      restoreNavigationFocus(id, ".tab[data-navigation-id]");
    }
  }

  function makeTopTab(id, label, count, kind) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    button.dataset.navigationId = id;
    button.title = `${label} · ${count}`;
    button.setAttribute("aria-label", `${label}，${count} 个书签`);
    if (state.activeTab === id) button.setAttribute("aria-current", "page");

    if (kind === "all" || kind === "favorites") {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("class", "tab-icon");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = kind === "all"
        ? `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`
        : `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`;
      button.append(icon);
    }

    const name = document.createElement("span");
    name.className = "tab-label";
    name.textContent = label;
    const badge = document.createElement("span");
    badge.className = "tab-count";
    badge.textContent = String(count);
    button.append(name, badge);
    button.addEventListener("click", () => selectNavigationTab(id));
    return button;
  }

  function renderTabs() {
    refs.tabs.replaceChildren();
    const tree = buildNavigationTree();
    const flatTree = flattenNavigationTree(tree);
    const expandableNodes = flatTree.filter((node) => node.children.length);
    const allExpanded = expandableNodes.length > 0 && expandableNodes.every((node) =>
      isNavigationNodeExpanded(node, node.path.length - 1)
    );
    refs.collapseAllLabel.textContent = allExpanded ? "折叠文件夹树" : "展开文件夹树";

    // Translate the old category selection once into the new folder-tree selection.
    if (state.activeTab.startsWith("cat:")) {
      const categoryNode = tree.find((node) => node.label === state.activeTab.slice(4));
      state.activeTab = categoryNode?.id || "all";
    } else if (state.activeTab.startsWith("folder:")) {
      const legacyRoot = state.activeTab.slice(7);
      const rootNode = tree.find((node) => node.label === legacyRoot);
      state.activeTab = rootNode?.id || "all";
    }
    if (state.activeTab.startsWith("node:") && !flatTree.some((node) => node.id === state.activeTab)) {
      state.activeTab = "all";
    }

    refs.tabs.append(makeTopTab("all", "全部", state.items.length, "all"));
    const favoriteCount = state.items.filter((item) => item.favorite).length;
    refs.tabs.append(makeTopTab("favorites", "收藏", favoriteCount, "favorites"));

    if (!tree.length) return;
    const divider = document.createElement("div");
    divider.className = "nav-section-label";
    divider.textContent = "文件夹";
    refs.tabs.append(divider);

    const treeWrap = document.createElement("div");
    treeWrap.className = "nav-tree";
    const renderNode = (node, depth, parent) => {
      const wrapper = document.createElement("div");
      wrapper.className = "nav-node";
      wrapper.dataset.navId = node.id;
      const row = document.createElement("div");
      row.className = "nav-node-row";

      const hasChildren = node.children.length > 0;
      const expanded = hasChildren && isNavigationNodeExpanded(node, depth);
      const childGroupId = `nav-children-${encodeURIComponent(node.id)}`;
      const disclosure = document.createElement("button");
      disclosure.type = "button";
      disclosure.className = `nav-disclosure${hasChildren ? "" : " is-spacer"}`;
      disclosure.tabIndex = hasChildren ? 0 : -1;
      disclosure.disabled = !hasChildren;
      disclosure.setAttribute("aria-hidden", String(!hasChildren));
      if (hasChildren) {
        disclosure.dataset.navigationId = node.id;
        disclosure.setAttribute("aria-label", `${expanded ? "折叠" : "展开"}${node.label}`);
        disclosure.setAttribute("aria-expanded", String(expanded));
        disclosure.setAttribute("aria-controls", childGroupId);
        disclosure.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6"/></svg>`;
        disclosure.addEventListener("click", (event) => {
          event.stopPropagation();
          const shouldRestoreFocus = refs.tabs.contains(document.activeElement);
          if (expanded) {
            state.collapsedNavNodes.add(node.id);
            state.expandedNavNodes.delete(node.id);
          } else {
            state.collapsedNavNodes.delete(node.id);
            state.expandedNavNodes.add(node.id);
          }
          saveViewPreferences();
          renderTabs();
          if (shouldRestoreFocus) {
            restoreNavigationFocus(node.id, ".nav-disclosure[data-navigation-id]");
          }
        });
      }

      const select = document.createElement("button");
      select.type = "button";
      select.className = "tab nav-folder-tab";
      select.dataset.navigationId = node.id;
      if (state.activeTab === node.id) select.setAttribute("aria-current", "page");
      select.title = node.path.join(" › ");
      select.setAttribute("aria-label", `${node.path.join("，")}，${node.count} 个书签`);
      const folderIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      folderIcon.setAttribute("class", "tab-icon nav-folder-icon");
      folderIcon.setAttribute("viewBox", "0 0 24 24");
      folderIcon.setAttribute("fill", "none");
      folderIcon.setAttribute("stroke", "currentColor");
      folderIcon.setAttribute("stroke-width", "1.6");
      folderIcon.setAttribute("stroke-linecap", "round");
      folderIcon.setAttribute("stroke-linejoin", "round");
      folderIcon.setAttribute("aria-hidden", "true");
      folderIcon.innerHTML = `<path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 4H5a2 2 0 0 0-2 2v1z"/>`;
      const name = document.createElement("span");
      name.className = "tab-label";
      name.textContent = node.label;
      const badge = document.createElement("span");
      badge.className = "tab-count";
      badge.textContent = String(node.count);
      select.append(folderIcon, name, badge);
      select.addEventListener("click", () => selectNavigationTab(node.id, node));

      const more = document.createElement("button");
      more.type = "button";
      more.className = "nav-more";
      more.setAttribute("aria-label", `文件夹操作：${node.label}`);
      more.title = "文件夹操作";
      more.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/></svg>`;
      more.addEventListener("click", (event) => {
        event.stopPropagation();
        const box = more.getBoundingClientRect();
        showFolderContextMenu(node, box.right, box.bottom, more);
      });
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showFolderContextMenu(node, event.clientX, event.clientY, select);
      });
      row.append(disclosure, select, more);
      wrapper.append(row);

      if (hasChildren) {
        const children = document.createElement("div");
        children.className = "nav-node-children";
        children.id = childGroupId;
        children.setAttribute("role", "group");
        children.setAttribute("aria-label", `${node.label} 子文件夹`);
        children.hidden = !expanded;
        if (expanded) {
          for (const child of node.children) children.append(renderNode(child, depth + 1, node));
        }
        wrapper.append(children);
      }
      return wrapper;
    };
    for (const node of tree) treeWrap.append(renderNode(node, 0, null));
    refs.tabs.append(treeWrap);
  }

  function selectedNavigationPath() {
    if (!state.activeTab.startsWith("node:")) return null;
    try { return JSON.parse(state.activeTab.slice(5)); }
    catch { return null; }
  }

  function filteredItems() {
    const rawQuery = state.query.trim().toLocaleLowerCase();
    const tokens = rawQuery.split(/\s+/).filter(Boolean);
    const compactQuery = rawQuery.replace(/\s+/g, "").toUpperCase();
    const selectedPath = selectedNavigationPath();

    let items = state.items.filter((item) => {
      if (tokens.length) return true;
      if (state.activeTab === "all") return true;
      if (state.activeTab === "favorites") return item.favorite;
      if (selectedPath) {
        const itemPath = getNavigationPath(item);
        return selectedPath.every((part, index) => itemPath[index] === part);
      }
      if (state.activeTab.startsWith("cat:")) return item.category === state.activeTab.slice(4);
      return true;
    });

    if (tokens.length) {
      items = items.filter((item) => {
        const titleLower = item.title.toLocaleLowerCase();
        const urlLower = searchableUrl(item.url);
        const categoryLower = item.category.toLocaleLowerCase();
        const groupLower = item.group.toLocaleLowerCase();
        const pathValue = getNavigationPath(item).join(" ");
        const pathLower = pathValue.toLocaleLowerCase();
        return tokens.every((token) => titleLower.includes(token)
          || urlLower.includes(token)
          || categoryLower.includes(token)
          || groupLower.includes(token)
          || pathLower.includes(token)
          || pinyinInitialMatches(item.title, token)
          || pinyinInitialMatches(pathValue, token))
          || (compactQuery && (pinyinInitialMatches(item.title, compactQuery)
            || pinyinInitialMatches(pathValue, compactQuery)));
      });
    }

    if (state.sortMode === "name") {
      items = [...items].sort((a, b) => pinyinCollator.compare(a.title, b.title));
    } else if (state.sortMode === "recent") {
      items = [...items].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
    } else if (state.sortMode === "domain") {
      items = [...items].sort((a, b) => hostOf(a.url).localeCompare(hostOf(b.url)) || pinyinCollator.compare(a.title, b.title));
    }
    return items;
  }

  function updateSelectionToolbar(filtered = []) {
    const existingIds = new Set(state.items.map((item) => item.id));
    for (const selectedId of state.selectedBookmarkIds) {
      if (!existingIds.has(selectedId)) state.selectedBookmarkIds.delete(selectedId);
    }
    const selectedItems = [...state.selectedBookmarkIds]
      .map((selectedId) => state.items.find((item) => item.id === selectedId))
      .filter(Boolean);
    refs.selectionToolbar.hidden = !state.selectionMode;
    refs.selectionCount.textContent = `已选 ${selectedItems.length} 个`;
    const allCurrentResultsSelected = filtered.length > 0
      && filtered.every((item) => state.selectedBookmarkIds.has(item.id));
    refs.selectAllResultsButton.textContent = allCurrentResultsSelected ? "取消全选" : "全选当前结果";
    refs.clearSelectionButton.disabled = selectedItems.length === 0;
    refs.selectionMoveButton.disabled = selectedItems.length === 0;
    refs.selectionFavoriteButton.disabled = selectedItems.length === 0;
    refs.selectionDeleteButton.disabled = selectedItems.length === 0;
    refs.selectionFavoriteButton.textContent = selectedItems.length
      && selectedItems.every((item) => item.favorite)
      ? "取消收藏"
      : "加入收藏";
    document.documentElement.dataset.selectionMode = String(state.selectionMode);
  }

  function setSelectionMode(enabled) {
    state.selectionMode = Boolean(enabled);
    if (!state.selectionMode) state.selectedBookmarkIds.clear();
    render({ refreshNavigation: false });
  }

  function toggleBookmarkSelection(itemId) {
    if (state.selectedBookmarkIds.has(itemId)) state.selectedBookmarkIds.delete(itemId);
    else state.selectedBookmarkIds.add(itemId);
    render({ refreshNavigation: false });
    refs.content.querySelector(`[data-bookmark-id="${CSS.escape(itemId)}"] .bookmark-select-toggle`)?.focus({ preventScroll: true });
  }

  function selectAllCurrentResults() {
    const filtered = filteredItems();
    const allSelected = filtered.length > 0
      && filtered.every((item) => state.selectedBookmarkIds.has(item.id));
    if (allSelected) {
      for (const item of filtered) state.selectedBookmarkIds.delete(item.id);
    } else {
      for (const item of filtered) state.selectedBookmarkIds.add(item.id);
    }
    render({ refreshNavigation: false });
    refs.selectAllResultsButton.focus({ preventScroll: true });
  }

  function selectedBookmarks() {
    return [...state.selectedBookmarkIds]
      .map((selectedId) => state.items.find((item) => item.id === selectedId))
      .filter(Boolean);
  }

  function clearBookmarkSelection() {
    state.selectedBookmarkIds.clear();
    setSelectionMode(false);
    refs.content.querySelector(".bookmark-link")?.focus({ preventScroll: true });
  }

  async function toggleSelectedFavorites() {
    const items = selectedBookmarks();
    if (!items.length) return;
    const favorite = !items.every((item) => item.favorite);
    const previous = items.map((item) => ({ item, favorite: item.favorite }));
    const previousChromeFavorites = new Set(chromeFavorites);
    for (const item of items) {
      item.favorite = favorite;
      if (item.source !== "chrome" || !item.chromeId) continue;
      if (favorite) chromeFavorites.add(item.chromeId);
      else chromeFavorites.delete(item.chromeId);
    }
    if (!persist()) {
      for (const entry of previous) entry.item.favorite = entry.favorite;
      chromeFavorites.clear();
      previousChromeFavorites.forEach((value) => chromeFavorites.add(value));
      toast("收藏状态未保存：浏览器存储空间不足。", true);
      return;
    }
    state.selectedBookmarkIds.clear();
    setSelectionMode(false);
    refs.content.querySelector(".bookmark-link")?.focus({ preventScroll: true });
    toast(favorite ? `已收藏 ${items.length} 个书签` : `已取消收藏 ${items.length} 个书签`);
  }

  function chromeRestoreRecord(item) {
    return {
      chromeId: String(item.chromeId),
      parentId: String(item.parentId || "1"),
      index: Number.isInteger(item.index) ? item.index : undefined,
      title: item.title,
      url: item.url,
      favorite: chromeFavorites.has(String(item.chromeId)),
      iconOverride: chromeIconOverrides.get(String(item.chromeId)) || ""
    };
  }

  async function undoBulkDelete(snapshot) {
    if (!snapshot) return;
    const restoredLocal = [];
    if (snapshot.local.length) {
      const before = state.items;
      const restored = [...state.items];
      for (const entry of [...snapshot.local].sort((a, b) => a.index - b.index)) {
        restored.splice(Math.min(entry.index, restored.length), 0, { ...entry.item, path: [...entry.item.path] });
        restoredLocal.push(entry);
      }
      state.items = restored;
      if (!persist()) {
        state.items = before;
        toast("撤销未完成：本地存储空间不足。", true, {
          label: "重试撤销", onActivate: () => undoBulkDelete(snapshot)
        });
        return;
      }
      snapshot.local = snapshot.local.filter((entry) => !restoredLocal.includes(entry));
    }

    const originalChromeCount = snapshot.chrome.length;
    const remainingChrome = [];
    let favoriteSaveWarning = false;
    for (const entry of snapshot.chrome) {
      try {
        let created;
        try {
          created = await chrome.bookmarks.create({
            parentId: entry.parentId,
            ...(Number.isInteger(entry.index) ? { index: entry.index } : {}),
            title: entry.title,
            url: entry.url
          });
        } catch {
          created = await chrome.bookmarks.create({ parentId: "1", title: entry.title, url: entry.url });
        }
        if (entry.favorite) chromeFavorites.add(created.id);
        if (entry.iconOverride) chromeIconOverrides.set(String(created.id), entry.iconOverride);
        if (!persist()) {
          favoriteSaveWarning = true;
          if (entry.favorite) chromeFavorites.delete(created.id);
          chromeIconOverrides.delete(String(created.id));
        }
      } catch {
        remainingChrome.push(entry);
      }
    }
    snapshot.chrome = remainingChrome;
    let syncSucceeded = true;
    if (EXTENSION_MODE && originalChromeCount > remainingChrome.length) syncSucceeded = await syncChromeBookmarks();
    render();
    const remaining = snapshot.local.length + snapshot.chrome.length;
    if (remaining) {
      toast(`已恢复部分书签，仍有 ${remaining} 个未能恢复${chromeSyncWarning(syncSucceeded)}`, true, {
        label: "重试撤销", onActivate: () => undoBulkDelete(snapshot)
      });
      return;
    }
    if (lastBulkDelete === snapshot) lastBulkDelete = null;
    toast(favoriteSaveWarning
      ? "已恢复书签；部分收藏状态未能保存"
      : `已恢复 ${restoredLocal.length + originalChromeCount - remainingChrome.length} 个书签${chromeSyncWarning(syncSucceeded)}`,
    favoriteSaveWarning || syncSucceeded !== true);
  }

  async function deleteSelectedBookmarks() {
    const items = selectedBookmarks();
    if (!items.length) return;
    const chromeItems = items.filter((item) => item.source === "chrome");
    if (!confirm(`确定删除已选的 ${items.length} 个书签吗？`)) return;
    for (const item of chromeItems) {
      if (!(await chromeBookmarkMatchesCurrent(item))) {
        toast(await refreshAfterChromeConflict(), true);
        return;
      }
    }

    const snapshot = { local: [], chrome: [] };
    for (const item of items) {
      if (item.source === "chrome") continue;
      snapshot.local.push({
        index: state.items.findIndex((entry) => entry.id === item.id),
        item: { ...item, path: [...item.path] }
      });
    }
    const originalItems = state.items;
    state.items = state.items.filter((item) => !snapshot.local.some((entry) => entry.item.id === item.id));
    if (snapshot.local.length && !persist()) {
      state.items = originalItems;
      toast("删除未保存：浏览器存储空间不足。", true);
      return;
    }

    const failed = [];
    for (const item of chromeItems) {
      try {
        if (!(await chromeBookmarkMatchesCurrent(item))) throw new Error("书签状态已变化");
        snapshot.chrome.push(chromeRestoreRecord(item));
        await chrome.bookmarks.remove(item.chromeId);
        chromeFavorites.delete(item.chromeId);
        chromeIconOverrides.delete(String(item.chromeId));
      } catch (error) {
        snapshot.chrome = snapshot.chrome.filter((entry) => entry.chromeId !== String(item.chromeId));
        failed.push({ title: item.title, message: error?.message || "删除失败" });
      }
    }
    const favoritesSaved = persist();
    const syncSucceeded = chromeItems.length ? await syncChromeBookmarks() : true;
    state.selectedBookmarkIds.clear();
    setSelectionMode(false);
    refs.content.querySelector(".bookmark-link")?.focus({ preventScroll: true });
    if (snapshot.local.length || snapshot.chrome.length) {
      lastBulkDelete = snapshot;
      const deletedCount = snapshot.local.length + snapshot.chrome.length;
      const detail = failed.length ? `；${failed.length} 个未删除` : "";
      toast(`已删除 ${deletedCount} 个书签${detail}${favoritesSaved ? "" : "；收藏状态未保存"}${chromeSyncWarning(syncSucceeded)}`,
        failed.length > 0 || !favoritesSaved || syncSucceeded !== true,
        { label: "撤销", onActivate: () => undoBulkDelete(snapshot) });
    } else {
      toast(failed.length ? `未能删除所选书签：${failed[0].message}` : "没有书签被删除", failed.length > 0);
    }
  }

  function renderContentHeading(count) {
    const toolbar = document.createElement("div");
    toolbar.className = "content-heading";
    const copy = document.createElement("div");
    copy.className = "content-heading-copy";
    const title = document.createElement("h2");
    const caption = document.createElement("p");
    caption.className = "content-caption";
    const path = selectedNavigationPath();

    if (state.query.trim()) {
      title.textContent = "搜索结果";
      caption.textContent = `匹配到 ${count} 个书签`;
    } else if (state.activeTab === "favorites") {
      title.textContent = "收藏";
      caption.textContent = `${count} 个常用网址`;
    } else if (path?.length) {
      title.textContent = path.at(-1);
      const hasChildFolders = Boolean(navigationNodeAtPath(path)?.children.length);
      caption.textContent = hasChildFolders
        ? `${count} 个书签 · 包含子文件夹`
        : `${count} 个书签`;
      const breadcrumb = document.createElement("div");
      breadcrumb.className = "content-breadcrumb";
      for (const [index, part] of path.entries()) {
        if (index) {
          const separator = document.createElement("span");
          separator.className = "breadcrumb-separator";
          separator.setAttribute("aria-hidden", "true");
          separator.textContent = "›";
          breadcrumb.append(separator);
        }
        const segment = document.createElement("span");
        segment.textContent = part;
        breadcrumb.append(segment);
      }
      copy.append(breadcrumb, title, caption);
    } else {
      title.textContent = "全部书签";
      caption.textContent = `${count} 个网址，随时回到需要的页面`;
    }
    if (copy.childElementCount === 0) copy.append(title, caption);

    const tools = document.createElement("div");
    tools.className = "content-heading-tools";

    const sortLabel = document.createElement("label");
    sortLabel.className = "toolbar-select-wrap";
    const sortLabelText = document.createElement("span");
    sortLabelText.className = "sr-only";
    sortLabelText.textContent = "书签排序方式";
    const sortSelect = document.createElement("select");
    sortSelect.className = "toolbar-select";
    sortSelect.setAttribute("aria-label", "书签排序方式");
    for (const [value, label] of [
      ["default", "默认顺序"], ["name", "名称 A–Z"], ["recent", "最近添加"], ["domain", "网站域名"]
    ]) {
      const option = new Option(label, value, false, state.sortMode === value);
      sortSelect.add(option);
    }
    sortSelect.addEventListener("change", () => {
      state.sortMode = sortSelect.value;
      saveViewPreferences();
      render({ refreshNavigation: false });
    });
    sortLabel.append(sortLabelText, sortSelect);

    const viewSettingsWrap = document.createElement("div");
    viewSettingsWrap.className = "view-settings-wrap";

    const viewSettingsButton = document.createElement("button");
    viewSettingsButton.type = "button";
    viewSettingsButton.className = "view-settings-button";
    viewSettingsButton.setAttribute("aria-haspopup", "true");
    viewSettingsButton.setAttribute("aria-expanded", "false");
    viewSettingsButton.title = "视图与卡片密度设置";
    const currentViewIcon = state.viewMode === "grid"
      ? `<svg viewBox="0 0 24 24" class="view-btn-icon" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/></svg>`
      : `<svg viewBox="0 0 24 24" class="view-btn-icon" aria-hidden="true"><path d="M9 6h12M9 12h12M9 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>`;
    const viewModeLabel = state.viewMode === "grid" ? "网格" : "列表";
    const densityModeLabel = state.densityMode === "compact" ? "紧凑" : "舒适";
    viewSettingsButton.innerHTML = `${currentViewIcon}<span>${viewModeLabel} · ${densityModeLabel}</span><svg viewBox="0 0 20 20" class="view-chevron" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>`;

    const viewMenu = document.createElement("div");
    viewMenu.className = "view-settings-menu";
    viewMenu.hidden = true;

    const checkSvg = `<svg viewBox="0 0 20 20" class="check-icon" aria-hidden="true"><path d="m4.5 10.2 3.5 3.4 7.5-7.4"/></svg>`;

    viewMenu.innerHTML = `
      <div class="view-menu-group-label">布局方式</div>
      <button type="button" class="view-menu-item${state.viewMode === "grid" ? " is-active" : ""}" data-view="grid">
        <svg viewBox="0 0 24 24" class="menu-icon" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/></svg>
        <span>网格视图</span>
        ${state.viewMode === "grid" ? checkSvg : ""}
      </button>
      <button type="button" class="view-menu-item${state.viewMode === "list" ? " is-active" : ""}" data-view="list">
        <svg viewBox="0 0 24 24" class="menu-icon" aria-hidden="true"><path d="M9 6h12M9 12h12M9 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>
        <span>列表视图</span>
        ${state.viewMode === "list" ? checkSvg : ""}
      </button>
      <div class="view-menu-divider"></div>
      <div class="view-menu-group-label">显示密度</div>
      <button type="button" class="view-menu-item${state.densityMode === "comfortable" ? " is-active" : ""}" data-density="comfortable">
        <svg viewBox="0 0 24 24" class="menu-icon" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/></svg>
        <span>舒适间距</span>
        ${state.densityMode === "comfortable" ? checkSvg : ""}
      </button>
      <button type="button" class="view-menu-item${state.densityMode === "compact" ? " is-active" : ""}" data-density="compact">
        <svg viewBox="0 0 24 24" class="menu-icon" aria-hidden="true"><rect x="3" y="6" width="18" height="5" rx="1.5"/><rect x="3" y="13" width="18" height="5" rx="1.5"/></svg>
        <span>紧凑间距</span>
        ${state.densityMode === "compact" ? checkSvg : ""}
      </button>
    `;

    viewSettingsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = viewMenu.hidden;
      viewMenu.hidden = !open;
      viewSettingsButton.setAttribute("aria-expanded", String(open));
    });

    viewMenu.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.viewMode = btn.dataset.view;
        saveViewPreferences();
        render({ refreshNavigation: false });
      });
    });

    viewMenu.querySelectorAll("[data-density]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.densityMode = btn.dataset.density;
        saveViewPreferences();
        render({ refreshNavigation: false });
      });
    });

    const closeViewMenuHandler = (event) => {
      if (!viewSettingsWrap.contains(event.target)) {
        viewMenu.hidden = true;
        viewSettingsButton.setAttribute("aria-expanded", "false");
      }
    };
    document.addEventListener("click", closeViewMenuHandler);

    viewSettingsWrap.append(viewSettingsButton, viewMenu);

    const selectionToggle = document.createElement("button");
    selectionToggle.type = "button";
    selectionToggle.className = `selection-mode-toggle${state.selectionMode ? " is-active" : ""}`;
    selectionToggle.setAttribute("aria-pressed", String(state.selectionMode));
    selectionToggle.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12 2.5 2.5L16 9"/></svg><span>${state.selectionMode ? "完成" : "选择"}</span>`;
    selectionToggle.addEventListener("click", () => setSelectionMode(!state.selectionMode));

    tools.append(sortLabel, viewSettingsWrap, selectionToggle);
    toolbar.append(copy, tools);
    return toolbar;
  }

  function createBookmarkGrid(items, queryTokens) {
    const grid = document.createElement("div");
    grid.className = "bookmark-grid";
    for (const item of items) grid.append(buildBookmark(item, queryTokens));
    return grid;
  }

  function renderBookmarkResults(filtered, visible, queryTokens) {
    // Preserve a deliberate global order when the user has selected a sort.
    if (state.sortMode !== "default") return createBookmarkGrid(visible, queryTokens);

    const selectedPath = state.query.trim() ? null : selectedNavigationPath();
    const groupingDepth = selectedPath?.length ? selectedPath.length + 1 : 1;
    const getGroupPath = (item) => {
      const itemPath = getNavigationPath(item);
      return itemPath.slice(0, Math.min(groupingDepth, itemPath.length));
    };
    const groups = new Map();
    for (const item of filtered) {
      const path = getGroupPath(item);
      const key = JSON.stringify(path);
      if (!groups.has(key)) groups.set(key, { path, totalCount: 0, visibleItems: [] });
      groups.get(key).totalCount++;
    }
    for (const item of visible) {
      const group = groups.get(JSON.stringify(getGroupPath(item)));
      if (group) group.visibleItems.push(item);
    }

    // A leaf folder already has a page heading. Avoid repeating its name as
    // the only group heading below it.
    const onlyGroup = groups.size === 1 ? groups.values().next().value : null;
    if (selectedPath && onlyGroup
      && JSON.stringify(onlyGroup.path) === JSON.stringify(selectedPath)) {
      return createBookmarkGrid(onlyGroup.visibleItems, queryTokens);
    }

    const result = document.createDocumentFragment();
    for (const group of groups.values()) {
      if (!group.visibleItems.length) continue;
      const section = document.createElement("section");
      section.className = "bookmark-group";
      const heading = document.createElement("div");
      heading.className = "bookmark-group-heading";
      heading.title = group.path.join(" › ");
      const label = document.createElement("h3");
      label.textContent = selectedPath && JSON.stringify(group.path) === JSON.stringify(selectedPath)
        ? "当前文件夹"
        : group.path.at(-1) || "未分类";
      const count = document.createElement("span");
      count.className = "bookmark-group-count";
      const countNum = group.visibleItems.length < group.totalCount
        ? `${group.visibleItems.length} / ${group.totalCount}`
        : String(group.totalCount);
      count.textContent = `· ${countNum}`;
      count.setAttribute("aria-label", `${group.totalCount} 个书签`);
      heading.append(label, count);
      section.append(heading, createBookmarkGrid(group.visibleItems, queryTokens));
      result.append(section);
    }
    return result;
  }

  function scheduleSearchRender() {
    clearTimeout(searchRenderTimer);
    searchRenderTimer = setTimeout(() => {
      searchRenderTimer = undefined;
      render({ refreshNavigation: false });
    }, 90);
  }

  function flushSearchRender() {
    if (searchRenderTimer === undefined) return;
    clearTimeout(searchRenderTimer);
    searchRenderTimer = undefined;
    render({ refreshNavigation: false });
  }

  function render({ refreshNavigation = true } = {}) {
    highResolutionIconGeneration++;
    clearTimeout(searchRenderTimer);
    searchRenderTimer = undefined;
    state.keyboardIndex = -1;
    hideBookmarkTooltip();
    hideContextMenu();

    document.documentElement.dataset.sidebarCollapsed = String(state.sidebarCollapsed);
    if (refs.sidebarCollapseButton) {
      const label = state.sidebarCollapsed ? "展开侧栏" : "收起侧栏";
      refs.sidebarCollapseButton.setAttribute("aria-label", label);
      refs.sidebarCollapseButton.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
      refs.sidebarCollapseButton.title = label;
      refs.sidebarCollapseButton.querySelector("svg")?.classList.toggle("is-collapsed", state.sidebarCollapsed);
    }

    if (refreshNavigation) renderTabs();
    refs.banner.hidden = state.mode !== "demo";
    if (refs.sidebarStorageStatus) {
      refs.sidebarStorageStatus.textContent = EXTENSION_MODE
        ? "Chrome 书签实时同步 · 可手动重试"
        : state.mode === "demo"
          ? "示例模式 · 导入或添加以保存"
          : "本地网页模式 · 数据保存在浏览器";
    }

    const chromeCount = state.items.filter((item) => item.source === "chrome").length;
    const localCount = state.items.length - chromeCount;

    if (EXTENSION_MODE) {
      refs.syncBadge.dataset.status = state.chromeSyncStatus;
      refs.syncBadgeText.textContent = state.chromeSyncStatus === "ready"
        ? "Chrome 已同步"
        : (state.chromeSyncStatus === "error"
          ? "Chrome 同步异常"
          : state.chromeSyncStatus === "importing"
            ? "正在导入 Chrome"
            : "正在读取 Chrome");
      refs.count.textContent = state.chromeSyncStatus === "error"
        ? "● Chrome 同步异常"
        : state.chromeSyncStatus === "importing"
          ? "● 正在同步 Chrome 书签"
          : "● 实时同步已就绪";
    } else {
      refs.count.textContent = state.mode === "demo"
        ? "● 示例演示就绪"
        : "● 本地数据已就绪";
    }
    refs.footerCount.textContent = `共 ${state.items.length} 个书签`;

    if (refs.syncNowButton) refs.syncNowButton.hidden = !EXTENSION_MODE;

    const rawQuery = state.query.trim();
    if (rawQuery) {
      refs.searchHintBar.hidden = false;
      refs.searchClear.hidden = false;
    } else {
      refs.searchHintBar.hidden = true;
      refs.searchClear.hidden = true;
    }

    const filtered = filteredItems();
    updateSelectionToolbar(filtered);
    if (rawQuery) {
      refs.searchResultNote.textContent = `找到 ${filtered.length} 个匹配项（搜索：“${rawQuery}”）`;
      clearTimeout(announcementTimer);
      announcementTimer = setTimeout(() => {
        refs.contentAnnouncement.textContent = `搜索“${rawQuery}”，找到 ${filtered.length} 个书签`;
      }, 350);
    } else {
      clearTimeout(announcementTimer);
      const selectedPath = selectedNavigationPath();
      const scope = state.activeTab === "favorites"
        ? "收藏"
        : (selectedPath?.length ? selectedPath.join("，") : "全部书签");
      const message = `${scope}，${filtered.length} 个书签`;
      if (refs.contentAnnouncement.textContent !== message) {
        refs.contentAnnouncement.textContent = message;
      }
    }
    const visible = filtered.slice(0, state.limit);
    document.documentElement.dataset.mixedSources = "false";
    refs.content.replaceChildren();
    refs.content.dataset.viewMode = state.viewMode;
    refs.content.dataset.densityMode = state.densityMode;
    refs.content.dataset.selectionMode = String(state.selectionMode);
    refs.content.dataset.sourceFilter = "all";
    refs.content.dataset.scope = state.query.trim()
      ? "search"
      : (selectedNavigationPath()?.length ? "folder" : state.activeTab === "favorites" ? "favorites" : "all");
    refs.content.append(renderContentHeading(filtered.length));

    if (!filtered.length) {
      renderEmpty();
      return;
    }

    const queryTokens = rawQuery.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    refs.content.append(renderBookmarkResults(filtered, visible, queryTokens));

    if (filtered.length > visible.length) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "load-more";
      button.textContent = `继续显示 · 还有 ${filtered.length - visible.length} 个`;
      button.addEventListener("click", () => {
        state.limit += PAGE_SIZE;
        render({ refreshNavigation: false });
      });
      refs.content.append(button);
    }
  }

  function toggleAllNavigationNodes() {
    const nodes = flattenNavigationTree(buildNavigationTree()).filter((node) => node.children.length);
    if (!nodes.length) return;
    const allExpanded = nodes.every((node) => isNavigationNodeExpanded(node, node.path.length - 1));
    if (allExpanded) {
      for (const node of nodes) {
        state.collapsedNavNodes.add(node.id);
        state.expandedNavNodes.delete(node.id);
      }
    } else {
      state.collapsedNavNodes.clear();
      for (const node of nodes) state.expandedNavNodes.add(node.id);
    }
    refs.collapseAllLabel.textContent = allExpanded ? "展开文件夹树" : "折叠文件夹树";
    saveViewPreferences();
    renderTabs();
  }

  function buildBookmark(item, queryTokens = []) {
    const row = document.createElement("div");
    const isSelected = state.selectedBookmarkIds.has(item.id);
    row.className = `bookmark bookmark-card${isSelected ? " is-selected" : ""}`;
    row.dataset.bookmarkId = item.id;
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showContextMenu(item, event.clientX, event.clientY, link);
    });

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "bookmark-select-toggle";
    selectButton.setAttribute("aria-pressed", String(isSelected));
    selectButton.setAttribute("aria-label", `${isSelected ? "取消选择" : "选择"} ${item.title}`);
    selectButton.title = isSelected ? "取消选择" : "选择书签";
    selectButton.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10.2 3.5 3.4 7.5-7.4"/></svg>`;
    selectButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleBookmarkSelection(item.id);
    });

    const link = document.createElement("a");
    link.className = "bookmark-link";
    link.addEventListener("click", (event) => {
      if (!state.selectionMode) return;
      event.preventDefault();
      toggleBookmarkSelection(item.id);
    });
    const openableUrl = safeUrl(item.url);
    if (openableUrl) {
      link.href = openableUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else {
      link.classList.add("bookmark-link--restricted");
      link.setAttribute("role", "link");
      link.setAttribute("aria-disabled", "true");
      link.tabIndex = 0;
      link.title = restrictedBookmarkMessage(item.url);
      const explainBlockedOpen = (event) => {
        event.preventDefault();
        toast(restrictedBookmarkMessage(item.url));
      };
      link.addEventListener("click", explainBlockedOpen);
      link.addEventListener("keydown", (event) => {
        if (event.key === "Enter") explainBlockedOpen(event);
      });
    }
    link.setAttribute("aria-label", `${item.title}，${item.url}${openableUrl ? "" : "，栖屿不会直接打开此网址"}`);

    link.addEventListener("mouseenter", (e) => showBookmarkTooltip(item, link, e.clientX, e.clientY));
    link.addEventListener("mouseleave", scheduleHideBookmarkTooltip);
    link.addEventListener("focus", () => showBookmarkTooltip(item, link));
    link.addEventListener("blur", hideBookmarkTooltip);

    const main = document.createElement("span");
    main.className = "bookmark-main";

    const faviconWrap = document.createElement("span");
    faviconWrap.className = "bookmark-favicon-wrap";
    faviconWrap.setAttribute("aria-hidden", "true");
    const favicon = document.createElement("img");
    favicon.className = "bookmark-favicon";
    favicon.alt = "";
    favicon.loading = "lazy";
    favicon.decoding = "async";
    favicon.referrerPolicy = "no-referrer";
    const initials = document.createElement("span");
    initials.className = "bookmark-favicon-fallback";
    const titleInitial = [...(item.title || "•").trim()][0] || "•";
    const domainInitial = [...hostOf(item.url).replace(/^(?:www\.)?/i, "")][0] || titleInitial;
    initials.textContent = /\p{Script=Han}/u.test(titleInitial)
      ? titleInitial
      : domainInitial.toLocaleUpperCase();
    let chromeFavicon = "";
    const pageUrl = webPageUrl(item.url);
    if (EXTENSION_MODE && pageUrl && globalThis.chrome?.runtime?.getURL) {
      const faviconUrl = new URL(chrome.runtime.getURL("/_favicon/"));
      faviconUrl.searchParams.set("pageUrl", pageUrl);
      // Request a near-display size. Chrome returns a rendered bitmap at the
      // requested size, so asking for 128px would make naturalWidth look like
      // source resolution and prevent a sharper 48–96px site icon from winning.
      faviconUrl.searchParams.set("size", "32");
      chromeFavicon = faviconUrl.toString();
    }
    const savedIcon = validIcon(item.icon) ? item.icon : "";
    const localIconServiceAvailable = !EXTENSION_MODE
      && location.protocol === "http:"
      && location.port === "8765"
      && ["localhost", "127.0.0.1"].includes(location.hostname)
      && Boolean(pageUrl);
    const iconCandidates = [];
    // Imported bookmark HTML/JSON may carry a higher-resolution site icon
    // than Chrome's cached favicon. Preserve it first in the extension UI.
    if (EXTENSION_MODE && savedIcon) iconCandidates.push(savedIcon);
    if (chromeFavicon) iconCandidates.push(chromeFavicon);
    else if (localIconServiceAvailable) iconCandidates.push(`/api/icon?url=${encodeURIComponent(item.url)}`);
    if (savedIcon && !iconCandidates.includes(savedIcon)) iconCandidates.push(savedIcon);
    let iconCandidateIndex = 0;
    let currentIconSource = "";
    let lastGoodIconSource = "";
    let highResolutionIconSource = "";
    let highResolutionUpgradeStarted = false;
    const iconGeneration = highResolutionIconGeneration;
    const showFaviconFallback = () => {
      favicon.hidden = true;
      faviconWrap.classList.remove("is-loading");
      faviconWrap.classList.add("has-fallback");
    };
    const tryHighResolutionUpgrade = (preserveCurrent = true) => {
      if (!EXTENSION_MODE || highResolutionUpgradeStarted) return false;
      highResolutionUpgradeStarted = true;
      if (!preserveCurrent) showFaviconFallback();
      findHighResolutionFavicon(item.url, () =>
        iconGeneration === highResolutionIconGeneration && favicon.isConnected
      ).then((candidate) => {
        const replaceableSource = currentIconSource === chromeFavicon || currentIconSource === savedIcon;
        const currentSize = Math.min(favicon.naturalWidth || 0, favicon.naturalHeight || 0);
        if (!candidate || candidate.url === currentIconSource || candidate.size <= currentSize
          || !favicon.isConnected || !replaceableSource) return;
        favicon.hidden = false;
        faviconWrap.classList.add("is-loading");
        highResolutionIconSource = candidate.url;
        currentIconSource = candidate.url;
        favicon.src = candidate.url;
      });
      return true;
    };
    const loadNextFaviconCandidate = () => {
      iconCandidateIndex++;
      if (iconCandidateIndex >= iconCandidates.length) return false;
      favicon.hidden = false;
      faviconWrap.classList.add("is-loading");
      currentIconSource = iconCandidates[iconCandidateIndex];
      favicon.src = currentIconSource;
      return true;
    };
    const restoreLastGoodFavicon = () => {
      if (currentIconSource !== highResolutionIconSource || !lastGoodIconSource) return false;
      highResolutionIconSource = "";
      currentIconSource = lastGoodIconSource;
      favicon.hidden = false;
      favicon.src = lastGoodIconSource;
      return true;
    };

    favicon.addEventListener("load", () => {
      if (adaptFaviconSurface(favicon, faviconWrap)) {
        lastGoodIconSource = currentIconSource;
        faviconWrap.classList.remove("is-loading", "has-fallback");
        if (currentIconSource === chromeFavicon || currentIconSource === savedIcon) {
          tryHighResolutionUpgrade();
        }
      } else if (!restoreLastGoodFavicon()) {
        if (!loadNextFaviconCandidate() && !tryHighResolutionUpgrade(false)) showFaviconFallback();
      }
    });
    favicon.addEventListener("error", () => {
      if (restoreLastGoodFavicon()) return;
      if (loadNextFaviconCandidate()) return;
      if (!tryHighResolutionUpgrade(false)) showFaviconFallback();
    });
    if (iconCandidates.length) {
      faviconWrap.classList.add("is-loading");
      currentIconSource = iconCandidates[0];
      favicon.src = currentIconSource;
    } else {
      showFaviconFallback();
    }
    faviconWrap.append(favicon, initials);

    const textWrap = document.createElement("span");
    textWrap.className = "bookmark-text";

    const title = document.createElement("span");
    title.className = "bookmark-title";
    title.innerHTML = highlightMatch(item.title, queryTokens);
    textWrap.append(title);

    const domainLine = document.createElement("span");
    domainLine.className = "bookmark-domain-line";
    const domain = document.createElement("span");
    domain.className = "bookmark-domain";
    domain.innerHTML = highlightMatch(openableUrl
      ? urlPathPreview(item.url, queryTokens)
      : restrictedBookmarkLabel(item.url), queryTokens);
    domainLine.append(domain);

    const navPath = getNavigationPath(item);
    if (navPath.length > 0) {
      const context = document.createElement("span");
      context.className = "bookmark-context";
      context.textContent = navPath.join(" › ");
      domainLine.append(context);
    }

    textWrap.append(domainLine);
    link.append(faviconWrap, textWrap);

    // Row Actions - In favorites view, hide persistent star to reduce visual noise; reveal on hover
    const isFavoritesView = state.activeTab === "favorites";
    const actions = document.createElement("span");
    actions.className = `bookmark-actions${item.favorite && !isFavoritesView ? " favorite-always" : ""}`;

    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = `mini-button${item.favorite ? " is-favorite" : ""}`;
    favorite.dataset.bookmarkAction = "favorite";
    favorite.innerHTML = item.favorite
      ? `<svg viewBox="0 0 24 24" class="action-icon star-active" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/></svg>`
      : `<svg viewBox="0 0 24 24" class="action-icon" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
    favorite.setAttribute("aria-label", item.favorite ? `取消收藏 ${item.title}` : `收藏 ${item.title}`);
    favorite.title = item.favorite ? "取消收藏" : "加入收藏";
    favorite.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(item, event.currentTarget);
    });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "mini-button";
    edit.dataset.bookmarkAction = "more";
    edit.innerHTML = `<svg viewBox="0 0 24 24" class="action-icon" aria-hidden="true"><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/><circle cx="5" cy="12" r="1.8" fill="currentColor"/></svg>`;
    edit.setAttribute("aria-label", `操作菜单：${item.title}`);
    edit.title = "更多操作";
    edit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const box = edit.getBoundingClientRect();
      showContextMenu(item, box.right, box.bottom, edit);
    });

    actions.append(favorite, edit);
    row.append(selectButton, link, actions);
    return row;
  }

  function toggleFavorite(item, focusOrigin = document.activeElement) {
    const target = state.items.find((entry) => entry.id === item.id);
    if (!target) return;
    const previousRows = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0);
    const originRow = focusOrigin?.closest?.(".bookmark");
    const originIndex = originRow ? previousRows.indexOf(originRow) : -1;
    const previousKeyboardIndex = originIndex >= 0 ? originIndex : state.keyboardIndex;
    const focusAction = focusOrigin?.dataset?.bookmarkAction || "";
    const shouldRestoreFocus = previousKeyboardIndex >= 0 || originIndex >= 0;
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
    if (shouldRestoreFocus) {
      const rows = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0);
      if (rows.length) {
        const targetIndex = rows.findIndex((row) => row.dataset.bookmarkId === target.id);
        const index = targetIndex >= 0
          ? targetIndex
          : Math.min(previousKeyboardIndex, rows.length - 1);
        focusBookmarkRow(index, rows);
        if (focusAction) {
          rows[index].querySelector(`[data-bookmark-action="${focusAction}"]`)?.focus({ preventScroll: true });
        }
      } else {
        refs.content.querySelector(".empty-state button")?.focus({ preventScroll: true });
      }
    }
    toast(target.favorite ? `已收藏“${target.title}”` : `已取消收藏“${target.title}”`);
  }

  function renderEmpty() {
    const wrap = document.createElement("div");
    wrap.className = "empty-state";
    const symbol = document.createElement("div");
    symbol.className = "empty-icon";
    const emptyBookmarkIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    emptyBookmarkIcon.setAttribute("viewBox", "0 0 24 24");
    emptyBookmarkIcon.setAttribute("aria-hidden", "true");
    emptyBookmarkIcon.innerHTML = `<path d="M7 4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V21l-5-3-5 3V4.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`;
    symbol.append(emptyBookmarkIcon);
    const heading = document.createElement("h2");
    const paragraph = document.createElement("p");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-primary";

    if (EXTENSION_MODE && state.chromeSyncStatus === "importing") {
      heading.textContent = "正在导入 Chrome 书签";
      paragraph.textContent = "当前列表将在 Chrome 导入完成后自动更新。";
      button.textContent = "等待导入完成";
      button.disabled = true;
    } else if (EXTENSION_MODE && state.chromeSyncStatus === "loading") {
      heading.textContent = "正在读取 Chrome 书签";
      paragraph.textContent = "首次读取或包含大量书签时可能需要几秒钟。";
      button.textContent = "添加本地书签";
      button.addEventListener("click", () => openDialog(null, "local"));
    } else if (EXTENSION_MODE && state.chromeSyncStatus === "error") {
      heading.textContent = "Chrome 书签读取失败";
      paragraph.textContent = "请在扩展管理中确认已授予书签访问权限，然后点击重试。";
      button.textContent = "重新同步";
      button.addEventListener("click", syncChromeBookmarks);
    } else if (state.query) {
      heading.textContent = "没有找到匹配的书签";
      paragraph.textContent = "请尝试缩短搜索词或检查拼写，也可点击下方按钮清空搜索。";
      button.textContent = "清空搜索条件";
      button.addEventListener("click", () => {
        refs.search.value = "";
        state.query = "";
        refs.searchClear.hidden = true;
        render({ refreshNavigation: false });
      });
    } else if (state.activeTab === "favorites") {
      heading.textContent = "还没有收藏任何书签";
      paragraph.textContent = "点击任意书签右侧的星标按钮，常用网站就会收纳到这里。";
      button.textContent = "浏览全部书签";
      button.addEventListener("click", () => { state.activeTab = "all"; render(); });
    } else if (selectedNavigationPath()?.length) {
      const path = selectedNavigationPath();
      heading.textContent = "这个文件夹还没有书签";
      paragraph.textContent = `向「${path.at(-1)}」添加书签，之后会显示在这里。`;
      button.textContent = "添加到此文件夹";
      button.addEventListener("click", () => openDialog());
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

  function populateChromeFolderOptions(select, selectedId = "") {
    select.replaceChildren();
    const folders = [...chromeFolders.values()].filter((folder) =>
      !folder.unmodifiable || String(folder.id) === String(selectedId));
    const selectedFolder = folders.find((folder) => String(folder.id) === String(selectedId));
    const defaultFolder = selectedFolder
      || folders.find(isChromeBookmarksBarFolder)
      || folders[0];
    for (const folder of folders) {
      const label = `${folder.path.join(" / ")}${folder.unmodifiable ? "（不可移动）" : ""}`;
      const option = new Option(label, folder.id, false, folder.id === defaultFolder?.id);
      if (folder.unmodifiable) {
        option.disabled = true;
        option.title = "此 Chrome 文件夹不可移动书签";
      }
      select.add(option);
    }
  }

  function populateChromeFolderSelect(selectedId = "") {
    populateChromeFolderOptions(refs.chromeFolderSelect, selectedId);
    if (!refs.chromeFolderSelect.options.length) {
      refs.chromeFolderSelect.add(new Option("书签栏", "1", true, true));
    }
  }

  function rememberDialogFocus(dialog, focusOrigin = document.activeElement, bookmarkId = null) {
    const rows = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0);
    const originRow = focusOrigin?.closest?.(".bookmark");
    dialogFocusReturns.set(dialog, {
      origin: focusOrigin,
      bookmarkId: bookmarkId || originRow?.dataset.bookmarkId || null,
      rowIndex: originRow ? rows.indexOf(originRow) : -1,
      bookmarkAction: focusOrigin?.dataset?.bookmarkAction || ""
    });
  }

  function restoreDialogFocus(dialog) {
    const saved = dialogFocusReturns.get(dialog);
    if (!saved || dialog.open) return;
    requestAnimationFrame(() => {
      if (dialogFocusReturns.get(dialog) !== saved || dialog.open) return;
      if ([refs.dialog, refs.moveDialog, refs.renameDialog, refs.auditDialog, refs.shortcutsDialog, $("#appearanceDialog")]
        .some((openDialog) => openDialog !== dialog && openDialog.open)) {
        dialogFocusReturns.delete(dialog);
        return;
      }
      dialogFocusReturns.delete(dialog);
      if (saved.origin?.isConnected && saved.origin !== document.body
        && saved.origin !== document.documentElement && saved.origin.getClientRects().length > 0) {
        saved.origin.focus({ preventScroll: true });
        return;
      }
      const rows = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0);
      let index = saved.bookmarkId
        ? rows.findIndex((row) => row.dataset.bookmarkId === saved.bookmarkId)
        : -1;
      if (index < 0 && saved.rowIndex >= 0 && rows.length) {
        index = Math.min(saved.rowIndex, rows.length - 1);
      }
      if (index >= 0) {
        focusBookmarkRow(index, rows);
        if (saved.bookmarkAction) {
          rows[index].querySelector(`[data-bookmark-action="${saved.bookmarkAction}"]`)?.focus({ preventScroll: true });
        }
        return;
      }
      refs.search.focus({ preventScroll: true });
    });
  }

  refs.dialog.addEventListener("close", () => {
    if (!refs.dialog.open) {
      state.editingId = null;
      editingSnapshot = null;
    }
    restoreDialogFocus(refs.dialog);
  });
  refs.moveDialog.addEventListener("close", () => {
    state.movingId = null;
    state.movingIds = [];
    restoreDialogFocus(refs.moveDialog);
  });
  refs.auditDialog.addEventListener("close", () => restoreDialogFocus(refs.auditDialog));
  refs.shortcutsDialog.addEventListener("close", () => restoreDialogFocus(refs.shortcutsDialog));
  $("#appearanceDialog").addEventListener("close", () => restoreDialogFocus($("#appearanceDialog")));
  refs.renameDialog.addEventListener("close", () => {
    if (refs.renameDialog.open) return;
    const section = state.renamingSection;
    if (!section) return;
    if (section.restoreFolderFocus) {
      const node = navigationNodeAtPath(section.path);
      if (node) restoreNavigationFocus(node.id, ".tab[data-navigation-id]");
      else refs.search.focus({ preventScroll: true });
    }
    state.renamingSection = null;
  });

  function openDialog(item = null, initialDestination = "chrome", focusOrigin = document.activeElement) {
    rememberDialogFocus(refs.dialog, focusOrigin, item?.id || null);
    state.editingId = item?.id || null;
    editingSnapshot = item ? bookmarkEditSignature(item) : null;
    const selectedFolderPath = item ? null : selectedNavigationPath();
    $("#dialogTitle").textContent = item ? "编辑书签" : "添加书签";
    refs.title.value = item?.title || "";
    refs.url.value = item?.url || "";
    refs.category.value = item?.category
      || selectedFolderPath?.[0]
      || (state.activeTab.startsWith("cat:") ? state.activeTab.slice(4) : "");
    refs.group.value = item?.group || selectedFolderPath?.slice(1).join(" / ") || "";
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
        refs.targetDestWrap.hidden = true;
        state.targetDest = "chrome";
        refs.chromeFolderWrap.hidden = false;
        refs.localOrganizeFields.hidden = true;
        const selectedPath = selectedFolderPath;
        let selectedFolderId = "";
        if (selectedPath?.length) {
          if (selectedPath.length === 1 && selectedPath[0] === "常用书签") {
            selectedFolderId = [...chromeFolders.values()].find(isChromeBookmarksBarFolder)?.id || "";
          } else {
            selectedFolderId = [...chromeFolders.values()].find((folder) => {
              const folderPath = isChromeBookmarksBarFolder(folder) ? folder.path.slice(1) : folder.path || [];
              return folderPath.length === selectedPath.length
                && folderPath.every((part, index) => part === selectedPath[index]);
            })?.id || "";
          }
        }
        populateChromeFolderSelect(selectedFolderId);
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
    editingSnapshot = null;
  }

  function bookmarkEditSignature(item) {
    if (!item) return "";
    return JSON.stringify({
      id: item.id,
      source: item.source,
      chromeId: item.chromeId || "",
      parentId: item.parentId || "",
      title: item.title,
      url: item.url,
      category: item.category,
      group: item.group,
      path: [...(item.path || [])],
      favorite: Boolean(item.favorite)
    });
  }

  async function withSubmitLock(event, pendingLabel, action) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form || form.dataset.submitting === "true") return;
    const submitButton = event.submitter || form.querySelector('button[type="submit"]');
    if (submitButton?.disabled) return;
    const originalLabel = submitButton?.textContent;
    form.dataset.submitting = "true";
    form.setAttribute("aria-busy", "true");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = pendingLabel;
    }
    try {
      await action(event);
    } finally {
      delete form.dataset.submitting;
      form.removeAttribute("aria-busy");
      if (submitButton && form.contains(submitButton)) {
        submitButton.disabled = false;
        if (originalLabel !== undefined) submitButton.textContent = originalLabel;
      }
    }
  }

  async function saveForm(event) {
    return withSubmitLock(event, "正在保存…", saveFormOnce);
  }

  async function saveFormOnce(event) {
    event.preventDefault();
    const title = refs.title.value.trim();
    const editingItem = state.items.find((item) => item.id === state.editingId);
    const enteredUrl = refs.url.value.trim();
    const url = safeUrl(enteredUrl)
      || (editingItem && enteredUrl === editingItem.url && !safeUrl(editingItem.url)
        ? storedBookmarkUrl(enteredUrl)
        : "");
    if (!title || !url) {
      refs.error.textContent = !title ? "请填写书签名称。" : "请输入有效的网页网址。";
      refs.error.hidden = false;
      return;
    }
    refs.error.hidden = true;

    const previousMode = state.mode;
    const previousDemoItems = previousMode === "demo" ? state.items : null;
    const previousView = {
      activeTab: state.activeTab,
      activeSubFolder: state.activeSubFolder,
      query: state.query,
      limit: state.limit,
      search: refs.search.value,
      searchClearHidden: refs.searchClear.hidden
    };
    const selectedFolderPathBeforeSave = selectedNavigationPath();
    if (previousMode === "demo") activatePersonal();
    const existing = state.items.find((item) => item.id === state.editingId);
    if (state.editingId && !existing && previousMode !== "demo") {
      refs.error.textContent = "此书签已从当前列表中移除。为避免误创建副本，本次保存已停止；请关闭窗口并重新检查书签。";
      refs.error.hidden = false;
      return;
    }
    if (state.editingId && existing && editingSnapshot
      && bookmarkEditSignature(existing) !== editingSnapshot) {
      refs.error.textContent = "此书签已在其他页面中更新。为避免覆盖新内容，本次保存已停止；请关闭窗口并重新打开编辑。";
      refs.error.hidden = false;
      return;
    }

    // Editing existing Chrome bookmark
    if (existing?.source === "chrome") {
      try {
        if (!(await chromeBookmarkMatchesCurrent(existing))) {
          refs.error.textContent = await refreshAfterChromeConflict();
          refs.error.hidden = false;
          return;
        }
        const latestExisting = state.items.find((item) => item.id === existing.id);
        if (!latestExisting || (editingSnapshot
          && bookmarkEditSignature(latestExisting) !== editingSnapshot)) {
          refs.error.textContent = "此书签在复核期间已更新或删除。为避免覆盖新内容，本次保存已停止；请关闭窗口并重新打开编辑。";
          refs.error.hidden = false;
          return;
        }
        await chrome.bookmarks.update(existing.chromeId, { title: title.slice(0, 512), url });
        const targetParentId = refs.chromeFolderSelect.value;
        let moveError = null;
        if (targetParentId && targetParentId !== existing.parentId) {
          const updatedSnapshot = {
            ...existing,
            title: title.slice(0, 512),
            url,
            parentId: existing.parentId
          };
          if (!(await chromeBookmarkMatchesCurrent(existing, updatedSnapshot))) {
            moveError = new Error("Chrome 中的书签在更新期间再次变化，已跳过移动");
          } else {
            try {
              await chrome.bookmarks.move(existing.chromeId, { parentId: targetParentId });
            } catch (error) {
              moveError = error;
            }
          }
        }
        const latestFavoriteItem = state.items.find((item) => item.id === existing.id);
        if (!latestFavoriteItem || Boolean(latestFavoriteItem.favorite) !== Boolean(existing.favorite)) {
          const syncSucceeded = await syncChromeBookmarks();
          refs.error.textContent = `Chrome 名称和网址已更新，但书签收藏状态在编辑期间发生变化；本次未覆盖收藏值。请关闭并重新打开编辑。${chromeSyncWarning(syncSucceeded)}`;
          refs.error.hidden = false;
          return;
        }
        const previousFavorite = chromeFavorites.has(existing.chromeId);
        if (refs.favorite.checked) chromeFavorites.add(existing.chromeId);
        else chromeFavorites.delete(existing.chromeId);
        const favoriteSaved = persist();
        if (!favoriteSaved) {
          if (previousFavorite) chromeFavorites.add(existing.chromeId);
          else chromeFavorites.delete(existing.chromeId);
        }
        const syncSucceeded = await syncChromeBookmarks();
        if (moveError) {
          const refreshed = state.items.find((item) => item.id === existing.id);
          if (refreshed) populateChromeFolderSelect(refreshed.parentId);
          const favoriteNote = favoriteSaved ? "" : " 收藏状态也未能保存。";
          const iconNote = consumePersistenceIconWarning();
          const nextStep = syncSucceeded === true
            ? "请重新选择目标文件夹后保存。"
            : chromeSyncWarning(syncSucceeded, " ");
          const updateNote = moveError.message?.includes("更新期间再次变化")
            ? "书签已提交更新，但 Chrome 状态随后再次变化，移动文件夹未执行"
            : "名称和网址已更新，但移动文件夹失败";
          refs.error.textContent = `${updateNote}：${moveError.message}。${favoriteNote}${iconNote ? ` ${iconNote}。` : " "}${nextStep}`;
          refs.error.hidden = false;
          return;
        }
        closeDialog();
        const syncNote = chromeSyncWarning(syncSucceeded);
        toast(favoriteSaved
          ? `Chrome 书签已更新${syncNote}`
          : `Chrome 书签已更新；收藏状态未能保存${syncNote}`, !favoriteSaved || syncSucceeded !== true);
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
        let favoriteSaved = true;
        if (refs.favorite.checked) {
          chromeFavorites.add(created.id);
          favoriteSaved = persist();
          if (!favoriteSaved) chromeFavorites.delete(created.id);
        }
        closeDialog();
        const syncSucceeded = await syncChromeBookmarks();
        const syncNote = chromeSyncWarning(syncSucceeded);
        toast(favoriteSaved
          ? `已添加至 Chrome 书签${syncNote}`
          : `书签已添加；收藏状态未能保存${syncNote}`, !favoriteSaved || syncSucceeded !== true);
      } catch (error) {
        refs.error.textContent = `添加失败：${error.message}`;
        refs.error.hidden = false;
      }
      return;
    }

    // Adding or editing Local bookmark
    const category = refs.category.value.trim() || "未分类";
    const enteredGroup = refs.group.value.trim();
    const group = enteredGroup || "常用书签";
    const existingLocalPath = existing?.source === "local" && Array.isArray(existing.path) && existing.path.length
      ? existing.path
      : null;
    const groupPath = existingLocalPath && group === existing.group
      ? existingLocalPath.slice(1)
      : group.split(" / ").map((part) => part.trim()).filter(Boolean);
    const selectedFolderPath = selectedFolderPathBeforeSave;
    const savingLocally = !EXTENSION_MODE || state.targetDest === "local";
    const addingToSelectedFolder = !existing
      && savingLocally
      && selectedFolderPath?.length
      && category === selectedFolderPath[0]
      && enteredGroup === selectedFolderPath.slice(1).join(" / ");
    const nextPath = existingLocalPath && group === existing.group
      ? [category, ...existingLocalPath.slice(1)]
      : addingToSelectedFolder
        ? selectedFolderPath
        : [category, ...groupPath];
    const previousItems = previousMode === "demo"
      ? previousDemoItems
      : state.items.map((item) => ({ ...item, path: [...(item.path || [])] }));

    const next = {
      id: existing?.id || id(),
      title: title.slice(0, 512),
      url,
      category: category.slice(0, 50),
      group: group.slice(0, 100),
      path: nextPath,
      favorite: refs.favorite.checked,
      icon: existing?.url === url ? existing.icon : "",
      source: "local",
      dateAdded: existing?.dateAdded || Date.now()
    };

    if (existing) Object.assign(existing, next);
    else state.items.push(next);

    state.activeTab = selectedFolderPath?.every((part, index) => next.path[index] === part)
      ? navigationNodeId(selectedFolderPath)
      : navigationNodeId([next.category]);
    state.activeSubFolder = "";
    state.query = "";
    state.limit = PAGE_SIZE;
    refs.search.value = "";
    refs.searchClear.hidden = true;

    if (!persist()) {
      state.mode = previousMode;
      state.items = previousItems;
      state.activeTab = previousView.activeTab;
      state.activeSubFolder = previousView.activeSubFolder;
      state.query = previousView.query;
      state.limit = previousView.limit;
      refs.search.value = previousView.search;
      refs.searchClear.hidden = previousView.searchClearHidden;
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
    if (!item || !confirm(`确定删除“${item.title}”吗？`)) return false;

    if (item.source === "chrome") {
      try {
        if (!(await chromeBookmarkMatchesCurrent(item))) {
          const message = await refreshAfterChromeConflict();
          if (refs.dialog.open) {
            refs.error.textContent = message;
            refs.error.hidden = false;
          } else {
            toast(message, true);
          }
          return false;
        }
        const latestItem = state.items.find((entry) => entry.id === item.id);
        if (!latestItem || bookmarkEditSignature(latestItem) !== bookmarkEditSignature(item)) {
          const message = await refreshAfterChromeConflict();
          if (refs.dialog.open) {
            refs.error.textContent = message;
            refs.error.hidden = false;
          } else {
            toast(message, true);
          }
          return false;
        }
        await chrome.bookmarks.remove(item.chromeId);
        chromeFavorites.delete(item.chromeId);
        chromeIconOverrides.delete(String(item.chromeId));
        const favoritesSaved = persist();
        const syncSucceeded = await syncChromeBookmarks();
        closeDialog();
        const syncNote = chromeSyncWarning(syncSucceeded);
        toast(favoritesSaved
          ? `Chrome 书签已删除${syncNote}`
          : `Chrome 书签已删除；收藏状态清理未能保存${syncNote}`, !favoritesSaved || syncSucceeded !== true);
        return true;
      } catch (error) {
        toast(`删除失败：${error.message}`, true);
        return false;
      }
    }

    const previousItems = state.items;
    state.items = state.items.filter((entry) => entry.id !== item.id);
    if (!persist()) {
      state.items = previousItems;
      toast("删除未保存：浏览器存储空间不足。", true);
      return false;
    }
    render();
    closeDialog();
    toast("书签已删除");
    return true;
  }

  async function deleteBookmarkAndRestoreFocus(item, focusOrigin = document.activeElement) {
    const rowsBeforeDelete = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0);
    const originRow = focusOrigin?.closest?.(".bookmark");
    const originIndex = rowsBeforeDelete.indexOf(originRow);
    state.editingId = item.id;
    const deleted = await deleteCurrent();
    if (!deleted && focusOrigin?.isConnected && focusOrigin.getClientRects().length > 0) {
      focusOrigin.focus({ preventScroll: true });
      return;
    }
    const rowsAfterDelete = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0);
    if (rowsAfterDelete.length) {
      focusBookmarkRow(Math.min(Math.max(0, originIndex), rowsAfterDelete.length - 1), rowsAfterDelete);
    } else {
      refs.search.focus({ preventScroll: true });
    }
  }

  function chooseFile() {
    if (importInProgress) {
      toast("书签文件正在导入，请稍候。", true);
      return;
    }
    refs.file.value = "";
    refs.file.click();
  }

  function normalizeImportedChromeRoot(item, rawItem) {
    // Bookmark HTML stores links directly under <DL> for the browser's root
    // folder. Give unmatched root links a useful local destination instead of
    // inheriting the parser's generic "未分类" placeholder.
    if (Array.isArray(rawItem?.folderPath) && rawItem.folderPath.length === 0) {
      item.path = ["常用书签"];
      item.category = "常用书签";
      item.group = "常用书签";
      return;
    }
    const path = Array.isArray(item.path) ? [...item.path] : [];
    // Only JSON backups from Chrome carry its synthetic bookmarks-bar node.
    // In HTML, a folder with this same name is a real user folder.
    if (rawItem?.source !== "chrome" || !isChromeBookmarksBar(path[0])) return;
    const localPath = path.slice(1);
    if (!localPath.length) localPath.push("常用书签");
    item.path = localPath;
    item.category = localPath[0].slice(0, 50) || "常用书签";
    item.group = localPath.length > 1 ? localPath.slice(1).join(" / ").slice(0, 100) : "常用书签";
  }

  function normalizeImportedQidianRoot(item, rawItem) {
    if (!Array.isArray(rawItem?.folderPath) || rawItem.folderPath.length) return;
    item.path = ["常用书签"];
    item.category = "常用书签";
    item.group = "常用书签";
  }

  function parseHtmlBookmarks(source) {
    const doc = new DOMParser().parseFromString(source, "text/html");
    const root = doc.querySelector("dl");
    if (!root) return [];
    const results = [];
    let iconBudget = MAX_IMPORT_ICON_CHARS;
    const direct = (element, tag) => [...element.children].find((child) => child.tagName === tag);
    const addAnchor = (anchor, path) => {
      const rawUrl = String(anchor.getAttribute("href") || "").trim();
      if (!rawUrl) return;
      const url = safeUrl(rawUrl) || rawUrl;
      const folder = path.filter(Boolean);
      const category = folder[0] || "未分类";
      const group = folder.length > 1 ? folder.slice(1).join(" / ") : "常用书签";
      const possibleIcon = anchor.getAttribute("icon") || "";
      const icon = validIcon(possibleIcon) && possibleIcon.length <= iconBudget ? possibleIcon : "";
      iconBudget -= icon.length;
      results.push({
        id: id(),
        title: bookmarkTitle(anchor.textContent, url),
        url,
        category: category.slice(0, 50),
        group: group.slice(0, 100),
        path: folder.length ? folder : [category],
        folderPath: [...folder],
        favorite: false,
        icon,
        source: "local",
        dateAdded: Number(anchor.getAttribute("add_date")) ? Number(anchor.getAttribute("add_date")) * 1000 : Date.now()
      });
    };
    const walk = (container, path) => {
      let nextFolder = null;
      let nextFolderIsToolbar = false;
      for (const child of container.children) {
        if (child.tagName === "DT") {
          const anchor = direct(child, "A");
          if (anchor) addAnchor(anchor, path);
          const heading = direct(child, "H3");
          const nested = direct(child, "DL");
          if (heading) {
            nextFolder = heading.textContent.trim();
            nextFolderIsToolbar = path.length === 0
              && heading.getAttribute("personal_toolbar_folder")?.toLowerCase() === "true";
            if (nested) {
              walk(nested, nextFolderIsToolbar ? path : [...path, nextFolder]);
              nextFolder = null;
              nextFolderIsToolbar = false;
            }
          } else if (nested) {
            walk(nested, nextFolder
              ? (nextFolderIsToolbar ? path : [...path, nextFolder])
              : path);
            nextFolder = null;
            nextFolderIsToolbar = false;
          }
        } else if (child.tagName === "DL") {
          walk(child, nextFolder
            ? (nextFolderIsToolbar ? path : [...path, nextFolder])
            : path);
          nextFolder = null;
          nextFolderIsToolbar = false;
        } else if (child.tagName === "A") addAnchor(child, path);
        else if (child.tagName === "H3") {
          nextFolder = child.textContent.trim();
          nextFolderIsToolbar = path.length === 0
            && child.getAttribute("personal_toolbar_folder")?.toLowerCase() === "true";
        }
        else if (child.children.length) walk(child, path);
      }
    };
    walk(root, []);
    return results;
  }

  async function importFile(event) {
    if (importInProgress) return;
    const fileInput = event.currentTarget;
    const file = fileInput.files?.[0];
    if (!file) return;
    const previousImportDisabled = refs.importButton.disabled;
    const previousDemoImportDisabled = refs.demoImportButton.disabled;
    importInProgress = true;
    fileInput.disabled = true;
    refs.importButton.disabled = true;
    refs.demoImportButton.disabled = true;
    try {
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        throw new Error("导入文件超过 25 MB。请先移除 HTML 内嵌图标或精简书签文件后再导入。");
      }
      const initialImportSnapshot = duplicateSnapshotSignature();
      const text = await file.text();
      const isJson = file.name.toLowerCase().endsWith(".json");
      const isQidianHtml = !isJson && /<H1\b[^>]*>\s*(?:栖屿|拾页|栖点)书签\s*<\/H1>/i.test(text);
      const chromeItems = EXTENSION_MODE
        ? flattenChromeTree(await chrome.bookmarks.getTree())
        : state.items.filter((item) => item.source === "chrome");
      const initialChromeSnapshot = chromeBookmarkSnapshotSignature(chromeItems);
      const chromeById = new Map(chromeItems
        .filter((item) => item.chromeId)
        .map((item) => [item.chromeId, item]));
      const normalizeChromeFolderPath = (path, folders) => {
        // Chrome's exported HTML omits the Bookmarks Bar wrapper when its
        // PERSONAL_TOOLBAR_FOLDER flag is set, but keeps Other/Mobile wrappers.
        // Strip only the actual bar root so those folders still match on import.
        if (isChromeBookmarksBarFolder(folders?.[0])) {
          return path.slice(1);
        }
        // When folder metadata is unavailable, retain the legacy localized-name
        // fallback. Known Chrome items normally take the structural branch above.
        if (folders?.length) return path;
        return isChromeBookmarksBar(path[0]) ? path.slice(1) : path;
      };
      const locationSignature = (url, path) => JSON.stringify([normalizeUrlForDedup(url), path || []]);
      const chromeByLocation = new Map();
      for (const chromeItem of chromeItems) {
        const folderNodes = getChromeFolderNodes(chromeItem);
        const folderPath = folderNodes.length ? folderNodes.map((folder) => folder.title) : chromeItem.path;
        const signature = locationSignature(chromeItem.url, normalizeChromeFolderPath(folderPath, folderNodes));
        if (!chromeByLocation.has(signature)) chromeByLocation.set(signature, []);
        chromeByLocation.get(signature).push(chromeItem);
      }
      let items = [];
      const matchedChromeIds = new Set();
      const importedChromeFavoriteValues = new Map();
      const importedChromeIconValues = new Map();
      const chromeFavoriteChanges = new Map();
      let chromeIdentityConflicts = 0;
      let chromeFavoriteSnapshot = null;
      let remainingImportIconChars = MAX_IMPORT_ICON_CHARS;
      let skippedImportItems = 0;
      let skippedImportIcons = 0;

      if (isJson) {
        const parsed = JSON.parse(text);
        const raw = Array.isArray(parsed) ? parsed : parsed.items;
        if (!Array.isArray(raw)) throw new Error("JSON 文件里没有书签列表");
        items = raw;
        chromeFavoriteSnapshot = Array.isArray(parsed.chromeFavorites)
          ? new Set(parsed.chromeFavorites.map(String))
          : null;
      } else {
        items = parseHtmlBookmarks(text);
      }

      const rawItems = items;
      items = [];
      for (const rawItem of rawItems) {
        const sanitized = sanitizeItem(rawItem);
        if (!sanitized) {
          skippedImportItems++;
          continue;
        }

        // Chrome IDs are profile-local and can be reused in another profile.
        // Require the saved ID, URL and full folder path before treating them
        // as the same bookmark; otherwise retain the backup as a local copy.
        if (rawItem?.source === "chrome" && sanitized.chromeId) {
          const existingChromeItem = chromeById.get(sanitized.chromeId);
          const importedPath = Array.isArray(rawItem.path)
            ? rawItem.path.map((part) => String(part))
            : null;
          const sameFolderPath = importedPath
            && importedPath.length === existingChromeItem?.path?.length
            && importedPath.every((part, index) => part === existingChromeItem.path[index]);
          if (existingChromeItem
            && normalizeUrlForDedup(existingChromeItem.url) === normalizeUrlForDedup(sanitized.url)
            && sameFolderPath) {
            matchedChromeIds.add(sanitized.chromeId);
            if (typeof rawItem.favorite === "boolean") {
              importedChromeFavoriteValues.set(sanitized.chromeId, rawItem.favorite);
            }
            if (validIcon(sanitized.icon)) {
              if (sanitized.icon.length > remainingImportIconChars) {
                skippedImportIcons++;
              } else {
                remainingImportIconChars -= sanitized.icon.length;
                importedChromeIconValues.set(sanitized.chromeId, {
                  url: sanitized.url,
                  icon: sanitized.icon
                });
              }
            }
            continue;
          }
          if (existingChromeItem) chromeIdentityConflicts++;
        }

        // Standard Chrome HTML exports do not retain IDs; match duplicate counts by URL and folder path.
        if (!isJson) {
          const importFolderPath = Array.isArray(rawItem.folderPath) ? rawItem.folderPath : sanitized.path;
          const signature = locationSignature(sanitized.url, importFolderPath);
          const locationMatches = chromeByLocation.get(signature);
          const existingChromeItem = locationMatches?.shift();
          if (existingChromeItem) {
            if (existingChromeItem.chromeId) matchedChromeIds.add(existingChromeItem.chromeId);
            continue;
          }
        }

        // Chrome references from another profile become local copies, preserving the backup.
        if (rawItem?.source === "chrome" || (!isJson && !isQidianHtml)) {
          normalizeImportedChromeRoot(sanitized, rawItem);
        } else if (isQidianHtml) {
          normalizeImportedQidianRoot(sanitized, rawItem);
        }
        if (sanitized.icon) {
          if (sanitized.icon.length > remainingImportIconChars) {
            sanitized.icon = "";
            skippedImportIcons++;
          }
          else remainingImportIconChars -= sanitized.icon.length;
        }
        sanitized.source = "local";
        delete sanitized.chromeId;
        delete sanitized.parentId;
        items.push(sanitized);
      }
      normalizeLocalItemIds(items, chromeItems.map((item) => item.id));

      for (const chromeId of matchedChromeIds) {
        const itemFavorite = importedChromeFavoriteValues.get(chromeId);
        const shouldBeFavorite = chromeFavoriteSnapshot
          ? chromeFavoriteSnapshot.has(chromeId)
          : itemFavorite;
        if (typeof shouldBeFavorite === "boolean") chromeFavoriteChanges.set(chromeId, shouldBeFavorite);
      }

      if (!items.length && !matchedChromeIds.size) throw new Error("文件中没有找到可导入或匹配的书签");

      const localCount = state.items.filter((item) => item.source !== "chrome").length;
      const matchNote = matchedChromeIds.size
        ? `，并匹配到 ${matchedChromeIds.size} 个现有 Chrome 书签`
        : "";

      const importWarnings = [];
      if (state.mode === "personal" && localCount) {
        importWarnings.push(`将当前 ${localCount} 个本地书签替换为文件中的 ${items.length} 个本地书签${matchNote}。栖屿会先下载当前全部书签的 JSON 备份，并要求你确认文件已保存。`);
      }
      if (skippedImportItems) {
        importWarnings.push(`文件中有 ${skippedImportItems} 条记录无效或使用暂不支持的网址格式，将跳过。`);
      }
      if (importWarnings.length
        && !confirm(`${importWarnings.join("\n\n")}\n\n继续导入吗？`)) return;

      if (state.mode === "personal" && localCount) {
        const backupItems = [...chromeItems, ...state.items.filter((item) => item.source !== "chrome")];
        const backupStarted = exportJson(backupItems, { silent: true });
        if (!backupStarted) throw new Error("自动备份下载未能启动，已取消导入");
        if (!confirm("已发起“栖屿书签.json”下载。请确认备份文件已保存，再继续替换本地书签；取消会保留现有书签。")) {
          toast("已取消导入，现有书签未更改。");
          return;
        }
      }

      if (EXTENSION_MODE) {
        if (chromeBookmarkImporting) {
          throw new Error("Chrome 正在导入书签，已取消本次导入；请等待 Chrome 完成后重试。");
        }
        let latestChromeItems;
        try {
          latestChromeItems = flattenChromeTree(await chrome.bookmarks.getTree());
        } catch {
          throw new Error("无法复核最新 Chrome 书签状态，已取消导入以保护现有数据。");
        }
        if (chromeBookmarkSnapshotSignature(latestChromeItems) !== initialChromeSnapshot) {
          const conflictMessage = await refreshAfterChromeConflict();
          throw new Error(`检测到 Chrome 书签或分组在导入期间发生变化，导入已取消。${conflictMessage}`);
        }
      }
      if (EXTENSION_MODE && chromeBookmarkImporting) {
        throw new Error("Chrome 正在导入书签，已取消本次导入；请等待 Chrome 完成后重试。");
      }
      if (duplicateSnapshotSignature() !== initialImportSnapshot) {
        throw new Error("栖屿书签在导入期间发生了变化，已取消导入；其他页面的最新更改已保留，请重新确认后再导入。");
      }

      const previousMode = state.mode;
      const previousItems = state.items.map((item) => ({ ...item, path: [...(item.path || [])] }));
      const previousFavorites = new Set(chromeFavorites);
      const previousChromeIcons = new Map(chromeIconOverrides);
      const previousView = {
        activeTab: state.activeTab,
        activeSubFolder: state.activeSubFolder,
        query: state.query,
        limit: state.limit,
        search: refs.search.value,
        searchClearHidden: refs.searchClear.hidden
      };
      for (const [chromeId, favorite] of chromeFavoriteChanges) {
        if (favorite) chromeFavorites.add(chromeId);
        else chromeFavorites.delete(chromeId);
        const currentItem = chromeById.get(chromeId);
        if (currentItem) currentItem.favorite = favorite;
      }
      for (const [chromeId, override] of importedChromeIconValues) {
        if (!matchedChromeIds.has(chromeId)) continue;
        chromeIconOverrides.set(chromeId, override);
        const currentItem = chromeById.get(chromeId);
        if (currentItem) currentItem.icon = override.icon;
      }
      state.mode = "personal";
      state.items = [...chromeItems, ...items];
      state.activeTab = "all";
      state.activeSubFolder = "";
      state.query = "";
      state.limit = PAGE_SIZE;
      refs.search.value = "";
      refs.searchClear.hidden = true;

      if (!persist()) {
        state.mode = previousMode;
        state.items = previousItems;
        chromeFavorites.clear();
        previousFavorites.forEach((chromeId) => chromeFavorites.add(chromeId));
        chromeIconOverrides.clear();
        previousChromeIcons.forEach((override, chromeId) => chromeIconOverrides.set(chromeId, override));
        state.activeTab = previousView.activeTab;
        state.activeSubFolder = previousView.activeSubFolder;
        state.query = previousView.query;
        state.limit = previousView.limit;
        refs.search.value = previousView.search;
        refs.searchClear.hidden = previousView.searchClearHidden;
        throw new Error("浏览器存储空间不足，请缩小文件或清理部分数据");
      }
      render();
      const importMessage = matchedChromeIds.size
        ? `已导入 ${items.length} 个本地书签，匹配并保留 ${matchedChromeIds.size} 个现有 Chrome 书签`
        : `已成功导入 ${items.length} 个书签`;
      const importNotes = [
        chromeIdentityConflicts ? `${chromeIdentityConflicts} 个 Chrome 书签 ID、网址或文件夹路径无法匹配，已作为本地书签保留` : "",
        skippedImportItems ? `${skippedImportItems} 条无效记录已跳过` : "",
        skippedImportIcons ? `${skippedImportIcons} 个内嵌图标缓存超出存储预算，已跳过；书签条目仍已导入` : ""
      ].filter(Boolean);
      toast(importNotes.length ? `${importMessage}；${importNotes.join("；")}` : importMessage);
    } catch (error) { toast(`导入失败：${error.message}`, true); }
    finally {
      importInProgress = false;
      fileInput.disabled = false;
      fileInput.value = "";
      refs.importButton.disabled = previousImportDisabled;
      refs.demoImportButton.disabled = previousDemoImportDisabled;
    }
  }

  function exportHtml() {
    const tree = { entries: [], childrenByKey: new Map() };
    let localExportOrder = 0;
    const ensureChild = (parent, key, name, orderPath = null) => {
      let child = parent.childrenByKey.get(key);
      if (!child) {
        const position = Array.isArray(orderPath) && orderPath.length
          ? [...orderPath]
          : [Number.MAX_SAFE_INTEGER, localExportOrder++];
        child = { key, name, entries: [], childrenByKey: new Map() };
        parent.childrenByKey.set(key, child);
        parent.entries.push({ kind: "folder", folder: child, orderPath: position });
      }
      return child;
    };
    const compareOrderPath = (left, right) => {
      const leftPath = left.orderPath || [];
      const rightPath = right.orderPath || [];
      for (let index = 0; index < Math.min(leftPath.length, rightPath.length); index++) {
        if (leftPath[index] !== rightPath[index]) return leftPath[index] - rightPath[index];
      }
      return leftPath.length - rightPath.length;
    };
    const chromeSiblingCounts = new Map();
    for (const folder of chromeFolders.values()) {
      const key = `${folder.parentId}\u0000${folder.title}`;
      chromeSiblingCounts.set(key, (chromeSiblingCounts.get(key) || 0) + 1);
    }

    // Seed the export tree from Chrome's folders first so empty folders are
    // retained in the browser-readable backup as well as folders with links.
    for (const folder of chromeFolders.values()) {
      const folders = getChromeFolderNodes({ parentId: folder.id });
      if (folders.length && isChromeBookmarksBarFolder(folders[0])) folders.shift();
      let node = tree;
      for (const entry of folders) {
        const siblingKey = `${entry.parentId}\u0000${entry.title}`;
        const duplicateSibling = chromeSiblingCounts.get(siblingKey) > 1;
        const key = duplicateSibling ? `chrome-folder:${entry.id}` : `name:${entry.title}`;
        node = ensureChild(node, key, entry.title, entry.orderPath);
      }
    }

    for (const item of state.items) {
      let node = tree;
      let segments;
      if (item.source === "chrome" && item.parentId) {
        const folders = getChromeFolderNodes(item);
        // Chrome supplies a synthetic top-level bookmarks bar folder. The HTML
        // document root already represents that location, so do not nest it twice.
        if (folders.length && isChromeBookmarksBarFolder(folders[0])) folders.shift();
        if (folders.length) {
          segments = folders.map((entry) => {
            const siblingKey = `${entry.parentId}\u0000${entry.title}`;
            const duplicateSibling = chromeSiblingCounts.get(siblingKey) > 1;
            return {
              key: duplicateSibling ? `chrome-folder:${entry.id}` : `name:${entry.title}`,
              name: entry.title,
              orderPath: entry.orderPath
            };
          });
        } else {
          let path = item.path?.length ? [...item.path] : [item.category, ...item.group.split(" / ")];
          if (isChromeBookmarksBar(path[0])) path = path.slice(1);
          segments = path.map((name) => ({ key: `name:${name}`, name }));
        }
      } else {
        let path = item.path?.length ? [...item.path] : [item.category, ...item.group.split(" / ")];
        if (item.source === "chrome" && isChromeBookmarksBar(path[0])) path = path.slice(1);
        segments = path.map((name) => ({ key: `name:${name}`, name }));
      }
      for (const segment of segments) {
        node = ensureChild(node, segment.key, segment.name, segment.orderPath);
      }
      const orderPath = item.source === "chrome" && Array.isArray(item.orderPath) && item.orderPath.length
        ? [...item.orderPath]
        : [Number.MAX_SAFE_INTEGER, localExportOrder++];
      node.entries.push({ kind: "bookmark", item, orderPath });
    }
    const lines = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<!-- This is an automatically generated file. -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      '<TITLE>栖屿书签</TITLE>',
      '<H1>栖屿书签</H1>',
      '<DL><p>'
    ];
    const writeNode = (node, depth) => {
      const indent = "    ".repeat(depth);
      const orderedEntries = [...node.entries].sort(compareOrderPath);
      for (const entry of orderedEntries) {
        if (entry.kind === "bookmark") {
          const item = entry.item;
          const addDate = Math.floor((item.dateAdded || Date.now()) / 1000);
          lines.push(`${indent}<DT><A HREF="${escapeHtml(item.url)}" ADD_DATE="${addDate}"${item.icon ? ` ICON="${escapeHtml(item.icon)}"` : ""}>${escapeHtml(item.title)}</A>`);
        } else {
          const child = entry.folder;
          lines.push(`${indent}<DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}">${escapeHtml(child.name)}</H3>`, `${indent}<DL><p>`);
          writeNode(child, depth + 1);
          lines.push(`${indent}</DL><p>`);
        }
      }
    };
    writeNode(tree, 1);
    lines.push('</DL><p>');
    download("栖屿书签.html", new Blob([lines.join("\n")], { type: "text/html;charset=utf-8" }));
  }

  function exportJson(items = state.items, { silent = false } = {}) {
    try {
      const payload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        chromeFavorites: [...chromeFavorites],
        chromeIconOverrides: [...chromeIconOverrides],
        items
      };
      const data = JSON.stringify(payload, null, 2);
      return download("栖屿书签.json", new Blob([data], { type: "application/json" }), { silent });
    } catch (error) {
      if (silent) throw error;
      toast(`导出失败：${error.message || "无法生成 JSON 备份"}`, true);
      return false;
    }
  }

  function download(name, blob, { silent = false } = {}) {
    let href = "";
    let link = null;
    try {
      href = URL.createObjectURL(blob);
      link = document.createElement("a");
      link.href = href;
      link.download = name;
      document.body.append(link);
      link.click();
    } catch (error) {
      if (href) URL.revokeObjectURL(href);
      if (silent) throw error;
      toast(`导出失败：${error.message || "无法创建下载文件"}`, true);
      return false;
    } finally {
      link?.remove();
    }
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    if (!silent) toast("已开始下载导出文件");
    return true;
  }

  function flattenChromeTree(nodes) {
    const items = [];
    chromeFolders = new Map();
    const folderTitle = (node) => String(node.title || "未分类").trim() || "未分类";
    const displayTitles = (siblings) => {
      const totals = new Map();
      for (const node of siblings || []) {
        if (node.url) continue;
        const title = folderTitle(node);
        totals.set(title, (totals.get(title) || 0) + 1);
      }
      // Reserve every unique real folder name before assigning suffixes. This
      // prevents two folders from collapsing into one navigation path when a
      // real folder is already named, for example, "项目（1）".
      const usedTitles = new Set([...totals]
        .filter(([, count]) => count === 1)
        .map(([title]) => title));
      const seen = new Map();
      return new Map((siblings || []).filter((node) => !node.url).map((node) => {
        const title = folderTitle(node);
        if (totals.get(title) <= 1) return [String(node.id), title];
        let index = (seen.get(title) || 0) + 1;
        let displayTitle = `${title}（${index}）`;
        while (usedTitles.has(displayTitle)) {
          index++;
          displayTitle = `${title}（${index}）`;
        }
        seen.set(title, index);
        usedTitles.add(displayTitle);
        return [String(node.id), displayTitle];
      }));
    };
    const walk = (node, folders, displayTitle = "", orderPath = [], fallbackIndex = 0) => {
      const nodeOrderPath = node.parentId === undefined
        ? orderPath
        : [...orderPath, Number.isInteger(node.index) ? node.index : fallbackIndex];
      if (node.url) {
        const url = storedBookmarkUrl(node.url);
        if (!url) return;
        const path = folders.length ? folders : ["未分类"];
        const category = path[0].slice(0, 50) || "未分类";
        const group = path.length > 1 ? path.slice(1).join(" / ").slice(0, 100) : "常用书签";
        const chromeId = String(node.id);
        items.push({
          id: `chrome-${chromeId}`,
          chromeId,
          source: "chrome",
          title: bookmarkTitle(node.title, url),
          url, category, group, path,
          favorite: chromeFavorites.has(chromeId),
          icon: chromeIconForBookmark(chromeId, url),
          parentId: String(node.parentId),
          index: Number.isInteger(node.index) ? node.index : fallbackIndex,
          dateAdded: node.dateAdded || 0,
          orderPath: nodeOrderPath
        });
        return;
      }
      const nextFolders = node.parentId === undefined ? folders : [...folders, displayTitle || folderTitle(node)];
      if (node.parentId !== undefined) {
        chromeFolders.set(String(node.id), {
          id: String(node.id),
          parentId: String(node.parentId),
          title: folderTitle(node),
          path: nextFolders,
          unmodifiable: Boolean(node.unmodifiable),
          folderType: typeof node.folderType === "string" ? node.folderType : "",
          orderPath: nodeOrderPath
        });
      }
      const childTitles = displayTitles(node.children);
      for (const [index, child] of (node.children || []).entries()) {
        walk(
          child,
          nextFolders,
          childTitles.get(String(child.id)) || folderTitle(child),
          nodeOrderPath,
          index
        );
      }
    };
    for (const [index, node] of (nodes || []).entries()) walk(node, [], "", [], index);
    return items;
  }

  function chromeBookmarkSnapshotSignature(items) {
    return JSON.stringify((items || [])
      .filter((item) => item.source === "chrome")
      .map((item) => [
        String(item.chromeId || item.id || ""),
        String(item.title || ""),
        storedBookmarkUrl(item.url),
        String(item.parentId || ""),
        Array.isArray(item.path) ? item.path.map(String) : [],
        Number(item.dateAdded) || 0,
        Array.isArray(item.orderPath) ? item.orderPath : []
      ]));
  }

  function chromeBookmarkFavoriteSignature(items) {
    return JSON.stringify((items || [])
      .filter((item) => item.source === "chrome")
      .map((item) => [String(item.chromeId || item.id || ""), Boolean(item.favorite)]));
  }

  function chromeFolderSnapshotSignature(folders) {
    return JSON.stringify([...folders.values()].map((folder) => [
      String(folder.id),
      String(folder.parentId),
      String(folder.title),
      Array.isArray(folder.path) ? folder.path.map(String) : [],
      Boolean(folder.unmodifiable),
      String(folder.folderType || ""),
      Array.isArray(folder.orderPath) ? folder.orderPath : []
    ]));
  }

  async function chromeBookmarkMatchesCurrent(item, expected = item) {
    if (!item?.chromeId || !chrome?.bookmarks?.get) return false;
    try {
      const [current] = await chrome.bookmarks.get([String(item.chromeId)]);
      const url = current?.url ? storedBookmarkUrl(current.url) : "";
      if (!url) return false;
      const title = bookmarkTitle(current.title, url);
      return String(current.id) === String(item.chromeId)
        && title === expected.title
        && url === expected.url
        && String(current.parentId) === String(expected.parentId);
    } catch {
      return false;
    }
  }

  async function chromeFolderMatchesCurrent(folderId, expected) {
    if (!folderId || !chrome?.bookmarks?.get) return false;
    try {
      const [current] = await chrome.bookmarks.get([String(folderId)]);
      if (!current || current.url) return false;
      const title = String(current.title || "未分类").trim() || "未分类";
      return String(current.id) === String(folderId)
        && title === expected.title
        && String(current.parentId) === String(expected.parentId)
        && Boolean(current.unmodifiable) === Boolean(expected.unmodifiable);
    } catch {
      return false;
    }
  }

  async function refreshAfterChromeConflict() {
    if (chromeBookmarkImporting) {
      return "Chrome 正在导入书签，本次操作未执行；请等待导入完成后重试。";
    }
    let syncSucceeded = false;
    try {
      syncSucceeded = await syncChromeBookmarks();
    } catch {
      syncSucceeded = false;
    }
    if (syncSucceeded === false) return "最新列表同步失败，请从右上角“⋯”菜单选择“重新同步 Chrome 书签”后重试。";
    if (syncSucceeded === true) return "最新列表已刷新；本次操作未写入，请重新打开操作后重试。";
    return "Chrome 列表仍在同步；如果状态长时间不变，请从右上角“⋯”菜单重新同步。";
  }

  function getChromeFolderNodes(item) {
    const folders = [];
    const visited = new Set();
    let folder = chromeFolders.get(String(item?.parentId || ""));
    while (folder && !visited.has(folder.id)) {
      visited.add(folder.id);
      folders.unshift(folder);
      folder = chromeFolders.get(folder.parentId);
    }
    return folders;
  }

  function chromeBarRootNavigationLabel() {
    const rootPathExists = (label) => {
      const localCollision = state.items.some((item) => {
        if (item.source === "chrome") return false;
        const path = Array.isArray(item.path) && item.path.length
          ? item.path
          : [item.category || "未分类", ...(item.group ? item.group.split(" / ") : [])];
        return path.length > 0 && path[0] === label;
      });
      if (localCollision) return true;

      for (const folder of chromeFolders.values()) {
        const parents = getChromeFolderNodes({ parentId: folder.id });
        const path = [...parents.map((parent) => parent.title), folder.title];
        if (parents.length && isChromeBookmarksBarFolder(parents[0])) path.shift();
        if (path.length > 0 && path[0] === label) return true;
      }
      return false;
    };

    if (!chromeBarRootAlternateLabel && !rootPathExists("常用书签")) return "常用书签";
    let alternate = chromeBarRootAlternateLabel || "书签栏根目录";
    let suffix = 2;
    while (rootPathExists(alternate)) alternate = `书签栏根目录 ${suffix++}`;
    chromeBarRootAlternateLabel = alternate;
    return chromeBarRootAlternateLabel;
  }

  let chromeSyncTimer;
  let chromeSyncRequest = 0;
  let chromeSyncPromise = null;
  let chromeSyncPromiseRequest = 0;
  let chromeBookmarkImporting = false;
  let skipFavoritePruneOnce = false;

  async function syncChromeBookmarks() {
    if (chromeBookmarkImporting) return;
    clearTimeout(chromeSyncTimer);
    chromeSyncTimer = undefined;
    const request = ++chromeSyncRequest;
    const pendingSync = readChromeBookmarks(request);
    chromeSyncPromise = pendingSync;
    chromeSyncPromiseRequest = request;
    let settledRequest = request;
    let result = await pendingSync;
    while (settledRequest < chromeSyncRequest) {
      // A newer read may start while this caller is already waiting for the
      // previous replacement. Follow the newest promise until the snapshot
      // current at settlement has finished, so actions cannot report success
      // based on an older read that was superseded in the meantime.
      const latestRequest = chromeSyncPromiseRequest;
      const latestSync = chromeSyncPromise;
      if (!latestSync || latestRequest <= settledRequest) return undefined;
      result = await latestSync;
      settledRequest = latestRequest;
    }
    return settledRequest === chromeSyncRequest ? result : undefined;
  }

  async function readChromeBookmarks(request) {
    try {
      const tree = await chrome.bookmarks.getTree();
      if (request !== chromeSyncRequest) return;
      const previousChromeSnapshot = chromeBookmarkSnapshotSignature(state.items);
      const previousFavoriteSnapshot = chromeBookmarkFavoriteSignature(state.items);
      const previousChromeIcons = new Map(state.items
        .filter((item) => item.source === "chrome")
        .map((item) => [String(item.chromeId || item.id), item.icon || ""]));
      const previousFolderSnapshot = chromeFolderSnapshotSignature(chromeFolders);
      const previousSyncStatus = state.chromeSyncStatus;
      const liveChromeIds = new Set();
      const collectChromeBookmarkIds = (nodes) => {
        for (const node of nodes || []) {
          if (node.url && node.id != null) liveChromeIds.add(String(node.id));
          collectChromeBookmarkIds(node.children);
        }
      };
      collectChromeBookmarkIds(tree);
      const chromeItems = flattenChromeTree(tree);
      const liveChromeItemsById = new Map(chromeItems.map((item) => [String(item.chromeId), item]));
      let prunedChromeIcons = false;
      for (const chromeId of chromeIconOverrides.keys()) {
        const item = liveChromeItemsById.get(chromeId);
        if (!item?.icon) {
          chromeIconOverrides.delete(chromeId);
          prunedChromeIcons = true;
        }
      }
      const localItems = state.items.filter((item) => item.source !== "chrome");
      const normalizedLocalIds = normalizeLocalItemIds(localItems, chromeItems.map((item) => item.id));
      let prunedFavorites = false;
      if (!chromeBookmarkImporting && !skipFavoritePruneOnce) {
        for (const chromeId of chromeFavorites) {
          if (!liveChromeIds.has(chromeId)) {
            chromeFavorites.delete(chromeId);
            prunedFavorites = true;
          }
        }
      }
      skipFavoritePruneOnce = false;
      const chromeChanged = previousChromeSnapshot !== chromeBookmarkSnapshotSignature(chromeItems)
        || previousFavoriteSnapshot !== chromeBookmarkFavoriteSignature(chromeItems);
      const chromeIconsChanged = chromeItems.some((item) =>
        previousChromeIcons.get(String(item.chromeId || item.id)) !== (item.icon || ""));
      const foldersChanged = previousFolderSnapshot !== chromeFolderSnapshotSignature(chromeFolders);
      let needsRender = chromeChanged || chromeIconsChanged || foldersChanged || normalizedLocalIds || previousSyncStatus !== "ready";
      if (needsRender) state.items = [...chromeItems, ...localItems];
      if (prunedFavorites || prunedChromeIcons || normalizedLocalIds) {
        const previousIconWarningCount = persistenceIconWarningPending;
        const saved = persist();
        if (saved && persistenceIconWarningPending > previousIconWarningCount) {
          needsRender = true;
          toast(prunedFavorites ? "Chrome 收藏状态已同步" : "书签状态已保存");
        }
      }
      state.chromeSyncStatus = "ready";
      if (needsRender) render();
      return true;
    } catch (error) {
      if (request !== chromeSyncRequest) return;
      state.chromeSyncStatus = "error";
      render();
      console.error("Chrome 书签同步失败", error);
      return false;
    }
  }

  function chromeSyncWarning(syncSucceeded, separator = "；") {
    if (syncSucceeded === true) return "";
    if (syncSucceeded === false) {
      return `${separator}页面列表同步失败，请从右上角“⋯”菜单选择“重新同步 Chrome 书签”`;
    }
    return chromeBookmarkImporting
      ? `${separator}Chrome 正在导入，页面列表会在导入结束后自动更新`
      : `${separator}页面列表尚未确认同步完成，请稍后从右上角“⋯”菜单重新同步`;
  }

  function scheduleChromeSync() {
    if (chromeBookmarkImporting) {
      clearTimeout(chromeSyncTimer);
      return;
    }
    clearTimeout(chromeSyncTimer);
    chromeSyncTimer = setTimeout(syncChromeBookmarks, 120);
  }

  function startChromeSync() {
    if (!chrome?.bookmarks?.getTree) {
      state.chromeSyncStatus = "error";
      render();
      return;
    }
    for (const name of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"]) {
      chrome.bookmarks[name]?.addListener(scheduleChromeSync);
    }
    chrome.bookmarks.onImportBegan?.addListener(() => {
      chromeBookmarkImporting = true;
      clearTimeout(chromeSyncTimer);
      chromeSyncRequest++;
      state.chromeSyncStatus = "importing";
      render();
    });
    chrome.bookmarks.onImportEnded?.addListener(() => {
      chromeBookmarkImporting = false;
      skipFavoritePruneOnce = true;
      state.chromeSyncStatus = "loading";
      render();
      scheduleChromeSync();
    });
    window.addEventListener("focus", scheduleChromeSync);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scheduleChromeSync();
    });
    syncChromeBookmarks();
  }

  function hideBookmarkTooltip() {
    clearTimeout(tooltipHideTimer);
    refs.tooltip.hidden = true;
  }

  function scheduleHideBookmarkTooltip() {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(hideBookmarkTooltip, 300);
  }

  function showBookmarkTooltip(item, anchor, x, y) {
    if (!anchor.isConnected || !refs.contextMenu.hidden) return;
    clearTimeout(tooltipHideTimer);
    refs.tooltip.textContent = `${item.title}\n${item.url}`;
    refs.tooltip.hidden = false;
    // 定位在鼠标附近，接近视口边缘时自动避让/翻转
    const tw = refs.tooltip.offsetWidth || 320;
    const th = refs.tooltip.offsetHeight || 30;
    let px, py;
    if (typeof x === "number" && typeof y === "number") {
      px = x + 16;
      py = y + 20;
    } else {
      const rect = anchor.getBoundingClientRect();
      px = rect.left;
      py = rect.bottom + 8;
    }
    px = Math.max(8, Math.min(px, window.innerWidth - tw - 8));
    if (py + th > window.innerHeight - 8) py = py - th - 40;
    py = Math.max(8, py);
    refs.tooltip.style.left = `${px}px`;
    refs.tooltip.style.top = `${py}px`;
  }

  function hideContextMenu({ restoreFocus = false } = {}) {
    const returnFocus = contextMenuReturnFocus;
    contextMenuReturnFocus = null;
    refs.contextMenu.hidden = true;
    state.contextItemId = null;
    state.contextFolderNode = null;
    refs.contextMenu.querySelectorAll('[data-menu-kind="bookmark"]').forEach((entry) => { entry.hidden = false; });
    refs.contextMenu.querySelectorAll('[data-menu-kind="folder"]').forEach((entry) => { entry.hidden = true; });
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  function showContextMenu(item, x, y, returnFocus = null) {
    hideBookmarkTooltip();
    refs.contextMenu.querySelectorAll('[data-menu-kind="bookmark"]').forEach((entry) => { entry.hidden = false; });
    refs.contextMenu.querySelectorAll('[data-menu-kind="folder"]').forEach((entry) => { entry.hidden = true; });
    const openable = Boolean(safeUrl(item.url));
    refs.contextMenu.querySelectorAll('[data-action="open"], [data-action="open-window"]').forEach((entry) => {
      entry.hidden = !openable;
    });
    refs.contextMenu.querySelector('[data-menu-kind="bookmark"].menu-divider').hidden = !openable;
    contextMenuReturnFocus = returnFocus;
    state.contextItemId = item.id;
    refs.contextFavoriteLabel.textContent = item.favorite ? "取消收藏" : "加入收藏";
    refs.contextMenu.hidden = false;
    const menuWidth = refs.contextMenu.offsetWidth || 184;
    const menuHeight = refs.contextMenu.offsetHeight || 220;
    refs.contextMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - menuWidth - 8))}px`;
    refs.contextMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - menuHeight - 8))}px`;
    refs.contextMenu.querySelector("button")?.focus();
  }

  function canRenameChromeFolder(folderId) {
    const folder = folderId ? chromeFolders.get(String(folderId)) : null;
    return Boolean(folder && !folder.unmodifiable && folder.parentId !== "0");
  }

  function showFolderContextMenu(node, x, y, returnFocus = null) {
    hideBookmarkTooltip();
    hideContextMenu();
    contextMenuReturnFocus = returnFocus;
    state.contextFolderNode = node;
    state.contextItemId = null;
    refs.contextMenu.querySelectorAll('[data-menu-kind="bookmark"]').forEach((entry) => { entry.hidden = true; });
    refs.contextMenu.querySelectorAll('[data-menu-kind="folder"]').forEach((entry) => { entry.hidden = false; });
    const rename = refs.contextMenu.querySelector('[data-action="folder-rename"]');
    const canRename = canRenameChromeFolder(node.folderId)
      || node.items.some((item) => item.source !== "chrome");
    rename.hidden = !canRename;
    refs.contextMenu.querySelector('[data-menu-kind="folder"].menu-divider').hidden = !canRename;
    const openAll = refs.contextMenu.querySelector('[data-action="folder-open-all"]');
    const openableCount = node.items.filter((item) => safeUrl(item.url)).length;
    const restrictedCount = node.items.length - openableCount;
    openAll.disabled = openableCount === 0;
    const openAllLabel = $("#folderOpenAllLabel");
    if (openAllLabel) {
      openAllLabel.textContent = openableCount
        ? `打开 ${openableCount} 个书签${restrictedCount ? `（另有 ${restrictedCount} 个特殊网址）` : ""}`
        : node.items.length ? "没有可直接打开的网址" : "文件夹为空";
    }
    refs.contextMenu.hidden = false;
    const menuWidth = refs.contextMenu.offsetWidth || 200;
    const menuHeight = refs.contextMenu.offsetHeight || 90;
    refs.contextMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - menuWidth - 8))}px`;
    refs.contextMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - menuHeight - 8))}px`;
    refs.contextMenu.querySelector('[data-action="folder-rename"]:not([hidden]), [data-action="folder-open-all"]:not(:disabled)')?.focus();
  }

  function openMoveDialog(item, focusOrigin = document.activeElement) {
    const items = item ? [item] : selectedBookmarks();
    if (!items.length) return;
    rememberDialogFocus(refs.moveDialog, focusOrigin, item?.id || items[0].id);
    state.movingId = item?.id || null;
    state.movingIds = items.map((entry) => entry.id);
    const title = refs.moveDialog.querySelector("#moveTitle");
    if (title) title.textContent = items.length > 1 ? `移动 ${items.length} 个书签` : "移动到分组";
    refs.newGroup.value = "";
    refs.moveTarget.replaceChildren();
    const paths = flattenNavigationTree(buildNavigationTree());
    const preferredPath = selectedNavigationPath() || getNavigationPath(items[0]);
    for (const node of paths) {
      const key = JSON.stringify(node.path);
      refs.moveTarget.add(new Option(node.path.join(" › "), key, false,
        JSON.stringify(preferredPath) === key));
    }
    if (!refs.moveTarget.options.length) refs.moveTarget.add(new Option("未分类", JSON.stringify(["未分类"]), true, true));
    const hint = refs.moveDialog.querySelector(".dialog-hint");
    if (hint) hint.textContent = "书签移动后将自动同步更新。";
    refs.moveDialog.showModal();
    refs.moveTarget.focus();
  }

  async function moveBookmark(event) {
    return withSubmitLock(event, "正在移动…", moveBookmarkOnce);
  }

  async function moveBookmarkOnce(event) {
    event.preventDefault();
    const items = (state.movingIds.length ? state.movingIds : [state.movingId])
      .filter(Boolean)
      .map((movingId) => state.items.find((entry) => entry.id === movingId))
      .filter(Boolean);
    if (!items.length) return;
    const newName = refs.newGroup.value.trim();
    let createdFolderIds = [];
    const movedChrome = [];
    const localPrevious = items.filter((item) => item.source !== "chrome").map((item) => ({
      item,
      path: [...item.path],
      category: item.category,
      group: item.group
    }));
    let chromeSyncSucceeded = true;
    try {
      const path = JSON.parse(refs.moveTarget.value);
      if (!Array.isArray(path) || !path.length) throw new Error("请选择目标分组");
      const destinationPath = newName ? [...path, newName] : path;
      const chromeItems = items.filter((item) => item.source === "chrome");
      for (const item of chromeItems) {
        if (!(await chromeBookmarkMatchesCurrent(item))) {
          toast(await refreshAfterChromeConflict(), true);
          return;
        }
      }

      let targetChromeFolderId = null;
      if (chromeItems.length) {
        const folderIdsByPath = new Map();
        for (const folder of chromeFolders.values()) {
          const chain = getChromeFolderNodes({ parentId: folder.id });
          const folderPath = chain.length && isChromeBookmarksBarFolder(chain[0])
            ? folder.path.slice(1)
            : folder.path;
          if (folderPath.length) folderIdsByPath.set(JSON.stringify(folderPath), folder.id);
        }
        let parentId = [...chromeFolders.values()].find(isChromeBookmarksBarFolder)?.id || "1";
        const traversed = [];
        for (const segment of destinationPath) {
          traversed.push(segment);
          const key = JSON.stringify(traversed);
          if (folderIdsByPath.has(key)) {
            parentId = folderIdsByPath.get(key);
            continue;
          }
          const folder = await chrome.bookmarks.create({ parentId, title: segment });
          createdFolderIds.push(folder.id);
          folderIdsByPath.set(key, String(folder.id));
          parentId = String(folder.id);
        }
        targetChromeFolderId = parentId;
        for (const item of chromeItems) {
          if (targetChromeFolderId === item.parentId) continue;
          if (!(await chromeBookmarkMatchesCurrent(item))) throw new Error(await refreshAfterChromeConflict());
          movedChrome.push({ item, parentId: item.parentId, index: item.index });
          await chrome.bookmarks.move(item.chromeId, { parentId: targetChromeFolderId });
        }
      }

      for (const item of items.filter((entry) => entry.source !== "chrome")) {
        item.path = [...destinationPath];
        item.category = destinationPath[0] || "未分类";
        item.group = destinationPath.length > 1 ? destinationPath.slice(1).join(" / ") : "常用书签";
      }
      if (localPrevious.length && !persist()) throw new Error("浏览器存储空间不足，栖屿分组未能保存");
      if (chromeItems.length) chromeSyncSucceeded = await syncChromeBookmarks() === true;
      expandNavigationPath(destinationPath);
      state.movingId = null;
      state.movingIds = [];
      state.selectedBookmarkIds.clear();
      state.selectionMode = false;
      render({ refreshNavigation: false });
      dialogFocusReturns.delete(refs.moveDialog);
      refs.moveDialog.close();
      refs.content.querySelector(".bookmark-link")?.focus({ preventScroll: true });
      toast(chromeSyncSucceeded ? `已移动 ${items.length} 个书签` : `书签已移动${chromeSyncWarning(false)}`, !chromeSyncSucceeded);
    } catch (error) {
      for (const previous of localPrevious) {
        Object.assign(previous.item, {
          path: previous.path,
          category: previous.category,
          group: previous.group
        });
      }
      let rollbackFailed = false;
      for (const previous of movedChrome.reverse()) {
        try {
          await chrome.bookmarks.move(previous.item.chromeId, {
            parentId: previous.parentId,
            ...(Number.isInteger(previous.index) ? { index: previous.index } : {})
          });
        } catch {
          rollbackFailed = true;
        }
      }
      for (const folderId of createdFolderIds.reverse()) {
        try { await chrome.bookmarks.remove(folderId); }
        catch { rollbackFailed = true; }
      }
      if (items.some((item) => item.source === "chrome")) {
        chromeSyncSucceeded = await syncChromeBookmarks() === true;
      }
      if (rollbackFailed) {
        refs.moveDialog.close();
        state.movingId = null;
        state.movingIds = [];
        toast(`移动未完成，部分 Chrome 操作无法自动还原${chromeSyncWarning(chromeSyncSucceeded)}`, true);
      } else {
        toast(`移动失败：${error.message}`, true);
      }
      if (localPrevious.length) {
        persist();
        render({ refreshNavigation: false });
      }
    }
  }

  // Rename Section Feature
  function renameLocalMembers(path) {
    return state.items
      .filter((item) => item.source !== "chrome")
      .map((item) => ({ id: item.id, path: getNavigationPath(item) }))
      .filter((item) => path.every((part, index) => item.path[index] === part))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  function renameLocalMembersSignature(path) {
    return JSON.stringify(renameLocalMembers(path));
  }

  function renameSectionSignature(path, chromeFolderId) {
    const localMembers = renameLocalMembers(path);
    const folder = chromeFolderId ? chromeFolders.get(String(chromeFolderId)) : null;
    return JSON.stringify({
      localMembers,
      chromeFolder: folder ? {
        id: folder.id,
        parentId: folder.parentId,
        title: folder.title,
        path: folder.path,
        unmodifiable: folder.unmodifiable
      } : null
    });
  }

  function openRenameDialog(section) {
    const items = Array.isArray(section.items) ? section.items : [];
    const inferredChromeFolderId = (section.isChrome ?? (items.length > 0 && items.every((item) => item.source === "chrome")))
      ? items[0]?.parentId
      : null;
    const chromeFolderId = section.chromeFolderId || inferredChromeFolderId || null;
    const renameChrome = section.renameChrome ?? canRenameChromeFolder(chromeFolderId);
    const renameLocal = section.renameLocal ?? items.some((item) => item.source !== "chrome");
    const path = [...(section.path || items[0]?.path || [section.category, section.group]).filter(Boolean)];
    const chromeFolder = chromeFolderId ? chromeFolders.get(String(chromeFolderId)) : null;

    if (!renameChrome && !renameLocal) {
      toast("此文件夹没有可重命名的内容", true);
      return;
    }

    state.renamingSection = {
      category: section.category,
      group: section.group,
      key: section.key,
      isChrome: renameChrome && !renameLocal,
      renameChrome,
      renameLocal,
      chromeFolderId: renameChrome ? String(chromeFolderId) : null,
      chromeFolderTitle: chromeFolder?.title || "",
      chromeFolderParentId: chromeFolder?.parentId || "",
      chromeFolderUnmodifiable: Boolean(chromeFolder?.unmodifiable),
      restoreFolderFocus: Boolean(section.restoreFolderFocus),
      path,
      localSnapshot: renameLocalMembersSignature(path),
      snapshot: renameSectionSignature(path, renameChrome ? chromeFolderId : null)
    };
    refs.renameInput.value = renameChrome
      ? (chromeFolder?.title || path.at(-1))
      : state.renamingSection.path.at(-1);
    refs.renameError.hidden = true;
    refs.renameError.textContent = "";
    refs.renameHint.textContent = renameChrome && renameLocal
      ? "将重命名 Chrome 文件夹，并同步更新此路径下的本地书签。"
      : renameChrome
        ? "重命名将同步写回 Chrome 文件夹。"
        : "仅重命名此路径下的本地书签分组。";
    refs.renameDialog.showModal();
    refs.renameInput.focus();
    refs.renameInput.select();
  }

  async function saveRenameSection(event) {
    return withSubmitLock(event, "正在保存…", saveRenameSectionOnce);
  }

  async function saveRenameSectionOnce(event) {
    event.preventDefault();
    const newName = refs.renameInput.value.trim();
    if (!newName) {
      refs.renameError.textContent = "请输入文件夹名称，不能只包含空格。";
      refs.renameError.hidden = false;
      refs.renameInput.focus();
      return;
    }
    refs.renameError.hidden = true;
    const current = state.renamingSection;
    if (!current) return;
    if (current.snapshot !== renameSectionSignature(current.path, current.chromeFolderId)) {
      refs.renameError.textContent = "此分组已在其他页面中更新。为避免覆盖新结构，请关闭窗口并重新打开分组操作。";
      refs.renameError.hidden = false;
      return;
    }
    const activePathBeforeRename = selectedNavigationPath();
    const selectionInsideRenamedFolder = Boolean(activePathBeforeRename
      && current.path.every((part, index) => activePathBeforeRename[index] === part));
    const selectedDescendantPath = selectionInsideRenamedFolder
      ? activePathBeforeRename.slice(current.path.length)
      : [];
    let focusRenamedNodeId = null;

    const previousItems = current.renameLocal
      ? state.items.map((item) => ({ ...item, path: [...(item.path || [])] }))
      : null;
    let chromeRenamed = false;
    let localChanged = false;
    let localPersisted = false;
    let chromeSyncResult;

    try {
      if (current.renameChrome && current.chromeFolderId) {
        if (!canRenameChromeFolder(current.chromeFolderId)) throw new Error("Chrome 文件夹已不可重命名");
        if (!(await chromeFolderMatchesCurrent(current.chromeFolderId, {
          title: current.chromeFolderTitle,
          parentId: current.chromeFolderParentId,
          unmodifiable: current.chromeFolderUnmodifiable
        }))) {
          refs.renameError.textContent = await refreshAfterChromeConflict();
          refs.renameError.hidden = false;
          return;
        }
        if (current.snapshot !== renameSectionSignature(current.path, current.chromeFolderId)) {
          refs.renameError.textContent = "分组在复核期间已发生变化。为避免覆盖新内容，本次重命名已停止；请关闭并重新打开分组操作。";
          refs.renameError.hidden = false;
          return;
        }
        await chrome.bookmarks.update(current.chromeFolderId, { title: newName });
        chromeRenamed = true;
      }

      if (current.renameLocal
        && current.localSnapshot !== renameLocalMembersSignature(current.path)) {
        throw new Error("分组中的本地书签在重命名期间发生变化");
      }
      if (current.renameLocal) {
        for (const item of state.items) {
          const itemPath = getNavigationPath(item);
          if (item.source !== "chrome" && current.path.every((part, index) => itemPath[index] === part)) {
            localChanged = true;
            item.path = [...itemPath];
            item.path[current.path.length - 1] = newName;
            item.category = item.path[0] || "未分类";
            item.group = item.path.length > 1 ? item.path.slice(1).join(" / ") : "常用书签";
          }
        }
        if (localChanged) {
          if (!persist()) throw new Error("浏览器存储空间不足，未保存更改");
          localPersisted = true;
        }
      }

      let renamedFolderNode = null;
      if (chromeRenamed) {
        chromeSyncResult = await syncChromeBookmarks();
        if (chromeSyncResult === true && current.chromeFolderId) {
          renamedFolderNode = flattenNavigationTree(buildNavigationTree())
            .find((node) => node.folderId === String(current.chromeFolderId)) || null;
        }
      } else {
        const renamedFolderPath = [...current.path];
        renamedFolderPath[renamedFolderPath.length - 1] = newName;
        renamedFolderNode = navigationNodeAtPath(renamedFolderPath);
      }

      if (selectionInsideRenamedFolder && renamedFolderNode) {
        const selectedNode = navigationNodeAtPath([
          ...renamedFolderNode.path,
          ...selectedDescendantPath
        ]) || renamedFolderNode;
        state.activeTab = selectedNode.id;
        expandNavigationPath(selectedNode.path);
      }
      if (!chromeRenamed || (selectionInsideRenamedFolder && renamedFolderNode)) render();
      if (current.restoreFolderFocus && renamedFolderNode) {
        focusRenamedNodeId = renamedFolderNode.id;
      }
      refs.renameDialog.close();
      state.renamingSection = null;
      if (focusRenamedNodeId) {
        restoreNavigationFocus(focusRenamedNodeId, ".tab[data-navigation-id]");
      }
      toast(`分组已重命名为“${newName}”${chromeSyncWarning(chromeSyncResult)}`, chromeSyncResult !== true);
    } catch (error) {
      let localRollbackFailed = false;
      if (previousItems && localChanged) {
        state.items = previousItems;
        if (localPersisted) localRollbackFailed = !persist();
      }
      let rollbackNote = "";
      if (chromeRenamed) {
        if (await chromeFolderMatchesCurrent(current.chromeFolderId, {
          title: newName,
          parentId: current.chromeFolderParentId,
          unmodifiable: current.chromeFolderUnmodifiable
        })) {
          try {
            await chrome.bookmarks.update(current.chromeFolderId, { title: current.chromeFolderTitle });
            const rollbackSynced = await syncChromeBookmarks();
            if (rollbackSynced !== true) rollbackNote = `；Chrome 文件夹已恢复原名${chromeSyncWarning(rollbackSynced, "；")}`;
          } catch {
            rollbackNote = "；Chrome 文件夹未能恢复原名，请检查 Chrome 书签";
            const rollbackSynced = await syncChromeBookmarks();
            if (rollbackSynced !== true) rollbackNote += chromeSyncWarning(rollbackSynced, "；");
          }
        } else {
          rollbackNote = "；Chrome 文件夹状态已再次变化，为避免覆盖新修改，未自动回滚";
          const rollbackSynced = await syncChromeBookmarks();
          if (rollbackSynced !== true) rollbackNote += chromeSyncWarning(rollbackSynced, "；");
        }
      } else if (previousItems && localChanged) {
        render();
      }
      if (localRollbackFailed) rollbackNote += "；本地书签也未能恢复，请检查浏览器存储空间";
      toast(`重命名失败：${error.message}${rollbackNote}`, true);
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

  function showDuplicates(focusOrigin = document.activeElement) {
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

      const openableUrl = safeUrl(group[0].url);
      const urlLink = document.createElement(openableUrl ? "a" : "span");
      urlLink.className = "audit-group-url";
      if (openableUrl) {
        urlLink.href = openableUrl;
        urlLink.target = "_blank";
        urlLink.rel = "noopener noreferrer";
        urlLink.textContent = group[0].url;
      } else {
        urlLink.classList.add("audit-group-url--restricted");
        urlLink.textContent = restrictedBookmarkLabel(group[0].url);
        urlLink.title = group[0].url;
        urlLink.setAttribute("aria-label", `${restrictedBookmarkLabel(group[0].url)}：${group[0].url}`);
      }
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
            let favoriteSaved = true;
            let syncSucceeded = true;
            if (item.source === "chrome") {
              if (!(await chromeBookmarkMatchesCurrent(item))) {
                const conflictMessage = await refreshAfterChromeConflict();
                showDuplicates();
                toast(`${conflictMessage}本次删除未执行。`, true);
                return;
              }
              await chrome.bookmarks.remove(item.chromeId);
              chromeFavorites.delete(item.chromeId);
              chromeIconOverrides.delete(String(item.chromeId));
              favoriteSaved = persist();
              syncSucceeded = await syncChromeBookmarks();
            } else {
              const previousItems = state.items;
              state.items = state.items.filter((e) => e.id !== item.id);
              if (!persist()) {
                state.items = previousItems;
                render();
                showDuplicates();
                toast("删除未保存：浏览器存储空间不足。", true);
                return;
              }
              render();
            }
            showDuplicates();
            const syncNote = chromeSyncWarning(syncSucceeded);
            toast(favoriteSaved
              ? `重复项已删除${syncNote}`
              : `重复项已删除；收藏状态清理未能保存${syncNote}`, !favoriteSaved || syncSucceeded !== true);
          } catch (e) { toast(`删除失败：${e.message}`, true); }
        });

        actions.append(delBtn);
        row.append(info, actions);
        card.append(row);
      }
      refs.auditResults.append(card);
    }
    refs.mergeButton.hidden = groups.length === 0;
    if (!refs.auditDialog.open) {
      rememberDialogFocus(refs.auditDialog, focusOrigin);
      refs.auditDialog.showModal();
    }
  }

  async function mergeDuplicates() {
    if (mergeInProgress) return;
    mergeInProgress = true;
    const wasDisabled = refs.mergeButton.disabled;
    const originalLabel = refs.mergeButton.textContent;
    refs.mergeButton.disabled = true;
    refs.mergeButton.textContent = "正在合并…";
    refs.mergeButton.setAttribute("aria-busy", "true");
    try {
      await mergeDuplicatesOnce();
    } finally {
      mergeInProgress = false;
      refs.mergeButton.disabled = wasDisabled;
      refs.mergeButton.textContent = originalLabel;
      refs.mergeButton.removeAttribute("aria-busy");
    }
  }

  function duplicateSnapshotSignature() {
    const items = state.items.map((item) => ({
      id: item.id,
      source: item.source,
      chromeId: item.chromeId || "",
      parentId: item.parentId || "",
      title: item.title,
      url: item.url,
      category: item.category,
      group: item.group,
      path: [...(item.path || [])],
      favorite: Boolean(item.favorite),
      icon: item.icon || "",
      dateAdded: item.dateAdded || 0
    }));
    return JSON.stringify({ items, chromeFavorites: [...chromeFavorites].sort() });
  }

  async function refreshBookmarkSnapshot() {
    if (state.mode !== "demo") {
      let saved;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        saved = raw ? JSON.parse(raw) : { items: [], chromeFavorites: [], chromeIconOverrides: [] };
        if (!Array.isArray(saved?.items)) return false;
      } catch {
        return false;
      }

      const chromeItems = state.items.filter((item) => item.source === "chrome");
      const localItems = saved.items
        .filter((item) => item?.source !== "chrome")
        .map(sanitizeItem)
        .filter(Boolean);
      normalizeLocalItemIds(localItems, chromeItems.map((item) => item.id));
      state.items = [...chromeItems, ...localItems];
      chromeFavorites.clear();
      for (const chromeId of Array.isArray(saved.chromeFavorites) ? saved.chromeFavorites : []) {
        if (typeof chromeId === "string") chromeFavorites.add(chromeId);
      }
      chromeIconOverrides.clear();
      for (const [chromeId, override] of sanitizeChromeIconOverrides(saved.chromeIconOverrides)) {
        chromeIconOverrides.set(chromeId, override);
      }
    }

    if (EXTENSION_MODE) {
      return await syncChromeBookmarks() === true;
    }
    render();
    return true;
  }

  async function mergeDuplicatesOnce() {
    if (!(await refreshBookmarkSnapshot())) {
      toast("未能读取最新书签状态，已取消合并；请稍后重试。", true);
      return;
    }
    let groups = duplicateGroups();
    let removeCount = groups.reduce((sum, group) => sum + group.length - 1, 0);
    showDuplicates();
    if (!removeCount) {
      toast("书签已更新，没有需要合并的重复项。", false);
      return;
    }
    if (!confirm(`准备删除 ${removeCount} 个重复书签，并为每组保留一个。栖屿会先发起 JSON 备份下载，再请你确认文件已保存。继续下载备份？`)) return;

    // Keep the exported backup and the later delete plan tied to the same
    // authoritative Chrome and local-bookmark snapshot.
    const backupSnapshot = duplicateSnapshotSignature();

    try {
      if (!exportJson(state.items, { silent: true })) {
        toast("备份下载未能启动，已取消合并。", true);
        return;
      }
    } catch (error) {
      toast(`备份导出失败，已取消合并：${error.message || "无法创建下载文件"}`, true);
      return;
    }
    if (!confirm("已发起“栖屿书签.json”下载。请先确认文件已保存，再继续删除重复书签；取消则保留所有书签。")) {
      toast("已取消合并，书签未更改。");
      return;
    }
    if (!(await refreshBookmarkSnapshot())) {
      toast("无法复核最新书签状态，已取消合并；备份已保留，请稍后重新检查。", true);
      return;
    }
    if (duplicateSnapshotSignature() !== backupSnapshot) {
      showDuplicates();
      toast("备份确认期间书签发生了变化，已取消合并。请检查最新重复项并重新开始，以确保备份和删除计划一致。", true);
      return;
    }

    groups = duplicateGroups();
    removeCount = groups.reduce((sum, group) => sum + group.length - 1, 0);
    if (!removeCount) {
      showDuplicates();
      toast("复核后没有需要合并的重复项，书签未更改。", false);
      return;
    }
    const previousItems = state.items.map((item) => ({ ...item, path: [...(item.path || [])] }));
    const previousFavorites = new Set(chromeFavorites);
    const previousChromeIcons = new Map(chromeIconOverrides);
    const localIdsToRemove = new Set();
    const duplicatePlans = groups.map((group) => ({
      group,
      ordered: [...group].sort((a, b) =>
        (a.source === "chrome" ? -1 : 1) - (b.source === "chrome" ? -1 : 1) || (a.dateAdded || 0) - (b.dateAdded || 0)
      )
    }));
    const chromeItemsToRemove = duplicatePlans
      .flatMap((plan) => plan.ordered.slice(1))
      .filter((item) => item.source === "chrome");

    for (const item of chromeItemsToRemove) {
      if (await chromeBookmarkMatchesCurrent(item)) continue;
      const conflictMessage = await refreshAfterChromeConflict();
      showDuplicates();
      toast(`合并已取消：${conflictMessage}`, true);
      return;
    }
    if (EXTENSION_MODE) {
      let latestChromeItems;
      try {
        latestChromeItems = flattenChromeTree(await chrome.bookmarks.getTree());
      } catch {
        const conflictMessage = await refreshAfterChromeConflict();
        showDuplicates();
        toast(`合并已取消：无法复核 Chrome 书签快照。${conflictMessage}`, true);
        return;
      }
      const plannedChromeSnapshot = chromeBookmarkSnapshotSignature(
        state.items.filter((item) => item.source === "chrome")
      );
      if (chromeBookmarkSnapshotSignature(latestChromeItems) !== plannedChromeSnapshot) {
        const conflictMessage = await refreshAfterChromeConflict();
        showDuplicates();
        toast(`合并已取消：Chrome 书签或分组已变化。${conflictMessage}`, true);
        return;
      }
    }
    if (duplicateSnapshotSignature() !== backupSnapshot) {
      showDuplicates();
      toast("合并已取消：备份确认期间栖屿书签再次变化，最新更改已保留。请重新检查重复项。", true);
      return;
    }

    for (const { group, ordered } of duplicatePlans) {
      // Prefer Chrome items, then keep the oldest item in each source.
      const keeper = ordered[0];
      // Imported local duplicates may carry an icon that Chrome's bookmark
      // record does not contain. Preserve the longest validated icon payload
      // on the surviving item before removing the other copies.
      const bestSavedIcon = group
        .map((item) => item.icon)
        .filter(validIcon)
        .sort((a, b) => b.length - a.length)[0];
      if (bestSavedIcon) {
        const keeperIcon = validIcon(keeper.icon) ? keeper.icon : "";
        const preservedIcon = keeperIcon.length > bestSavedIcon.length ? keeperIcon : bestSavedIcon;
        keeper.icon = preservedIcon;
        if (keeper.source === "chrome") setChromeIconOverride(keeper, preservedIcon);
      }
      const hasFavorite = group.some((item) => item.favorite);
      if (hasFavorite && !keeper.favorite) {
        keeper.favorite = true;
        if (keeper.source === "chrome" && keeper.chromeId) chromeFavorites.add(keeper.chromeId);
      }

      for (const item of ordered.slice(1)) {
        if (item.source !== "chrome") localIdsToRemove.add(item.id);
      }
    }

    // Persist all local removals and inherited favorites before changing Chrome.
    state.items = state.items.filter((item) => !localIdsToRemove.has(item.id));
    if (!persist()) {
      state.items = previousItems;
      chromeFavorites.clear();
      previousFavorites.forEach((chromeId) => chromeFavorites.add(chromeId));
      chromeIconOverrides.clear();
      previousChromeIcons.forEach((override, chromeId) => chromeIconOverrides.set(chromeId, override));
      render();
      showDuplicates();
      toast("合并已取消：本地书签无法保存，Chrome 书签未更改。", true);
      return;
    }

    let removed = localIdsToRemove.size;
    let failed = 0;

    for (const item of chromeItemsToRemove) {
      try {
        if (!(await chromeBookmarkMatchesCurrent(item))) {
          failed++;
          continue;
        }
        await chrome.bookmarks.remove(item.chromeId);
        chromeFavorites.delete(item.chromeId);
        chromeIconOverrides.delete(String(item.chromeId));
        removed++;
      } catch {
        failed++;
      }
    }

    const favoritesSaved = persist();
    const syncSucceeded = EXTENSION_MODE ? await syncChromeBookmarks() : true;
    if (!EXTENSION_MODE) render();

    const remainingGroups = duplicateGroups();
    if (failed && remainingGroups.length) showDuplicates();
    else refs.auditDialog.close();

    const details = [
      failed ? `${failed} 个 Chrome 书签删除失败` : "",
      favoritesSaved ? "" : "收藏状态未能完全保存",
      syncSucceeded !== true ? chromeSyncWarning(syncSucceeded, "") : ""
    ].filter(Boolean);
    toast(`已合并 ${removed} 个重复项${details.length ? `；${details.join("；")}` : ""}`, details.length > 0);
  }

  // Dead Links Check
  function finishDeadLinkCheck(run) {
    run.finished = true;
    if (activeDeadLinkCheck !== run) return;
    activeDeadLinkCheck = null;
    refs.auditCancelButton.hidden = true;
    refs.auditCancelButton.disabled = false;
    refs.auditCancelButton.textContent = "停止检查";
  }

  function cancelDeadLinkCheck() {
    const run = activeDeadLinkCheck;
    if (!run || run.finished || run.cancelled) return;
    run.cancelled = true;
    run.controller.abort();
    refs.auditCancelButton.disabled = true;
    refs.auditCancelButton.textContent = "正在停止…";
    refs.auditSummary.textContent = "正在停止当前请求…";
  }

  function abandonDeadLinkCheck() {
    const run = activeDeadLinkCheck;
    if (!run) return;
    cancelDeadLinkCheck();
    finishDeadLinkCheck(run);
  }

  async function checkOneLink(item, signal) {
    if (signal.aborted) return { item, kind: "cancelled", detail: "已停止" };
    if (!/^https?:/i.test(item.url)) return { item, kind: "skip", detail: "非网页链接" };
    const parsedUrl = new URL(item.url);
    if (parsedUrl.username || parsedUrl.password) {
      return { item, kind: "uncertain", detail: "网址含登录信息，已跳过请求" };
    }

    if (!EXTENSION_MODE) {
      // In local web mode, call serve.py endpoint /api/check
      const endpointController = new AbortController();
      const relayAbort = () => endpointController.abort();
      signal.addEventListener("abort", relayAbort, { once: true });
      if (signal.aborted) endpointController.abort();
      const endpointTimeout = setTimeout(() => endpointController.abort(), 9000);
      try {
        const res = await fetch(`/api/check?url=${encodeURIComponent(item.url)}`, { signal: endpointController.signal });
        if (!res.ok) {
          return { item, kind: "uncertain", detail: `本地检查服务不可用（HTTP ${res.status}）` };
        }
        const data = await res.json();
        return { item, kind: data.kind || "uncertain", detail: data.detail || `HTTP ${data.status}` };
      } catch {
        if (signal.aborted) return { item, kind: "cancelled", detail: "已停止" };
        if (endpointController.signal.aborted) return { item, kind: "uncertain", detail: "本地检查超时" };
        return { item, kind: "uncertain", detail: "本地检查服务不可用" };
      } finally {
        clearTimeout(endpointTimeout);
        signal.removeEventListener("abort", relayAbort);
      }
    }

    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    signal.addEventListener("abort", relayAbort, { once: true });
    if (signal.aborted) controller.abort();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      let response = await fetch(item.url, {
        method: "HEAD",
        // Never let a bookmark redirect this extension request to a second
        // host (including a private-network host). Fetch exposes redirects in
        // manual mode as an opaque response, which we classify for review.
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });
      if ([405, 501, 404, 410].includes(response.status)) {
        response = await fetch(item.url, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          cache: "no-store",
          headers: { Range: "bytes=0-0" },
          signal: controller.signal
        });
      }
      const redirectStatus = [301, 302, 303, 307, 308].includes(response.status);
      if (response.type === "opaqueredirect" || response.redirected || redirectStatus) {
        try { await response.body?.cancel(); } catch { /* response is already closed */ }
        return { item, kind: "uncertain", detail: "网址发生跳转，未继续请求跳转目标" };
      }
      try { await response.body?.cancel(); } catch { /* response is already closed */ }
      if (response.status === 404 || response.status === 410) {
        return { item, kind: "dead", detail: `HTTP ${response.status}` };
      }
      if (response.ok) return { item, kind: "ok", detail: `HTTP ${response.status}` };
      return { item, kind: "uncertain", detail: `HTTP ${response.status}` };
    } catch (error) {
      if (signal.aborted) return { item, kind: "cancelled", detail: "已停止" };
      return { item, kind: "uncertain", detail: error.name === "AbortError" ? "连接超时" : "网络或权限限制" };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", relayAbort);
    }
  }

  async function checkDeadLinks(focusOrigin = document.activeElement) {
    if (activeDeadLinkCheck) cancelDeadLinkCheck();
    const run = { controller: new AbortController(), cancelled: false, finished: false };
    activeDeadLinkCheck = run;
    refs.auditCancelButton.hidden = false;
    refs.auditCancelButton.disabled = false;
    refs.auditCancelButton.textContent = "停止检查";
    $("#auditTitle").textContent = "失效链接检查";
    refs.mergeButton.hidden = true;
    refs.auditResults.replaceChildren();
    refs.auditProgressWrap.hidden = false;
    refs.auditProgressBar.style.width = "0%";
    const items = state.items.filter((item) => /^https?:/i.test(item.url));
    refs.auditSummary.textContent = "正在准备检查…";
    if (!refs.auditDialog.open) {
      rememberDialogFocus(refs.auditDialog, focusOrigin);
      refs.auditDialog.showModal();
    }

    if (!items.length) {
      refs.auditProgressWrap.hidden = true;
      refs.auditSummary.textContent = "当前没有可检查的 HTTP 或 HTTPS 书签网址。";
      const emptyNote = document.createElement("p");
      emptyNote.className = "audit-empty-note";
      emptyNote.textContent = "书签检查只支持网页链接；其他类型的链接不会发送请求。";
      refs.auditResults.append(emptyNote);
      finishDeadLinkCheck(run);
      return;
    }

    if (EXTENSION_MODE) {
      const origins = [...new Set(items.flatMap((item) => {
        const url = new URL(item.url);
        // Credential-bearing bookmarks are classified as uncertain without a
        // network request; do not request host access for origins we will skip.
        if (url.username || url.password) return [];
        // An omitted port in a Chrome match pattern covers every port on the
        // host. Pin default ports too, so access stays limited to this URL.
        const port = url.port || (url.protocol === "https:" ? "443" : "80");
        return [`${url.protocol}//${url.hostname}:${port}/*`];
      }))];
      if (origins.length) {
        refs.auditSummary.textContent = "正在申请本次检查所需的主机与端口权限；Chrome 会记住已允许的主机，可在扩展管理中撤销…";
        try {
          const granted = await chrome.permissions.request({ origins });
          if (activeDeadLinkCheck !== run) {
            finishDeadLinkCheck(run);
            return;
          }
          if (run.cancelled) {
            refs.auditProgressWrap.hidden = true;
            refs.auditSummary.textContent = "链接检查已停止。";
            finishDeadLinkCheck(run);
            return;
          }
          if (!granted) {
            refs.auditSummary.textContent = "未取得所需主机的访问权限，无法检查链接。你可以随时重试。";
            refs.auditProgressWrap.hidden = true;
            finishDeadLinkCheck(run);
            return;
          }
        } catch (error) {
          if (activeDeadLinkCheck !== run) {
            finishDeadLinkCheck(run);
            return;
          }
          refs.auditSummary.textContent = run.cancelled
            ? "链接检查已停止。"
            : `权限请求失败：${error.message}`;
          refs.auditProgressWrap.hidden = true;
          finishDeadLinkCheck(run);
          return;
        }
      }
    }

    if (activeDeadLinkCheck !== run) {
      finishDeadLinkCheck(run);
      return;
    }
    if (run.cancelled) {
      refs.auditProgressWrap.hidden = true;
      refs.auditSummary.textContent = "链接检查已停止。";
      finishDeadLinkCheck(run);
      return;
    }

    const results = [];
    let cursor = 0;
    let done = 0;

    async function worker() {
      while (cursor < items.length && !run.cancelled && activeDeadLinkCheck === run) {
        const item = items[cursor++];
        let result;
        try {
          result = await checkOneLink(item, run.controller.signal);
        } catch {
          result = { item, kind: "uncertain", detail: "检查过程异常" };
        }
        if (run.cancelled || activeDeadLinkCheck !== run || result.kind === "cancelled") return;
        results.push(result);
        done++;
        const pct = Math.round((done / items.length) * 100);
        refs.auditProgressBar.style.width = `${pct}%`;
        refs.auditSummary.textContent = `正在检查 ${done} / ${items.length} 个网址 (${pct}%)…`;
      }
    }

    await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
    if (activeDeadLinkCheck !== run) return;

    const dead = results.filter((result) => result.kind === "dead");
    const uncertain = results.filter((result) => result.kind === "uncertain");
    finishDeadLinkCheck(run);
    refs.auditProgressWrap.hidden = true;
    refs.auditSummary.textContent = run.cancelled
      ? `已停止检查：完成 ${done} / ${items.length} 个网址，明确失效 ${dead.length} 个，待复查 ${uncertain.length} 个。`
      : `共检查 ${items.length} 个网址：明确返回 404/410 的 ${dead.length} 个，待复查 ${uncertain.length} 个。`;

    if (!dead.length && !uncertain.length) {
      const emptyNote = document.createElement("p");
      emptyNote.style.padding = "20px";
      emptyNote.style.textAlign = "center";
      emptyNote.style.color = "var(--text-muted)";
      emptyNote.textContent = run.cancelled
        ? (done ? `已停止。已完成的 ${done} 个网址未发现失效项，剩余 ${items.length - done} 个尚未检查。` : "检查已停止，尚未完成任何网址的检查。")
        : "恭喜，所有书签链接均正常响应！";
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

      const openableUrl = safeUrl(result.item.url);
      const urlLink = document.createElement(openableUrl ? "a" : "span");
      urlLink.className = "audit-group-url";
      urlLink.style.marginTop = "4px";
      if (openableUrl) {
        urlLink.href = openableUrl;
        urlLink.target = "_blank";
        urlLink.rel = "noopener noreferrer";
        urlLink.textContent = result.item.url;
      } else {
        urlLink.classList.add("audit-group-url--restricted");
        urlLink.textContent = restrictedBookmarkLabel(result.item.url);
        urlLink.title = result.item.url;
        urlLink.setAttribute("aria-label", `${restrictedBookmarkLabel(result.item.url)}：${result.item.url}`);
      }

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
          let favoriteSaved = true;
          let syncSucceeded = true;
          if (result.item.source === "chrome") {
            if (!(await chromeBookmarkMatchesCurrent(result.item))) {
              const conflictMessage = await refreshAfterChromeConflict();
              toast(`${conflictMessage}请重新检查失效链接后再操作。`, true);
              return;
            }
            await chrome.bookmarks.remove(result.item.chromeId);
            chromeFavorites.delete(result.item.chromeId);
            chromeIconOverrides.delete(String(result.item.chromeId));
            favoriteSaved = persist();
            syncSucceeded = await syncChromeBookmarks();
          } else {
            const previousItems = state.items;
            state.items = state.items.filter((e) => e.id !== result.item.id);
            if (!persist()) {
              state.items = previousItems;
              render();
              toast("删除未保存：浏览器存储空间不足。", true);
              return;
            }
            render();
          }
          card.remove();
          const syncNote = chromeSyncWarning(syncSucceeded);
          toast(favoriteSaved
            ? `书签已删除${syncNote}`
            : `书签已删除；收藏状态清理未能保存${syncNote}`, !favoriteSaved || syncSucceeded !== true);
        } catch (e) { toast(`删除失败：${e.message}`, true); }
      });

      actions.append(editBtn, delBtn);
      row.append(info, actions);
      card.append(row);
      refs.auditResults.append(card);
    }
  }

  function commandActions() {
    return [
      { id: "search", label: "搜索书签", detail: "聚焦搜索框", run: () => { closeCommandPalette(); refs.search.focus(); refs.search.select(); } },
      { id: "all", label: "全部书签", detail: "查看完整书签库", run: () => { state.activeTab = "all"; state.quickSourceFilter = "all"; state.query = ""; refs.search.value = ""; render(); } },
      { id: "favorites", label: "收藏", detail: "查看收藏的网址", run: () => { state.activeTab = "favorites"; state.quickSourceFilter = "all"; state.query = ""; refs.search.value = ""; render(); } },
      { id: "add", label: "添加书签", detail: "新建书签或文件夹", run: () => openDialog() },
      { id: "theme", label: "切换黑白主题", detail: "在暗黑与白色模式间切换", run: toggleTheme },
      { id: "view", label: "切换网格 / 列表", detail: `当前：${state.viewMode === "grid" ? "网格" : "列表"}`, run: () => { state.viewMode = state.viewMode === "grid" ? "list" : "grid"; saveViewPreferences(); render({ refreshNavigation: false }); } },
      { id: "density", label: "切换卡片密度", detail: `当前：${state.densityMode === "compact" ? "紧凑" : "舒适"}`, run: () => { state.densityMode = state.densityMode === "compact" ? "comfortable" : "compact"; saveViewPreferences(); render({ refreshNavigation: false }); } },
      { id: "select", label: state.selectionMode ? "退出选择模式" : "选择书签", detail: "批量移动、收藏或删除", run: () => setSelectionMode(!state.selectionMode) },
      { id: "sidebar", label: state.sidebarCollapsed ? "展开侧栏" : "收起侧栏", detail: "调整目录导航宽度", run: () => { state.sidebarCollapsed = !state.sidebarCollapsed; saveViewPreferences(); render({ refreshNavigation: false }); } },
      { id: "appearance", label: "外观设置", detail: "主题与背景偏好", run: () => refs.appearanceMenuItem.click() },
      { id: "duplicates", label: "查找重复书签", detail: "扫描并整理重复网址", run: () => refs.duplicateButton.click() },
      { id: "dead-links", label: "检查失效链接", detail: "检查网址是否仍可访问", run: () => refs.deadLinkButton.click() }
    ];
  }

  function renderCommandPaletteOptions() {
    const query = refs.commandInput.value.trim().toLocaleLowerCase();
    const actions = commandActions().filter((entry) => !query
      || `${entry.label} ${entry.detail}`.toLocaleLowerCase().includes(query)
      || pinyinInitialMatches(entry.label, query));
    const bookmarks = query
      ? state.items.filter((item) => `${item.title} ${item.url} ${hostOf(item.url)}`.toLocaleLowerCase().includes(query)
        || pinyinInitialMatches(item.title, query))
        .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
        .slice(0, 8)
        .map((item) => ({ id: `bookmark:${item.id}`, kind: "bookmark", item, label: item.title, detail: `${hostOf(item.url)} · ${getNavigationPath(item).join(" › ")}` }))
      : [];
    commandOptions = [...bookmarks, ...actions].slice(0, 12);
    commandActiveIndex = Math.min(commandActiveIndex, Math.max(0, commandOptions.length - 1));
    refs.commandResults.replaceChildren();
    if (!commandOptions.length) {
      const empty = document.createElement("div");
      empty.className = "command-empty-state";
      empty.textContent = "没有匹配的操作或书签";
      refs.commandResults.append(empty);
      return;
    }
    commandOptions.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `command-result${index === commandActiveIndex ? " is-active" : ""}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === commandActiveIndex));
      button.dataset.commandIndex = String(index);
      const mark = document.createElement("span");
      mark.className = "command-result-mark";
      mark.innerHTML = option.kind === "bookmark"
        ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10a1 1 0 0 1 1 1v14.2l-6-3.6-6 3.6V5.5a1 1 0 0 1 1-1Z"/></svg>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h8"/></svg>`;
      const text = document.createElement("span");
      text.className = "command-result-copy";
      const label = document.createElement("strong");
      label.textContent = option.label;
      const detail = document.createElement("small");
      detail.textContent = option.detail;
      text.append(label, detail);
      const enter = document.createElement("kbd");
      enter.textContent = "↵";
      button.append(mark, text, enter);
      button.addEventListener("mouseenter", () => {
        commandActiveIndex = index;
        updateCommandActiveState();
      });
      button.addEventListener("click", () => executeCommandOption(index));
      refs.commandResults.append(button);
    });
  }

  function updateCommandActiveState() {
    for (const [index, option] of [...refs.commandResults.querySelectorAll(".command-result")].entries()) {
      const active = index === commandActiveIndex;
      option.classList.toggle("is-active", active);
      option.setAttribute("aria-selected", String(active));
    }
    refs.commandResults.querySelector(".command-result.is-active")?.scrollIntoView({ block: "nearest" });
  }

  function openCommandPalette() {
    commandActiveIndex = 0;
    refs.commandInput.value = "";
    renderCommandPaletteOptions();
    refs.commandDialog.showModal();
    requestAnimationFrame(() => refs.commandInput.focus({ preventScroll: true }));
  }

  function closeCommandPalette({ restoreFocus = false } = {}) {
    if (refs.commandDialog.open) refs.commandDialog.close();
    if (restoreFocus) refs.search.focus({ preventScroll: true });
  }

  async function executeCommandOption(index) {
    const option = commandOptions[index];
    if (!option) return;
    closeCommandPalette();
    if (option.kind !== "bookmark") {
      option.run();
      return;
    }
    const url = safeUrl(option.item.url);
    if (!url) {
      toast(restrictedBookmarkMessage(option.item.url));
      return;
    }
    try {
      if (EXTENSION_MODE) await chrome.tabs.create({ url });
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast(`打开失败：${error?.message || "浏览器未能打开此网址"}`, true);
    }
  }

  // Bind Event Listeners
  if (EXTENSION_MODE) {
    refs.importButton.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg> 导入本地书签`;
  }

  function closeActionsMenu({ restoreFocus = false } = {}) {
    const wasOpen = !refs.actionsMenu.hidden;
    refs.exportMenu.hidden = true;
    refs.exportButton.setAttribute("aria-expanded", "false");
    refs.actionsMenu.hidden = true;
    refs.actionsButton.setAttribute("aria-expanded", "false");
    if (restoreFocus && wasOpen) refs.actionsButton.focus({ preventScroll: true });
  }

  refs.quickAdd.addEventListener("click", () => openDialog());
  // Appearance settings entry in the ⋯ menu (dialog open is wired in appearance.js)
  refs.appearanceMenuItem.addEventListener("click", () => {
    rememberDialogFocus($("#appearanceDialog"), refs.actionsButton);
    closeActionsMenu();
  });

  // Save destination toggle in bookmark form
  refs.destToggle.addEventListener("click", (event) => {
    const btn = event.target.closest(".segment-btn");
    if (!btn) return;
    state.targetDest = btn.dataset.dest;
    updateSaveDestToggle();
  });

  refs.sidebarCollapseButton.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    saveViewPreferences();
    render({ refreshNavigation: false });
  });

  refs.selectAllResultsButton.addEventListener("click", selectAllCurrentResults);
  refs.clearSelectionButton.addEventListener("click", () => {
    state.selectedBookmarkIds.clear();
    render({ refreshNavigation: false });
    refs.clearSelectionButton.focus({ preventScroll: true });
  });
  refs.selectionMoveButton.addEventListener("click", () => openMoveDialog(null, refs.selectionMoveButton));
  refs.selectionFavoriteButton.addEventListener("click", toggleSelectedFavorites);
  refs.selectionDeleteButton.addEventListener("click", deleteSelectedBookmarks);
  refs.selectionExitButton.addEventListener("click", clearBookmarkSelection);

  refs.commandInput.addEventListener("input", () => {
    commandActiveIndex = 0;
    renderCommandPaletteOptions();
  });
  refs.commandInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (commandOptions.length) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        commandActiveIndex = (commandActiveIndex + step + commandOptions.length) % commandOptions.length;
        updateCommandActiveState();
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      executeCommandOption(commandActiveIndex);
    }
  });
  refs.closeCommandButton.addEventListener("click", () => closeCommandPalette({ restoreFocus: true }));
  refs.commandDialog.addEventListener("click", (event) => {
    if (event.target === refs.commandDialog) closeCommandPalette({ restoreFocus: true });
  });
  refs.toastAction.addEventListener("click", () => {
    const action = toastActionHandler;
    clearTimeout(toastTimer);
    refs.toast.classList.remove("show");
    refs.toastAction.hidden = true;
    toastActionHandler = null;
    action?.();
  });

  // Collapse all
  refs.collapseAllBtn.addEventListener("click", () => {
    closeActionsMenu({ restoreFocus: true });
    toggleAllNavigationNodes();
  });

  // Actions menu toggle
  refs.actionsButton.addEventListener("click", (e) => {
    e.stopPropagation();
    if (refs.actionsMenu.hidden) {
      refs.exportMenu.hidden = true;
      refs.exportButton.setAttribute("aria-expanded", "false");
      refs.actionsMenu.hidden = false;
      refs.actionsButton.setAttribute("aria-expanded", "true");
    } else {
      closeActionsMenu();
    }
  });

  refs.syncNowButton?.addEventListener("click", async () => {
    if (!EXTENSION_MODE) return;
    closeActionsMenu({ restoreFocus: true });
    const result = await syncChromeBookmarks();
    if (result === true) toast("Chrome 书签已重新同步");
    else if (result === false) toast("Chrome 书签同步失败；请检查扩展权限后重试。", true);
    else toast("Chrome 正在导入或同步，完成后页面会自动更新。");
  });

  // Shortcuts dialog
  refs.shortcutsButton.addEventListener("click", () => {
    rememberDialogFocus(refs.shortcutsDialog, refs.actionsButton);
    closeActionsMenu();
    refs.shortcutsDialog.showModal();
  });
  refs.footerShortcutsLink.addEventListener("click", () => {
    rememberDialogFocus(refs.shortcutsDialog, refs.footerShortcutsLink);
    refs.shortcutsDialog.showModal();
  });

  refs.themeToggle.addEventListener("click", toggleTheme);
  refs.importButton.addEventListener("click", () => {
    closeActionsMenu();
    chooseFile();
  });
  refs.demoImportButton.addEventListener("click", chooseFile);
  refs.file.addEventListener("change", importFile);

  // Search input & clear button
  refs.search.closest(".search-box")?.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    refs.search.focus({ preventScroll: true });
  });
  refs.search.addEventListener("input", () => {
    state.query = refs.search.value;
    state.limit = PAGE_SIZE;
    scheduleSearchRender();
  });
  refs.search.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" || event.isComposing) return;
    flushSearchRender();
    const rows = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0);
    if (!rows.length) return;
    event.preventDefault();
    event.stopPropagation();
    focusBookmarkRow(0, rows);
  });
  refs.searchClear.addEventListener("click", () => {
    refs.search.value = "";
    state.query = "";
    refs.searchClear.hidden = true;
    render({ refreshNavigation: false });
    refs.search.focus();
  });
  refs.clearSearchScopeBtn.addEventListener("click", () => {
    refs.search.value = "";
    state.query = "";
    refs.searchClear.hidden = true;
    render({ refreshNavigation: false });
  });

  // Dialog forms
  refs.form.addEventListener("submit", saveForm);
  $("#closeDialogButton").addEventListener("click", closeDialog);
  $("#cancelDialogButton").addEventListener("click", closeDialog);
  refs.delete.addEventListener("click", deleteCurrent);
  refs.moveForm.addEventListener("submit", moveBookmark);
  refs.renameForm.addEventListener("submit", saveRenameSection);
  refs.renameInput.addEventListener("input", () => {
    refs.renameError.hidden = true;
    refs.renameError.textContent = "";
  });

  refs.duplicateButton.addEventListener("click", () => {
    closeActionsMenu();
    showDuplicates(refs.actionsButton);
  });
  refs.deadLinkButton.addEventListener("click", () => {
    closeActionsMenu();
    checkDeadLinks(refs.actionsButton);
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
    closeActionsMenu({ restoreFocus: true });
  });

  // Close dialog buttons
  $$("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => $("#" + button.dataset.closeDialog).close());
  });

  refs.auditCancelButton.addEventListener("click", cancelDeadLinkCheck);
  refs.auditDialog.addEventListener("close", abandonDeadLinkCheck);

  // Context Menu Actions
  refs.contextMenu.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action.startsWith("folder-")) {
      const node = state.contextFolderNode;
      const folderReturnFocus = contextMenuReturnFocus;
      hideContextMenu();
      if (!node) return;
      if (action === "folder-rename") {
        const renameChrome = canRenameChromeFolder(node.folderId);
        const renameLocal = node.items.some((entry) => entry.source !== "chrome");
        openRenameDialog({
          category: node.path[0] || "未分类",
          group: node.path.slice(1).join(" / ") || "常用书签",
          key: node.id,
          items: node.items,
          path: node.path,
          renameChrome,
          renameLocal,
          chromeFolderId: node.folderId,
          restoreFolderFocus: true
        });
        return;
      }
      if (action === "folder-open-all") {
        const items = node.items
          .map((bookmark) => ({ bookmark, url: safeUrl(bookmark.url) }))
          .filter((entry) => entry.url);
        const restrictedCount = node.items.length - items.length;
        if (!items.length) {
          toast(restrictedCount
            ? "此文件夹只有特殊网址；栖屿不会直接打开这类网址。"
            : "此文件夹没有可打开的书签");
          if (folderReturnFocus?.isConnected) folderReturnFocus.focus({ preventScroll: true });
          return;
        }
        const restrictedNote = restrictedCount ? `，另有 ${restrictedCount} 个特殊网址不会从栖屿打开` : "";
        if (items.length > 1 && !confirm(`将在新标签页打开“${node.path.at(-1)}”中的 ${items.length} 个书签${restrictedNote}，继续吗？`)) {
          if (folderReturnFocus?.isConnected) folderReturnFocus.focus({ preventScroll: true });
          return;
        }
        let opened = 0;
        let requested = 0;
        let failed = 0;
        for (const { url } of items) {
          try {
            if (EXTENSION_MODE) {
              await chrome.tabs.create({ url, active: false });
              opened++;
            } else {
              // noopener deliberately makes window.open() return null in many
              // browsers. A missing WindowProxy cannot distinguish a blocked
              // popup from a successfully opened, isolated tab.
              window.open(url, "_blank", "noopener,noreferrer");
              requested++;
            }
          } catch { failed++; }
        }
        toast(EXTENSION_MODE
          ? `已在新标签页打开 ${opened} 个书签${failed ? `，${failed} 个未能打开` : ""}${restrictedCount ? `，跳过 ${restrictedCount} 个特殊网址` : ""}`
          : `已请求打开 ${requested} 个书签${failed ? `，${failed} 个启动失败` : ""}${restrictedCount ? `，跳过 ${restrictedCount} 个特殊网址` : ""}`,
        failed > 0);
        if (folderReturnFocus?.isConnected) folderReturnFocus.focus({ preventScroll: true });
        return;
      }
    }
    const item = state.items.find((entry) => entry.id === state.contextItemId);
    const returnFocus = contextMenuReturnFocus;
    const rowsBeforeAction = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0);
    const originRow = returnFocus?.closest?.(".bookmark");
    const originIndex = rowsBeforeAction.indexOf(originRow);
    const restoreBookmarkContextFocus = () => {
      if (returnFocus?.isConnected && returnFocus.getClientRects().length > 0) {
        returnFocus.focus({ preventScroll: true });
        return;
      }
      const rows = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0);
      if (rows.length) focusBookmarkRow(Math.min(Math.max(0, originIndex), rows.length - 1), rows);
      else refs.search.focus({ preventScroll: true });
    };
    hideContextMenu();
    if (!item) {
      restoreBookmarkContextFocus();
      return;
    }

    if (action === "open") {
      const url = safeUrl(item.url);
      if (!url) {
        toast(restrictedBookmarkMessage(item.url));
        restoreBookmarkContextFocus();
        return;
      }
      try {
        if (EXTENSION_MODE) await chrome.tabs.create({ url });
        else window.open(url, "_blank", "noopener,noreferrer");
      } catch (error) {
        toast(`打开失败：${error?.message || "浏览器未能打开此网址"}`, true);
        restoreBookmarkContextFocus();
      }
    } else if (action === "open-window") {
      const url = safeUrl(item.url);
      if (!url) {
        toast(restrictedBookmarkMessage(item.url));
        restoreBookmarkContextFocus();
        return;
      }
      try {
        if (EXTENSION_MODE && chrome.windows) {
          await chrome.windows.create({ url });
        } else {
          window.open(url, "_blank", "noopener,noreferrer,popup=no");
        }
      } catch (error) {
        toast(`打开窗口失败：${error?.message || "浏览器未能创建新窗口"}`, true);
        restoreBookmarkContextFocus();
      }
    } else if (action === "copy-url") {
      try {
        await navigator.clipboard.writeText(item.url);
        toast("网址已复制到剪贴板");
      } catch {
        toast("复制失败", true);
      } finally {
        restoreBookmarkContextFocus();
      }
    } else if (action === "copy-title") {
      try {
        await navigator.clipboard.writeText(item.title);
        toast("名称已复制到剪贴板");
      } catch {
        toast("复制失败", true);
      } finally {
        restoreBookmarkContextFocus();
      }
    } else if (action === "toggle-favorite") {
      toggleFavorite(item, returnFocus);
    } else if (action === "edit") {
      openDialog(item, "chrome", returnFocus);
    } else if (action === "move") {
      openMoveDialog(item, returnFocus);
    } else if (action === "delete") {
      await deleteBookmarkAndRestoreFocus(item, returnFocus);
    }
  });

  refs.contextMenu.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...refs.contextMenu.querySelectorAll('[role="menuitem"]:not([hidden]):not(:disabled)')];
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else if (currentIndex < 0) nextIndex = event.key === "ArrowDown" ? 0 : items.length - 1;
    else nextIndex = (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[nextIndex].focus();
  });
  refs.contextMenu.addEventListener("focusout", () => {
    queueMicrotask(() => {
      if (!refs.contextMenu.hidden && !refs.contextMenu.contains(document.activeElement)) hideContextMenu();
    });
  });

  // Click outside listener for menus
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".actions-wrap")) closeActionsMenu();
    if (!event.target.closest("#contextMenu") && !event.target.closest(".bookmark-actions")) {
      hideContextMenu();
    }
  });

  window.addEventListener("scroll", () => {
    hideContextMenu();
    hideBookmarkTooltip();
  }, { passive: true });

  refs.tooltip.addEventListener("mouseenter", () => clearTimeout(tooltipHideTimer));
  refs.tooltip.addEventListener("mouseleave", hideBookmarkTooltip);

  window.matchMedia("(max-width: 900px)").addEventListener("change", () => renderTabs());

  function focusBookmarkRow(index, rows = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0)) {
    const row = rows[index];
    if (!row) return;
    state.keyboardIndex = index;
    rows.forEach((entry, entryIndex) => entry.classList.toggle("is-keyboard-current", entryIndex === index));
    row.querySelector(".bookmark-link")?.focus({ preventScroll: true });
    row.scrollIntoView({
      block: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
  }

  // Global Keyboard Shortcuts
  document.addEventListener("keydown", (event) => {
    if (event.isComposing) return;

    const anotherDialogOpen = refs.dialog.open || refs.moveDialog.open || refs.renameDialog.open
      || refs.auditDialog.open || refs.shortcutsDialog.open || $("#appearanceDialog").open;
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k"
      && !anotherDialogOpen && refs.contextMenu.hidden && refs.actionsMenu.hidden) {
      event.preventDefault();
      if (!refs.commandDialog.open) openCommandPalette();
      return;
    }

    if (event.key === "Escape") {
      if (refs.commandDialog.open) {
        closeCommandPalette({ restoreFocus: true });
        return;
      }
      const hadOpenMenu = !refs.exportMenu.hidden || !refs.actionsMenu.hidden || !refs.contextMenu.hidden;
      const dialogOpen = refs.dialog.open || refs.moveDialog.open || refs.renameDialog.open
        || refs.auditDialog.open || refs.shortcutsDialog.open || $("#appearanceDialog").open;
      if (!refs.exportMenu.hidden) {
        refs.exportMenu.hidden = true;
        refs.exportButton.setAttribute("aria-expanded", "false");
        refs.exportButton.focus({ preventScroll: true });
      } else {
        closeActionsMenu({ restoreFocus: true });
      }
      hideContextMenu({ restoreFocus: true });
      hideBookmarkTooltip();
      if (refs.search.value && !hadOpenMenu && !dialogOpen) {
        refs.search.value = "";
        state.query = "";
        refs.searchClear.hidden = true;
        render({ refreshNavigation: false });
        refs.search.focus({ preventScroll: true });
      }
      return;
    }

    // Don't intercept when dialogs are open
    if (refs.dialog.open || refs.moveDialog.open || refs.renameDialog.open
      || refs.auditDialog.open || refs.shortcutsDialog.open || $("#appearanceDialog").open || refs.commandDialog.open
      || !refs.contextMenu.hidden || !refs.actionsMenu.hidden) return;

    // Don't intercept when typing in text fields
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
      || document.activeElement.isContentEditable
      || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "?" || (event.shiftKey && event.key === "/")) {
      event.preventDefault();
      rememberDialogFocus(refs.shortcutsDialog, document.activeElement);
      refs.shortcutsDialog.showModal();
      return;
    }

    if (event.key === "/") {
      event.preventDefault();
      refs.search.focus();
      refs.search.select();
      return;
    }

    if (event.key.toLocaleLowerCase() === "s") {
      event.preventDefault();
      const currentRow = document.activeElement?.closest?.(".bookmark");
      const bookmarkId = currentRow?.dataset.bookmarkId;
      const nextMode = !state.selectionMode;
      setSelectionMode(nextMode);
      if (bookmarkId) {
        const row = [...$$('.bookmark')].find((entry) => entry.dataset.bookmarkId === bookmarkId);
        row?.querySelector(nextMode ? ".bookmark-select-toggle" : ".bookmark-link")?.focus({ preventScroll: true });
      }
      return;
    }

    // Keyboard selection navigation
    const activeElement = document.activeElement;
    const focusInsideBookmark = activeElement?.closest?.(".bookmark");
    const focusInsideAnotherControl = !focusInsideBookmark
      && activeElement !== document.body
      && activeElement !== document.documentElement;
    if (focusInsideAnotherControl
      && ["ArrowDown", "ArrowUp", "j", "k", "J", "K"].includes(event.key)) return;

    const rows = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0);
    if (!rows.length) return;

    if (event.key === "j" || event.key === "ArrowDown" || event.key === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = (event.key === "j" || event.key === "ArrowDown") ? 1 : -1;
      const focusedRow = document.activeElement?.closest?.(".bookmark");
      const focusedIndex = rows.indexOf(focusedRow);
      const currentIndex = focusedIndex >= 0 ? focusedIndex : state.keyboardIndex;
      if (step > 0 && currentIndex === rows.length - 1 && refs.content.querySelector(".load-more")) {
        const nextIndex = rows.length;
        state.limit += PAGE_SIZE;
        render({ refreshNavigation: false });
        const expandedRows = [...$$(".bookmark")].filter((row) => row.getClientRects().length > 0);
        focusBookmarkRow(nextIndex, expandedRows);
        return;
      }
      state.keyboardIndex = currentIndex < 0
        ? (step > 0 ? 0 : rows.length - 1)
        : Math.max(0, Math.min(rows.length - 1, currentIndex + step));
      focusBookmarkRow(state.keyboardIndex, rows);
      return;
    }

    const currentRow = document.activeElement?.closest?.(".bookmark");
    const currentIndex = rows.indexOf(currentRow);
    if (currentIndex >= 0) {
      state.keyboardIndex = currentIndex;
      const bookmarkId = currentRow.dataset.bookmarkId;
      const item = state.items.find((it) => it.id === bookmarkId);
      if (!item) return;

      if (event.key === "Enter") {
        if (document.activeElement.closest("button, a")) return;
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
        deleteBookmarkAndRestoreFocus(item, activeElement);
      }
    }
  });

  function storedBookmarkContentSignature(items) {
    return JSON.stringify(items.map((item) => [
      item.id,
      item.source,
      item.title,
      item.url,
      item.category,
      item.group,
      ...(item.path || [])
    ]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const clearing = event.key === null || event.newValue === null;
    if (state.mode === "demo" && clearing) return;

    let saved = { items: [], chromeFavorites: [], chromeIconOverrides: [] };
    if (!clearing) {
      try {
        saved = JSON.parse(event.newValue);
        if (!Array.isArray(saved?.items)) throw new Error("书签数据格式无效");
      } catch {
        toast("另一栖屿页面的书签数据无法读取，当前页面未覆盖现有内容。", true);
        return;
      }
    }

    const oldContent = storedBookmarkContentSignature(state.items);
    const chromeItems = state.items.filter((item) => item.source === "chrome");
    const localItems = saved.items
      .filter((item) => item?.source !== "chrome")
      .map(sanitizeItem)
      .filter(Boolean);
    normalizeLocalItemIds(localItems, chromeItems.map((item) => item.id));
    const nextFavorites = new Set(Array.isArray(saved.chromeFavorites)
      ? saved.chromeFavorites.filter((value) => typeof value === "string")
      : []);
    const nextChromeIcons = new Map(sanitizeChromeIconOverrides(saved.chromeIconOverrides));
    chromeIconOverrides.clear();
    nextChromeIcons.forEach((override, chromeId) => chromeIconOverrides.set(chromeId, override));

    state.items = [
      ...chromeItems.map((item) => ({
        ...item,
        favorite: nextFavorites.has(item.chromeId),
        icon: chromeIconForBookmark(item.chromeId, item.url)
      })),
      ...localItems
    ];
    chromeFavorites.clear();
    nextFavorites.forEach((chromeId) => chromeFavorites.add(chromeId));
    if (!clearing) state.mode = "personal";

    const editItem = state.items.find((item) => item.id === state.editingId);
    const editConflict = Boolean(state.editingId && editingSnapshot
      && (!editItem || bookmarkEditSignature(editItem) !== editingSnapshot));
    if (editConflict && refs.dialog.open) {
      refs.error.textContent = "此书签已在其他页面中更新或删除。为避免覆盖新内容，本次保存已停止；请关闭窗口并重新打开编辑。";
      refs.error.hidden = false;
    }

    const contentChanged = oldContent !== storedBookmarkContentSignature(state.items);
    if (contentChanged) {
      if (activeDeadLinkCheck) abandonDeadLinkCheck();
      if (refs.auditDialog.open && $("#auditTitle").textContent === "失效链接检查") {
        refs.auditProgressWrap.hidden = true;
        refs.auditSummary.textContent = "书签已在另一页面更新；旧检查结果已清除，请重新运行检查。";
        refs.auditResults.replaceChildren();
      }
    }

    render();
    if (refs.auditDialog.open && $("#auditTitle").textContent === "重复书签清理") {
      showDuplicates();
    }
  });

  // Initialization
  syncThemeButton();
  render();
  if (EXTENSION_MODE) startChromeSync();
})();
