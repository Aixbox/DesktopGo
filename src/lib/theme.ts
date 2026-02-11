import type { ThemeMode } from "@/types";

/**
 * 根据 ThemeMode 设置应用到 <html> 元素上的 dark class
 */
export function applyTheme(mode: ThemeMode) {
    const root = document.documentElement;

    if (mode === "dark") {
        root.classList.add("dark");
    } else if (mode === "light") {
        root.classList.remove("dark");
    } else {
        // system: 跟随系统偏好
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
    }
}

/**
 * 从 localStorage 读取保存的主题模式
 */
export function getSavedTheme(): ThemeMode {
    const saved = localStorage.getItem("themeMode");
    if (saved === "dark" || saved === "light" || saved === "system") return saved;
    return "dark"; // 默认深色
}

/**
 * 初始化主题，并设置系统主题变化监听
 */
export function initTheme(): () => void {
    const mode = getSavedTheme();
    applyTheme(mode);

    // 监听系统主题偏好变化（仅在 system 模式下生效）
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
        const currentMode = getSavedTheme();
        if (currentMode === "system") {
            applyTheme("system");
        }
    };
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
}
