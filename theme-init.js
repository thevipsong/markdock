try {
  const savedTheme = localStorage.getItem("qidian-theme-v1");
  document.documentElement.dataset.theme = savedTheme === "dark" || savedTheme === "light"
    ? savedTheme
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  const appearanceRaw = localStorage.getItem("qidian-appearance-v1");
  if (appearanceRaw) {
    const appearance = JSON.parse(appearanceRaw);
    if (appearance && typeof appearance.preset === "string") {
      document.documentElement.dataset.background = appearance.preset;
      if (typeof appearance.blur === "number") {
        document.documentElement.style.setProperty("--background-blur", `${appearance.blur}px`);
      }
      if (typeof appearance.overlay === "number") {
        document.documentElement.style.setProperty("--background-overlay", String(appearance.overlay / 100));
      }
    }
  }
} catch {
  document.documentElement.dataset.theme = "light";
}
