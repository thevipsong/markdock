const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const backgroundSource = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) { listeners.push(listener); },
    async dispatch(...args) {
      return Promise.all(listeners.map((listener) => listener(...args)));
    }
  };
}

function loadBackground(launchMode = "tab") {
  const actionClicked = createEvent();
  const contextMenuClicked = createEvent();
  const storageChanged = createEvent();
  const runtimeInstalled = createEvent();
  const command = createEvent();
  const calls = { panelBehavior: [], panelOpen: [], tabCreate: [] };
  const chrome = {
    storage: {
      local: { get: async () => ({ "markdock-launch-mode-v1": launchMode }) },
      onChanged: storageChanged
    },
    sidePanel: {
      setPanelBehavior: async (behavior) => { calls.panelBehavior.push(behavior); },
      open: (options) => {
        calls.panelOpen.push(options);
        return Promise.resolve();
      }
    },
    runtime: {
      onInstalled: runtimeInstalled,
      lastError: null,
      getURL: (path) => `chrome-extension://test/${path}`,
      getContexts: async () => []
    },
    contextMenus: {
      onClicked: contextMenuClicked,
      removeAll: (callback) => callback?.(),
      create: (_item, callback) => callback?.()
    },
    commands: { onCommand: command },
    action: {
      onClicked: actionClicked,
      setBadgeText() {},
      setBadgeBackgroundColor() {}
    },
    bookmarks: { getTree: async () => [], search: async () => [], create: async () => ({}) },
    tabs: {
      create: async (options) => { calls.tabCreate.push(options); return { id: 1 }; },
      update: async () => {},
      remove: async () => {}
    },
    windows: { update: async () => {} }
  };

  vm.runInNewContext(backgroundSource, {
    chrome,
    console: { warn() {}, error() {}, log() {} },
    URL,
    setTimeout: () => 0,
    clearTimeout() {}
  });

  return { actionClicked, contextMenuClicked, storageChanged, calls };
}

test("side-panel preference enables Chrome's native toolbar action behavior", async () => {
  const { actionClicked, calls } = loadBackground("side-panel");

  await actionClicked.dispatch({ windowId: 7, incognito: false });

  assert.equal(calls.panelBehavior.length, 1);
  assert.equal(calls.panelBehavior[0].openPanelOnActionClick, true);
  assert.deepEqual(calls.panelOpen, []);
  assert.deepEqual(calls.tabCreate, []);
});

test("context-menu side-panel opening calls the API before yielding", async () => {
  const { actionClicked, contextMenuClicked, calls } = loadBackground("side-panel");
  await actionClicked.dispatch({ windowId: 7, incognito: false });

  const opening = contextMenuClicked.dispatch(
    { menuItemId: "markdock-open-gallery" },
    { windowId: 11, incognito: false }
  );
  assert.equal(calls.panelOpen.length, 1);
  assert.equal(calls.panelOpen[0].windowId, 11);
  await opening;
  assert.deepEqual(calls.tabCreate, []);
});

test("switching back to tab mode disables side-panel action behavior", async () => {
  const { actionClicked, storageChanged, calls } = loadBackground("side-panel");
  await actionClicked.dispatch({ windowId: 7, incognito: false });
  storageChanged.listeners[0]({ "markdock-launch-mode-v1": { newValue: "tab" } }, "local");
  await new Promise((resolve) => setTimeout(resolve, 0));

  await actionClicked.dispatch({ windowId: 7, incognito: false });

  assert.equal(calls.panelBehavior.at(-1).openPanelOnActionClick, false);
  assert.equal(calls.tabCreate.length, 1);
});
