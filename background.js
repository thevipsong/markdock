const openingProfiles = new Map();
const USER_DATA_CONSENT_KEY = "markdock-data-use-consent-v1";
const MENU_SAVE_PAGE = "markdock-save-page";
const MENU_SAVE_LINK = "markdock-save-link";
const MENU_OPEN_GALLERY = "markdock-open-gallery";
const LAUNCH_MODE_KEY = "markdock-launch-mode-v1";
let preferredLaunchMode = "tab";
let launchModeRevision = 0;
let panelBehaviorUpdates = Promise.resolve();

function syncPanelBehavior(mode) {
  if (!chrome.sidePanel?.setPanelBehavior) return Promise.resolve();
  panelBehaviorUpdates = panelBehaviorUpdates
    .catch(() => {})
    .then(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: mode === "side-panel" }))
    .catch((error) => console.warn("同步 MarkDock 侧边栏打开方式失败", error));
  return panelBehaviorUpdates;
}

const launchModeReady = chrome.storage?.local?.get(LAUNCH_MODE_KEY).then((values) => {
  if (launchModeRevision === 0) {
    preferredLaunchMode = values?.[LAUNCH_MODE_KEY] === "side-panel" ? "side-panel" : "tab";
  }
  return syncPanelBehavior(preferredLaunchMode);
}).catch((error) => {
  console.warn("读取 MarkDock 打开方式失败", error);
  return syncPanelBehavior("tab");
});

chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[LAUNCH_MODE_KEY]) return;
  launchModeRevision += 1;
  preferredLaunchMode = changes[LAUNCH_MODE_KEY].newValue === "side-panel" ? "side-panel" : "tab";
  void syncPanelBehavior(preferredLaunchMode);
});

async function hasUserDataConsent() {
  try {
    const res = await chrome.storage?.local?.get(USER_DATA_CONSENT_KEY);
    return res?.[USER_DATA_CONSENT_KEY] === "accepted";
  } catch {
    return false;
  }
}

let isSettingUpMenus = false;

function setupContextMenus() {
  if (!chrome.contextMenus || isSettingUpMenus) return;
  isSettingUpMenus = true;
  chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    const menus = [
      {
        id: MENU_SAVE_PAGE,
        title: "将当前页面保存到 MarkDock 书签坞",
        contexts: ["page"]
      },
      {
        id: MENU_SAVE_LINK,
        title: "将此链接保存到 MarkDock 书签坞",
        contexts: ["link"]
      },
      {
        id: MENU_OPEN_GALLERY,
        title: "打开 MarkDock 书签坞工作台",
        contexts: ["action"]
      }
    ];

    for (const item of menus) {
      chrome.contextMenus.create(item, () => {
        // Checking chrome.runtime.lastError prevents Chrome from logging
        // "Unchecked runtime.lastError: Cannot create item with duplicate id"
        void chrome.runtime.lastError;
      });
    }
    isSettingUpMenus = false;
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

async function resolveDefaultBookmarkParentId() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const rootChildren = tree?.[0]?.children || [];
    const bar = rootChildren.find((node) => node.folderType === "bookmarks-bar" || node.id === "1") || rootChildren[0];
    return bar?.id || "1";
  } catch {
    return "1";
  }
}

async function quickSaveBookmark(url, title) {
  let parsedUrl;
  try {
    parsedUrl = new URL(String(url || ""));
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
  const bookmarkUrl = parsedUrl.href;
  const parentId = await resolveDefaultBookmarkParentId();
  const cleanTitle = String(title || "").trim() || parsedUrl.hostname.replace(/^www\./, "");
  try {
    const existing = await chrome.bookmarks.search({ url: bookmarkUrl });
    if (existing && existing.length > 0) {
      return { status: "exists", bookmark: existing[0] };
    }
    const created = await chrome.bookmarks.create({
      parentId,
      title: cleanTitle.slice(0, 512),
      url: bookmarkUrl
    });
    return { status: "created", bookmark: created };
  } catch (error) {
    console.error("MarkDock 快速保存书签失败", error);
    return null;
  }
}

function flashBadge(text, color = "#76549f") {
  if (!chrome.action?.setBadgeText) return;
  chrome.action.setBadgeBackgroundColor?.({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
  }, 1800);
}

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_OPEN_GALLERY) {
    await openPreferredGallery(tab);
    return;
  }
  if (!(await hasUserDataConsent())) {
    await triggerOpenGallery(tab);
    flashBadge("需同意");
    return;
  }
  if (info.menuItemId === MENU_SAVE_LINK && info.linkUrl) {
    const res = await quickSaveBookmark(info.linkUrl, info.selectionText || info.linkUrl);
    if (res) flashBadge(res.status === "created" ? "✓" : "已存");
    return;
  }
  if (info.menuItemId === MENU_SAVE_PAGE) {
    const pageUrl = info.pageUrl || tab?.url;
    const pageTitle = tab?.title || pageUrl;
    const res = await quickSaveBookmark(pageUrl, pageTitle);
    if (res) flashBadge(res.status === "created" ? "✓" : "已存");
  }
});

chrome.commands?.onCommand.addListener(async (command, tab) => {
  if (command === "quick-bookmark-current-page") {
    if (!(await hasUserDataConsent())) {
      await triggerOpenGallery(tab);
      flashBadge("需同意");
      return;
    }
    const pageUrl = tab?.url;
    if (pageUrl && /^https?:\/\//i.test(pageUrl)) {
      const res = await quickSaveBookmark(pageUrl, tab?.title || pageUrl);
      if (res) flashBadge(res.status === "created" ? "✓" : "已存");
    } else {
      await triggerOpenGallery(tab);
    }
  }
});

function triggerOpenGallery(clickedTab) {
  const incognito = Boolean(clickedTab?.incognito);
  const activeOpen = openingProfiles.get(incognito);
  if (activeOpen) return activeOpen;
  // Keep lookup/create atomic per Chrome profile so rapid toolbar clicks do
  // not race and open duplicate gallery tabs.
  const opening = openGallery(incognito, clickedTab?.windowId)
    .catch((error) => console.error("无法打开 MarkDock 书签页", error))
    .finally(() => openingProfiles.delete(incognito));
  openingProfiles.set(incognito, opening);
  return opening;
}

function openPreferredGallery(clickedTab) {
  if (preferredLaunchMode === "side-panel"
    && !clickedTab?.incognito
    && Number.isInteger(clickedTab?.windowId)
    && chrome.sidePanel?.open) {
    return chrome.sidePanel.open({ windowId: clickedTab.windowId }).catch((error) => {
      console.warn("无法打开 MarkDock 侧边栏，改为新标签页", error);
      return triggerOpenGallery(clickedTab);
    });
  }
  return triggerOpenGallery(clickedTab);
}

chrome.action.onClicked.addListener(async (clickedTab) => {
  await launchModeReady;
  // Chrome opens/toggles the side panel through setPanelBehavior. Do not call
  // sidePanel.open() here: it can undo Chrome's toggle-close action.
  if (preferredLaunchMode === "side-panel") return;
  await triggerOpenGallery(clickedTab);
});

async function openGallery(incognito, preferredWindowId) {
  const targetUrl = chrome.runtime.getURL("index.html");
  let existing;
  try {
    // Query this extension's own open page instead of inspecting every tab URL.
    // Reading Tab.url through tabs.query would require the broad "tabs" permission.
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["TAB"],
      documentUrls: [targetUrl],
      incognito
    });
    existing = contexts.find((context) => context.tabId >= 0);
  } catch { /* fall back to creating the gallery */ }

  if (existing) {
    let tabActivated = false;
    try {
      await chrome.tabs.update(existing.tabId, { active: true });
      tabActivated = true;
    } catch { /* a stale tab id should open a replacement */ }
    if (tabActivated) {
      // A window can disappear or move after getContexts() returns. Failure to
      // focus it must not open a second gallery when the existing tab is live.
      if (existing.windowId >= 0) {
        try { await chrome.windows.update(existing.windowId, { focused: true }); }
        catch { /* the selected tab remains the single gallery instance */ }
      }
      return;
    }
  }

  const createProperties = { url: targetUrl };
  if (Number.isInteger(preferredWindowId) && preferredWindowId >= 0) {
    createProperties.windowId = preferredWindowId;
  }
  await chrome.tabs.create(createProperties);
}
