try {
  const savedTheme = localStorage.getItem("qidian-theme-v1");
  document.documentElement.dataset.theme = savedTheme === "dark" || savedTheme === "light"
    ? savedTheme
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
} catch { document.documentElement.dataset.theme = "light"; }
