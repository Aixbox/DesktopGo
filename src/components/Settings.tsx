import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useIconStore } from "@/stores/iconStore";
import { applyTheme, saveTheme } from "@/lib/theme";
import { getSetting, setSetting } from "@/lib/settingsStore";
import type { IconSize, TitleLineCount, WindowMode, ThemeMode } from "@/types";
import { Settings as SettingsIcon, RefreshCw, Info, Images } from "lucide-react";

type NavItem = "settings" | "iconManager" | "update" | "about";

const NAV_ITEMS: { key: NavItem; label: string; icon: React.ReactNode }[] = [
    { key: "settings", label: "设置", icon: <SettingsIcon className="w-4 h-4" /> },
    { key: "iconManager", label: "图标管理", icon: <Images className="w-4 h-4" /> },
    { key: "update", label: "更新", icon: <RefreshCw className="w-4 h-4" /> },
    { key: "about", label: "关于", icon: <Info className="w-4 h-4" /> },
];

const ICON_SIZE_OPTIONS: { label: string; value: IconSize }[] = [
    { label: "大图标", value: "large" },
    { label: "中等图标", value: "medium" },
    { label: "小图标", value: "small" },
];

const WINDOW_MODE_OPTIONS: { label: string; value: WindowMode }[] = [
    { label: "全屏", value: "fullscreen" },
    { label: "大窗口", value: "large" },
    { label: "中等窗口", value: "medium" },
    { label: "小窗口", value: "small" },
];

const TITLE_LINE_OPTIONS: { label: string; value: TitleLineCount }[] = [
    { label: "一行标题", value: "one" },
    { label: "两行标题", value: "two" },
];

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
    { label: "跟随系统", value: "system" },
    { label: "深色模式", value: "dark" },
    { label: "浅色模式", value: "light" },
];

type IconSyncAction = "incremental" | "full";

type IconSyncResult = {
    mode: string;
    scanned_count: number;
    added_count: number;
    total_count: number;
};

const ICON_SYNC_ACTIONS: Record<
    IconSyncAction,
    {
        label: string;
        command: "sync_new_desktop_icons" | "sync_full_desktop_icons";
        desc: string;
        confirmTitle: string;
        confirmDesc: string;
    }
> = {
    incremental: {
        label: "桌面新增图标同步",
        command: "sync_new_desktop_icons",
        desc: "仅追加桌面上新增的图标，已有图标保持不变。",
        confirmTitle: "确认执行新增图标同步",
        confirmDesc: "该操作会扫描桌面并仅新增快照中不存在的图标，不会删除或覆盖已有图标记录。",
    },
    full: {
        label: "桌面全量图标同步",
        command: "sync_full_desktop_icons",
        desc: "按当前桌面重建图标快照，覆盖现有快照结果。",
        confirmTitle: "确认执行全量图标同步",
        confirmDesc: "该操作会重新扫描整个桌面并重建图标快照，旧快照中已不存在的图标会被移除。",
    },
};

function SettingGroup({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="mb-6">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
            <div className="flex flex-wrap gap-2">{children}</div>
        </div>
    );
}

function OptionButton({
    label,
    selected,
    onClick,
}: {
    label: string;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`rounded-lg border px-4 py-2 text-sm transition-all duration-150 cursor-pointer ${selected
                ? "border-blue-500 bg-blue-500/20 text-blue-400"
                : "border-border bg-secondary text-secondary-foreground hover:border-muted-foreground hover:bg-accent"
                }`}
        >
            {label}
        </button>
    );
}

function SettingsPanel() {
    const { iconSize, windowMode, titleLineCount } = useIconStore();
    const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

    useEffect(() => {
        void (async () => {
            try {
                const [savedIconSize, savedWindowMode, savedTitleLineCount, savedThemeMode] =
                    await Promise.all([
                        getSetting("iconSize"),
                        getSetting("windowMode"),
                        getSetting("titleLineCount"),
                        getSetting("themeMode"),
                    ]);
                useIconStore.setState({
                    iconSize: savedIconSize,
                    windowMode: savedWindowMode,
                    titleLineCount: savedTitleLineCount,
                });
                setThemeMode(savedThemeMode);
            } catch (e) {
                console.error("Failed to load settings:", e);
            }
        })();
    }, []);

    const handleIconSize = (value: IconSize) => {
        void setSetting("iconSize", value).catch((e) =>
            console.error("Failed to save icon size:", e),
        );
        useIconStore.setState({ iconSize: value });
    };

    const handleWindowMode = async (value: WindowMode) => {
        void setSetting("windowMode", value).catch((e) =>
            console.error("Failed to save window mode:", e),
        );
        useIconStore.setState({ windowMode: value });
        const mainWindow = await WebviewWindow.getByLabel("main");
        if (mainWindow) {
            await mainWindow.close();
        }
    };

    const handleTitleLineCount = (value: TitleLineCount) => {
        void setSetting("titleLineCount", value).catch((e) =>
            console.error("Failed to save title line count:", e),
        );
        useIconStore.setState({ titleLineCount: value });
    };

    const handleThemeMode = (value: ThemeMode) => {
        void saveTheme(value).catch((e) => console.error("Failed to save theme mode:", e));
        setThemeMode(value);
        applyTheme(value);
    };

    return (
        <>
            <SettingGroup title="主题模式">
                {THEME_OPTIONS.map((opt) => (
                    <OptionButton
                        key={opt.value}
                        label={opt.label}
                        selected={themeMode === opt.value}
                        onClick={() => handleThemeMode(opt.value)}
                    />
                ))}
            </SettingGroup>

            <SettingGroup title="图标大小">
                {ICON_SIZE_OPTIONS.map((opt) => (
                    <OptionButton
                        key={opt.value}
                        label={opt.label}
                        selected={iconSize === opt.value}
                        onClick={() => handleIconSize(opt.value)}
                    />
                ))}
            </SettingGroup>

            <SettingGroup title="窗口大小">
                {WINDOW_MODE_OPTIONS.map((opt) => (
                    <OptionButton
                        key={opt.value}
                        label={opt.label}
                        selected={windowMode === opt.value}
                        onClick={() => handleWindowMode(opt.value)}
                    />
                ))}
            </SettingGroup>

            <SettingGroup title="标题行数">
                {TITLE_LINE_OPTIONS.map((opt) => (
                    <OptionButton
                        key={opt.value}
                        label={opt.label}
                        selected={titleLineCount === opt.value}
                        onClick={() => handleTitleLineCount(opt.value)}
                    />
                ))}
            </SettingGroup>
        </>
    );
}

function UpdatePanel() {
    return (
        <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">暂无更新内容</p>
        </div>
    );
}

function IconManagerPanel() {
    const [pendingAction, setPendingAction] = useState<IconSyncAction | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [resultText, setResultText] = useState<string>("");

    const handleConfirmSync = async () => {
        if (!pendingAction) return;
        setSyncing(true);
        setResultText("");

        try {
            const action = ICON_SYNC_ACTIONS[pendingAction];
            const result = await invoke<IconSyncResult>(action.command);
            const modeText = result.mode === "full" ? "全量同步" : "新增同步";
            setResultText(
                `${modeText}完成：扫描 ${result.scanned_count} 项，新增 ${result.added_count} 项，当前快照共 ${result.total_count} 项。`,
            );
        } catch (e) {
            setResultText(`同步失败：${String(e)}`);
        } finally {
            setSyncing(false);
            setPendingAction(null);
        }
    };

    return (
        <>
            <div className="space-y-6">
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold">图标管理</h2>
                    <p className="text-sm text-muted-foreground">
                        首次进入主页面会自动扫描并保存图标快照，后续不会主动扫描。你可以在这里手动同步。
                    </p>
                </div>

                <div className="grid gap-3">
                    {(Object.keys(ICON_SYNC_ACTIONS) as IconSyncAction[]).map((actionKey) => {
                        const action = ICON_SYNC_ACTIONS[actionKey];
                        return (
                            <button
                                key={actionKey}
                                onClick={() => setPendingAction(actionKey)}
                                disabled={syncing}
                                className="rounded-lg border border-border bg-secondary px-4 py-3 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <p className="text-sm font-medium">{action.label}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{action.desc}</p>
                            </button>
                        );
                    })}
                </div>

                {resultText ? <p className="text-sm text-muted-foreground">{resultText}</p> : null}
            </div>

            {pendingAction ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
                    <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
                        <h3 className="text-base font-semibold">
                            {ICON_SYNC_ACTIONS[pendingAction].confirmTitle}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {ICON_SYNC_ACTIONS[pendingAction].confirmDesc}
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                onClick={() => setPendingAction(null)}
                                disabled={syncing}
                                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirmSync}
                                disabled={syncing}
                                className="rounded-md bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {syncing ? "同步中..." : "开始同步"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

function AboutPanel() {
    return (
        <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">关于页面待完善</p>
        </div>
    );
}

export function Settings() {
    const [activeNav, setActiveNav] = useState<NavItem>("settings");

    return (
        <div className="flex h-screen w-screen bg-background text-foreground">
            {/* 左侧导航栏 */}
            <nav className="flex w-48 flex-col border-r border-border bg-secondary/50 p-4">
                <h1 className="mb-6 px-2 text-lg font-semibold">DesktopGo</h1>
                <ul className="flex flex-col gap-1">
                    {NAV_ITEMS.map((item) => (
                        <li key={item.key}>
                            <button
                                onClick={() => setActiveNav(item.key)}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer ${activeNav === item.key
                                    ? "bg-zinc-200 dark:bg-zinc-700/60 text-foreground font-medium"
                                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                    }`}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* 右侧内容区 */}
            <main className="flex-1 overflow-y-auto p-8">
                {activeNav === "settings" && <SettingsPanel />}
                {activeNav === "iconManager" && <IconManagerPanel />}
                {activeNav === "update" && <UpdatePanel />}
                {activeNav === "about" && <AboutPanel />}
            </main>
        </div>
    );
}
