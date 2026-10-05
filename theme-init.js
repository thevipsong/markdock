/**
 * 在样式表载入前恢复黑白主题与背景，避免刷新时出现闪回。
 * 背景图片使用 IndexedDB 异步读取，其余设置从小体积本地配置同步恢复。
 */
(() => {
  "use strict";

  const SETTINGS_KEY = "qidian-skin-settings-v2";
  const THEME_KEY = "qidian-theme-v1";
  const LEGACY_APPEARANCE_KEY = "qidian-appearance-v1";
  const root = document.documentElement;
  const initialWallpaperGeneration = root.dataset.wallpaperGeneration || "0";
  const lightSkins = new Set(["ivory", "mist", "rose", "light", "white"]);
  const darkSkins = new Set(["nebula", "abyss", "aurora", "ember", "midnight", "dark", "black"]);
  const gradients = {
    slate: {
      dark: "radial-gradient(1000px 640px at 85% -12%, rgba(90, 101, 118, .34), transparent 68%), linear-gradient(155deg, #171a20 0%, #20242b 52%, #111317 100%)",
      light: "radial-gradient(1000px 640px at 85% -12%, rgba(126, 136, 148, .13), transparent 68%), linear-gradient(155deg, #f7f8f9 0%, #eceef0 58%, #e3e6e9 100%)"
    },
    coast: {
      dark: "radial-gradient(960px 660px at 82% -10%, rgba(79, 133, 168, .30), transparent 67%), linear-gradient(155deg, #172027 0%, #202a31 52%, #111619 100%)",
      light: "radial-gradient(960px 660px at 82% -10%, rgba(93, 151, 184, .15), transparent 67%), linear-gradient(155deg, #f4f8fa 0%, #e8f0f4 58%, #dfe9ee 100%)"
    },
    plum: {
      dark: "radial-gradient(940px 660px at 82% -12%, rgba(116, 91, 135, .30), transparent 67%), linear-gradient(155deg, #201d24 0%, #29242e 52%, #141316 100%)",
      light: "radial-gradient(940px 660px at 82% -12%, rgba(142, 118, 154, .13), transparent 67%), linear-gradient(155deg, #f8f6f9 0%, #f0edf3 58%, #e8e3eb 100%)"
    }
  };
  let settings = {};

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = JSON.parse(raw) || {};
  } catch {
    settings = {};
  }

  let legacySettings = {};
  try {
    const legacyRaw = localStorage.getItem(LEGACY_APPEARANCE_KEY);
    if (legacyRaw) legacySettings = JSON.parse(legacyRaw) || {};
  } catch {
    legacySettings = {};
  }
  let theme = settings.theme === "dark" || settings.theme === "light" ? settings.theme : null;
  if (theme !== "dark" && theme !== "light") {
    try { theme = localStorage.getItem(THEME_KEY); } catch { /* Use the settings fallback. */ }
    if (theme !== "dark" && theme !== "light") {
      if (lightSkins.has(settings.skin)) theme = "light";
      else if (darkSkins.has(settings.skin)) theme = "dark";
    }
  }

  if (theme !== "dark" && theme !== "light") {
    if (legacySettings.preset === "ivory") theme = "light";
    else if (["aurora", "obsidian"].includes(legacySettings.preset)) theme = "dark";
  }
  theme = theme === "light" ? "light" : "dark";

  const oldMode = settings.wallpaperMode || (legacySettings.preset === "image" ? "custom" : "diffuse");
  const allowedModes = new Set(["diffuse", "gradient", "solid", "custom"]);
  const wallpaperMode = oldMode === "bing"
    ? "diffuse"
    : (allowedModes.has(oldMode) ? oldMode : "diffuse");
  const gradient = Object.hasOwn(gradients, settings.gradient) ? settings.gradient : "slate";
  const solid = settings.solidCustomized === true
    && typeof settings.solid === "string"
    && /^#[\da-f]{6}$/i.test(settings.solid)
    ? settings.solid
    : (theme === "dark" ? "#17191d" : "#f3f4f5");
  const savedBlur = Number.isFinite(settings.blur) ? settings.blur : legacySettings.blur;
  const savedOverlay = Number.isFinite(settings.overlay) ? settings.overlay : legacySettings.overlay;
  const blur = Number.isFinite(savedBlur) ? Math.max(0, Math.min(24, savedBlur)) : 10;
  const overlay = Number.isFinite(savedOverlay) ? Math.max(0, Math.min(70, savedOverlay)) : 24;
  let bootstrapWallpaperUrl = "";

  root.dataset.theme = theme;
  root.dataset.skin = theme === "dark" ? "midnight" : "ivory";
  root.dataset.material = "frosted";
  root.dataset.wallpaperMode = wallpaperMode;
  const metaTheme = document.querySelector("meta[name='theme-color']");
  if (metaTheme) metaTheme.content = theme === "dark" ? "#101113" : "#f3f4f5";
  root.style.setProperty("--wallpaper-blur", `${blur}px`);
  const imageMode = wallpaperMode === "custom";
  root.style.setProperty("--wallpaper-overlay", String(imageMode ? overlay / 100 : 0));
  root.style.setProperty("--wallpaper-solid", solid);
  if (wallpaperMode === "gradient") root.style.setProperty("--wallpaper-gradient", gradients[gradient][theme]);

  if (theme === "dark" || theme === "light") {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* Theme still renders. */ }
  }

  if (oldMode === "bing") {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, wallpaperMode })); } catch { /* Keep the safe in-memory fallback. */ }
  }

  if (wallpaperMode === "custom" && typeof settings.cachedWallpaperUrl === "string") {
    const value = settings.cachedWallpaperUrl;
    if (/^(https?:|data:image\/)/i.test(value)) {
      root.style.setProperty("--custom-wallpaper-url", `url(${JSON.stringify(value)})`);
    }
  }

  if (wallpaperMode === "custom") {
    try {
      const request = indexedDB.open("qidian-appearance-assets", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("images")) request.result.createObjectStore("images");
      };
      request.onsuccess = () => {
        const db = request.result;
        try {
          const transaction = db.transaction("images", "readonly");
          const imageRequest = transaction.objectStore("images").get("background");
          imageRequest.onsuccess = () => {
            // This early bootstrap read may finish after the user has changed
            // the wallpaper. Never let an old IndexedDB result overwrite the
            // newer choice made by appearance.js.
            if (root.dataset.wallpaperMode !== "custom"
                || root.dataset.wallpaperGeneration !== initialWallpaperGeneration
                || !(imageRequest.result instanceof Blob)) return;
            const imageUrl = URL.createObjectURL(imageRequest.result);
            bootstrapWallpaperUrl = imageUrl;
            root.style.setProperty("--custom-wallpaper-url", `url(${JSON.stringify(imageUrl)})`);
          };
          transaction.oncomplete = () => db.close();
          transaction.onerror = () => db.close();
        } catch {
          db.close();
        }
      };
    } catch {
      // The app will still load if IndexedDB is unavailable.
    }
  }

  window.addEventListener("pagehide", (event) => {
    // Keep the object URL alive when the document enters the back-forward
    // cache; the same document and its CSS background are restored on return.
    if (event.persisted) return;
    if (bootstrapWallpaperUrl) URL.revokeObjectURL(bootstrapWallpaperUrl);
  });
})();
