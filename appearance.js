/**
 * MarkDock 外观与背景系统 2.2
 * 支持双主题、6 款多色空间渐变、12 款质感纯色色卡、精选矢量艺术壁纸、
 * 每日必应 4K 壁纸自动同步、自定义图片存储，以及微质感点阵网格与卡片毛玻璃通透质感。
 */
(() => {
  "use strict";

  const SETTINGS_KEY = "qidian-skin-settings-v2";
  const THEME_KEY = "qidian-theme-v1";
  const LEGACY_APPEARANCE_KEY = "qidian-appearance-v1";
  const BING_CACHE_KEY = "markdock-bing-wallpaper-cache";
  const root = document.documentElement;

  const bootstrapWallpaperStyle = root.style.getPropertyValue("--custom-wallpaper-url");
  const themes = new Set(["dark", "light"]);
  const modes = new Set(["diffuse", "gradient", "solid", "custom"]);

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

  const CURATED_WALLPAPERS = {
    aurora: {
      name: "极光流动",
      dark: "assets/wallpapers/aurora-flow.svg",
      light: "assets/wallpapers/aurora-flow-light.svg",
      url: "assets/wallpapers/aurora-flow.svg"
    },
    cosmic: {
      name: "深邃星云",
      dark: "assets/wallpapers/cosmic-glow.svg",
      light: "assets/wallpapers/cosmic-glow-light.svg",
      url: "assets/wallpapers/cosmic-glow.svg"
    },
    zen: {
      name: "静谧远山",
      dark: "assets/wallpapers/zen-mountain.svg",
      light: "assets/wallpapers/zen-mountain-light.svg",
      url: "assets/wallpapers/zen-mountain.svg"
    },
    dusk: {
      name: "暮光落霞",
      dark: "assets/wallpapers/warm-dusk.svg",
      light: "assets/wallpapers/warm-dusk-light.svg",
      url: "assets/wallpapers/warm-dusk.svg"
    }
  };

  const SOLID_SWATCHES_DARK = [
    { color: "#101113", name: "深空黑" },
    { color: "#18191c", name: "石墨炭" },
    { color: "#0f172a", name: "星夜蓝" },
    { color: "#062326", name: "冷墨青" },
    { color: "#171424", name: "暗夜紫" },
    { color: "#1a1412", name: "浓缩咖啡" }
  ];

  const SOLID_SWATCHES_LIGHT = [
    { color: "#f8f9fa", name: "象牙白" },
    { color: "#f3f4f6", name: "极简雪灰" },
    { color: "#f6f4ee", name: "温润燕麦" },
    { color: "#eef4f9", name: "冰川淡蓝" },
    { color: "#eef6f3", name: "薄荷青灰" },
    { color: "#fbf0f3", name: "晚霞雾粉" }
  ];

  const lightSkins = new Set(["ivory", "mist", "rose", "light", "white"]);
  const darkSkins = new Set(["nebula", "abyss", "aurora", "ember", "midnight", "dark", "black"]);

  const DEFAULTS = {
    theme: "dark",
    wallpaperMode: "diffuse",
    imageSubMode: "curated",
    curatedId: "aurora",
    gradient: "slate",
    solid: "#101113",
    solidCustomized: false,
    blur: 10,
    overlay: 24,
    textureMode: "none",
    cardGlass: false,
    cachedWallpaperUrl: "",
    cachedBingUrl: "",
    cachedBingTitle: "今日必应壁纸",
    cachedBingCopyright: "",
    cachedBingDate: ""
  };

  function clampNumber(value, min, max, fallback) {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : fallback;
  }

  function themeFromSkin(skin) {
    if (lightSkins.has(skin)) return "light";
    if (darkSkins.has(skin)) return "dark";
    return null;
  }

  function persistedWallpaperUrl(value) {
    return typeof value === "string" && /^(https?:|data:image\/)/i.test(value);
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
    else if (saved?.wallpaperMode === "bing") {
      state.wallpaperMode = "custom";
      state.imageSubMode = "bing";
    }

    if (["curated", "bing", "upload"].includes(saved?.imageSubMode)) {
      state.imageSubMode = saved.imageSubMode;
    } else if (saved?.wallpaperMode === "custom" && saved?.cachedWallpaperUrl) {
      state.imageSubMode = "upload";
    }

    if (Object.hasOwn(CURATED_WALLPAPERS, saved?.curatedId)) state.curatedId = saved.curatedId;
    if (Object.hasOwn(gradients, saved?.gradient)) state.gradient = saved.gradient;

    if (typeof saved?.solid === "string" && /^#[\da-f]{6}$/i.test(saved.solid)) {
      state.solid = saved.solid;
      state.solidCustomized = saved?.solidCustomized === true;
    }

    state.blur = clampNumber(saved?.blur, 0, 28, state.blur);
    state.overlay = clampNumber(saved?.overlay, 0, 75, state.overlay);
    state.textureMode = saved?.textureMode === "dots" ? "dots" : "none";
    state.cardGlass = saved?.cardGlass === true;

    if (persistedWallpaperUrl(saved?.cachedWallpaperUrl)) state.cachedWallpaperUrl = saved.cachedWallpaperUrl;
    if (typeof saved?.cachedBingUrl === "string") state.cachedBingUrl = saved.cachedBingUrl;
    if (typeof saved?.cachedBingTitle === "string") state.cachedBingTitle = saved.cachedBingTitle;
    if (typeof saved?.cachedBingCopyright === "string") state.cachedBingCopyright = saved.cachedBingCopyright;
    if (typeof saved?.cachedBingDate === "string") state.cachedBingDate = saved.cachedBingDate;

    try {
      const legacyRaw = localStorage.getItem(LEGACY_APPEARANCE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        if (!Object.keys(saved).length && legacy?.preset === "ivory") state.theme = "light";
        if (!Object.keys(saved).length && legacy?.preset === "image") {
          state.wallpaperMode = "custom";
          state.imageSubMode = "upload";
        }
        if (typeof legacy?.blur === "number") state.blur = clampNumber(legacy.blur, 0, 28, state.blur);
        if (typeof legacy?.overlay === "number") state.overlay = clampNumber(legacy.overlay, 0, 75, state.overlay);
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

    if (!state.solidCustomized) state.solid = state.theme === "light" ? "#f8f9fa" : "#101113";
    return state;
  }

  let state = readSettings();
  let customImageObjectUrl = "";
  let imageStorePromise = null;
  let wallpaperUploadInProgress = false;
  let wallpaperImageRestoreCount = 0;
  let wallpaperImageGeneration = 0;

  function openDatabase() {
    if (imageStorePromise) return imageStorePromise;
    const connection = new Promise((resolve, reject) => {
      const request = indexedDB.open("qidian-appearance-assets", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("images")) request.result.createObjectStore("images");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开本地图片库"));
    });
    let cachedConnection;
    cachedConnection = connection.then((db) => {
      db.onversionchange = () => {
        db.close();
        if (imageStorePromise === cachedConnection) imageStorePromise = null;
      };
      return db;
    }).catch((error) => {
      if (imageStorePromise === cachedConnection) imageStorePromise = null;
      throw error;
    });
    imageStorePromise = cachedConnection;
    return cachedConnection;
  }

  async function imageStore(operation, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const mode = operation === "get" ? "readonly" : "readwrite";
      const transaction = db.transaction("images", mode);
      const store = transaction.objectStore("images");
      const request = operation === "get"
        ? store.get("background")
        : operation === "delete"
          ? store.delete("background")
          : store.put(value, "background");
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error("本地图片读写失败"));
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error("本地图片保存失败"));
      transaction.onabort = () => reject(transaction.error || new Error("本地图片保存已取消"));
    });
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
    } catch {
      updateAppearanceSaveStatus("设置没有写入本地存储；请检查浏览器存储空间后重试。", true);
      updateWallpaperStatus("设置无法保存，请检查浏览器本地存储空间。", true);
      return false;
    }
    try { localStorage.setItem(THEME_KEY, state.theme); } catch {}
    updateAppearanceSaveStatus("");
    return true;
  }

  function safeWallpaperUrl(value) {
    if (typeof value !== "string" || !value) return "";
    return `url(${JSON.stringify(value)})`;
  }

  function skinForTheme(theme) {
    return theme === "dark"
      ? { id: "midnight", name: "暗黑", scheme: "dark" }
      : { id: "ivory", name: "白色", scheme: "light" };
  }

  function applyWallpaper() {
    root.dataset.wallpaperMode = state.wallpaperMode;
    root.dataset.textureMode = state.textureMode || "none";
    root.dataset.cardGlass = state.cardGlass ? "true" : "false";
    root.style.setProperty("--wallpaper-blur", `${state.blur}px`);
    const isImageMode = state.wallpaperMode === "custom";
    root.style.setProperty("--wallpaper-overlay", String(isImageMode ? state.overlay / 100 : 0));
    root.style.setProperty("--wallpaper-solid", state.solid);

    if (state.wallpaperMode === "gradient") {
      root.style.setProperty("--wallpaper-gradient", (gradients[state.gradient] || gradients.slate)[state.theme]);
    } else {
      root.style.removeProperty("--wallpaper-gradient");
    }

    let imageUrl = "";
    if (isImageMode) {
      if (state.imageSubMode === "curated") {
        const item = CURATED_WALLPAPERS[state.curatedId] || CURATED_WALLPAPERS.aurora;
        imageUrl = item[state.theme] || item.dark || item.url;
      } else if (state.imageSubMode === "bing") {
        imageUrl = state.cachedBingUrl;
      } else if (state.imageSubMode === "upload") {
        imageUrl = customImageObjectUrl || state.cachedWallpaperUrl;
      }
    }

    const cssUrl = safeWallpaperUrl(imageUrl);
    if (cssUrl) {
      root.style.setProperty("--custom-wallpaper-url", cssUrl);
    } else if (isImageMode && bootstrapWallpaperStyle) {
      root.style.setProperty("--custom-wallpaper-url", bootstrapWallpaperStyle);
    } else {
      root.style.removeProperty("--custom-wallpaper-url");
    }
  }

  function applyTheme(theme, persist = true) {
    if (!themes.has(theme)) return state.theme;
    state.theme = theme;
    if (!state.solidCustomized) state.solid = theme === "light" ? "#f8f9fa" : "#101113";
    const skin = skinForTheme(theme);
    root.dataset.theme = theme;
    root.dataset.skin = skin.id;
    root.dataset.material = "frosted";
    delete root.dataset.customAccent;

    ["--accent", "--accent-hover", "--accent-soft", "--accent-border", "--focus"].forEach((property) => {
      root.style.removeProperty(property);
    });

    const metaTheme = document.querySelector("meta[name='theme-color']");
    if (metaTheme) metaTheme.content = theme === "dark" ? "#101113" : "#f3f4f5";
    if (persist) saveSettings();
    applyWallpaper();
    updateThemeCards();
    updateWallpaperUI();
    window.dispatchEvent(new CustomEvent("qidian:skinchange", {
      detail: { ...state, theme, skin }
    }));
    return theme;
  }

  function updateWallpaperStatus(message, isError = false) {
    const status = document.querySelector("#wallpaperStatus");
    if (status && message) status.textContent = message;
    status?.classList.toggle("is-error", isError);
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

  async function fetchBingDailyWallpaper(force = false) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    if (!force && state.cachedBingUrl && state.cachedBingDate === today) {
      return {
        url: state.cachedBingUrl,
        title: state.cachedBingTitle,
        copyright: state.cachedBingCopyright,
        date: state.cachedBingDate
      };
    }

    try {
      const cachedRaw = localStorage.getItem(BING_CACHE_KEY);
      if (!force && cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && (cached.date === today || cached.url)) {
          state.cachedBingUrl = cached.url;
          state.cachedBingTitle = cached.title || "今日必应壁纸";
          state.cachedBingCopyright = cached.copyright || "";
          state.cachedBingDate = cached.date || today;
          return cached;
        }
      }
    } catch {}

    const bingInfo = document.querySelector("#bingCopyright");
    if (bingInfo) bingInfo.textContent = "正在同步今日必应高清壁纸…";

    try {
      const res = await fetch("https://bing.biturl.top/?resolution=1920&format=json&index=0&mkt=zh-CN", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data && data.url) {
        const result = {
          date: today,
          url: data.url,
          title: data.copyright ? data.copyright.split("(")[0].trim() : "今日必应高清壁纸",
          copyright: data.copyright || ""
        };
        state.cachedBingUrl = result.url;
        state.cachedBingTitle = result.title;
        state.cachedBingCopyright = result.copyright;
        state.cachedBingDate = result.date;
        try { localStorage.setItem(BING_CACHE_KEY, JSON.stringify(result)); } catch {}
        saveSettings();
        if (state.wallpaperMode === "custom" && state.imageSubMode === "bing") {
          applyWallpaper();
        }
        updateWallpaperUI();
        return result;
      }
    } catch (e) {
      // Fallback to cn.bing.com
      try {
        const res2 = await fetch("https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&nc=1612409408888&pid=hp");
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2?.images?.[0]) {
            const img = data2.images[0];
            const fullUrl = img.url.startsWith("http") ? img.url : `https://cn.bing.com${img.url}`;
            const result = {
              date: today,
              url: fullUrl,
              title: img.title || (img.copyright ? img.copyright.split("(")[0].trim() : "今日必应壁纸"),
              copyright: img.copyright || ""
            };
            state.cachedBingUrl = result.url;
            state.cachedBingTitle = result.title;
            state.cachedBingCopyright = result.copyright;
            state.cachedBingDate = result.date;
            try { localStorage.setItem(BING_CACHE_KEY, JSON.stringify(result)); } catch {}
            saveSettings();
            if (state.wallpaperMode === "custom" && state.imageSubMode === "bing") {
              applyWallpaper();
            }
            updateWallpaperUI();
            return result;
          }
        }
      } catch {}
    }

    if (state.cachedBingUrl) {
      updateWallpaperUI();
      return { url: state.cachedBingUrl, title: state.cachedBingTitle, copyright: state.cachedBingCopyright };
    }
    return null;
  }

  function renderSolidSwatches() {
    const container = document.querySelector("#wallpaperSolidSwatches");
    if (!container) return;
    const swatches = state.theme === "light" ? SOLID_SWATCHES_LIGHT : SOLID_SWATCHES_DARK;
    container.innerHTML = "";
    swatches.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wallpaper-solid-swatch-btn";
      btn.dataset.swatchColor = item.color;
      btn.title = item.name;
      btn.style.backgroundColor = item.color;
      const isSelected = state.solid.toLowerCase() === item.color.toLowerCase();
      btn.classList.toggle("is-active", isSelected);
      btn.setAttribute("aria-label", item.name);
      btn.addEventListener("click", () => {
        state.solid = item.color;
        state.solidCustomized = true;
        state.wallpaperMode = "solid";
        saveSettings();
        applyWallpaper();
        updateWallpaperUI();
      });
      container.appendChild(btn);
    });
  }

  function updateWallpaperUI() {
    // 1. 主模式按钮
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

    // 3. 纯色快捷卡
    renderSolidSwatches();
    const solidColor = document.querySelector("#wallpaperSolidColor");
    if (solidColor) solidColor.value = state.solid;

    // 4. 图片来源 Tab 与各子区域切换
    document.querySelectorAll("[data-image-source]").forEach((tab) => {
      const selected = tab.dataset.imageSource === state.imageSubMode;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });

    const isImageMode = state.wallpaperMode === "custom";
    const curatedGrid = document.querySelector("#curatedWallpapersGrid");
    const bingCard = document.querySelector("#bingWallpaperCard");
    const customUploadBox = document.querySelector("#customUploadBox");

    if (curatedGrid) curatedGrid.hidden = !isImageMode || state.imageSubMode !== "curated";
    if (bingCard) bingCard.hidden = !isImageMode || state.imageSubMode !== "bing";
    if (customUploadBox) customUploadBox.hidden = !isImageMode || state.imageSubMode !== "upload";

    // 精选壁纸选中高亮与缩略图更新
    document.querySelectorAll("[data-curated-id]").forEach((item) => {
      const selected = item.dataset.curatedId === state.curatedId;
      item.classList.toggle("is-active", selected);
      const config = CURATED_WALLPAPERS[item.dataset.curatedId];
      if (config) {
        const thumb = item.querySelector(".curated-thumb");
        const thumbUrl = config[state.theme] || config.dark || config.url;
        if (thumb && thumbUrl) {
          thumb.style.backgroundImage = `url('${thumbUrl}')`;
        }
      }
    });

    // 必应卡片预览信息
    const bingPreviewImg = document.querySelector("#bingPreviewImg");
    const bingTitle = document.querySelector("#bingTitle");
    const bingCopyright = document.querySelector("#bingCopyright");
    if (bingPreviewImg && state.cachedBingUrl) {
      bingPreviewImg.style.backgroundImage = `url("${state.cachedBingUrl}")`;
    }
    if (bingTitle && state.cachedBingTitle) bingTitle.textContent = state.cachedBingTitle;
    if (bingCopyright && state.cachedBingCopyright) bingCopyright.textContent = state.cachedBingCopyright;

    // 自定义上传图片预览
    const customThumb = document.querySelector("#customWallpaperThumb");
    const removeBtn = document.querySelector("#removeWallpaperButton");
    const uploadBtn = document.querySelector("#uploadWallpaperButton");
    const hasCustomImg = Boolean(customImageObjectUrl || state.cachedWallpaperUrl);
    if (customThumb) {
      customThumb.style.backgroundImage = hasCustomImg ? safeWallpaperUrl(customImageObjectUrl || state.cachedWallpaperUrl) : "none";
    }
    if (removeBtn) removeBtn.hidden = !hasCustomImg;
    if (uploadBtn) uploadBtn.textContent = hasCustomImg ? "更换图片" : "选择本地图片";

    // 5. 区域显示/隐藏
    const options = document.querySelector("#wallpaperOptions");
    const gradientOptions = document.querySelector("#wallpaperGradientOptions");
    const solidOptions = document.querySelector("#wallpaperSolidOptions");
    const imageOptions = document.querySelector("#wallpaperImageOptions");
    const adjustments = document.querySelector("#wallpaperAdjustments");

    const hasOptions = state.wallpaperMode !== "diffuse";
    if (options) options.hidden = !hasOptions;
    if (gradientOptions) gradientOptions.hidden = state.wallpaperMode !== "gradient";
    if (solidOptions) solidOptions.hidden = state.wallpaperMode !== "solid";
    if (imageOptions) imageOptions.hidden = !isImageMode;
    if (adjustments) adjustments.hidden = !isImageMode;

    // 滑块
    const blurRange = document.querySelector("#wallpaperBlurRange");
    const blurValue = document.querySelector("#wallpaperBlurValue");
    const overlayRange = document.querySelector("#wallpaperOverlayRange");
    const overlayValue = document.querySelector("#wallpaperOverlayValue");
    if (blurRange) blurRange.value = String(state.blur);
    if (blurValue) blurValue.value = `${state.blur} px`;
    if (overlayRange) overlayRange.value = String(state.overlay);
    if (overlayValue) overlayValue.value = `${state.overlay}%`;

    // 6. 高级质感开关
    const dotGridToggle = document.querySelector("#toggleDotGrid");
    if (dotGridToggle) dotGridToggle.setAttribute("aria-checked", String(state.textureMode === "dots"));

    const cardGlassToggle = document.querySelector("#toggleCardGlass");
    if (cardGlassToggle) cardGlassToggle.setAttribute("aria-checked", String(state.cardGlass === true));
  }

  async function loadStoredCustomImage() {
    if (wallpaperUploadInProgress) return;
    const generation = ++wallpaperImageGeneration;
    wallpaperImageRestoreCount++;
    try {
      const blob = await imageStore("get");
      if (generation !== wallpaperImageGeneration) return;
      if (!(blob instanceof Blob)) {
        if (state.wallpaperMode === "custom" && state.imageSubMode === "upload" && !state.cachedWallpaperUrl) {
          updateWallpaperStatus("还没有保存的本地图片，请选择一张图片。", false);
        }
        return;
      }
      if (customImageObjectUrl) URL.revokeObjectURL(customImageObjectUrl);
      customImageObjectUrl = URL.createObjectURL(blob);
      if (state.wallpaperMode === "custom" && state.imageSubMode === "upload") applyWallpaper();
      updateWallpaperUI();
      updateWallpaperStatus("自定义图片已保存到本地，刷新后仍然保留。", false);
    } catch {
      if (generation !== wallpaperImageGeneration) return;
      updateWallpaperUI();
      updateWallpaperStatus("图片库暂时无法读取，已保留当前背景设置。", true);
    } finally {
      wallpaperImageRestoreCount = Math.max(0, wallpaperImageRestoreCount - 1);
    }
  }

  function updateRangeValue(input, output, suffix) {
    if (!input || !output) return;
    output.value = `${input.value}${suffix}`;
  }

  function setupUI() {
    const dialog = document.querySelector("#appearanceDialog");
    const openButton = document.querySelector("#appearanceButton");
    const menuItem = document.querySelector("#appearanceMenuItem");
    const fileInput = document.querySelector("#wallpaperFileInput");
    const uploadButton = document.querySelector("#uploadWallpaperButton");
    const removeButton = document.querySelector("#removeWallpaperButton");
    const refreshBingBtn = document.querySelector("#refreshBingButton");

    const chooseWallpaperFile = () => {
      if (wallpaperUploadInProgress) {
        updateWallpaperStatus("正在处理图片，请稍候…", false);
        return;
      }
      fileInput?.click();
    };

    // 主题切换
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      button.addEventListener("click", () => applyTheme(button.dataset.themeOption));
    });

    // 背景模式切换
    document.querySelectorAll("[data-wallpaper-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.wallpaperChoice;
        state.wallpaperMode = mode;
        saveSettings();
        applyWallpaper();
        updateWallpaperUI();
        if (mode === "custom" && state.imageSubMode === "bing" && !state.cachedBingUrl) {
          fetchBingDailyWallpaper();
        }
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

    // 纯色自定义取色器
    document.querySelector("#wallpaperSolidColor")?.addEventListener("input", (event) => {
      state.solid = event.target.value;
      state.solidCustomized = true;
      state.wallpaperMode = "solid";
      saveSettings();
      applyWallpaper();
      updateWallpaperUI();
    });

    // 壁纸来源 Tab
    document.querySelectorAll("[data-image-source]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const source = tab.dataset.imageSource;
        state.imageSubMode = source;
        state.wallpaperMode = "custom";
        saveSettings();
        applyWallpaper();
        updateWallpaperUI();
        if (source === "bing" && !state.cachedBingUrl) {
          fetchBingDailyWallpaper();
        }
      });
    });

    // 精选画廊项目选择
    document.querySelectorAll("[data-curated-id]").forEach((item) => {
      item.addEventListener("click", () => {
        state.curatedId = item.dataset.curatedId;
        state.imageSubMode = "curated";
        state.wallpaperMode = "custom";
        saveSettings();
        applyWallpaper();
        updateWallpaperUI();
      });
    });

    // 必应刷新按钮
    refreshBingBtn?.addEventListener("click", async () => {
      refreshBingBtn.disabled = true;
      refreshBingBtn.textContent = "正在获取…";
      await fetchBingDailyWallpaper(true);
      refreshBingBtn.disabled = false;
      refreshBingBtn.textContent = "🔄 刷新今日壁纸";
    });

    // 自定义上传
    uploadButton?.addEventListener("click", chooseWallpaperFile);
    removeButton?.addEventListener("click", async () => {
      try {
        await imageStore("delete");
        if (customImageObjectUrl) URL.revokeObjectURL(customImageObjectUrl);
        customImageObjectUrl = "";
        state.cachedWallpaperUrl = "";
        saveSettings();
        applyWallpaper();
        updateWallpaperUI();
        updateWallpaperStatus("已移除自定义图片，可重新选择图片。", false);
      } catch (e) {
        updateWallpaperStatus("移除图片失败：" + e.message, true);
      }
    });

    fileInput?.addEventListener("change", async (event) => {
      if (wallpaperUploadInProgress) return;
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/") || file.size > 25_000_000) {
        updateWallpaperStatus("请选择小于 25 MB 的图片文件。", true);
        input.value = "";
        return;
      }

      wallpaperUploadInProgress = true;
      const wallpaperGeneration = Number(root.dataset.wallpaperGeneration) || 0;
      root.dataset.wallpaperGeneration = String(wallpaperGeneration + 1);
      input.disabled = true;
      if (uploadButton) {
        uploadButton.disabled = true;
        uploadButton.textContent = "正在处理…";
      }
      updateWallpaperStatus("正在压缩优化图片…", false);
      let bitmap = null;
      let pendingImageObjectUrl = "";
      try {
        bitmap = await createImageBitmap(file);
        const maxDimension = 2400;
        const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法创建画布上下文");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
        if (!blob) throw new Error("图片转换失败");
        pendingImageObjectUrl = URL.createObjectURL(blob);
        await imageStore("put", blob);

        state.wallpaperMode = "custom";
        state.imageSubMode = "upload";
        state.cachedWallpaperUrl = "";
        saveSettings();

        wallpaperImageGeneration++;
        if (customImageObjectUrl) URL.revokeObjectURL(customImageObjectUrl);
        customImageObjectUrl = pendingImageObjectUrl;
        pendingImageObjectUrl = "";
        applyWallpaper();
        updateWallpaperUI();
        updateWallpaperStatus("图片已成功导入并保存至本地浏览器！", false);
      } catch (error) {
        if (pendingImageObjectUrl) URL.revokeObjectURL(pendingImageObjectUrl);
        updateWallpaperStatus(`图片保存失败：${error?.message || "请重试"}`, true);
      } finally {
        bitmap?.close();
        wallpaperUploadInProgress = false;
        input.disabled = false;
        input.value = "";
        if (uploadButton) {
          uploadButton.disabled = false;
          uploadButton.textContent = "更换图片";
        }
        updateWallpaperUI();
      }
    });

    // 模糊与遮罩滑块
    const blurRange = document.querySelector("#wallpaperBlurRange");
    const blurValue = document.querySelector("#wallpaperBlurValue");
    blurRange?.addEventListener("input", () => {
      state.blur = clampNumber(Number(blurRange.value), 0, 28, state.blur);
      updateRangeValue(blurRange, blurValue, " px");
      saveSettings();
      applyWallpaper();
    });

    const overlayRange = document.querySelector("#wallpaperOverlayRange");
    const overlayValue = document.querySelector("#wallpaperOverlayValue");
    overlayRange?.addEventListener("input", () => {
      state.overlay = clampNumber(Number(overlayRange.value), 0, 75, state.overlay);
      updateRangeValue(overlayRange, overlayValue, "%");
      saveSettings();
      applyWallpaper();
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
      if (!dialog.open) dialog.showModal();
    };

    openButton?.addEventListener("click", openAppearance);
    menuItem?.addEventListener("click", openAppearance);
    updateThemeCards();
    updateWallpaperUI();
  }

  window.qidianSkin = {
    getSkins: () => [
      { id: "midnight", name: "暗黑", scheme: "dark" },
      { id: "ivory", name: "白色", scheme: "light" }
    ],
    getSettings: () => ({ ...state }),
    setTheme: (theme) => applyTheme(theme),
    setSkin: (skinId) => {
      const theme = themeFromSkin(skinId);
      if (theme) applyTheme(theme);
    },
    toggleTheme: () => applyTheme(state.theme === "dark" ? "light" : "dark"),
    setWallpaperMode: (mode) => {
      state.wallpaperMode = mode;
      saveSettings();
      applyWallpaper();
      updateWallpaperUI();
    },
    setCuratedId: (id) => {
      if (CURATED_WALLPAPERS[id]) {
        state.curatedId = id;
        state.imageSubMode = "curated";
        state.wallpaperMode = "custom";
        saveSettings();
        applyWallpaper();
        updateWallpaperUI();
      }
    }
  };

  applyTheme(state.theme, false);
  loadStoredCustomImage();

  if (state.wallpaperMode === "custom" && state.imageSubMode === "bing" && !state.cachedBingUrl) {
    fetchBingDailyWallpaper();
  }

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
        if (modes.has(saved.wallpaperMode)) state.wallpaperMode = saved.wallpaperMode;
        if (["curated", "bing", "upload"].includes(saved.imageSubMode)) state.imageSubMode = saved.imageSubMode;
        if (Object.hasOwn(CURATED_WALLPAPERS, saved.curatedId)) state.curatedId = saved.curatedId;
        if (Object.hasOwn(gradients, saved.gradient)) state.gradient = saved.gradient;
        if (typeof saved.solid === "string" && /^#[\da-f]{6}$/i.test(saved.solid)) state.solid = saved.solid;
        state.solidCustomized = saved.solidCustomized === true;
        state.blur = clampNumber(saved.blur, 0, 28, state.blur);
        state.overlay = clampNumber(saved.overlay, 0, 75, state.overlay);
        state.textureMode = saved.textureMode === "dots" ? "dots" : "none";
        state.cardGlass = saved.cardGlass === true;
        if (typeof saved.cachedWallpaperUrl === "string") state.cachedWallpaperUrl = saved.cachedWallpaperUrl;
        if (typeof saved.cachedBingUrl === "string") state.cachedBingUrl = saved.cachedBingUrl;
        if (!state.solidCustomized) state.solid = state.theme === "light" ? "#f8f9fa" : "#101113";
        updateAppearanceSaveStatus("");
        applyTheme(state.theme, false);
        if (state.wallpaperMode === "custom" && state.imageSubMode === "upload") loadStoredCustomImage();
      } catch {
        // Ignore incomplete updates
      }
    }
  });

  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    if (customImageObjectUrl) URL.revokeObjectURL(customImageObjectUrl);
  });
})();
