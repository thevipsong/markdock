chrome.action.onClicked.addListener(async () => {
  const targetUrl = chrome.runtime.getURL("index.html");
  try {
    const tabs = await chrome.tabs.query({});
    const found = tabs.find((t) => t.url && t.url.startsWith(targetUrl));
    if (found && found.id) {
      await chrome.tabs.update(found.id, { active: true });
      if (found.windowId) {
        await chrome.windows.update(found.windowId, { focused: true });
      }
      return;
    }
  } catch { /* fallback to create */ }
  chrome.tabs.create({ url: targetUrl });
});

