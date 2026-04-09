import type { ThemeMode, WindowStyle } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "@/lib/settingsStore";

export const THEME_MODE_SYNC_EVENT = "desktopgo:theme-mode-sync";

export function resolveEffectiveThemeMode(
    mode: ThemeMode,
    windowStyle: WindowStyle = "default",
): ThemeMode {
    return windowStyle === "nativeAcrylic" ? "system" : mode;
}

function emitThemeModeSync(mode: ThemeMode) {
    window.dispatchEvent(
        new CustomEvent(THEME_MODE_SYNC_EVENT, {
            detail: { mode },
        }),
    );
}

/**
 * 根据 ThemeMode 设置应用到 <html> 元素上的 dark class
 */
export function applyTheme(mode: ThemeMode, windowStyle: WindowStyle = "default") {
    const effectiveMode = resolveEffectiveThemeMode(mode, windowStyle);
    const root = document.documentElement;

    if (effectiveMode === "dark") {
        root.classList.add("dark");
    } else if (effectiveMode === "light") {
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
 * 从 plugin-store 读取保存的主题模式
 */
export async function getSavedTheme(): Promise<ThemeMode> {
    return getSetting("themeMode");
}

export async function saveTheme(mode: ThemeMode): Promise<void> {
    await setSetting("themeMode", mode);
}

/**
 * 初始化主题，并设置系统主题变化监听
 */
export async function initTheme(): Promise<() => void> {
    const [mode, windowStyle] = await Promise.all([
        getSavedTheme(),
        getSetting("windowStyle"),
    ]);
    applyTheme(mode, windowStyle);

    // 监听系统主题偏好变化（system 模式，或原生亚克力强制跟随系统时生效）
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
        void (async () => {
            const [currentMode, windowStyle] = await Promise.all([
                getSavedTheme(),
                getSetting("windowStyle"),
            ]);

            if (windowStyle === "nativeAcrylic") {
                const nextMode: ThemeMode = mediaQuery.matches ? "dark" : "light";
                if (currentMode !== nextMode) {
                    await saveTheme(nextMode);
                }
                applyTheme(nextMode, windowStyle);
                emitThemeModeSync(nextMode);
                await invoke("apply_window_style", {
                    style: windowStyle,
                    themeMode: nextMode,
                });
                return;
            }

            if (currentMode === "system") {
                applyTheme("system");
                emitThemeModeSync("system");
            }
        })().catch((e) => {
            console.error("Failed to sync system theme change:", e);
        });
    };
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
}
