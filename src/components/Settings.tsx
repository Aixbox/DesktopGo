import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useIconStore } from "@/stores/iconStore";
import type { IconSize, TitleLineCount, WindowMode } from "@/types";

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

export function Settings() {
    const {
        iconSize,
        windowMode,
        titleLineCount,
    } = useIconStore();

    const handleIconSize = (value: IconSize) => {
        localStorage.setItem("iconSize", value);
        useIconStore.setState({ iconSize: value });
    };

    const handleWindowMode = async (value: WindowMode) => {
        localStorage.setItem("windowMode", value);
        useIconStore.setState({ windowMode: value });
        // 关闭主窗口避免调整大小时闪烁，下次打开时会重新创建并应用新尺寸
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
        <div className="flex h-screen w-screen bg-zinc-900">
            <div className="mx-auto w-full max-w-xl p-8">
                <h1 className="mb-8 text-xl font-semibold text-white">设置</h1>

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
            </div>
        </div>
    );
}
