/**
 * 在样式表载入前恢复主题（暗黑 / 白色 / 跟随系统）与背景，避免刷新时出现闪回。
 */
(() => {
  "use strict";

  const SETTINGS_KEY = "qidian-skin-settings-v2";
  const THEME_KEY = "qidian-theme-v1";
  const LEGACY_APPEARANCE_KEY = "qidian-appearance-v1";
  const root = document.documentElement;
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
    },
    aurora: {
      dark: "radial-gradient(1100px 700px at 75% -10%, rgba(16, 185, 129, .22), transparent 65%), radial-gradient(900px 600px at 15% 100%, rgba(124, 58, 237, .25), transparent 60%), linear-gradient(155deg, #0d1a1f 0%, #111e28 50%, #0d1117 100%)",
      light: "radial-gradient(1000px 650px at 80% -10%, rgba(16, 185, 129, .14), transparent 65%), radial-gradient(800px 500px at 10% 90%, rgba(124, 58, 237, .10), transparent 60%), linear-gradient(155deg, #f0fdf4 0%, #eef2ff 55%, #f8fafc 100%)"
    },
    sunset: {
      dark: "radial-gradient(1000px 680px at 85% -12%, rgba(244, 63, 94, .28), transparent 65%), radial-gradient(850px 600px at 10% 20%, rgba(245, 158, 11, .20), transparent 60%), linear-gradient(155deg, #221419 0%, #291b22 52%, #140d10 100%)",
      light: "radial-gradient(980px 660px at 85% -10%, rgba(244, 63, 94, .13), transparent 65%), radial-gradient(800px 550px at 10% 25%, rgba(245, 158, 11, .11), transparent 60%), linear-gradient(155deg, #fff7ed 0%, #fff1f2 55%, #fdf4ff 100%)"
    },
    abyss: {
      dark: "radial-gradient(1050px 720px at 80% -15%, rgba(56, 189, 248, .26), transparent 68%), radial-gradient(900px 650px at 15% 95%, rgba(99, 102, 241, .24), transparent 65%), linear-gradient(160deg, #0b132b 0%, #111a38 52%, #080c1a 100%)",
      light: "radial-gradient(1000px 680px at 80% -12%, rgba(56, 189, 248, .15), transparent 68%), linear-gradient(155deg, #f0f9ff 0%, #e0f2fe 55%, #e8edf5 100%)"
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

  const validModes = new Set(["dark", "light", "system"]);
  let themeMode = validModes.has(settings.theme) ? settings.theme : null;
  if (!themeMode) {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (validModes.has(stored)) themeMode = stored;
    } catch { /* ignore */ }
    if (!themeMode) {
      if (lightSkins.has(settings.skin)) themeMode = "light";
      else if (darkSkins.has(settings.skin)) themeMode = "dark";
    }
  }

  if (!themeMode) {
    if (legacySettings.preset === "ivory") themeMode = "light";
    else if (["aurora", "obsidian"].includes(legacySettings.preset)) themeMode = "dark";
  }
  themeMode = validModes.has(themeMode) ? themeMode : "dark";

  const resolvedTheme = themeMode === "system"
    ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : (themeMode === "light" ? "light" : "dark");

  const allowedModes = new Set(["diffuse", "gradient"]);
  const wallpaperMode = allowedModes.has(settings.wallpaperMode) ? settings.wallpaperMode : "diffuse";
  const gradient = Object.hasOwn(gradients, settings.gradient) ? settings.gradient : "slate";

  root.dataset.themeMode = themeMode;
  root.dataset.theme = resolvedTheme;
  root.dataset.skin = resolvedTheme === "dark" ? "midnight" : "ivory";
  root.dataset.material = "frosted";
  root.dataset.wallpaperMode = wallpaperMode;
  delete root.dataset.imageSubMode;
  root.dataset.textureMode = settings.textureMode === "dots" ? "dots" : "none";
  root.dataset.cardGlass = settings.cardGlass ? "true" : "false";

  const metaTheme = document.querySelector("meta[name='theme-color']");
  if (metaTheme) metaTheme.content = resolvedTheme === "dark" ? "#0b0c10" : "#f8fafc";
  root.style.setProperty("--wallpaper-blur", "0px");
  root.style.setProperty("--wallpaper-overlay", "0");
  root.style.removeProperty("--custom-wallpaper-url");
  if (wallpaperMode === "gradient") root.style.setProperty("--wallpaper-gradient", gradients[gradient][resolvedTheme]);
  else root.style.removeProperty("--wallpaper-gradient");

  try { localStorage.setItem(THEME_KEY, themeMode); } catch { /* Theme still renders. */ }
})();
