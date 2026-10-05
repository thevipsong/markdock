const openingProfiles = new Map();

chrome.action.onClicked.addListener((clickedTab) => {
  const incognito = Boolean(clickedTab?.incognito);
  const activeOpen = openingProfiles.get(incognito);
  if (activeOpen) return activeOpen;
  // Keep lookup/create atomic per Chrome profile so rapid toolbar clicks do
  // not race and open duplicate gallery tabs.
  const opening = openGallery(incognito, clickedTab?.windowId)
    .catch((error) => console.error("无法打开栖屿书签页", error))
    .finally(() => openingProfiles.delete(incognito));
  openingProfiles.set(incognito, opening);
  return opening;
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
