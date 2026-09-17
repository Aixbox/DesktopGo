use super::*;

fn candidate(source: &'static str, name: &str, identity: &str, priority: u8) -> ScannedCandidate {
    ScannedCandidate {
        display_name: name.to_string(),
        entry_path: format!("C:\\dummy\\{name}.lnk"),
        target_path: identity.to_string(),
        identity: identity.to_lowercase(),
        item_type: "shortcut".to_string(),
        source_label: source,
        source_priority: priority,
    }
}

#[test]
fn junk_names_are_filtered() {
    assert!(is_junk_name("Uninstall Foo"));
    assert!(is_junk_name("应用卸载程序"));
    assert!(is_junk_name("  "));
    assert!(!is_junk_name("Visual Studio Code"));
    assert!(!is_junk_name("微信"));
}

#[test]
fn system_tool_folders_are_detected_by_name() {
    // 用户报告的样例：管理工具、辅助功能、Windows Kits 里的快捷方式。
    assert!(path_has_system_tool_folder(
        r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Administrative Tools\services.lnk"
    ));
    assert!(path_has_system_tool_folder(
        r"C:\Users\a\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Accessibility\LiveCaptions.lnk"
    ));
    assert!(path_has_system_tool_folder(
        r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Windows Kits\Application Verifier (X86)\Application Verifier (WOW).lnk"
    ));
    // 中文系统的本地化文件夹名。
    assert!(path_has_system_tool_folder(
        r"C:\dummy\管理工具\services.lnk"
    ));
    assert!(path_has_system_tool_folder(
        r"C:\dummy\辅助功能\VoiceAccess.lnk"
    ));
    // 自启动目录。
    assert!(path_has_system_tool_folder(
        r"C:\Users\a\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\OneDrive.lnk"
    ));
    // 快速启动目录（用户报告的 Window Switcher 案例）。
    assert!(path_has_system_tool_folder(
        r"C:\Users\a\AppData\Roaming\Microsoft\Internet Explorer\Quick Launch\Window Switcher.lnk"
    ));
    // 普通应用不受影响。
    assert!(!path_has_system_tool_folder(
        r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    ));
    assert!(!path_has_system_tool_folder(r"C:\Users\a\Desktop\微信.lnk"));
}

#[test]
fn system_tool_targets_are_detected_by_path() {
    // 目标在 %SystemRoot% 下：.msc 管理控制台与 SystemApps 收件箱组件。
    assert!(is_system_tool_target(r"C:\Windows\System32\services.msc"));
    assert!(is_system_tool_target(
        r"C:\Windows\SystemApps\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\LiveCaptions.exe"
    ));
    // Windows Kits 目录内（即使入口路径不在该文件夹下）。
    assert!(is_system_tool_target(
        r"C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appverifier.exe"
    ));
    // %SystemRoot% 边界：C:\Windows Coverage 这类同前缀目录不算（下一字符不是分隔符）。
    assert!(!is_system_tool_target(r"C:\Windows Coverage\app.exe"));
    // WindowsApps 包目录与执行别名目录（用户报告的 winget 案例）。
    assert!(is_system_tool_target(
        r"C:\Program Files\WindowsApps\Microsoft.DesktopAppInstaller_1.29.289.0_x64__8wekyb3d8bbwe\winget.exe"
    ));
    assert!(is_system_tool_target(
        r"C:\Users\a\AppData\Local\Microsoft\WindowsApps\winget.exe"
    ));
    // 套件组件可执行文件名（用户报告的 Office msoadfsb 案例）。
    assert!(is_system_tool_target(
        r"C:\Program Files\Microsoft Office\root\Office16\msoadfsb.exe"
    ));
    assert!(!is_system_tool_target(
        r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    ));
    assert!(!is_system_tool_entry(
        r"C:\Users\a\Desktop\微信.lnk",
        "https://weixin.qq.com/"
    ));
    assert!(!is_system_tool_entry(
        r"C:\Users\a\Desktop\Chrome.lnk",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    ));
}

#[test]
fn component_executable_names_are_detected_without_false_positives() {
    // Office 套件 mso* 内部组件与 helper/server/service/host/diag 后台组件。
    assert!(is_component_executable_name(
        r"C:\Program Files\Microsoft Office\root\Office16\msoxmled.exe"
    ));
    assert!(is_component_executable_name(
        r"C:\Program Files\Common Files\sdxhelper.exe"
    ));
    assert!(is_component_executable_name(
        r"C:\WindowsPackageManagerServer.exe"
    ));
    assert!(is_component_executable_name(
        r"C:\bin\PAD.ChildSession.Service.Host.exe"
    ));
    // 正规应用与套件主程序不受影响。
    assert!(!is_component_executable_name(
        r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE"
    ));
    assert!(!is_component_executable_name(r"C:\Apps\7zFM.exe"));
    assert!(!is_component_executable_name(r"C:\Apps\wt.exe"));
    assert!(!is_component_executable_name(r"C:\Apps\Typora.exe"));
}

#[test]
fn env_vars_expand_and_keep_unknown_placeholders() {
    std::env::set_var("DESKTOPGO_TEST_DIR", "C:\\Program Files");
    assert_eq!(
        expand_env_vars("%DESKTOPGO_TEST_DIR%\\app.exe"),
        "C:\\Program Files\\app.exe"
    );
    assert_eq!(
        expand_env_vars("%DESKTOPGO_TEST_MISSING_VAR%\\app.exe"),
        "%DESKTOPGO_TEST_MISSING_VAR%\\app.exe"
    );
}

#[test]
fn app_paths_target_requires_an_existing_exe() {
    // App Paths 键里混有 .dll 注册（dfshim.dll、vstoee.dll），不能当应用收录。
    let dir = std::env::temp_dir().join(format!("desktopgo-app-import-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let exe = dir.join("probe.exe");
    let dll = dir.join("probe.dll");
    std::fs::write(&exe, b"MZ").unwrap();
    std::fs::write(&dll, b"MZ").unwrap();
    assert!(is_importable_app_paths_target(&exe));
    assert!(!is_importable_app_paths_target(&dll));
    assert!(!is_importable_app_paths_target(&dir.join("missing.exe")));
    assert!(!is_importable_app_paths_target(&dir));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn dedupe_keeps_the_highest_priority_entry_per_identity() {
    let (deduped, merges) = dedupe_candidates(vec![
        candidate(
            "注册表",
            "注册表版",
            "C:\\Apps\\foo.exe",
            PRIORITY_APP_PATHS,
        ),
        candidate("桌面", "桌面版", "C:\\Apps\\foo.exe", PRIORITY_USER_DESKTOP),
        candidate(
            "开始菜单",
            "菜单版",
            "C:\\Apps\\foo.exe",
            PRIORITY_USER_PROGRAMS,
        ),
        candidate(
            "开始菜单",
            "另一个",
            "C:\\Apps\\bar.exe",
            PRIORITY_USER_PROGRAMS,
        ),
    ]);
    assert_eq!(deduped.len(), 2);
    let foo = deduped
        .iter()
        .find(|item| item.identity == "c:\\apps\\foo.exe")
        .expect("foo 条目应保留");
    assert_eq!(foo.display_name, "菜单版", "同身份键保留开始菜单来源");
    assert!(
        deduped
            .iter()
            .any(|item| item.identity == "c:\\apps\\bar.exe"),
        "不同身份键的条目互不干扰"
    );
    // 被合并条目的去向要能追溯到保留条目：桌面版并入菜单版，注册表版亦然。
    assert_eq!(merges.len(), 2, "两条同身份的低优先级条目都应记录去向");
    assert!(
        merges
            .iter()
            .all(|(source, identity)| identity == "c:\\apps\\foo.exe"
                && (*source == "桌面" || *source == "注册表")),
        "去向应记录被合并来源与保留条目身份键"
    );
}

#[test]
fn classification_attaches_merged_sources_to_the_survivor() {
    let (deduped, merges) = dedupe_candidates(vec![
        candidate(
            "开始菜单",
            "菜单版",
            "C:\\Apps\\foo.exe",
            PRIORITY_USER_PROGRAMS,
        ),
        candidate("桌面", "桌面版", "C:\\Apps\\foo.exe", PRIORITY_USER_DESKTOP),
        candidate(
            "桌面",
            "桌面版二",
            "C:\\Apps\\foo.exe",
            PRIORITY_USER_DESKTOP,
        ),
    ]);
    let classified = classify_candidates(deduped, merges, Vec::new());
    assert_eq!(classified.len(), 1);
    let merged = &classified[0].merged_sources;
    assert_eq!(
        merged.get("桌面"),
        Some(&2),
        "两个桌面来源条目都应计入保留条目的 merged_sources"
    );
}

#[test]
fn classification_matches_identity_and_name() {
    let existing = vec![SnapshotIconItem {
        id: "existing-id".to_string(),
        key: "existing-key".to_string(),
        display_order: 1,
        name: "微信".to_string(),
        path: "C:\\Library\\wechat.lnk".to_string(),
        target_path: "C:\\Apps\\WeChat.exe".to_string(),
        launch_arguments: String::new(),
        working_directory: String::new(),
        custom_icon_path: String::new(),
        icon_source: "target".to_string(),
        icon_color: "none".to_string(),
        icon_text: String::new(),
        item_type: "shortcut".to_string(),
        origin: "import".to_string(),
        hidden: false,
        icon: String::new(),
        automatic_target_icon_cache: false,
        automatic_target_icon_cache_version: 0,
        legacy_icons: None,
    }];

    let classified = classify_candidates(
        vec![
            // 大小写不同但身份一致 → 一定重复。
            candidate(
                "桌面",
                "WeChat",
                "c:\\apps\\wechat.exe",
                PRIORITY_USER_DESKTOP,
            ),
            // 目标不同但名称相同 → 可能重复。
            candidate(
                "桌面",
                "微信",
                "C:\\Other\\wechat-portable.exe",
                PRIORITY_USER_DESKTOP,
            ),
            // 都不同 → 新应用。
            candidate(
                "注册表",
                "DesktopGo",
                "C:\\Apps\\desktopgo.exe",
                PRIORITY_APP_PATHS,
            ),
        ],
        Vec::new(),
        existing,
    );

    assert_eq!(classified[0].status, "exact_duplicate");
    assert_eq!(classified[1].status, "possible_duplicate");
    assert_eq!(classified[2].status, "new");
}
