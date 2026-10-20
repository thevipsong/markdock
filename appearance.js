/**
 * MarkDock 外观与背景系统 2.5
 * 支持暗黑 / 白色 / 跟随系统三模式、默认微光与 6 款多色流光渐变，以及微质感点阵网格与卡片毛玻璃通透质感。
 */
(() => {
  "use strict";

  const SETTINGS_KEY = "qidian-skin-settings-v2";
  const THEME_KEY = "qidian-theme-v1";
  const LEGACY_APPEARANCE_KEY = "qidian-appearance-v1";
  const root = document.documentElement;

  const themes = new Set(["dark", "light", "system"]);
  const modes = new Set(["diffuse", "gradient"]);
  const systemDarkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

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

  const lightSkins = new Set(["ivory", "mist", "rose", "light", "white"]);
  const darkSkins = new Set(["nebula", "abyss", "aurora", "ember", "midnight", "dark", "black"]);

  const DEFAULTS = {
    theme: "dark",
    wallpaperMode: "diffuse",
    gradient: "slate",
    textureMode: "none",
    cardGlass: false
  };

  function themeFromSkin(skin) {
    if (lightSkins.has(skin)) return "light";
    if (darkSkins.has(skin)) return "dark";
    return null;
  }

  function resolveEffectiveTheme(themeOption = state.theme) {
    if (themeOption === "system") {
      return systemDarkQuery && !systemDarkQuery.matches ? "light" : "dark";
    }
    return themeOption === "light" ? "light" : "dark";
  }

  function readSettings() {
    const state = { ...DEFAULTS };
    let saved = {};
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) saved = JSON.parse(raw) || {};
    } catch {
      saved = {};
    }

    if (themes.has(saved?.theme)) state.theme = saved.theme;
    else if (themeFromSkin(saved?.skin)) state.theme = themeFromSkin(saved.skin);

    if (modes.has(saved?.wallpaperMode)) state.wallpaperMode = saved.wallpaperMode;
    else state.wallpaperMode = "diffuse";

    if (Object.hasOwn(gradients, saved?.gradient)) state.gradient = saved.gradient;

    state.textureMode = saved?.textureMode === "dots" ? "dots" : "none";
    state.cardGlass = saved?.cardGlass === true;

    try {
      const legacyRaw = localStorage.getItem(LEGACY_APPEARANCE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        if (!Object.keys(saved).length && legacy?.preset === "ivory") state.theme = "light";
      }
    } catch {
      // Ignore invalid legacy appearance data.
    }

    if (!themes.has(saved?.theme)) {
      try {
        const storedTheme = localStorage.getItem(THEME_KEY);
        if (themes.has(storedTheme)) state.theme = storedTheme;
      } catch {
        // Fallback
      }
    }

    return state;
  }

  let state = readSettings();

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
    } catch {
      updateAppearanceSaveStatus("设置没有写入本地存储；请检查浏览器存储空间后重试。", true);
      return false;
    }
    try { localStorage.setItem(THEME_KEY, state.theme); } catch {}
    updateAppearanceSaveStatus("");
    return true;
  }

  function skinForTheme(resolved) {
    return resolved === "dark"
      ? { id: "midnight", name: "暗黑", scheme: "dark" }
      : { id: "ivory", name: "白色", scheme: "light" };
  }

  function applyWallpaper() {
    if (!modes.has(state.wallpaperMode)) state.wallpaperMode = "diffuse";
    const activeTheme = resolveEffectiveTheme(state.theme);
    root.dataset.wallpaperMode = state.wallpaperMode;
    delete root.dataset.imageSubMode;
    root.dataset.textureMode = state.textureMode || "none";
    root.dataset.cardGlass = state.cardGlass ? "true" : "false";
    root.style.setProperty("--wallpaper-blur", "0px");
    root.style.setProperty("--wallpaper-overlay", "0");
    root.style.removeProperty("--custom-wallpaper-url");

    if (state.wallpaperMode === "gradient") {
      root.style.setProperty("--wallpaper-gradient", (gradients[state.gradient] || gradients.slate)[activeTheme]);
    } else {
      root.style.removeProperty("--wallpaper-gradient");
    }
  }

  function applyTheme(themeOption, persist = true) {
    if (!themes.has(themeOption)) return state.theme;
    state.theme = themeOption;
    const activeTheme = resolveEffectiveTheme(themeOption);
    const skin = skinForTheme(activeTheme);
    root.dataset.themeMode = themeOption;
    root.dataset.theme = activeTheme;
    root.dataset.skin = skin.id;
    root.dataset.material = "frosted";
    delete root.dataset.customAccent;

    ["--accent", "--accent-hover", "--accent-soft", "--accent-border", "--focus"].forEach((property) => {
      root.style.removeProperty(property);
    });

    const metaTheme = document.querySelector("meta[name='theme-color']");
    if (metaTheme) metaTheme.content = activeTheme === "dark" ? "#0b0c10" : "#f8fafc";
    if (persist) saveSettings();
    applyWallpaper();
    updateThemeCards();
    updateWallpaperUI();
    window.dispatchEvent(new CustomEvent("qidian:skinchange", {
      detail: { ...state, theme: activeTheme, themeMode: themeOption, skin }
    }));
    return activeTheme;
  }

  function updateAppearanceSaveStatus(message, isError = false) {
    const status = document.querySelector("#appearanceSaveStatus");
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", isError);
  }

  function updateThemeCards() {
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      const selected = button.dataset.themeOption === state.theme;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function updateWallpaperUI() {
    // 1. 主模式按钮（默认微光 / 流光渐变）
    document.querySelectorAll("[data-wallpaper-choice]").forEach((button) => {
      const selected = button.dataset.wallpaperChoice === state.wallpaperMode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    // 2. 渐变选项
    document.querySelectorAll("[data-wallpaper-gradient]").forEach((button) => {
      const selected = button.dataset.wallpaperGradient === state.gradient;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    // 3. 区域显示/隐藏
    const options = document.querySelector("#wallpaperOptions");
    const gradientOptions = document.querySelector("#wallpaperGradientOptions");

    const isGradientMode = state.wallpaperMode === "gradient";
    if (options) options.hidden = !isGradientMode;
    if (gradientOptions) gradientOptions.hidden = !isGradientMode;

    // 4. 高级质感开关
    const dotGridToggle = document.querySelector("#toggleDotGrid");
    if (dotGridToggle) dotGridToggle.setAttribute("aria-checked", String(state.textureMode === "dots"));

    const cardGlassToggle = document.querySelector("#toggleCardGlass");
    if (cardGlassToggle) cardGlassToggle.setAttribute("aria-checked", String(state.cardGlass === true));
  }

  function setupUI() {
    const dialog = document.querySelector("#appearanceDialog");
    const openButton = document.querySelector("#appearanceButton");
    const menuItem = document.querySelector("#appearanceMenuItem");

    // 主题切换（暗黑 / 白色 / 跟随系统）
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      button.addEventListener("click", () => applyTheme(button.dataset.themeOption));
    });

    // 背景模式切换（仅默认微光与流光渐变）
    document.querySelectorAll("[data-wallpaper-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.wallpaperChoice;
        if (!modes.has(mode)) return;
        state.wallpaperMode = mode;
        saveSettings();
        applyWallpaper();
        updateWallpaperUI();
      });
    });

    // 渐变方案切换
    document.querySelectorAll("[data-wallpaper-gradient]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!Object.hasOwn(gradients, button.dataset.wallpaperGradient)) return;
        state.gradient = button.dataset.wallpaperGradient;
        state.wallpaperMode = "gradient";
        saveSettings();
        applyWallpaper();
        updateWallpaperUI();
      });
    });

    // 高级质感开关
    const dotGridToggle = document.querySelector("#toggleDotGrid");
    dotGridToggle?.addEventListener("click", () => {
      state.textureMode = state.textureMode === "dots" ? "none" : "dots";
      saveSettings();
      applyWallpaper();
      updateWallpaperUI();
    });

    const cardGlassToggle = document.querySelector("#toggleCardGlass");
    cardGlassToggle?.addEventListener("click", () => {
      state.cardGlass = !state.cardGlass;
      saveSettings();
      applyWallpaper();
      updateWallpaperUI();
    });

    const openAppearance = () => {
      if (!dialog) return;
      updateThemeCards();
      updateWallpaperUI();
      window.dispatchEvent(new CustomEvent("qidian:appearanceopen"));
      if (!dialog.open) dialog.showModal();
    };

    openButton?.addEventListener("click", openAppearance);
    menuItem?.addEventListener("click", openAppearance);
    updateThemeCards();
    updateWallpaperUI();
  }

  systemDarkQuery?.addEventListener?.("change", () => {
    if (state.theme === "system") {
      applyTheme("system", false);
    }
  });

  window.qidianSkin = {
    getSkins: () => [
      { id: "midnight", name: "暗黑", scheme: "dark" },
      { id: "ivory", name: "白色", scheme: "light" },
      { id: "system", name: "跟随系统", scheme: "system" }
    ],
    getSettings: () => ({ ...state, effectiveTheme: resolveEffectiveTheme(state.theme) }),
    setTheme: (theme) => applyTheme(theme),
    setSkin: (skinId) => {
      if (skinId === "system") {
        applyTheme("system");
        return;
      }
      const theme = themeFromSkin(skinId);
      if (theme) applyTheme(theme);
    },
    toggleTheme: () => {
      const currentEffective = resolveEffectiveTheme(state.theme);
      return applyTheme(currentEffective === "dark" ? "light" : "dark");
    },
    setWallpaperMode: (mode) => {
      if (!modes.has(mode)) return state.wallpaperMode;
      state.wallpaperMode = mode;
      saveSettings();
      applyWallpaper();
      updateWallpaperUI();
      return state.wallpaperMode;
    }
  };

  applyTheme(state.theme, false);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupUI, { once: true });
  } else {
    setupUI();
  }

  window.addEventListener("storage", (event) => {
    if (event.key === THEME_KEY && themes.has(event.newValue)) {
      applyTheme(event.newValue, false);
      return;
    }
    if (event.key === SETTINGS_KEY && event.newValue) {
      try {
        const saved = JSON.parse(event.newValue);
        if (themes.has(saved.theme)) state.theme = saved.theme;
        state.wallpaperMode = modes.has(saved.wallpaperMode) ? saved.wallpaperMode : "diffuse";
        if (Object.hasOwn(gradients, saved.gradient)) state.gradient = saved.gradient;
        state.textureMode = saved.textureMode === "dots" ? "dots" : "none";
        state.cardGlass = saved.cardGlass === true;
        updateAppearanceSaveStatus("");
        applyTheme(state.theme, false);
      } catch {
        // Ignore incomplete updates
      }
    }
  });
})();
