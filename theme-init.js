/**
 * 栖点 · 幻梦皮肤零延迟初始化引擎 (Theme & Mirage Skin Early Bootstrapper)
 * 在文档最早期运行，无缝渲染皮肤、材质、强调色与壁纸，杜绝闪烁 (FOUC)。
 */
(() => {
  "use strict";

  const SETTINGS_KEY = "qidian-skin-settings-v2";
  const OLD_THEME_KEY = "qidian-theme-v1";
  const OLD_APPEARANCE_KEY = "qidian-appearance-v1";

  // 8 套幻梦专属皮肤属性表
  const SKIN_SCHEMES = {
    nebula: "dark",
    abyss: "dark",
    aurora: "dark",
    ember: "dark",
    midnight: "dark",
    ivory: "light",
    mist: "light",
    rose: "light"
  };

  const DEFAULT_SKIN = "nebula";
  const DEFAULT_MATERIAL = "frosted";
  const DEFAULT_WALLPAPER_MODE = "diffuse";

  let skin = DEFAULT_SKIN;
  let material = DEFAULT_MATERIAL;
  let wallpaperMode = DEFAULT_WALLPAPER_MODE;
  let customAccent = null;
  let blur = 12;
  let overlay = 25;
  let cachedWallpaperUrl = "";

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed.skin && SKIN_SCHEMES[parsed.skin]) skin = parsed.skin;
        if (parsed.material === "liquid" || parsed.material === "frosted") material = parsed.material;
        if (parsed.wallpaperMode === "diffuse" || parsed.wallpaperMode === "bing" || parsed.wallpaperMode === "custom") {
          wallpaperMode = parsed.wallpaperMode;
        }
        if (typeof parsed.customAccent === "string" && /^#[0-9a-f]{6}$/i.test(parsed.customAccent.trim())) {
          customAccent = parsed.customAccent.trim();
        }
        if (typeof parsed.blur === "number") blur = Math.max(0, Math.min(40, parsed.blur));
        if (typeof parsed.overlay === "number") overlay = Math.max(0, Math.min(80, parsed.overlay));
        if (typeof parsed.cachedWallpaperUrl === "string") cachedWallpaperUrl = parsed.cachedWallpaperUrl;
      }
    } else {
      // 兼容旧版配置迁移
      const oldTheme = localStorage.getItem(OLD_THEME_KEY);
      const oldAppearanceRaw = localStorage.getItem(OLD_APPEARANCE_KEY);
      if (oldAppearanceRaw) {
        try {
          const oldApp = JSON.parse(oldAppearanceRaw);
          if (oldApp.preset === "ivory") skin = "ivory";
          else if (oldApp.preset === "aurora") skin = "aurora";
          else if (oldApp.preset === "obsidian") skin = "midnight";
          else if (oldApp.preset === "image") wallpaperMode = "custom";
          if (typeof oldApp.blur === "number") blur = oldApp.blur;
          if (typeof oldApp.overlay === "number") overlay = oldApp.overlay;
        } catch { /* ignore */ }
      } else if (oldTheme === "light") {
        skin = "mist";
      }
    }
  } catch {
    // 降级使用默认
  }

  const colorScheme = SKIN_SCHEMES[skin] || "dark";
  const root = document.documentElement;

  root.dataset.skin = skin;
  root.dataset.theme = colorScheme;
  root.dataset.material = material;
  root.dataset.wallpaperMode = wallpaperMode;

  root.style.setProperty("--wallpaper-blur", `${blur}px`);
  root.style.setProperty("--wallpaper-overlay", String(overlay / 100));

  if (customAccent) {
    root.dataset.customAccent = "true";
    root.style.setProperty("--accent", customAccent);
    root.style.setProperty("--accent-hover", customAccent);
    root.style.setProperty("--accent-soft", `${customAccent}26`);
    root.style.setProperty("--accent-border", `${customAccent}59`);
    root.style.setProperty("--focus", customAccent);
  }

  if (wallpaperMode === "bing") {
    root.style.setProperty("--custom-wallpaper-url", 'url("https://uapis.cn/api/v1/image/bing-daily")');
  } else if (wallpaperMode === "custom" && cachedWallpaperUrl) {
    root.style.setProperty("--custom-wallpaper-url", `url("${cachedWallpaperUrl}")`);
  }
})();
