/**
 * 栖屿外观设置：保留两款界面主题，并让背景预设独立保存。
 */
(() => {
  "use strict";

  const SETTINGS_KEY = "qidian-skin-settings-v2";
  const THEME_KEY = "qidian-theme-v1";
  const LEGACY_APPEARANCE_KEY = "qidian-appearance-v1";
  const root = document.documentElement;
  // theme-init.js may already have restored an IndexedDB image before this
  // deferred script runs. Keep that CSS URL as a fallback until our own read
  // creates an object URL; otherwise the first applyTheme() removes it and
  // briefly exposes the plain background on every refresh.
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
    }
  };
  const lightSkins = new Set(["ivory", "mist", "rose", "light", "white"]);
  const darkSkins = new Set(["nebula", "abyss", "aurora", "ember", "midnight", "dark", "black"]);
  const DEFAULTS = {
    theme: "dark",
    wallpaperMode: "diffuse",
    gradient: "slate",
    solid: "#17191d",
    solidCustomized: false,
    blur: 10,
    overlay: 24,
    cachedWallpaperUrl: ""
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
    else if (saved?.wallpaperMode === "bing") state.wallpaperMode = "diffuse";
    if (Object.hasOwn(gradients, saved?.gradient)) state.gradient = saved.gradient;
    if (typeof saved?.solid === "string" && /^#[\da-f]{6}$/i.test(saved.solid)) {
      state.solid = saved.solid;
      state.solidCustomized = saved?.solidCustomized === true;
    }
    state.blur = clampNumber(saved?.blur, 0, 24, state.blur);
    state.overlay = clampNumber(saved?.overlay, 0, 70, state.overlay);
    if (persistedWallpaperUrl(saved?.cachedWallpaperUrl)) state.cachedWallpaperUrl = saved.cachedWallpaperUrl;

    try {
      const legacyRaw = localStorage.getItem(LEGACY_APPEARANCE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        if (!Object.keys(saved).length && legacy?.preset === "ivory") state.theme = "light";
        if (!Object.keys(saved).length && legacy?.preset === "image") state.wallpaperMode = "custom";
        if (typeof legacy?.blur === "number") state.blur = clampNumber(legacy.blur, 0, 24, state.blur);
        if (typeof legacy?.overlay === "number") state.overlay = clampNumber(legacy.overlay, 0, 70, state.overlay);
      }
    } catch {
      // Ignore invalid legacy appearance data.
    }
    if (!modes.has(saved?.wallpaperMode) && saved?.wallpaperMode !== "bing") {
      try {
        const legacyRaw = localStorage.getItem(LEGACY_APPEARANCE_KEY);
        if (legacyRaw && JSON.parse(legacyRaw)?.preset === "image") state.wallpaperMode = "custom";
      } catch {
        // Keep the default background when legacy settings are unavailable.
      }
    }
    if (!themes.has(saved?.theme)) {
      try {
        const storedTheme = localStorage.getItem(THEME_KEY);
        if (themes.has(storedTheme)) state.theme = storedTheme;
      } catch {
        // The bootstrap theme is enough when storage cannot be read.
      }
    }
    if (!state.solidCustomized) state.solid = state.theme === "light" ? "#f3f4f5" : "#17191d";
    if (saved?.wallpaperMode === "bing") {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, ...state }));
      } catch {
        // Keep the safe in-memory fallback if a legacy setting cannot be rewritten.
      }
    }
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
      updateAppearanceSaveStatus("设置没有写入本地存储；刷新后可能恢复为之前的设置。请检查浏览器存储空间后重试。", true);
      updateWallpaperStatus("设置无法保存，请检查浏览器本地存储空间。", true);
      return false;
    }
    // SETTINGS_KEY is authoritative; the small key remains for older builds.
    try { localStorage.setItem(THEME_KEY, state.theme); } catch { /* The full settings still preserve the theme. */ }
    updateAppearanceSaveStatus("");
    return true;
  }

  function safeWallpaperUrl(value) {
    if (typeof value !== "string" || !value) return "";
    if (!/^(https?:|blob:|data:image\/)/i.test(value)) return "";
    return `url(${JSON.stringify(value)})`;
  }

  function skinForTheme(theme) {
    return theme === "dark"
      ? { id: "midnight", name: "暗黑", scheme: "dark" }
      : { id: "ivory", name: "白色", scheme: "light" };
  }

  function applyWallpaper() {
    root.dataset.wallpaperMode = state.wallpaperMode;
    root.style.setProperty("--wallpaper-blur", `${state.blur}px`);
    const imageMode = state.wallpaperMode === "custom";
    root.style.setProperty("--wallpaper-overlay", String(imageMode ? state.overlay / 100 : 0));
    root.style.setProperty("--wallpaper-solid", state.solid);

    if (state.wallpaperMode === "gradient") {
      root.style.setProperty("--wallpaper-gradient", (gradients[state.gradient] || gradients.slate)[state.theme]);
    } else {
      root.style.removeProperty("--wallpaper-gradient");
    }

    let imageUrl = "";
    if (state.wallpaperMode === "custom") imageUrl = customImageObjectUrl || state.cachedWallpaperUrl;
    const cssUrl = safeWallpaperUrl(imageUrl);
    if (cssUrl) {
      root.style.setProperty("--custom-wallpaper-url", cssUrl);
    } else if (state.wallpaperMode === "custom" && bootstrapWallpaperStyle) {
      root.style.setProperty("--custom-wallpaper-url", bootstrapWallpaperStyle);
    } else {
      root.style.removeProperty("--custom-wallpaper-url");
    }
  }

  function applyTheme(theme, persist = true) {
    if (!themes.has(theme)) return state.theme;
    state.theme = theme;
    if (!state.solidCustomized) state.solid = theme === "light" ? "#f3f4f5" : "#17191d";
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

  function updateWallpaperUI() {
    document.querySelectorAll("[data-wallpaper-choice]").forEach((button) => {
      const selected = button.dataset.wallpaperChoice === state.wallpaperMode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    document.querySelectorAll("[data-wallpaper-gradient]").forEach((button) => {
      const selected = button.dataset.wallpaperGradient === state.gradient;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    const options = document.querySelector("#wallpaperOptions");
    const gradientOptions = document.querySelector("#wallpaperGradientOptions");
    const solidOptions = document.querySelector("#wallpaperSolidOptions");
    const imageOptions = document.querySelector("#wallpaperImageOptions");
    const adjustments = document.querySelector("#wallpaperAdjustments");
    const blurRow = document.querySelector("#wallpaperBlurRow");
    const solidColor = document.querySelector("#wallpaperSolidColor");
    const blurRange = document.querySelector("#wallpaperBlurRange");
    const blurValue = document.querySelector("#wallpaperBlurValue");
    const overlayRange = document.querySelector("#wallpaperOverlayRange");
    const overlayValue = document.querySelector("#wallpaperOverlayValue");
    const hasOptions = state.wallpaperMode !== "diffuse";
    const imageMode = state.wallpaperMode === "custom";

    if (options) options.hidden = !hasOptions;
    if (gradientOptions) gradientOptions.hidden = state.wallpaperMode !== "gradient";
    if (solidOptions) solidOptions.hidden = state.wallpaperMode !== "solid";
    if (imageOptions) imageOptions.hidden = !imageMode;
    if (adjustments) adjustments.hidden = !imageMode;
    if (blurRow) blurRow.hidden = false;
    if (solidColor) solidColor.value = state.solid;
    if (blurRange) blurRange.value = String(state.blur);
    if (blurValue) blurValue.value = `${state.blur} px`;
    if (overlayRange) overlayRange.value = String(state.overlay);
    if (overlayValue) overlayValue.value = `${state.overlay}%`;
    const uploadButton = document.querySelector("#uploadWallpaperButton");
    if (uploadButton) uploadButton.textContent = customImageObjectUrl || state.cachedWallpaperUrl ? "更换图片" : "选择图片";
  }

  async function loadStoredCustomImage() {
    if (wallpaperUploadInProgress) return;
    const generation = ++wallpaperImageGeneration;
    wallpaperImageRestoreCount++;
    try {
      const blob = await imageStore("get");
      if (generation !== wallpaperImageGeneration) return;
      if (!(blob instanceof Blob)) {
        if (state.wallpaperMode === "custom" && !state.cachedWallpaperUrl) {
          state.wallpaperMode = "diffuse";
          applyWallpaper();
          saveSettings();
          updateWallpaperUI();
          updateWallpaperStatus("还没有已保存的背景图片，请选择一张图片。", false);
        }
        return;
      }
      if (customImageObjectUrl) URL.revokeObjectURL(customImageObjectUrl);
      customImageObjectUrl = URL.createObjectURL(blob);
      if (state.wallpaperMode === "custom") applyWallpaper();
      updateWallpaperUI();
      updateWallpaperStatus("自定义图片已保存，可随时更换。", false);
    } catch {
      if (generation !== wallpaperImageGeneration) return;
      // A transient IndexedDB failure must not erase the user's saved choice:
      // keep custom mode so the next page load or explicit retry can recover it.
      updateWallpaperUI();
      updateWallpaperStatus("图片库暂时无法读取，已保留自定义背景设置；可以重试或重新选择图片。", true);
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
    const chooseWallpaperFile = () => {
      if (wallpaperUploadInProgress) {
        updateWallpaperStatus("正在处理图片，请稍候。", false);
        return;
      }
      fileInput?.click();
    };

    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      button.addEventListener("click", () => applyTheme(button.dataset.themeOption));
    });

    document.querySelectorAll("[data-wallpaper-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.wallpaperChoice;
        if (mode === "custom" && !customImageObjectUrl && !state.cachedWallpaperUrl) {
          if (wallpaperImageRestoreCount > 0) {
            state.wallpaperMode = mode;
            saveSettings();
            applyWallpaper();
            updateWallpaperUI();
            updateWallpaperStatus("正在恢复已保存的背景图片…", false);
            return;
          }
          chooseWallpaperFile();
          return;
        }
        state.wallpaperMode = mode;
        saveSettings();
        applyWallpaper();
        updateWallpaperUI();
      });
    });

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

    document.querySelector("#wallpaperSolidColor")?.addEventListener("input", (event) => {
      state.solid = event.target.value;
      state.solidCustomized = true;
      state.wallpaperMode = "solid";
      saveSettings();
      applyWallpaper();
      updateWallpaperUI();
    });

    uploadButton?.addEventListener("click", chooseWallpaperFile);
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

      const wasInputDisabled = input.disabled;
      const wasButtonDisabled = uploadButton?.disabled ?? false;
      wallpaperUploadInProgress = true;
      const wallpaperGeneration = Number(root.dataset.wallpaperGeneration) || 0;
      root.dataset.wallpaperGeneration = String(wallpaperGeneration + 1);
      input.disabled = true;
      if (uploadButton) {
        uploadButton.disabled = true;
        uploadButton.textContent = "正在处理…";
        uploadButton.setAttribute("aria-busy", "true");
      }
      updateWallpaperStatus("正在处理图片…", false);
      let bitmap = null;
      let pendingImageObjectUrl = "";
      try {
        bitmap = await createImageBitmap(file);
        const maxDimension = 2200;
        const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法处理这张图片");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
        if (!blob) throw new Error("图片转换失败");
        // Keep the previous image available until both the new image and its
        // settings have been saved. localStorage and IndexedDB cannot share a
        // transaction, so restore the image if settings persistence fails.
        const previousBlob = await imageStore("get");
        pendingImageObjectUrl = URL.createObjectURL(blob);
        await imageStore("put", blob);

        const previousState = { ...state };
        state.wallpaperMode = "custom";
        state.cachedWallpaperUrl = "";
        const settingsSaved = saveSettings();
        if (!settingsSaved) {
          wallpaperImageGeneration++;
          state = previousState;
          let previousImageRestored = true;
          try {
            if (previousBlob instanceof Blob) await imageStore("put", previousBlob);
            else await imageStore("delete");
          } catch {
            previousImageRestored = false;
          }
          if (customImageObjectUrl) URL.revokeObjectURL(customImageObjectUrl);
          customImageObjectUrl = previousBlob instanceof Blob ? URL.createObjectURL(previousBlob) : "";
          URL.revokeObjectURL(pendingImageObjectUrl);
          pendingImageObjectUrl = "";
          applyWallpaper();
          updateWallpaperUI();
          updateWallpaperStatus(
            previousImageRestored
              ? "设置无法保存，已保留原有背景；请检查浏览器本地存储空间后重试。"
              : "设置无法保存，且旧图片恢复失败；请先重新选择背景，再刷新页面。",
            true
          );
          return;
        }

        wallpaperImageGeneration++;
        if (customImageObjectUrl) URL.revokeObjectURL(customImageObjectUrl);
        customImageObjectUrl = pendingImageObjectUrl;
        pendingImageObjectUrl = "";
        applyWallpaper();
        updateWallpaperUI();
        updateWallpaperStatus("图片已保存到本机，刷新后仍会保留。", false);
      } catch (error) {
        if (pendingImageObjectUrl) URL.revokeObjectURL(pendingImageObjectUrl);
        updateWallpaperStatus(`图片保存失败：${error?.message || "请重试"}`, true);
      } finally {
        bitmap?.close();
        wallpaperUploadInProgress = false;
        input.disabled = wasInputDisabled;
        input.value = "";
        if (uploadButton) {
          uploadButton.disabled = wasButtonDisabled;
          uploadButton.removeAttribute("aria-busy");
        }
        updateWallpaperUI();
      }
    });

    const blurRange = document.querySelector("#wallpaperBlurRange");
    const blurValue = document.querySelector("#wallpaperBlurValue");
    blurRange?.addEventListener("input", () => {
      state.blur = clampNumber(Number(blurRange.value), 0, 24, state.blur);
      updateRangeValue(blurRange, blurValue, " px");
      saveSettings();
      applyWallpaper();
    });

    const overlayRange = document.querySelector("#wallpaperOverlayRange");
    const overlayValue = document.querySelector("#wallpaperOverlayValue");
    overlayRange?.addEventListener("input", () => {
      state.overlay = clampNumber(Number(overlayRange.value), 0, 70, state.overlay);
      updateRangeValue(overlayRange, overlayValue, "%");
      saveSettings();
      applyWallpaper();
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
    toggleTheme: () => applyTheme(state.theme === "dark" ? "light" : "dark")
  };

  applyTheme(state.theme, false);
  loadStoredCustomImage();

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
        if (Object.hasOwn(gradients, saved.gradient)) state.gradient = saved.gradient;
        if (typeof saved.solid === "string" && /^#[\da-f]{6}$/i.test(saved.solid)) state.solid = saved.solid;
        state.solidCustomized = saved.solidCustomized === true;
        state.blur = clampNumber(saved.blur, 0, 24, state.blur);
        state.overlay = clampNumber(saved.overlay, 0, 70, state.overlay);
        if (typeof saved.cachedWallpaperUrl === "string") {
          state.cachedWallpaperUrl = persistedWallpaperUrl(saved.cachedWallpaperUrl)
            ? saved.cachedWallpaperUrl
            : "";
        }
        if (!state.solidCustomized) state.solid = state.theme === "light" ? "#f3f4f5" : "#17191d";
        updateAppearanceSaveStatus("");
        applyTheme(state.theme, false);
        if (state.wallpaperMode === "custom") loadStoredCustomImage();
      } catch {
        // Ignore incomplete cross-tab updates.
      }
    }
  });

  window.addEventListener("pagehide", (event) => {
    // A BFCache restore reuses this document and its current wallpaper URL.
    if (event.persisted) return;
    if (customImageObjectUrl) URL.revokeObjectURL(customImageObjectUrl);
  });
})();
