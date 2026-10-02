/**
 * 栖点 · 幻梦皮肤系统管理器 (Mirage Skins & Appearance Engine)
 * 深度复刻自 RevolutionLA/dsh-dream-skin: 8套专属幻梦皮肤、双玻璃材质、品牌强调色与壁纸 2.0
 */
(() => {
  "use strict";

  const STORAGE_KEY = "qidian-skin-settings-v2";
  const OLD_THEME_KEY = "qidian-theme-v1";
  const OLD_APPEARANCE_KEY = "qidian-appearance-v1";

  // 8 套精选幻梦经典皮肤
  const SKINS = [
    {
      id: "nebula",
      name: "星云紫",
      scheme: "dark",
      badge: "深色",
      accent: "#8b7cf6",
      desc: "紫青深邃，幻梦默认旗舰",
      swatch: "radial-gradient(circle at 75% 25%, #8b7cf6 0%, #282444 60%, #12101a 100%)"
    },
    {
      id: "abyss",
      name: "沉静蓝",
      scheme: "dark",
      badge: "深色",
      accent: "#5e6ad2",
      desc: "清透冷调靛蓝，沉静内敛",
      swatch: "radial-gradient(circle at 75% 25%, #5e6ad2 0%, #1e2230 60%, #101014 100%)"
    },
    {
      id: "aurora",
      name: "极光青",
      scheme: "dark",
      badge: "深色",
      accent: "#2dd4bf",
      desc: "青绿天蓝低温系，空灵清爽",
      swatch: "radial-gradient(circle at 75% 25%, #2dd4bf 0%, #162a28 60%, #0e1316 100%)"
    },
    {
      id: "ember",
      name: "余烬橙",
      scheme: "dark",
      badge: "深色",
      accent: "#f59e5b",
      desc: "余烬微光，温暖而克制",
      swatch: "radial-gradient(circle at 75% 25%, #f59e5b 0%, #2a1c14 60%, #16110d 100%)"
    },
    {
      id: "midnight",
      name: "午夜黑",
      scheme: "dark",
      badge: "深色",
      accent: "#7c8cff",
      desc: "纯黑 OLED 底色，深沉纯粹",
      swatch: "radial-gradient(circle at 75% 25%, #7c8cff 0%, #181822 60%, #0b0b0e 100%)"
    },
    {
      id: "mist",
      name: "薄雾明亮",
      scheme: "light",
      badge: "浅色",
      accent: "#2196f3",
      desc: "清透液态白，冷蓝光晕",
      swatch: "radial-gradient(circle at 75% 25%, #9fbef5 0%, #ffffff 60%, #e9eef6 100%)"
    },
    {
      id: "ivory",
      name: "iOS 扁平",
      scheme: "light",
      badge: "浅色",
      accent: "#0071e3",
      desc: "苹果极简浅白，平色分层",
      swatch: "radial-gradient(circle at 75% 25%, #c4a478 0%, #ffffff 60%, #f4f4f6 100%)"
    },
    {
      id: "rose",
      name: "Material 粉",
      scheme: "light",
      badge: "浅色",
      accent: "#e91e63",
      desc: "干净明快的品牌粉，优雅鲜明",
      swatch: "radial-gradient(circle at 75% 25%, #f06292 0%, #ffffff 60%, #f7f0f3 100%)"
    }
  ];

  // 12 款精选灵感强调色
  const ACCENT_PRESETS = [
    "#4f83f2", "#2563eb", "#34d399", "#22d3ee",
    "#a78bfa", "#fb923c", "#f87171", "#fbbf24",
    "#e879f9", "#f472b6", "#2dd4bf", "#a3e635"
  ];

  const BING_DAILY_URL = "https://uapis.cn/api/v1/image/bing-daily";

  const root = document.documentElement;

  // 默认状态
  let state = {
    skin: "nebula",
    material: "frosted",
    customAccent: null,
    wallpaperMode: "diffuse",
    blur: 12,
    overlay: 25,
    cachedWallpaperUrl: ""
  };

  let customImageObjectUrl = "";

  // 读取已保存设置与旧版平滑升级
  try {
    const savedRaw = localStorage.getItem(STORAGE_KEY);
    if (savedRaw) {
      const parsed = JSON.parse(savedRaw);
      if (parsed && typeof parsed === "object") {
        if (SKINS.some((s) => s.id === parsed.skin)) state.skin = parsed.skin;
        if (parsed.material === "liquid" || parsed.material === "frosted") state.material = parsed.material;
        if (parsed.wallpaperMode === "diffuse" || parsed.wallpaperMode === "bing" || parsed.wallpaperMode === "custom") {
          state.wallpaperMode = parsed.wallpaperMode;
        }
        if (typeof parsed.customAccent === "string" && /^#[0-9a-f]{6}$/i.test(parsed.customAccent.trim())) {
          state.customAccent = parsed.customAccent.trim();
        }
        if (typeof parsed.blur === "number") state.blur = Math.max(0, Math.min(40, parsed.blur));
        if (typeof parsed.overlay === "number") state.overlay = Math.max(0, Math.min(80, parsed.overlay));
        if (typeof parsed.cachedWallpaperUrl === "string") state.cachedWallpaperUrl = parsed.cachedWallpaperUrl;
      }
    } else {
      // 兼容旧版配置迁移
      const oldTheme = localStorage.getItem(OLD_THEME_KEY);
      const oldAppearanceRaw = localStorage.getItem(OLD_APPEARANCE_KEY);
      if (oldAppearanceRaw) {
        try {
          const oldApp = JSON.parse(oldAppearanceRaw);
          if (oldApp.preset === "ivory") state.skin = "ivory";
          else if (oldApp.preset === "aurora") state.skin = "aurora";
          else if (oldApp.preset === "obsidian") state.skin = "midnight";
          else if (oldApp.preset === "image") state.wallpaperMode = "custom";
          if (typeof oldApp.blur === "number") state.blur = oldApp.blur;
          if (typeof oldApp.overlay === "number") state.overlay = oldApp.overlay;
        } catch { /* ignore */ }
      } else if (oldTheme === "light") {
        state.skin = "mist";
      }
    }
  } catch {
    // defaults remain available
  }

  // IndexedDB 存储本地上传壁纸图片
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("qidian-appearance-assets", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("images");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function imageStore(mode, operation, value) {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("images", mode);
        const store = tx.objectStore("images");
        const request = operation === "get"
          ? store.get("background")
          : operation === "put"
            ? store.put(value, "background")
            : store.delete("background");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(OLD_THEME_KEY, currentSkin().scheme);
    } catch {
      // ignore storage errors
    }
  }

  function currentSkin() {
    return SKINS.find((s) => s.id === state.skin) || SKINS[0];
  }

  function applySettings() {
    const skin = currentSkin();
    root.dataset.skin = skin.id;
    root.dataset.theme = skin.scheme;
    root.dataset.material = state.material;
    root.dataset.wallpaperMode = state.wallpaperMode;

    // 壁纸微调变量
    root.style.setProperty("--wallpaper-blur", `${state.blur}px`);
    root.style.setProperty("--wallpaper-overlay", String(state.overlay / 100));

    // 自定义强调色叠加
    if (state.customAccent) {
      root.dataset.customAccent = "true";
      root.style.setProperty("--accent", state.customAccent);
      root.style.setProperty("--accent-hover", state.customAccent);
      root.style.setProperty("--accent-soft", `${state.customAccent}26`);
      root.style.setProperty("--accent-border", `${state.customAccent}59`);
      root.style.setProperty("--focus", state.customAccent);
    } else {
      delete root.dataset.customAccent;
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-hover");
      root.style.removeProperty("--accent-soft");
      root.style.removeProperty("--accent-border");
      root.style.removeProperty("--focus");
    }

    // 壁纸图片源处理
    if (state.wallpaperMode === "bing") {
      root.style.setProperty("--custom-wallpaper-url", `url("${BING_DAILY_URL}")`);
    } else if (state.wallpaperMode === "custom") {
      if (customImageObjectUrl) {
        root.style.setProperty("--custom-wallpaper-url", `url("${customImageObjectUrl}")`);
      } else if (state.cachedWallpaperUrl) {
        root.style.setProperty("--custom-wallpaper-url", `url("${state.cachedWallpaperUrl}")`);
      } else {
        root.style.removeProperty("--custom-wallpaper-url");
      }
    } else {
      root.style.removeProperty("--custom-wallpaper-url");
    }

    // 状态栏与 Meta 标签同步
    const metaTheme = document.querySelector("meta[name='theme-color']");
    if (metaTheme) {
      metaTheme.content = skin.scheme === "dark" ? "#101014" : "#f4f4f6";
    }

    // 触发全局主题事件通知
    window.dispatchEvent(new CustomEvent("qidian:skinchange", { detail: { ...state, skin } }));
  }

  async function loadStoredCustomImage() {
    try {
      const blob = await imageStore("readonly", "get");
      if (blob) {
        if (customImageObjectUrl) URL.revokeObjectURL(customImageObjectUrl);
        customImageObjectUrl = URL.createObjectURL(blob);
        if (state.wallpaperMode === "custom") {
          root.style.setProperty("--custom-wallpaper-url", `url("${customImageObjectUrl}")`);
        }
      }
    } catch {
      // ignore
    }
  }

  // --------------------------------------------------------------------------
  // UI 元素交互初始化
  // --------------------------------------------------------------------------
  function setupUI() {
    const dialog = document.querySelector("#appearanceDialog");
    const appearanceButton = document.querySelector("#appearanceButton");
    const skinGrid = document.querySelector("#skinGrid");
    const currentSkinTag = document.querySelector("#currentSkinTag");

    const matBtnFrosted = document.querySelector("#matBtnFrosted");
    const matBtnLiquid = document.querySelector("#matBtnLiquid");

    const accentPalette = document.querySelector("#accentPalette");
    const accentColorPicker = document.querySelector("#accentColorPicker");
    const randomAccentBtn = document.querySelector("#randomAccentBtn");
    const resetAccentBtn = document.querySelector("#resetAccentBtn");

    const wallpaperModeToggle = document.querySelector("#wallpaperModeToggle");
    const customWallpaperWrap = document.querySelector("#customWallpaperWrap");
    const wallpaperSliderBox = document.querySelector("#wallpaperSliderBox");
    const uploadWallpaperBtn = document.querySelector("#uploadWallpaperBtn");
    const wallpaperFileInput = document.querySelector("#wallpaperFileInput");
    const wallpaperUrlInput = document.querySelector("#wallpaperUrlInput");
    const applyWallpaperUrlBtn = document.querySelector("#applyWallpaperUrlBtn");
    const wallpaperStatusText = document.querySelector("#wallpaperStatusText");

    const blurRange = document.querySelector("#blurRange");
    const blurValue = document.querySelector("#blurValue");
    const overlayRange = document.querySelector("#overlayRange");
    const overlayValue = document.querySelector("#overlayValue");

    const resetSkinSettingsBtn = document.querySelector("#resetSkinSettingsBtn");

    if (!dialog) return;

    // 1. 渲染 8 款皮肤卡片
    skinGrid.innerHTML = "";
    SKINS.forEach((skin) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "skin-card";
      card.dataset.skinId = skin.id;
      if (skin.id === state.skin) card.classList.add("is-active");

      const swatch = document.createElement("div");
      swatch.className = "skin-swatch";
      swatch.style.background = skin.swatch;

      const meta = document.createElement("div");
      meta.className = "skin-meta";

      const name = document.createElement("span");
      name.className = "skin-name";
      name.textContent = skin.name;

      const badge = document.createElement("span");
      badge.className = "skin-badge";
      badge.textContent = skin.badge;

      meta.append(name, badge);
      card.append(swatch, meta);

      card.addEventListener("click", () => {
        state.skin = skin.id;
        saveSettings();
        applySettings();
        updateUIState();
      });

      skinGrid.appendChild(card);
    });

    // 2. 材质切换按钮
    if (matBtnFrosted && matBtnLiquid) {
      matBtnFrosted.addEventListener("click", () => {
        state.material = "frosted";
        saveSettings();
        applySettings();
        updateUIState();
      });
      matBtnLiquid.addEventListener("click", () => {
        state.material = "liquid";
        saveSettings();
        applySettings();
        updateUIState();
      });
    }

    // 3. 渲染 12 个强调色色块
    accentPalette.innerHTML = "";
    ACCENT_PRESETS.forEach((hex) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "accent-swatch";
      swatch.style.backgroundColor = hex;
      swatch.title = hex;
      if (state.customAccent && state.customAccent.toLowerCase() === hex.toLowerCase()) {
        swatch.classList.add("is-active");
      }
      swatch.addEventListener("click", () => {
        state.customAccent = hex;
        if (accentColorPicker) accentColorPicker.value = hex;
        saveSettings();
        applySettings();
        updateUIState();
      });
      accentPalette.appendChild(swatch);
    });

    // 自定义颜色拾取器
    if (accentColorPicker) {
      accentColorPicker.value = state.customAccent || currentSkin().accent;
      accentColorPicker.addEventListener("input", (e) => {
        state.customAccent = e.target.value;
        saveSettings();
        applySettings();
        updateUIState();
      });
    }

    // 随机灵感强调色
    if (randomAccentBtn) {
      randomAccentBtn.addEventListener("click", () => {
        const randomHex = ACCENT_PRESETS[Math.floor(Math.random() * ACCENT_PRESETS.length)];
        state.customAccent = randomHex;
        if (accentColorPicker) accentColorPicker.value = randomHex;
        saveSettings();
        applySettings();
        updateUIState();
      });
    }

    // 恢复跟随皮肤强调色
    if (resetAccentBtn) {
      resetAccentBtn.addEventListener("click", () => {
        state.customAccent = null;
        if (accentColorPicker) accentColorPicker.value = currentSkin().accent;
        saveSettings();
        applySettings();
        updateUIState();
      });
    }

    // 4. 壁纸模式分段切换
    if (wallpaperModeToggle) {
      wallpaperModeToggle.querySelectorAll(".segment-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.wallpaperMode = btn.dataset.mode;
          saveSettings();
          applySettings();
          updateUIState();
        });
      });
    }

    // 上传图片按钮
    if (uploadWallpaperBtn && wallpaperFileInput) {
      uploadWallpaperBtn.addEventListener("click", () => wallpaperFileInput.click());
      wallpaperFileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/") || file.size > 25_000_000) {
          if (wallpaperStatusText) wallpaperStatusText.textContent = "请选择小于 25 MB 的图片格式文件。";
          return;
        }
        if (wallpaperStatusText) wallpaperStatusText.textContent = "正在处理图片…";

        try {
          const bitmap = await createImageBitmap(file);
          const maxDim = 2560;
          const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          bitmap.close();

          const blob = await new Promise((res) => canvas.toBlob(res, "image/webp", 0.88));
          if (!blob) throw new Error("图片转换失败");

          await imageStore("readwrite", "put", blob);

          if (customImageObjectUrl) URL.revokeObjectURL(customImageObjectUrl);
          customImageObjectUrl = URL.createObjectURL(blob);

          state.wallpaperMode = "custom";
          state.cachedWallpaperUrl = "";
          saveSettings();
          applySettings();
          updateUIState();

          if (wallpaperStatusText) wallpaperStatusText.textContent = "壁纸已保存至本地离线存储。";
        } catch (err) {
          if (wallpaperStatusText) wallpaperStatusText.textContent = `上传失败：${err.message}`;
        }
      });
    }

    // 网络图片网址
    if (applyWallpaperUrlBtn && wallpaperUrlInput) {
      applyWallpaperUrlBtn.addEventListener("click", () => {
        const url = wallpaperUrlInput.value.trim();
        if (!url) return;
        state.wallpaperMode = "custom";
        state.cachedWallpaperUrl = url;
        saveSettings();
        applySettings();
        updateUIState();
        if (wallpaperStatusText) wallpaperStatusText.textContent = "已应用网络壁纸。";
      });
    }

    // 模糊与暗度滑动条
    if (blurRange && blurValue) {
      blurRange.value = String(state.blur);
      blurValue.value = `${state.blur}px`;
      blurRange.addEventListener("input", () => {
        state.blur = Number(blurRange.value);
        blurValue.value = `${state.blur}px`;
        saveSettings();
        applySettings();
      });
    }

    if (overlayRange && overlayValue) {
      overlayRange.value = String(state.overlay);
      overlayValue.value = `${state.overlay}%`;
      overlayRange.addEventListener("input", () => {
        state.overlay = Number(overlayRange.value);
        overlayValue.value = `${state.overlay}%`;
        saveSettings();
        applySettings();
      });
    }

    // 恢复出厂设置
    if (resetSkinSettingsBtn) {
      resetSkinSettingsBtn.addEventListener("click", async () => {
        try {
          await imageStore("readwrite", "delete");
        } catch { /* ignore */ }
        if (customImageObjectUrl) URL.revokeObjectURL(customImageObjectUrl);
        customImageObjectUrl = "";

        state = {
          skin: "nebula",
          material: "frosted",
          customAccent: null,
          wallpaperMode: "diffuse",
          blur: 12,
          overlay: 25,
          cachedWallpaperUrl: ""
        };

        saveSettings();
        applySettings();
        updateUIState();

        if (wallpaperStatusText) wallpaperStatusText.textContent = "已恢复默认星云紫皮肤。";
      });
    }

    // 打开弹窗按钮
    if (appearanceButton) {
      appearanceButton.addEventListener("click", () => {
        updateUIState();
        dialog.showModal();
      });
    }

    // 更新界面状态（选中高亮等）
    function updateUIState() {
      const activeSkin = currentSkin();
      if (currentSkinTag) {
        currentSkinTag.textContent = `${activeSkin.name} (${activeSkin.scheme === "dark" ? "深色" : "浅色"})`;
      }

      // 皮肤网格选中态
      skinGrid.querySelectorAll(".skin-card").forEach((card) => {
        card.classList.toggle("is-active", card.dataset.skinId === state.skin);
      });

      // 材质选中态
      if (matBtnFrosted && matBtnLiquid) {
        matBtnFrosted.classList.toggle("is-active", state.material === "frosted");
        matBtnLiquid.classList.toggle("is-active", state.material === "liquid");
      }

      // 强调色色块选中态
      accentPalette.querySelectorAll(".accent-swatch").forEach((swatch) => {
        swatch.classList.toggle(
          "is-active",
          Boolean(state.customAccent && swatch.title.toLowerCase() === state.customAccent.toLowerCase())
        );
      });

      if (accentColorPicker) {
        accentColorPicker.value = state.customAccent || activeSkin.accent;
      }

      // 壁纸模式分段按钮选中态
      if (wallpaperModeToggle) {
        wallpaperModeToggle.querySelectorAll(".segment-btn").forEach((btn) => {
          btn.classList.toggle("is-active", btn.dataset.mode === state.wallpaperMode);
        });
      }

      // 自定义壁纸控制区与滑动条展示
      const isCustom = state.wallpaperMode === "custom";
      const isBing = state.wallpaperMode === "bing";

      if (customWallpaperWrap) customWallpaperWrap.hidden = !isCustom;
      if (wallpaperSliderBox) wallpaperSliderBox.hidden = !(isCustom || isBing);

      if (wallpaperUrlInput && state.cachedWallpaperUrl) {
        wallpaperUrlInput.value = state.cachedWallpaperUrl;
      }

      if (blurRange && blurValue) {
        blurRange.value = String(state.blur);
        blurValue.value = `${state.blur}px`;
      }

      if (overlayRange && overlayValue) {
        overlayRange.value = String(state.overlay);
        overlayValue.value = `${state.overlay}%`;
      }
    }

    updateUIState();
  }

  // --------------------------------------------------------------------------
  // 对外公开 API: window.qidianSkin
  // --------------------------------------------------------------------------
  window.qidianSkin = {
    getSkins: () => [...SKINS],
    getSettings: () => ({ ...state }),
    setSkin: (skinId) => {
      if (SKINS.some((s) => s.id === skinId)) {
        state.skin = skinId;
        saveSettings();
        applySettings();
      }
    },
    setMaterial: (material) => {
      if (material === "frosted" || material === "liquid") {
        state.material = material;
        saveSettings();
        applySettings();
      }
    },
    setAccent: (hexOrNull) => {
      state.customAccent = hexOrNull;
      saveSettings();
      applySettings();
    },
    // 智能在深浅皮肤间无缝切换（供标题栏日月按钮调用）
    toggleTheme: () => {
      const isDark = currentSkin().scheme === "dark";
      if (isDark) {
        // 切换到浅色旗舰皮肤（薄雾 mist）
        state.skin = "mist";
      } else {
        // 切换到深色旗舰皮肤（星云紫 nebula）
        state.skin = "nebula";
      }
      saveSettings();
      applySettings();
      // 同步 UI 状态
      const dialog = document.querySelector("#appearanceDialog");
      if (dialog && dialog.open) {
        document.querySelectorAll(".skin-card").forEach((card) => {
          card.classList.toggle("is-active", card.dataset.skinId === state.skin);
        });
      }
      return currentSkin().scheme;
    }
  };

  // 启动时初始化
  applySettings();
  loadStoredCustomImage().then(() => applySettings());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupUI);
  } else {
    setupUI();
  }
})();
