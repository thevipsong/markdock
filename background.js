const openingProfiles = new Map();
const MENU_SAVE_PAGE = "markdock-save-page";
const MENU_SAVE_LINK = "markdock-save-link";
const MENU_OPEN_GALLERY = "markdock-open-gallery";

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
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const parentId = await resolveDefaultBookmarkParentId();
  const cleanTitle = String(title || "").trim() || new URL(url).hostname.replace(/^www\./, "");
  try {
    const existing = await chrome.bookmarks.search({ url });
    if (existing && existing.length > 0) {
      return { status: "exists", bookmark: existing[0] };
    }
    const created = await chrome.bookmarks.create({
      parentId,
      title: cleanTitle.slice(0, 512),
      url
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
    await triggerOpenGallery(tab);
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

chrome.action.onClicked.addListener((clickedTab) => triggerOpenGallery(clickedTab));

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
