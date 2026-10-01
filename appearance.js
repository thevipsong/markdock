(() => {
  "use strict";
  const STORAGE_KEY = "qidian-appearance-v1";
  const presets = [
    ["dusk", "暮山", "linear-gradient(135deg,#6e899a,#142944)"],
    ["aurora", "极光", "linear-gradient(135deg,#1a425d,#9880b9,#263d40)"],
    ["sunset", "晚霞", "linear-gradient(135deg,#844c82,#e06d53)"],
    ["forest", "苍翠", "linear-gradient(135deg,#1d433b,#437055)"],
    ["ocean", "碧海", "linear-gradient(135deg,#1c3b57,#2d6b7b)"],
    ["slate", "石板", "#263646"],
    ["plum", "梅紫", "#433248"],
    ["obsidian", "曜黑", "linear-gradient(135deg,#1e222d,#0d1117)"],
    ["image", "我的图片", "linear-gradient(135deg,#4b5b71,#8796a2)"]
  ];
  const root = document.documentElement;
  const dialog = document.querySelector("#appearanceDialog");
  const grid = document.querySelector("#presetGrid");
  const status = document.querySelector("#appearanceStatus");
  const blurRange = document.querySelector("#blurRange");
  const overlayRange = document.querySelector("#overlayRange");
  let settings = { preset: "dusk", blur: 12, overlay: 35 };
  let imageUrl = "";
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      settings.preset = presets.some(([key]) => key === saved.preset) ? saved.preset : "dusk";
      settings.blur = Math.max(0, Math.min(40, Number(saved.blur) || 0));
      settings.overlay = Math.max(0, Math.min(80, Number(saved.overlay) || 0));
    }
  } catch { /* defaults remain available */ }

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
        const request = operation === "get" ? store.get("background") : operation === "put" ? store.put(value, "background") : store.delete("background");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
    catch { status.textContent = "设置未能保存，请检查浏览器存储空间。"; }
  }
  function apply() {
    root.dataset.background = settings.preset;
    root.style.setProperty("--background-blur", `${settings.blur}px`);
    root.style.setProperty("--background-overlay", String(settings.overlay / 100));
    blurRange.value = String(settings.blur);
    overlayRange.value = String(settings.overlay);
    document.querySelector("#blurValue").value = `${settings.blur}px`;
    document.querySelector("#overlayValue").value = `${settings.overlay}%`;
    for (const button of grid.querySelectorAll(".preset")) button.setAttribute("aria-pressed", String(button.dataset.preset === settings.preset));
  }
  async function loadImage() {
    try {
      const blob = await imageStore("readonly", "get");
      if (!blob) {
        if (settings.preset === "image") { settings.preset = "dusk"; save(); }
        apply();
        return;
      }
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(blob);
      root.style.setProperty("--custom-background", `url("${imageUrl}")`);
      apply();
    } catch {
      if (settings.preset === "image") { settings.preset = "dusk"; save(); apply(); }
      status.textContent = "图片存储暂时不可用，渐变背景仍可使用。";
    }
  }
  for (const [key, label, background] of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    button.dataset.preset = key;
    button.textContent = label;
    button.style.background = background;
    button.addEventListener("click", () => {
      if (key === "image" && !imageUrl) { document.querySelector("#backgroundFile").click(); return; }
      settings.preset = key;
      save();
      apply();
    });
    grid.append(button);
  }
  document.querySelector("#appearanceButton").addEventListener("click", () => dialog.showModal());
  blurRange.addEventListener("input", () => { settings.blur = Number(blurRange.value); save(); apply(); });
  overlayRange.addEventListener("input", () => { settings.overlay = Number(overlayRange.value); save(); apply(); });
  document.querySelector("#backgroundFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 25_000_000) { status.textContent = "请选择不超过 25 MB 的图片。"; return; }
    status.textContent = "正在处理图片…";
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .86));
      if (!blob) throw new Error("无法转换图片");
      await imageStore("readwrite", "put", blob);
      settings.preset = "image";
      save();
      await loadImage();
      status.textContent = "图片已保存。";
    } catch (error) { status.textContent = `图片未保存：${error.message}`; }
  });
  document.querySelector("#removeBackground").addEventListener("click", async () => {
    try { await imageStore("readwrite", "delete"); } catch { /* preset still resets */ }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = "";
    root.style.removeProperty("--custom-background");
    settings = { preset: "dusk", blur: 12, overlay: 35 };
    save();
    apply();
    status.textContent = "已恢复默认背景。";
  });
  apply();
  loadImage();
})();
