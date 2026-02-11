import { useState } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useIconStore } from "@/stores/iconStore";
import type { IconSize, TitleLineCount, WindowMode } from "@/types";
import { Settings as SettingsIcon, RefreshCw, Info } from "lucide-react";

type NavItem = "settings" | "update" | "about";

const NAV_ITEMS: { key: NavItem; label: string; icon: React.ReactNode }[] = [
    { key: "settings", label: "设置", icon: <SettingsIcon className="w-4 h-4" /> },
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

function SettingGroup({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="mb-6">
            <h2 className="mb-3 text-sm font-medium text-zinc-400">{title}</h2>
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
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700"
                }`}
        >
            {label}
        </button>
    );
}

function SettingsPanel() {
    const { iconSize, windowMode, titleLineCount } = useIconStore();

    const handleIconSize = (value: IconSize) => {
        localStorage.setItem("iconSize", value);
        useIconStore.setState({ iconSize: value });
    };

    const handleWindowMode = async (value: WindowMode) => {
        localStorage.setItem("windowMode", value);
        useIconStore.setState({ windowMode: value });
        const mainWindow = await WebviewWindow.getByLabel("main");
        if (mainWindow) {
            await mainWindow.close();
        }
    };

    const handleTitleLineCount = (value: TitleLineCount) => {
        localStorage.setItem("titleLineCount", value);
        useIconStore.setState({ titleLineCount: value });
    };

    return (
        <>
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
            <p className="text-sm text-zinc-500">暂无更新内容</p>
        </div>
    );
}

function AboutPanel() {
    return (
        <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-500">关于页面待完善</p>
        </div>
    );
}

export function Settings() {
    const [activeNav, setActiveNav] = useState<NavItem>("settings");

    return (
        <div className="flex h-screen w-screen bg-zinc-900">
            {/* 左侧导航栏 */}
            <nav className="flex w-48 flex-col border-r border-zinc-800 bg-zinc-900/80 p-4">
                <h1 className="mb-6 px-2 text-lg font-semibold text-white">DesktopGo</h1>
                <ul className="flex flex-col gap-1">
                    {NAV_ITEMS.map((item) => (
                        <li key={item.key}>
                            <button
                                onClick={() => setActiveNav(item.key)}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer ${activeNav === item.key
                                        ? "bg-zinc-700/60 text-white"
                                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
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
                {activeNav === "update" && <UpdatePanel />}
                {activeNav === "about" && <AboutPanel />}
            </main>
        </div>
    );
}
