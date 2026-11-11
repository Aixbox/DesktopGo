# 桌面证据摘录

归档日期：2026-11-11。保留原始行号及引用附近上下文；不是完整反编译副本，不代表运行观察。全文 SHA-256、摘录范围及来源见 [sources.json](sources.json)。较长 shader 字符串保留原始 Java 转义。

## source-001

原文件：`D:/Project/other/ColorOS16/analysis/decoded/OplusLauncher/resources/res/drawable/folder_icon_bg.xml`  
全文 SHA-256：`ef848aa8eeac86cf118ab0f21d87f75a31a622818ca8592d86ae74bd22147af0`  
原始引用行：3

原文件第 1–6 行：

```text
    1 | <?xml version="1.0" encoding="utf-8"?>
    2 | <shape xmlns:androidprv="http://schemas.android.com/apk/prv/res/android" xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    3 |     <solid android:color="@color/oplus_folder_bg_dark"/>
    4 |     <corners android:radius="@dimen/folder_bg_radius"/>
    5 |     <smooth-weight android:gradientRadius="@dimen/radius_weight_small_folder"/>
    6 | </shape>
```

## source-002

原文件：`D:/Project/other/ColorOS16/analysis/decoded/OplusLauncher/resources/res/drawable/hotseat_bg.xml`  
全文 SHA-256：`6287bbb0fbcc840aa9f99e77bd17c74f1020947825890a28348cec8ff2ac1e82`  
原始引用行：4

原文件第 1–9 行：

```text
    1 | <?xml version="1.0" encoding="utf-8"?>
    2 | <shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    3 |     <corners android:radius="@dimen/dp_19"/>
    4 |     <solid android:color="@color/hotseat_bg_color"/>
    5 |     <stroke
    6 |         android:width="@dimen/hotseat_bg_stroke_width"
    7 |         android:color="@color/hotseat_bg_stroke_color"/>
    8 |     <smooth-weight android:gradientRadius="@dimen/radius_weight"/>
    9 | </shape>
```

## source-003

原文件：`D:/Project/other/ColorOS16/analysis/decoded/OplusLauncher/resources/res/drawable/launcher_folder_content_background.xml`  
全文 SHA-256：`179195bb8e5cdb7d97187a5940aee9c7026af6d9b1608aeca8caab1e45e1f821`  
原始引用行：3

原文件第 1–9 行：

```text
    1 | <?xml version="1.0" encoding="utf-8"?>
    2 | <inset xmlns:android="http://schemas.android.com/apk/res/android" android:inset="0dp">
    3 |     <shape android:shape="rectangle">
    4 |         <corners android:radius="@dimen/folder_content_background_radius"/>
    5 |         <stroke
    6 |             android:width="1dp"
    7 |             android:color="@color/launcher_widget_stroke_color"/>
    8 |     </shape>
    9 | </inset>
```

## source-004

原文件：`D:/Project/other/ColorOS16/analysis/decoded/OplusLauncher/resources/res/layout/oplus_user_folder_icon_normalized.xml`  
全文 SHA-256：`ce566cde0c64816a988bbacb9bb6380823b361d16b28a4ab886d4564e4463bc2`  
原始引用行：63

原文件第 57–91 行：

```text
   57 |         android:clipChildren="false"
   58 |         android:clipToPadding="false"
   59 |         android:layout_width="wrap_content"
   60 |         android:layout_height="wrap_content"
   61 |         android:layout_marginTop="@dimen/folder_content_wrapper_margin_top">
   62 |         <ImageView
   63 |             android:id="@+id/folder_content_background"
   64 |             android:background="@drawable/launcher_folder_content_background"
   65 |             android:paddingTop="@dimen/folder_pageview_padding_top"
   66 |             android:clipToPadding="false"
   67 |             android:layout_width="match_parent"
   68 |             android:layout_height="match_parent"
   69 |             android:layout_marginBottom="@dimen/folder_content_background_margin_bottom"
   70 |             android:paddingStart="0dp"
   71 |             android:paddingEnd="0dp"/>
   72 |         <ImageView
   73 |             android:id="@+id/folder_animator_background"
   74 |             android:background="@drawable/folder_icon_bg"
   75 |             android:paddingTop="@dimen/folder_pageview_padding_top"
   76 |             android:visibility="invisible"
   77 |             android:clipToPadding="false"
   78 |             android:layout_width="match_parent"
   79 |             android:layout_height="match_parent"
   80 |             android:layout_marginBottom="@dimen/folder_content_background_margin_bottom"
   81 |             android:paddingStart="0dp"
   82 |             android:paddingEnd="0dp"/>
   83 |         <com.android.launcher3.folder.OplusFolderPagedView
   84 |             android:id="@+id/folder_content"
   85 |             android:paddingTop="@dimen/folder_pageview_padding_top"
   86 |             android:clipChildren="false"
   87 |             android:clipToPadding="false"
   88 |             android:layout_width="match_parent"
   89 |             android:layout_height="match_parent"
   90 |             android:paddingStart="@dimen/folder_content_background_margin_start_end"
   91 |             android:paddingEnd="@dimen/folder_content_background_margin_start_end"
```

## source-005

原文件：`D:/Project/other/ColorOS16/analysis/decoded/OplusLauncher/resources/res/values-night/colors.xml`  
全文 SHA-256：`e7f2f0a180f3e430293d8f1d7ebf24c9ee9d81838a7c2ef700c5b8607f9d48ec`  
原始引用行：499, 500, 522, 590

原文件第 493–550 行：

```text
  493 |     <color name="drop_bar_enter_color_dark">#8a999999</color>
  494 |     <color name="drop_bar_normal_color_bright">#66404040</color>
  495 |     <color name="drop_bar_normal_color_dark">#66999999</color>
  496 |     <color name="encypt_cover_background_color">#000000</color>
  497 |     <color name="encypt_text_color">#8affffff</color>
  498 |     <color name="fast_scroll_message_color">#d9ffffff</color>
  499 |     <color name="folder_bg_bright_wallpaper">#66404040</color>
  500 |     <color name="folder_bg_dark_wallpaper">#66999999</color>
  501 |     <color name="folder_current_recommend_color">#33ffffff</color>
  502 |     <color name="gesture_tutorial_back_arrow_color">#99000000</color>
  503 |     <color name="gesture_tutorial_fake_wallpaper_color">#000000</color>
  504 |     <color name="gestures_guide_text_color">#8cffffff</color>
  505 |     <color name="group_empty_card_subtitle_color">#8affffff</color>
  506 |     <color name="group_empty_card_title_color">#e6ffffff</color>
  507 |     <color name="guide_panel_navigation_bar_background_color">#ff404040</color>
  508 |     <color name="guide_panel_select_indicator_dot_color">#d9ffffff</color>
  509 |     <color name="guide_panel_title_text_color">#e6ffffff</color>
  510 |     <color name="guide_panel_unselect_indicator_dot_color">#4dffffff</color>
  511 |     <color name="history_text">#8affffff</color>
  512 |     <color name="history_title">#e6ffffff</color>
  513 |     <color name="home_settings_header_accent">@android:color/system_accent1_100</color>
  514 |     <color name="home_settings_header_collapsed">@android:color/system_neutral1_700</color>
  515 |     <color name="home_settings_header_expanded">@android:color/system_neutral1_900</color>
  516 |     <color name="home_settings_thumb_off_color">@android:color/system_neutral2_300</color>
  517 |     <color name="home_settings_track_off_color">@android:color/system_neutral1_700</color>
  518 |     <color name="home_settings_track_on_color">@android:color/system_accent2_700</color>
  519 |     <color name="hotseat_and_folder_bg_bright_wallpaper">#66404040</color>
  520 |     <color name="hotseat_and_folder_bg_dark_wallpaper">#66999999</color>
  521 |     <color name="hotseat_bg_bright_wallpaper">#66404040</color>
  522 |     <color name="hotseat_bg_color">#1e000000</color>
  523 |     <color name="hotseat_bg_dark_wallpaper">#66999999</color>
  524 |     <color name="hotseat_blur_divider_bg_bright_wallpapaer">#33ffffff</color>
  525 |     <color name="hotseat_blur_divider_bg_bright_wallpapaer_extreme">#33ffffff</color>
  526 |     <color name="hotseat_divider_bg_bright_wallpaper">#d9404040</color>
  527 |     <color name="hotseat_divider_bg_color">#3dffffff</color>
  528 |     <color name="hotseat_divider_bg_dark_wallpaper">#d9999999</color>
  529 |     <color name="icon_black">#ffffff</color>
  530 |     <color name="indicator_bright">#f0f0f0</color>
  531 |     <color name="item_resize_frame_dark_color">#4dffffff</color>
  532 |     <color name="item_togglebar_dialog_layout_bg_color">#1affffff</color>
  533 |     <color name="item_togglebar_dialog_layout_stroke_color">#247cff</color>
  534 |     <color name="item_togglebar_dialog_layout_text_color">#e6ffffff</color>
  535 |     <color name="item_transform_style_color">#89ffffff</color>
  536 |     <color name="launcher_activity_background_color">#ffffff</color>
  537 |     <color name="launcher_add_item_text_color">#ffffffff</color>
  538 |     <color name="launcher_alert_panel_bg_color">#ff000000</color>
  539 |     <color name="launcher_all_apps_divider_color">#33ffffff</color>
  540 |     <color name="launcher_all_apps_icon_text_color">#ffffffff</color>
  541 |     <color name="launcher_all_apps_search_view_divider_color">#33ffffff</color>
  542 |     <color name="launcher_deep_shortcut_bg_color">#333333</color>
  543 |     <color name="launcher_deep_shortcut_group_divide_color">#29000000</color>
  544 |     <color name="launcher_deep_shortcut_item_text_color">#ffffffff</color>
  545 |     <color name="launcher_delete_app_panel_content_text_color">#ffffffff</color>
  546 |     <color name="launcher_delete_app_panel_negative_btn_text_color">#d9ffffff</color>
  547 |     <color name="launcher_dialog_button_panel_divider">#33ffffff</color>
  548 |     <color name="launcher_drawer_uninstall_btn_text_color_normal">#ffffffff</color>
  549 |     <color name="launcher_edit_shortcut_bg_color">#14ffffff</color>
  550 |     <color name="launcher_edit_shortcut_bg_color_third_theme">#555555</color>
```

原文件第 584–618 行：

```text
  584 |     <color name="mock_webpage_url_bar">#202124</color>
  585 |     <color name="mock_webpage_url_bar_item">#3c4043</color>
  586 |     <color name="mode_common_description">#ffffffff</color>
  587 |     <color name="mode_common_radio_description">#ffffffff</color>
  588 |     <color name="oplus_deep_shortcut_system_item_bg_color">#80545454</color>
  589 |     <color name="oplus_deep_shortcut_view_selected_color">#33ffffff</color>
  590 |     <color name="oplus_folder_bg_bright">#4c000000</color>
  591 |     <color name="oplus_folder_bg_dark">#4c000000</color>
  592 |     <color name="oplus_folder_icon_bg_color">#4c000000</color>
  593 |     <color name="oplus_recent_clear_all_button_src">#b8ffffff</color>
  594 |     <color name="oplus_relay_view_bg">#29000000</color>
  595 |     <color name="oplus_relay_view_bg_night_bright">#29cccccc</color>
  596 |     <color name="oplus_snack_bar_background">#333333</color>
  597 |     <color name="oplus_task_menu_group_divider">#29000000</color>
  598 |     <color name="page_indicator_bg">#3dffffff</color>
  599 |     <color name="page_indicator_bg_dark">#66404040</color>
  600 |     <color name="panel_guide_layout_bg_color">#404040</color>
  601 |     <color name="panel_guide_tips_description_color">#d9ffffff</color>
  602 |     <color name="panel_guide_tips_title_color">#d9ffffff</color>
  603 |     <color name="popup_blur_scrim_color">#1a000000</color>
  604 |     <color name="popup_shortcut_icon_tint_color">#ffffffff</color>
  605 |     <color name="quick_card_background">#ff383838</color>
  606 |     <color name="recent_task_menu_item_hover_bg">#33ffffff</color>
  607 |     <color name="recent_task_popup_shortcut_primary_bg_color">#404040</color>
  608 |     <color name="recommend_dialog_current_text">#99ffffff</color>
  609 |     <color name="recommend_dialog_icon_color">#ffffff</color>
  610 |     <color name="recommend_dialog_message_text">#e6ffffff</color>
  611 |     <color name="remind_blend_blur">#737373</color>
  612 |     <color name="remind_mixnd_blur">#cc404040</color>
  613 |     <color name="search_empty_text_color">#ffffff</color>
  614 |     <color name="search_view_exp_bg_color">#00181f</color>
  615 |     <color name="search_view_window_mask">#b3000000</color>
  616 |     <color name="side_gestures_learning_setting_bg_color">#ff404040</color>
  617 |     <color name="splash_window_background_default">@color/splash_screen_bg_dark</color>
  618 |     <color name="split_enter_normal_dim_color">#000000</color>
```

## source-006

原文件：`D:/Project/other/ColorOS16/analysis/decoded/OplusLauncher/resources/res/values/colors.xml`  
全文 SHA-256：`a1939693a14a285dd7942dd90c609cf02b7b9db810f00dcc82a6418f5b6a0a9a`  
原始引用行：1744, 2379, 2380

原文件第 1738–1772 行：

```text
 1738 |     <color name="home_settings_thumb_off_color">@android:color/system_neutral2_100</color>
 1739 |     <color name="home_settings_track_off_color">@android:color/system_neutral2_600</color>
 1740 |     <color name="home_settings_track_on_color">@android:color/system_accent1_600</color>
 1741 |     <color name="hotseat_and_folder_bg_bright_wallpaper">#66a6a6a6</color>
 1742 |     <color name="hotseat_and_folder_bg_dark_wallpaper">#66e0e0e0</color>
 1743 |     <color name="hotseat_bg_bright_wallpaper">#66a6a6a6</color>
 1744 |     <color name="hotseat_bg_color">#4cffffff</color>
 1745 |     <color name="hotseat_bg_color_bright">#1e000000</color>
 1746 |     <color name="hotseat_bg_dark_wallpaper">#66e0e0e0</color>
 1747 |     <color name="hotseat_bg_stroke_color">#2effffff</color>
 1748 |     <color name="hotseat_blur_divider_bg_bright_wallpapaer">#75ffffff</color>
 1749 |     <color name="hotseat_blur_divider_bg_bright_wallpapaer_extreme">#33000000</color>
 1750 |     <color name="hotseat_blur_divider_bg_dark_wallpapaer">#33ffffff</color>
 1751 |     <color name="hotseat_divider_bg_bright_wallpaper">#4ca6a6a6</color>
 1752 |     <color name="hotseat_divider_bg_color">#4dffffff</color>
 1753 |     <color name="hotseat_divider_bg_dark_wallpaper">#4ce0e0e0</color>
 1754 |     <color name="icon_background">#e0e0e0</color>
 1755 |     <color name="icon_black">#000000</color>
 1756 |     <color name="icon_tint">#ff000000</color>
 1757 |     <color name="important_conversation">#f9ab00</color>
 1758 |     <color name="indicator_bright">#191c1e</color>
 1759 |     <color name="indicator_selected_color_bright">#ffffff</color>
 1760 |     <color name="indicator_selected_color_dark">#000000</color>
 1761 |     <color name="indicator_unselected_color">#66ffffff</color>
 1762 |     <color name="item_resize_frame_bright_color">#33000000</color>
 1763 |     <color name="item_resize_frame_dark_color">#99ffffff</color>
 1764 |     <color name="item_resize_handle_bright_color">#ff808080</color>
 1765 |     <color name="item_resize_handle_dark_color">#ffffffff</color>
 1766 |     <color name="item_togglebar_dialog_layout_bg_color">#14000000</color>
 1767 |     <color name="item_togglebar_dialog_layout_stroke_color">#0066ff</color>
 1768 |     <color name="item_togglebar_dialog_layout_text_color">#e6000000</color>
 1769 |     <color name="item_transform_style_color">#89000000</color>
 1770 |     <color name="launcher_activity_background_color">#f5f5f5</color>
 1771 |     <color name="launcher_add_item_text_color">#000000</color>
 1772 |     <color name="launcher_alert_panel_bg_color">#ffffffff</color>
```

原文件第 2373–2408 行：

```text
 2373 |     <color name="notification_icon_default_color">#757575</color>
 2374 |     <color name="oplus_category_name_color">#ffffffff</color>
 2375 |     <color name="oplus_deep_shortcut_system_item_bg_color">#08000000</color>
 2376 |     <color name="oplus_deep_shortcut_view_selected_color">#1f000000</color>
 2377 |     <color name="oplus_default_bg">#3dffffff</color>
 2378 |     <color name="oplus_default_bg_extreme">#3dffffff</color>
 2379 |     <color name="oplus_folder_bg_bright">#66a6a6a6</color>
 2380 |     <color name="oplus_folder_bg_dark">#66e0e0e0</color>
 2381 |     <color name="oplus_folder_icon_bg_color">#80ffffff</color>
 2382 |     <color name="oplus_hide_nav_handle_bottom_color">#33ffffff</color>
 2383 |     <color name="oplus_hide_nav_handle_middle_color">#99e4e4d0</color>
 2384 |     <color name="oplus_hide_nav_handle_top_color">#ffffffff</color>
 2385 |     <color name="oplus_launcher_folder_icon_bg_color_bright_wallpaper">#4c000000</color>
 2386 |     <color name="oplus_launcher_mainmenu_default_text_color">#ffffffff</color>
 2387 |     <color name="oplus_launcher_text_color_bright_wallpaper">#000000</color>
 2388 |     <color name="oplus_recent_clear_all_button_src">#b8000000</color>
 2389 |     <color name="oplus_relay_subheading_color">#8affffff</color>
 2390 |     <color name="oplus_relay_text_color">#e6ffffff</color>
 2391 |     <color name="oplus_relay_view_bg">#3dffffff</color>
 2392 |     <color name="oplus_shelf_list_background_color">#ffffffff</color>
 2393 |     <color name="oplus_snack_bar_background">#ffffff</color>
 2394 |     <color name="oplus_stack_layout_ps_task_top_icon_bg_color">#dedede</color>
 2395 |     <color name="oplus_task_menu_group_divider">#14000000</color>
 2396 |     <color name="page_indicator_bg">#66e0e0e0</color>
 2397 |     <color name="page_indicator_bg_dark">#66a6a6a6</color>
 2398 |     <color name="page_preview_item_background_color_focused_with_unacceptable">#80ff0000</color>
 2399 |     <color name="page_preview_item_no_space_background_color">#772c2d</color>
 2400 |     <color name="page_preview_item_twopanel_dragenter_background_color_bright">#66000000</color>
 2401 |     <color name="page_preview_item_twopanel_dragenter_background_color_dark">#b3ffffff</color>
 2402 |     <color name="page_preview_item_twopanel_selected_background_color_bright">#26000000</color>
 2403 |     <color name="page_preview_item_twopanel_selected_background_color_dark">#40ffffff</color>
 2404 |     <color name="panel_guide_layout_bg_color">#fafafa</color>
 2405 |     <color name="panel_guide_tips_description_color">#8c000000</color>
 2406 |     <color name="panel_guide_tips_title_color">#d9000000</color>
 2407 |     <color name="pending_card_container_background_color">#33ffffff</color>
 2408 |     <color name="pending_card_indicator_select_color">#8d000000</color>
```

## source-016

原文件：`D:/Project/other/ColorOS16/analysis/focused/launcher-material/com/android/launcher3/folder/big/BigFolderUtil.java`  
全文 SHA-256：`9026615e9059577a0450770b9496c942098775f9854d2161fc98393ad12e68bb`  
原始引用行：36

原文件第 30–64 行：

```text
   30 |     private static final String TAG = "BigFolderUtil";
   31 |
   32 |     private BigFolderUtil() {
   33 |     }
   34 |
   35 |     @JvmStatic
   36 |     public static final int getBigFolderDefaultBgColor(Context context) {
   37 |         Intrinsics.checkNotNullParameter(context, "context");
   38 |         if (FeatureOption.getSIsSupportTaskBar()) {
   39 |             return WallpaperResolver.INSTANCE.isWorkspaceWpBright() ? context.getResources().getColor(R.color.folder_bg_bright_wallpaper, null) : context.getResources().getColor(R.color.folder_bg_dark_wallpaper, null);
   40 |         }
   41 |         return (WallpaperResolver.INSTANCE.isWorkspaceWpBright() && OplusUIEngine.isDefaultThemeResource(1L)) ? context.getResources().getColor(R.color.oplus_folder_bg_bright, null) : context.getResources().getColor(R.color.oplus_folder_bg_dark, null);
   42 |     }
   43 |
   44 |     @JvmStatic
   45 |     private static final void saveBigFolderBgBlur(Context context) {
   46 |         try {
   47 |             JSONObject jSONObject = new JSONObject();
   48 |             jSONObject.put(OPLUS_FOLDER_BG_TYPE, 1);
   49 |             String string = jSONObject.toString();
   50 |             Intrinsics.checkNotNullExpressionValue(string, "toString(...)");
   51 |             saveToSecureSettingProvider(context, LAUNCHER_FOLDER_BG_PARAMETER, string);
   52 |         } catch (JSONException e4) {
   53 |             com.android.common.config.o.a("saveBigFolderBgBlur JSONException:", e4.getMessage(), TAG);
   54 |         }
   55 |     }
   56 |
   57 |     @JvmStatic
   58 |     private static final void saveBigFolderBgColor(Context context) {
   59 |         int bigFolderDefaultBgColor = getBigFolderDefaultBgColor(context);
   60 |         try {
   61 |             JSONObject jSONObject = new JSONObject();
   62 |             jSONObject.put(OPLUS_FOLDER_BG_TYPE, 0);
   63 |             jSONObject.put(OPLUS_FOLDER_PARAMETER, bigFolderDefaultBgColor);
   64 |             String string = jSONObject.toString();
```

## source-017

原文件：`D:/Project/other/ColorOS16/analysis/focused/launcher-material/com/android/launcher3/hotseat/expand/ExpandUtils.java`  
全文 SHA-256：`589f197be1daab359de2147e23fa3d09457249979ab729b5b780cfaa3547df8d`  
原始引用行：954

原文件第 948–982 行：

```text
  948 |     }
  949 |
  950 |     public final void setHotSeatBgColor(int i10) {
  951 |         hotSeatBgColor = i10;
  952 |     }
  953 |
  954 |     @JvmStatic
  955 |     public static final Drawable getHotseatNormalBgDrawable(Context context, float radius) {
  956 |         int color;
  957 |         Drawable drawable;
  958 |         Intrinsics.checkNotNullParameter(context, "context");
  959 |         if (FeatureOption.getSIsSupportTaskBar()) {
  960 |             color = context.getColor(WallpaperResolver.INSTANCE.isWorkspaceWpBright() ? R.color.hotseat_bg_bright_wallpaper : R.color.hotseat_bg_dark_wallpaper);
  961 |         } else {
  962 |             color = context.getColor(WallpaperResolver.INSTANCE.isWorkspaceWpBright() ? R.color.hotseat_bg_color_bright : R.color.hotseat_bg_color);
  963 |         }
  964 |         hotSeatBgColor = color;
  965 |         if (FeatureOption.getSIsSupportTaskBar()) {
  966 |             drawable = context.getDrawable(WallpaperResolver.INSTANCE.isWorkspaceWpBright() ? R.drawable.hotseat_bg_bright_wallpapaer : R.drawable.hotseat_bg_dark_wallpapaer);
  967 |         } else {
  968 |             drawable = context.getDrawable(WallpaperResolver.INSTANCE.isWorkspaceWpBright() ? R.drawable.hotseat_bg_bright : R.drawable.hotseat_bg);
  969 |         }
  970 |         if (radius > 0.0f) {
  971 |             GradientDrawable gradientDrawable = drawable instanceof GradientDrawable ? (GradientDrawable) drawable : null;
  972 |             if (gradientDrawable != null) {
  973 |                 gradientDrawable.setCornerRadius(radius);
  974 |             }
  975 |         }
  976 |         return drawable;
  977 |     }
  978 |
  979 |     @JvmStatic
  980 |     public static final void updateHotseatGridSizeIfNecessary(Launcher launcher) {
  981 |         DeviceProfile deviceProfile;
  982 |         ConfigParam configParamConfig;
```

## source-018

原文件：`D:/Project/other/ColorOS16/analysis/focused/launcher-material/com/android/launcher3/uioverrides/states/blurdrawable/BlurMaterialColor.java`  
全文 SHA-256：`05e2bfbe838e37e4cfaf2dcb2fd902aabbc8c008a2d77d2fe00ae3835973a781`  
原始引用行：10

原文件第 4–35 行：

```text
    4 | import kotlin.Metadata;
    5 |
    6 | /* JADX INFO: compiled from: OplusBlurProperties.kt */
    7 | /* JADX INFO: loaded from: classes2.dex */
    8 | @Metadata(d1 = {"\u0000\u0012\n\u0002\u0018\u0002\n\u0002\u0010\u0010\n\u0000\n\u0002\u0010\b\n\u0002\b\n\b\u0086\u0081\u0002\u0018\u00002\b\u0012\u0004\u0012\u00020\u00000\u0001B\u0017\b\u0002\u0012\u0006\u0010\u0002\u001a\u00020\u0003\u0012\u0006\u0010\u0004\u001a\u00020\u0003¢\u0006\u0002\u0010\u0005R\u0011\u0010\u0004\u001a\u00020\u0003¢\u0006\b\n\u0000\u001a\u0004\b\u0006\u0010\u0007R\u0011\u0010\u0002\u001a\u00020\u0003¢\u0006\b\n\u0000\u001a\u0004\b\b\u0010\u0007j\u0002\b\tj\u0002\b\nj\u0002\b\u000bj\u0002\b\f¨\u0006\r"}, d2 = {"Lcom/android/launcher3/uioverrides/states/blurdrawable/BlurMaterialColor;", "", "mixColor", "", "blendColor", "(Ljava/lang/String;III)V", "getBlendColor", "()I", "getMixColor", "LIGHT_NORMAL", "LIGHT_BRIGHT", "DARK_NORMAL", "DARK_BRIGHT", "OplusLauncher_OPPOPallDomesticAallRelease"}, k = 1, mv = {1, 9, 0}, xi = 48)
    9 | public enum BlurMaterialColor {
   10 |     LIGHT_NORMAL(Color.parseColor("#FF37393E"), Color.parseColor("#3D2E3033")),
   11 |     LIGHT_BRIGHT(Color.parseColor("#00000000"), Color.parseColor("#1A000000")),
   12 |     DARK_NORMAL(Color.parseColor("#A3737373"), Color.parseColor("#33999999")),
   13 |     DARK_BRIGHT(Color.parseColor("#A3737373"), Color.parseColor("#33999999"));
   14 |
   15 |     private static final /* synthetic */ o9.a $ENTRIES = kotlin.enums.a.a(values());
   16 |     private final int blendColor;
   17 |     private final int mixColor;
   18 |
   19 |     BlurMaterialColor(int i10, int i11) {
   20 |         this.mixColor = i10;
   21 |         this.blendColor = i11;
   22 |     }
   23 |
   24 |     public static o9.a<BlurMaterialColor> getEntries() {
   25 |         return $ENTRIES;
   26 |     }
   27 |
   28 |     public final int getBlendColor() {
   29 |         return this.blendColor;
   30 |     }
   31 |
   32 |     public final int getMixColor() {
   33 |         return this.mixColor;
   34 |     }
   35 | }
```

## source-019

原文件：`D:/Project/other/ColorOS16/analysis/focused/launcher/com/android/launcher/theme/LauncherIconConfig.java`  
全文 SHA-256：`e1f157f505666678cadbcbc456f46e5cadb971d7f9f668252a55425d22a12f3c`  
原始引用行：201

原文件第 195–229 行：

```text
  195 |     private static void initCheck() {
  196 |         if (sInstance == null) {
  197 |             throw new IllegalStateException("Call update to init first!");
  198 |         }
  199 |     }
  200 |
  201 |     public static boolean isDarkModeIcon() {
  202 |         initCheck();
  203 |         return sInstance.mIconConfig != null && ((sInstance.mIconConfig.isDarkModeIcon() && sInstance.mIconConfig.getTheme() == 2) || sInstance.mIconConfig.getTheme() == 3);
  204 |     }
  205 |
  206 |     public static boolean isTargetPath(Path path) {
  207 |         return path == sStickerPath || path == sOctagonPath || path == sLeafPath;
  208 |     }
  209 |
  210 |     private void loadIconSizeArrayFromXml() {
  211 |         this.mIconSizes = getIconSizeArrayFromXml(UiConfig.getCols(), UiConfig.getRows());
  212 |         this.mCategoryIconSizes = getCategoryIconSizeArrayFromXml();
  213 |         StringBuilder sb2 = new StringBuilder("loadIconSizeArrayFromXml mIconSizes:");
  214 |         sb2.append(Arrays.toString(this.mIconSizes));
  215 |         c0.c(this.mCategoryIconSizes, sb2, TAG);
  216 |     }
  217 |
  218 |     public static void updateIconConfigIfNecessary(Context context) {
  219 |         Configuration configuration;
  220 |         IconConfig iconConfig = null;
  221 |         try {
  222 |             Resources resources = context.getResources();
  223 |             configuration = ActivityManager.getService().getConfiguration();
  224 |             try {
  225 |                 iconConfig = IconConfigParser.parserConfig(resources, Long.valueOf(ConfigurationWrapper.getUxIconConfig(configuration)));
  226 |             } catch (RemoteException e4) {
  227 |                 e = e4;
  228 |                 LogUtils.toFile(TAG, "getUxIconConfig e:" + e.getMessage());
  229 |             }
```

## source-020

原文件：`D:/Project/other/ColorOS16/analysis/focused/launcher/com/android/launcher3/folder/OplusFolderAnimationManager.java`  
全文 SHA-256：`c8a19106858f2571f3be6ca5fb20c588624e9c046c92845990cb61e7988743d4`  
原始引用行：677

原文件第 671–705 行：

```text
  671 |     public void clearChildTempState() {
  672 |         this.mChildTempAnimParam.clear();
  673 |     }
  674 |
  675 |     @Override // com.android.launcher3.folder.FolderAnimationManager
  676 |     public AnimatorSet createFolderBackgroundAnimatorSet(boolean z5) {
  677 |         if (this.mColorFolder.sOPlusFolderExtV2.getContentBackground() == null) {
  678 |             return null;
  679 |         }
  680 |         ObjectAnimator objectAnimator = this.mContentBackgroundAnim;
  681 |         if (objectAnimator != null) {
  682 |             objectAnimator.cancel();
  683 |         }
  684 |         if (!z5 && !this.mColorFolder.sOPlusFolderExtV2.getContentBackground().isVisibleToUser()) {
  685 |             this.mColorFolder.sOPlusFolderExtV2.getContentBackground().setAlpha(0.0f);
  686 |             return null;
  687 |         }
  688 |         AnimatorSet animatorSet = new AnimatorSet();
  689 |         ObjectAnimator objectAnimatorOfFloat = ObjectAnimator.ofFloat(this.mColorFolder.sOPlusFolderExtV2.getContentBackground(), "alpha", z5 ? 1.0f : 0.0f);
  690 |         this.mContentBackgroundAnim = objectAnimatorOfFloat;
  691 |         if (z5) {
  692 |             objectAnimatorOfFloat.setDuration(200L);
  693 |             this.mContentBackgroundAnim.setStartDelay(this.mFolderOpenDuration);
  694 |             if (this.mColorFolder.supportFooterRecommend()) {
  695 |                 this.mColorFolder.getFooterController().updateBackgroundMargin();
  696 |             }
  697 |         } else {
  698 |             objectAnimatorOfFloat.setDuration(100L);
  699 |         }
  700 |         animatorSet.play(this.mContentBackgroundAnim);
  701 |         return animatorSet;
  702 |     }
  703 |
  704 |     /* JADX WARN: Code duplicated, block: B:48:0x0115  */
  705 |     /* JADX WARN: Code duplicated, block: B:49:0x0117  */
```

## source-021

原文件：`D:/Project/other/ColorOS16/analysis/focused/launcher/com/android/launcher3/OplusHotseat.java`  
全文 SHA-256：`f8025c49ceea9cbc13463f316379de3892ca564529959ff85217d36cb0c95eef`  
原始引用行：443, 1500

原文件第 437–471 行：

```text
  437 |         if (!bottomSearchManager.oplusFeatureSupport(((ViewGroup) this).mContext) || (bottomView = bottomSearchManager.getBottomView()) == null) {
  438 |             return;
  439 |         }
  440 |         bottomView.setTranslationY(f10);
  441 |     }
  442 |
  443 |     private Drawable updateBlurParams(float f10) {
  444 |         OplusBlurProperties.BlendColorParams blurColorParams = OplusBlurProperties.getBlurColorParams(((ViewGroup) this).mContext);
  445 |         this.mBlurProp.setBlurCornerRadius(f10, false, null, true);
  446 |         this.mBlurProp.setBlurParams(800, blurColorParams.getBlendMode(), blurColorParams.getBlendColor(), blurColorParams.getMixColor());
  447 |         this.mBlurProp.setIgnorePageScrollBlurAnim(true);
  448 |         return this.mBlurProp.getMLayerBlurDrawable();
  449 |     }
  450 |
  451 |     private void updateCellXy(boolean z5, ItemInfo itemInfo, CellLayoutLayoutParams cellLayoutLayoutParams, int i10, int i11) {
  452 |         if (z5) {
  453 |             itemInfo.setCellXY(i10, i11);
  454 |             cellLayoutLayoutParams.setCellXY(i10, i11);
  455 |             cellLayoutLayoutParams.setTmpCellXY(i10, i11);
  456 |         } else {
  457 |             cellLayoutLayoutParams.setTmpCellXY(i10, i11);
  458 |         }
  459 |         cellLayoutLayoutParams.reorderToCellX = i10;
  460 |         cellLayoutLayoutParams.reorderToCellY = i11;
  461 |     }
  462 |
  463 |     @Override // com.android.launcher3.CellLayout
  464 |     public boolean addViewToCellLayout(View view, int i10, int i11, CellLayoutLayoutParams cellLayoutLayoutParams, boolean z5) {
  465 |         boolean zAddViewToCellLayout = super.addViewToCellLayout(view, i10, i11, cellLayoutLayoutParams, z5);
  466 |         if (view instanceof BubbleTextView) {
  467 |             BubbleTextView bubbleTextView = (BubbleTextView) view;
  468 |             if (bubbleTextView.mIconSize != HotseatResizeHelper.getHotseatIconSize()) {
  469 |                 bubbleTextView.mIconSize = HotseatResizeHelper.getHotseatIconSize();
  470 |                 bubbleTextView.forceReapplyFancyIcon();
  471 |             }
```

原文件第 1494–1528 行：

```text
 1494 |     public void setCellDimensionsAndNotFix(int i10, int i11) {
 1495 |         this.mCellWidth = i10;
 1496 |         this.mCellHeight = i11;
 1497 |         this.mShortcutsAndWidgets.setCellDimensions(i10, i11, this.mCountX, this.mCountY, this.mBorderSpace);
 1498 |     }
 1499 |
 1500 |     public void setDockerBackground() {
 1501 |         if (this.mShortcutsAndWidgets.getChildCount() == 0) {
 1502 |             this.mShortcutsAndWidgets.setBackgroundResource(0);
 1503 |             return;
 1504 |         }
 1505 |         Drawable drawableCreateBlurDrawable = (OplusBlurProperties.isSupportNewBlur(((ViewGroup) this).mContext, true) && ScreenUtils.hasLargeDisplayFeatures()) ? createBlurDrawable() : ExpandUtils.getHotseatNormalBgDrawable(((ViewGroup) this).mContext, getSmoothBackgroundRadius(getMeasuredHeight()));
 1506 |         if (drawableCreateBlurDrawable != null) {
 1507 |             this.mShortcutsAndWidgets.setBackground(drawableCreateBlurDrawable);
 1508 |         }
 1509 |         setBackgroundAlpha(this.mBackgroundVisible ? 1.0f : 0.0f);
 1510 |     }
 1511 |
 1512 |     public void setNeedRefreshAfterAttached() {
 1513 |         this.mNeedRefreshAfterAttached = true;
 1514 |     }
 1515 |
 1516 |     @Override // android.view.View
 1517 |     public void setScaleX(float f10) {
 1518 |         View bottomView;
 1519 |         super.setScaleX(f10);
 1520 |         BottomSearchManager bottomSearchManager = BottomSearchManager.INSTANCE;
 1521 |         if (!bottomSearchManager.oplusFeatureSupport(((ViewGroup) this).mContext) || (bottomView = bottomSearchManager.getBottomView()) == null) {
 1522 |             return;
 1523 |         }
 1524 |         bottomView.setScaleX(f10);
 1525 |     }
 1526 |
 1527 |     @Override // android.view.View
 1528 |     public void setScaleY(float f10) {
```

## source-022

原文件：`D:/Project/other/ColorOS16/analysis/focused/launcher/com/android/launcher3/uioverrides/states/blurdrawable/OplusBlurProperties.java`  
全文 SHA-256：`7c01a6d26a43107ed324f8d7a7f05736c70950821f4ea022f446094d56b3756a`  
原始引用行：350, 822

原文件第 344–378 行：

```text
  344 |             RenderEffect renderEffectCreateBlurEffect = RenderEffect.createBlurEffect(start, end, Shader.TileMode.MIRROR);
  345 |             Intrinsics.checkNotNullExpressionValue(renderEffectCreateBlurEffect, "createBlurEffect(...)");
  346 |             OplusViewBackgroundRenderEffect.setBackgroundRenderEffect(renderEffectCreateBlurEffect, view);
  347 |         }
  348 |
  349 |         @JvmStatic
  350 |         public final boolean isBlurEnable(Context context) {
  351 |             Intrinsics.checkNotNullParameter(context, "context");
  352 |             return isBlurServiceInstalled(context) && isMaterialBlurJumpSupported();
  353 |         }
  354 |
  355 |         @JvmStatic
  356 |         public final boolean isMaterialBlurDrawSupported() {
  357 |             return OplusBlurProperties.INSTANCE.getSysMaterialBlurSwitchEnable() && (LauncherAnimConfig.isLevelAOrAPlus() || AppFeatureUtils.INSTANCE.isUpgradeMaterialBlur() || LauncherAnimConfig.isLevelBPlusOrHigher());
  358 |         }
  359 |
  360 |         @JvmStatic
  361 |         public final boolean isMaterialBlurJumpSupported() {
  362 |             return LauncherAnimConfig.isLevelAOrAPlus() || AppFeatureUtils.INSTANCE.isUpgradeMaterialBlur();
  363 |         }
  364 |
  365 |         @JvmStatic
  366 |         public final boolean isSupportDrawerBlur() {
  367 |             return !AppFeatureUtils.INSTANCE.isMixColorsDisable() && LauncherAnimConfig.isLevelAPlus() && getSysMaterialBlurSwitchEnable();
  368 |         }
  369 |
  370 |         @JvmStatic
  371 |         public final boolean isSupportDrawerBtnBlur() {
  372 |             return !AppFeatureUtils.INSTANCE.isMixColorsDisable() && LauncherAnimConfig.isLevelAOrAPlus() && getSysMaterialBlurSwitchEnable();
  373 |         }
  374 |
  375 |         @JvmStatic
  376 |         public final boolean isSupportNewBlur(Context context, boolean isLocalBlur) {
  377 |             Intrinsics.checkNotNullParameter(context, "context");
  378 |             if (OplusBlurProperties.mSysMaterialBlurSwitchEnable) {
```

原文件第 816–850 行：

```text
  816 |                 }
  817 |                 return null;
  818 |             }
  819 |         }
  820 |
  821 |         @JvmStatic
  822 |         public final BlendColorParams getBlurColorParams(Context context, boolean isBright, boolean isExtremeDark) {
  823 |             BlurMaterialColor blurMaterialColor;
  824 |             Intrinsics.checkNotNullParameter(context, "context");
  825 |             boolean zIsDarkMode = ThemeUtils.INSTANCE.isDarkMode(context);
  826 |             int i10 = zIsDarkMode ? 4 : 3;
  827 |             if (zIsDarkMode) {
  828 |                 if (isBright) {
  829 |                     blurMaterialColor = BlurMaterialColor.DARK_BRIGHT;
  830 |                 } else {
  831 |                     blurMaterialColor = BlurMaterialColor.DARK_NORMAL;
  832 |                 }
  833 |             } else if (isBright) {
  834 |                 blurMaterialColor = BlurMaterialColor.LIGHT_BRIGHT;
  835 |             } else {
  836 |                 blurMaterialColor = BlurMaterialColor.LIGHT_NORMAL;
  837 |             }
  838 |             return new BlendColorParams(i10, blurMaterialColor.getBlendColor(), blurMaterialColor.getMixColor());
  839 |         }
  840 |     }
  841 |
  842 |     public OplusBlurProperties(Context context, LayerBlurDrawable layerBlurDrawable) {
  843 |         Intrinsics.checkNotNullParameter(context, "context");
  844 |         this.mLayerBlurDrawable = layerBlurDrawable;
  845 |         this.contextRef = new WeakReference<>(context);
  846 |     }
  847 |
  848 |     @JvmStatic
  849 |     public static final BlendColorParams getBlurColorParams(Context context) {
  850 |         return INSTANCE.getBlurColorParams(context);
```

## source-030

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-folder-material-detail-20261111/com/android/launcher/views/AGSLGradientStrokeParam.java`  
全文 SHA-256：`b5737c1d3b7ea17aa8d5b03552bacdc20f945debd60d749e4e5d67274251cd69`  
原始引用行：583

原文件第 577–586 行：

```text
  577 |         this.farLineFadeTowardsCenter1 = f25;
  578 |         this.farLineFadeTowardsCenter2 = f26;
  579 |         this.hostType = hostType;
  580 |         this.mFadeToSide2Ratio = 5;
  581 |     }
  582 |
  583 |     public /* synthetic */ AGSLGradientStrokeParam(float f10, float f11, GradientStrokeShader.CornerType cornerType, float f12, float f13, int i10, float f14, int i11, int i12, float f15, float f16, float f17, float f18, float f19, float f20, float f21, float f22, float f23, float f24, float f25, float f26, String str, int i13, DefaultConstructorMarker defaultConstructorMarker) {
  584 |         this((i13 & 1) != 0 ? 0.0f : f10, (i13 & 2) != 0 ? 0.0f : f11, (i13 & 4) != 0 ? GradientStrokeShader.CornerType.FULL : cornerType, (i13 & 8) != 0 ? 1.0f : f12, (i13 & 16) != 0 ? 10.0f : f13, (i13 & 32) != 0 ? -1 : i10, (i13 & 64) == 0 ? f14 : 1.0f, (i13 & 128) != 0 ? 0 : i11, (i13 & 256) == 0 ? i12 : 0, (i13 & 512) != 0 ? 6.0f : f15, (i13 & 1024) != 0 ? 0.35f : f16, (i13 & 2048) != 0 ? 0.0f : f17, (i13 & 4096) != 0 ? 0.0f : f18, (i13 & 8192) != 0 ? 0.0f : f19, (i13 & 16384) != 0 ? 0.0f : f20, (i13 & 32768) != 0 ? 6.0f : f21, (i13 & 65536) != 0 ? 0.2f : f22, (i13 & 131072) != 0 ? 0.0f : f23, (i13 & 262144) != 0 ? 0.0f : f24, (i13 & 524288) != 0 ? 0.0f : f25, (i13 & 1048576) != 0 ? 0.0f : f26, (i13 & 2097152) != 0 ? "default" : str);
  585 |     }
  586 | }
```

## source-031

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-folder-material-detail-20261111/com/android/launcher/views/TextureStrokeController.java`  
全文 SHA-256：`d08c871f4dd01c43acce45a20f88350edee98e142227d8437359282b7ab0cfaf`  
原始引用行：38

原文件第 32–66 行：

```text
   32 | /* JADX INFO: compiled from: TextureStrokeController.kt */
   33 | /* JADX INFO: loaded from: classes.dex */
   34 | @Metadata(d1 = {"\u0000>\n\u0002\u0018\u0002\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0010\u000b\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0002\b\u0003\n\u0002\u0010\b\n\u0002\b\u0005\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0002\b\u0007\n\u0002\u0010\u000e\n\u0002\b\u0004\bÆ\u0002\u0018\u00002\u00020\u0001B\t\b\u0002¢\u0006\u0004\b\u0002\u0010\u0003J\u0015\u0010\u0007\u001a\u00020\u00062\u0006\u0010\u0005\u001a\u00020\u0004¢\u0006\u0004\b\u0007\u0010\bJ\u0015\u0010\u000b\u001a\u00020\u00042\u0006\u0010\n\u001a\u00020\t¢\u0006\u0004\b\u000b\u0010\fJ\u0015\u0010\u000f\u001a\u00020\u00062\u0006\u0010\u000e\u001a\u00020\r¢\u0006\u0004\b\u000f\u0010\u0010J\r\u0010\u0011\u001a\u00020\u0004¢\u0006\u0004\b\u0011\u0010\u0012J\u001b\u0010\u0016\u001a\u00020\u00062\f\u0010\u0015\u001a\b\u0012\u0004\u0012\u00020\u00140\u0013¢\u0006\u0004\b\u0016\u0010\u0017R\u0016\u0010\u0018\u001a\u00020\r8\u0002@\u0002X\u0082\u000e¢\u0006\u0006\n\u0004\b\u0018\u0010\u0019R\u0016\u0010\u001a\u001a\u00020\u00048\u0002@\u0002X\u0082\u000e¢\u0006\u0006\n\u0004\b\u001a\u0010\u001bR\u0014\u0010\u001f\u001a\u00020\u001c8VX\u0096\u0004¢\u0006\u0006\u001a\u0004\b\u001d\u0010\u001e¨\u0006 "}, d2 = {"Lcom/android/launcher/views/TextureStrokeController;", "Lcom/android/launcher/pageindicators/decorate/DebugApi;", "<init>", "()V", "", "isOn", "Lk9/n;", "onBlurSwitchChange", "(Z)V", "Landroid/content/Context;", "context", "isBlurOpen", "(Landroid/content/Context;)Z", "", "state", "onTextureStrokeSwitchChange", "(I)V", "isTextureStrokeOpen", "()Z", "Lkotlin/Function0;", "", SettingsDynamicConstants.KEY_BLOCK, "runWhenTextureStrokeEnable", "(Lkotlin/jvm/functions/Function0;)V", "mTextureStokeFlag", "I", "mBlurEnable", "Z", "", "getTag", "()Ljava/lang/String;", "tag", "OplusLauncher_OPPOPallDomesticAallRelease"}, k = 1, mv = {1, 9, 0}, xi = 48)
   35 | public final class TextureStrokeController implements DebugApi {
   36 |     private static boolean mBlurEnable;
   37 |     public static final TextureStrokeController INSTANCE = new TextureStrokeController();
   38 |     private static int mTextureStokeFlag = -1;
   39 |
   40 |     private TextureStrokeController() {
   41 |     }
   42 |
   43 |     /* JADX INFO: Access modifiers changed from: private */
   44 |     public static final void onTextureStrokeSwitchChange$lambda$2$lambda$1(Function0 refreshAction) {
   45 |         Intrinsics.checkNotNullParameter(refreshAction, "$refreshAction");
   46 |         refreshAction.invoke();
   47 |     }
   48 |
   49 |     @Override // com.android.launcher.pageindicators.decorate.DebugApi
   50 |     public String getTag() {
   51 |         return "TextureStrokeController";
   52 |     }
   53 |
   54 |     public final boolean isBlurOpen(Context context) {
   55 |         Intrinsics.checkNotNullParameter(context, "context");
   56 |         if (mBlurEnable) {
   57 |             return OplusBlurProperties.INSTANCE.isBlurEnable(context);
   58 |         }
   59 |         return false;
   60 |     }
   61 |
   62 |     public final boolean isTextureStrokeOpen() {
   63 |         return mTextureStokeFlag == 1;
   64 |     }
   65 |
   66 |     public final void onBlurSwitchChange(boolean isOn) {
```

## source-032

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-folder-material-detail-20261111/com/android/launcher3/folder/OplusPreviewBackground.java`  
全文 SHA-256：`4780549ebcde766904b1b9c9ab86688feb87fe4b7431f3118bebd45d20f0721c`  
原始引用行：263, 732

原文件第 257–291 行：

```text
  257 |         int spanX;
  258 |         FolderIcon folderIcon;
  259 |         FolderInfo folderInfo;
  260 |         if (context == null) {
  261 |             return;
  262 |         }
  263 |         OplusBlurProperties.BlendColorParams blurColorParams = OplusBlurProperties.getBlurColorParams(this.mContext);
  264 |         initBgViewIfNeed(context, view);
  265 |         if (!(view instanceof FolderIcon) || (folderInfo = (folderIcon = (FolderIcon) view).mInfo) == null) {
  266 |             int[] iArr = this.mCreateSpanXY;
  267 |             if (iArr != null) {
  268 |                 spanX = iArr[0];
  269 |                 spanY = iArr[1];
  270 |             } else {
  271 |                 spanY = 0;
  272 |                 spanX = 0;
  273 |             }
  274 |         } else {
  275 |             spanX = folderInfo.getSpanX();
  276 |             spanY = folderIcon.mInfo.getSpanY();
  277 |         }
  278 |         OplusBlurProperties oplusBlurProperties = this.mBlurProp;
  279 |         if (oplusBlurProperties == null || oplusBlurProperties.getMLayerBlurDrawable() == null) {
  280 |             this.mBlurProp = OplusBlurProperties.prepareBlur(view, context, z5, false, (IconUtils.isMiddle(spanX, spanY) && IconUtils.isIconRadiusRound()) ? 9 : 1);
  281 |         }
  282 |         if (this.mBlurProp != null) {
  283 |             boolean z10 = TransitionManager.isHotseatIcon(view) || (view instanceof OplusHotseat);
  284 |             this.mBlurProp.setIgnorePageScrollBlurAnim(z10);
  285 |             if (ScreenUtils.hasLargeDisplayFeatures()) {
  286 |                 if (z10 && this.mBlurProp.getMLayerBlurDrawable() != null) {
  287 |                     this.mBlurProp.getMLayerBlurDrawable().setBlurAlpha(0.0f);
  288 |                 }
  289 |                 this.mBlurProp.setSkipFadeBlurAnimaWhenStateTransition(z10);
  290 |             }
  291 |             this.mBlurProp.setBlurCornerRadius(this.mRadius, true, CommonUtils.getItemInfo(view));
```

原文件第 726–760 行：

```text
  726 |
  727 |     public int getScaleSize(boolean z5) {
  728 |         return (int) (this.mScale * (z5 ? this.mPreviewSizeX : this.mPreviewSizeY));
  729 |     }
  730 |
  731 |     /* JADX WARN: Multi-variable type inference failed */
  732 |     public void initBgDrawable(Context context, View view, ActivityContext activityContext) {
  733 |         Context context2;
  734 |         if (context == null || view == 0 || activityContext == null || (context2 = this.mContext) == null) {
  735 |             LogUtils.e(TAG, "initBgDrawable: context = " + context + ", invalidateDelegate = " + view + ", activity = " + activityContext + ", mContext = " + this.mContext);
  736 |             return;
  737 |         }
  738 |         if (isBgSupportNewBlur(context2)) {
  739 |             initBlurDrawable(context, view, false);
  740 |         } else {
  741 |             this.mBgDrawable = getNormalDrawable(context);
  742 |             recycleBlurBackground();
  743 |         }
  744 |         if (view instanceof IGroupView) {
  745 |             setBackground((IGroupView) view);
  746 |         }
  747 |         if (this.mBgDrawable == null) {
  748 |             StringBuilder sb2 = new StringBuilder("initBgDrawable: mBgDrawable=null blur=");
  749 |             sb2.append(isBgSupportNewBlur(this.mContext));
  750 |             sb2.append(" blurProp=");
  751 |             sb2.append(this.mBlurProp != null);
  752 |             sb2.append(" delegate=");
  753 |             sb2.append(view.getClass().getSimpleName());
  754 |             LogUtils.i(TAG, sb2.toString());
  755 |         }
  756 |     }
  757 |
  758 |     public void initBgViewIfNeed(Context context, View view) {
  759 |         if (this.mBgView == null) {
  760 |             this.mBgView = new FolderRoundImageView(this.mRadius, context);
```

## source-033

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-folder-material-reference-20261111/com/android/launcher3/uioverrides/states/blurdrawable/LayerBlurDrawable.java`  
全文 SHA-256：`4e8cda390efc69706785aa3660d97252a7c2adad8748772d8a3f42488ac0c7ea`  
原始引用行：116, 380, 427, 624

原文件第 110–144 行：

```text
  110 |     public static final class Companion {
  111 |         public /* synthetic */ Companion(DefaultConstructorMarker defaultConstructorMarker) {
  112 |             this();
  113 |         }
  114 |
  115 |         @JvmStatic
  116 |         public final float getBlurAlphaByState(LauncherState state) {
  117 |             Intrinsics.checkNotNullParameter(state, "state");
  118 |             if (Intrinsics.areEqual(state, LauncherState.NORMAL)) {
  119 |                 return 1.0f;
  120 |             }
  121 |             return Intrinsics.areEqual(state, LauncherState.SPRING_LOADED) ? true : Intrinsics.areEqual(state, LauncherState.PAGE_PREVIEW) ? true : Intrinsics.areEqual(state, LauncherState.TOGGLE_BAR) ? 0.0f : 1.0f;
  122 |         }
  123 |
  124 |         @JvmStatic
  125 |         public final int getDefaultBgColor(Context context) {
  126 |             Intrinsics.checkNotNullParameter(context, "context");
  127 |             return context.getColor(WallpaperResolver.INSTANCE.isWorkspaceWpBright() ? R.color.oplus_default_bg_extreme : R.color.oplus_default_bg);
  128 |         }
  129 |
  130 |         private Companion() {
  131 |         }
  132 |
  133 |         /* JADX INFO: Access modifiers changed from: private */
  134 |         public final GradientDrawableWrapper createDefaultDrawable(Context context, int type) {
  135 |             GradientDrawable gradientDrawable;
  136 |             if (type == 1) {
  137 |                 Drawable drawableMutate = context.getResources().getDrawable(R.drawable.smooth_default_big_drawable).mutate();
  138 |                 Intrinsics.checkNotNull(drawableMutate, "null cannot be cast to non-null type android.graphics.drawable.GradientDrawable");
  139 |                 gradientDrawable = (GradientDrawable) drawableMutate;
  140 |                 gradientDrawable.setColor(LayerBlurDrawable.INSTANCE.getDefaultBgColor(context));
  141 |                 gradientDrawable.setAlpha(0);
  142 |             } else if (type != 9) {
  143 |                 gradientDrawable = new GradientDrawable();
  144 |                 gradientDrawable.setColor(LayerBlurDrawable.INSTANCE.getDefaultBgColor(context));
```

原文件第 374–408 行：

```text
  374 |
  375 |     /* JADX INFO: renamed from: isBreenoBlurAnimRunning, reason: from getter */
  376 |     public final boolean getIsBreenoBlurAnimRunning() {
  377 |         return this.isBreenoBlurAnimRunning;
  378 |     }
  379 |
  380 |     public final void refreshBlurDrawableParam() {
  381 |         if (!TextureStrokeController.INSTANCE.isTextureStrokeOpen() || !this.mTempShowTextureStroke) {
  382 |             this.mBlurDrawable.setGradientStrokeLineParams(null);
  383 |             return;
  384 |         }
  385 |         float f10 = this.mRadius;
  386 |         if (f10 == 0.0f) {
  387 |             return;
  388 |         }
  389 |         this.mAGSLGradientStrokeParam.setCorner(f10);
  390 |         this.mAGSLGradientStrokeParam.updateParam(this.mOriginBounds.width(), this.mOriginBounds.height(), this.mRadius);
  391 |         this.mBlurDrawable.setGradientStrokeLineParams(this.mAGSLGradientStrokeParam.getGradientStrokeParams());
  392 |         if (this.mDefaultDrawable.getMCornerType() != GradientStrokeShader.CornerType.BEZIER) {
  393 |             this.mBlurDrawable.setCornerRadius(this.mRadius);
  394 |             return;
  395 |         }
  396 |         GradientStrokeCornerParams gradientStrokeCornerParams = this.mGradientStrokeCornerParams;
  397 |         gradientStrokeCornerParams.setRadius(this.mRadius);
  398 |         gradientStrokeCornerParams.setWeight(this.mDefaultDrawable.getMCornerWeight());
  399 |         this.mBlurDrawable.setGradientStrokeCornerParams(gradientStrokeCornerParams);
  400 |     }
  401 |
  402 |     public final void restoreDefaultColor() {
  403 |         Context context = this.mWeakLauncher.get();
  404 |         if (context != null) {
  405 |             this.mDefaultDrawable.setColor(INSTANCE.getDefaultBgColor(context));
  406 |         }
  407 |         setBlurAlpha(1.0f);
  408 |     }
```

原文件第 421–455 行：

```text
  421 |         }
  422 |         this.mWholeAlpha = alpha / 255;
  423 |         updateLayerDrawableAlpha();
  424 |         logIfFolderBlurFullyTransparentIfChanged("setAlpha");
  425 |     }
  426 |
  427 |     public final void setBlurAlpha(float alpha) {
  428 |         this.mBlurAlpha = alpha;
  429 |         this.mDefaultAlpha = 1 - alpha;
  430 |         updateLayerDrawableAlpha();
  431 |         logIfFolderBlurFullyTransparentIfChanged("setBlurAlpha");
  432 |     }
  433 |
  434 |     @Override // android.graphics.drawable.Drawable
  435 |     public void setBounds(Rect rect) {
  436 |         Intrinsics.checkNotNullParameter(rect, "rect");
  437 |         super.setBounds(rect);
  438 |         this.mDefaultDrawable.setBounds(rect);
  439 |         this.mBlurDrawable.setBounds(rect);
  440 |         GradientDrawable gradientDrawable = this.mGlassFrameDrawable;
  441 |         if (gradientDrawable == null) {
  442 |             return;
  443 |         }
  444 |         gradientDrawable.setBounds(rect);
  445 |     }
  446 |
  447 |     public final void setBreenoBlurAnimRunning(boolean z5) {
  448 |         this.isBreenoBlurAnimRunning = z5;
  449 |     }
  450 |
  451 |     public final void setCornerRadius(float f10, boolean z5, ItemInfo itemInfo) {
  452 |         setCornerRadius$default(this, f10, z5, itemInfo, false, 8, null);
  453 |     }
  454 |
  455 |     public final void setIgnorePageScrollBlurAnim(boolean isIgnore) {
```

原文件第 618–652 行：

```text
  618 |         Intrinsics.checkNotNullParameter(mBlurDrawable, "mBlurDrawable");
  619 |         Intrinsics.checkNotNullParameter(mDefaultDrawable, "mDefaultDrawable");
  620 |         this.type = i10;
  621 |         this.mBlurDrawable = mBlurDrawable;
  622 |         this.mDefaultDrawable = mDefaultDrawable;
  623 |         this.mNeedAlphaFadeIn = z5;
  624 |         if (FeatureOption.isRLMDevice) {
  625 |             GradientDrawable glassBgDrawable = OplusToolUtils.INSTANCE.getGlassBgDrawable(context, i10, true);
  626 |             this.mGlassFrameDrawable = glassBgDrawable;
  627 |             if (glassBgDrawable != null) {
  628 |                 addLayer(glassBgDrawable);
  629 |             }
  630 |         }
  631 |         this.mBlurAlpha = 1.0f;
  632 |         this.mDefaultAlpha = 1.0f;
  633 |         this.mWholeAlpha = 1.0f;
  634 |         this.mBlurFadeAnim = kotlin.a.b(new Function0<SpringAnimation>() { // from class: com.android.launcher3.uioverrides.states.blurdrawable.LayerBlurDrawable$mBlurFadeAnim$2
  635 |             {
  636 |                 super(0);
  637 |             }
  638 |
  639 |             /* JADX WARN: Can't rename method to resolve collision */
  640 |             @Override // kotlin.jvm.functions.Function0
  641 |             public final SpringAnimation invoke() {
  642 |                 SpringAnimation springAnimation = new SpringAnimation(this.this$0, (FloatProperty<LayerBlurDrawable>) LayerBlurDrawable.BLUR_ALPHA);
  643 |                 springAnimation.setSpring(new SpringForce(0.0f).setStiffness(300.0f).setDampingRatio(1.0f));
  644 |                 springAnimation.setMinimumVisibleChange(0.01f);
  645 |                 return springAnimation;
  646 |             }
  647 |         });
  648 |         WeakReference<Context> weakReference = new WeakReference<>(context);
  649 |         this.mWeakLauncher = weakReference;
  650 |         Context context2 = weakReference.get();
  651 |         if (context2 == null) {
  652 |             fFloatValue = 1.0f;
```

## source-034

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-launcher-backend-analysis-20261111/com/oplus/posteffect/BlurDrawable.java`  
全文 SHA-256：`e5bc79ddf26dbd5975472ebda14af4332318b43ad51813b27d750bb01fdcd3d8`  
原始引用行：68

原文件第 62–74 行：

```text
   62 |
   63 |     public final void setOnRemovedAction(Function1<? super BlurDrawable, n> function1) {
   64 |         this.onRemovedAction = function1;
   65 |     }
   66 |
   67 |     /* JADX WARN: 'super' call moved to the top of the method (can break code semantics) */
   68 |     public BlurDrawable(SurfaceControl surfaceControl, Context context, boolean z5, Function1<? super BlurDrawable, n> function1) {
   69 |         super(surfaceControl, context, true);
   70 |         Intrinsics.checkNotNullParameter(surfaceControl, "surfaceControl");
   71 |         Intrinsics.checkNotNullParameter(context, "context");
   72 |         this.onRemovedAction = function1;
   73 |     }
   74 | }
```

## source-035

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-launcher-backend-analysis-20261111/com/oplus/posteffect/BlurParam.java`  
全文 SHA-256：`8778234f2c109f58a5b563b387d99b2ac2299aef0c0d6de4997ce3a085e57000`  
原始引用行：346, 436

原文件第 340–374 行：

```text
  340 |     }
  341 |
  342 |     public final void setZoomScale(float f10) {
  343 |         this.zoomScale = f10;
  344 |     }
  345 |
  346 |     public final float[] toFloatArray(boolean enableBlurShader) {
  347 |         float f10;
  348 |         float fBlue;
  349 |         float f11;
  350 |         float fRed;
  351 |         int sBlendTypeValue = BlurDrawableManager.INSTANCE.getSBlendTypeValue();
  352 |         boolean z5 = !Log.isDebug() || sBlendTypeValue == -1 ? !enableBlurShader : sBlendTypeValue == 2;
  353 |         float f12 = this.blurType;
  354 |         float f13 = this.blurRadius;
  355 |         Rect rect = this.blurArea;
  356 |         float f14 = rect.left;
  357 |         float f15 = rect.top;
  358 |         float f16 = rect.right;
  359 |         float f17 = rect.bottom;
  360 |         float f18 = z5 ? this.blendMode : 0.0f;
  361 |         float fRed2 = z5 ? Color.red(this.blendColorA) / 255.0f : 0.0f;
  362 |         float fGreen = z5 ? Color.green(this.blendColorA) / 255.0f : 0.0f;
  363 |         float fBlue2 = z5 ? Color.blue(this.blendColorA) / 255.0f : 0.0f;
  364 |         float fAlpha = z5 ? Color.alpha(this.blendColorA) / 255.0f : 0.0f;
  365 |         float fRed3 = z5 ? Color.red(this.blendColorB) / 255.0f : 0.0f;
  366 |         float fGreen2 = z5 ? Color.green(this.blendColorB) / 255.0f : 0.0f;
  367 |         if (z5) {
  368 |             f10 = 255.0f;
  369 |             fBlue = Color.blue(this.blendColorB) / 255.0f;
  370 |         } else {
  371 |             f10 = 255.0f;
  372 |             fBlue = 0.0f;
  373 |         }
  374 |         float f19 = fBlue;
```

原文件第 430–439 行：

```text
  430 |         setMaterialParams(mode, topLayerColor, bottomLayerColor);
  431 |         this.wrappingType = wrappingType;
  432 |         this.zoomScale = zoomScale;
  433 |         this.rotation = rotation;
  434 |     }
  435 |
  436 |     public /* synthetic */ BlurParam(int i10, int i11, int i12, int i13, int i14, int i15, int i16, int i17, Rect rect, float f10, Wrapping wrapping, int i18, PointF pointF, int i19, DefaultConstructorMarker defaultConstructorMarker) {
  437 |         this((i19 & 1) != 0 ? 0 : i10, (i19 & 2) != 0 ? 0 : i11, (i19 & 4) != 0 ? 0 : i12, (i19 & 8) != 0 ? 0 : i13, (i19 & 16) != 0 ? 0 : i14, (i19 & 32) != 0 ? 0 : i15, (i19 & 64) != 0 ? 0 : i16, (i19 & 128) != 0 ? 0 : i17, (i19 & 256) != 0 ? new Rect(0, 0, 0, 0) : rect, (i19 & 512) != 0 ? 1.0f : f10, (i19 & 1024) != 0 ? Wrapping.MIRRORED_REPEAT : wrapping, (i19 & 2048) != 0 ? -1 : i18, (i19 & 4096) != 0 ? new PointF(0.0f, 1.0f) : pointF);
  438 |     }
  439 | }
```

## source-036

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-launcher-continuous-analysis-20261111/com/oplus/posteffect/drawable/ContinuousBlurDrawable.java`  
全文 SHA-256：`c9d0dfd704b4724a9f23002d0c018716bd5f53245fd065beafa372a5582d0f40`  
原始引用行：83, 164

原文件第 77–111 行：

```text
   77 |         if ((i10 & 1) != 0) {
   78 |             z5 = false;
   79 |         }
   80 |         continuousBlurDrawable.removeBlurDrawable(z5);
   81 |     }
   82 |
   83 |     private final void setBlurParamsInternal(BlurParam backgroundParams, ForegroundBlurParam foregroundParams, boolean isSyncBinder) {
   84 |         boolean zIsDiffBlur;
   85 |         synchronized (getDataLock()) {
   86 |             try {
   87 |                 boolean foreColorParams = setForeColorParams(foregroundParams);
   88 |                 if (!Intrinsics.areEqual(getBlurParam(), backgroundParams) || foreColorParams) {
   89 |                     if (getEnableShader()) {
   90 |                         zIsDiffBlur = getBlurParam().isDiffBlur(backgroundParams);
   91 |                         if (getBlurParam().getZoomScale() != backgroundParams.getZoomScale()) {
   92 |                             setMatrixDirty(true);
   93 |                         }
   94 |                         if (getBlurParam().isDiffBlend(backgroundParams) || foreColorParams) {
   95 |                             getBlurShader().setBgAndFgBlendParams(backgroundParams, getForegroundBlurParams());
   96 |                         }
   97 |                         invalidate();
   98 |                     } else {
   99 |                         zIsDiffBlur = true;
  100 |                     }
  101 |                     getBlurParam().copyFrom(backgroundParams);
  102 |                     if (!isValidBlurRadius()) {
  103 |                         invalidate();
  104 |                         Log.w(TAG, "[setBlurParamsInternal] drawable " + getDrawableId() + " blurRadius is 0, removeBlurDrawable");
  105 |                         removeBlurDrawable$default(this, false, 1, null);
  106 |                         releasePendingBitmap();
  107 |                         return;
  108 |                     }
  109 |                     Log.d(TAG, "[setBlurParamsInternal] drawable=" + getDrawableId() + " params=" + getBlurParam() + " requestUpdate=" + zIsDiffBlur);
  110 |                     syncBlurParams(zIsDiffBlur, isSyncBinder);
  111 |                 }
```

原文件第 158–192 行：

```text
  158 |
  159 |     public final boolean isExclusive() {
  160 |         return this.exclusive.get();
  161 |     }
  162 |
  163 |     @Override // com.oplus.posteffect.drawable.BaseDrawable
  164 |     public void onDrawBlurContent() {
  165 |         if (!this.isRegistered) {
  166 |             releaseDrawingBitmap();
  167 |             return;
  168 |         }
  169 |         if (getContentDirty()) {
  170 |             setContentDirty(false);
  171 |             BaseDrawable.ImageInfo drawingImageInfo = getDrawingImageInfo();
  172 |             BlurImage image = drawingImageInfo != null ? drawingImageInfo.getImage() : null;
  173 |             RecordingCanvas canvas = getRenderNode().beginRecording();
  174 |             if (image == null || image.getIsRecycled()) {
  175 |                 Intrinsics.checkNotNullExpressionValue(canvas, "canvas");
  176 |                 drawPlaceholder(canvas, getPaint());
  177 |             } else {
  178 |                 getBlurShaderPaint().setShader(getEnableShader() ? getBlurShader().getShaderOrNull() : null);
  179 |                 if (getBlurShaderPaint().getShader() != null) {
  180 |                     Intrinsics.checkNotNullExpressionValue(canvas, "canvas");
  181 |                     drawBlurShader(canvas);
  182 |                 } else if (getPaintAlpha() != 0) {
  183 |                     Intrinsics.checkNotNullExpressionValue(canvas, "canvas");
  184 |                     drawBlur(canvas, getPaint(), image.require(), getForegroundBlurParams());
  185 |                 }
  186 |             }
  187 |             getRenderNode().endRecording();
  188 |             getPaint().reset();
  189 |         }
  190 |     }
  191 |
  192 |     @Override // com.oplus.posteffect.drawable.BaseDrawable
```

## source-037

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-launcher-dark-icons-analysis-20261111/com/android/launcher3/folder/OplusFolder.java`  
全文 SHA-256：`d08a8bf6667136526f939d580acc7417990a09b0bed81c18bd6ddb759d4b5cf9`  
原始引用行：1550

原文件第 1544–1578 行：

```text
 1544 |         }
 1545 |         checkFolderIconExist(true, false);
 1546 |         this.mDragItemPendingAddBack.add(dragObject);
 1547 |         this.mItemsInvalidated = true;
 1548 |     }
 1549 |
 1550 |     @Override // com.android.launcher3.folder.Folder, android.view.View
 1551 |     public void onFinishInflate() {
 1552 |         int i10;
 1553 |         int dimensionPixelSize;
 1554 |         super.onFinishInflate();
 1555 |         FontManager.setSuitableFontSize(this.mFolderName, getLauncher(), R.dimen.folder_name_text_size, 2);
 1556 |         ImageView imageView = (ImageView) findViewById(R.id.folder_animator_background);
 1557 |         this.mContentAnimationBackground = imageView;
 1558 |         int navigationBarHeight = 0;
 1559 |         imageView.setForceDarkAllowed(false);
 1560 |         if (FeatureOption.getSIsSupportTaskBar()) {
 1561 |             i10 = WallpaperResolver.isWorkspaceWpBright() ? R.drawable.folder_icon_bg_bright_wallpaper : R.drawable.folder_icon_bg_dark_wallpaper;
 1562 |         } else {
 1563 |             i10 = WallpaperResolver.isWorkspaceWpBright() ? R.drawable.folder_icon_bg_bright : R.drawable.folder_icon_bg;
 1564 |         }
 1565 |         this.mContentAnimationBackground.setBackground(((LinearLayout) this).mContext.getDrawable(i10));
 1566 |         this.mFolderContentRoot = (FrameLayout) findViewById(R.id.folder_content_root);
 1567 |         this.mFolderHeader = (ConstraintLayout) findViewById(R.id.folder_header);
 1568 |         if (Utilities.isRtl(((LinearLayout) this).mContext.getResources())) {
 1569 |             this.mFolderHeader.setLayoutDirection(1);
 1570 |         } else {
 1571 |             this.mFolderHeader.setLayoutDirection(0);
 1572 |         }
 1573 |         OplusPageIndicator oplusPageIndicator = (OplusPageIndicator) findViewById(R.id.folder_page_indicator);
 1574 |         this.mIndicator = oplusPageIndicator;
 1575 |         oplusPageIndicator.updateContent();
 1576 |         this.mFolderHeader.setOnClickListener(new com.android.launcher.powersave.m(this, 1));
 1577 |         this.mFolderRecommendSetting = (ImageView) findViewById(R.id.folder_recommend_setting);
 1578 |         fitRecommendedSettingBtn();
```

## source-038

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-launcher-dark-icons-analysis-20261111/com/oplus/uxicon/ui/morphicon/StylePrefixAdapter.java`  
全文 SHA-256：`e569fd77207eb8f503626383de288bf1e3bb3a0aca77cf50725cf1bcc4183633`  
原始引用行：32

原文件第 26–35 行：

```text
   26 |         if (iconConfig.getTheme() == 7) {
   27 |             return new StylePrefix(7, "rec_night", null);
   28 |         }
   29 |         return iconConfig.getTheme() == 6 ? new StylePrefix(6, null, UxIconLoaderUtil.getInstance().getCommonStylePrefixExceptRect(3)) : new StylePrefix(2, null, null);
   30 |     }
   31 |
   32 |     public final StylePrefix getNightStyleName() {
   33 |         return new StylePrefix(2, "rec_night", null);
   34 |     }
   35 | }
```

## source-039

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-launcher-dark-icons-analysis-20261111/com/oplus/uxicon/ui/util/UxIconLoaderUtil.java`  
全文 SHA-256：`03c6a8fb8420378110a83afb5d9b737c27c27bbe1afdac7698ea349d53ef6163`  
原始引用行：83, 2400, 2434, 2804

原文件第 77–111 行：

```text
   77 | import java.util.function.Function;
   78 | import kotlin.Pair;
   79 |
   80 | /* JADX INFO: loaded from: classes3.dex */
   81 | public class UxIconLoaderUtil {
   82 |     private static final int APPICON_FG_DEF_SIZE = 240;
   83 |     public static final String BG_COLOR_MORPH_ICON_DARK_THEME_FIRST = "#383838";
   84 |     public static final String BG_COLOR_MORPH_ICON_DARK_THEME_SECOND = "#151515";
   85 |     public static final String BG_COLOR_MORPH_ICON_NIGHT_SHADOW = "#0F0F0F";
   86 |     public static final String COMPONENT_APP_FILE_CHECK = "ux_component.png";
   87 |     private static final int FORGROUND_DRAWABLE_SCALE_PX = 60;
   88 |     private static final String FUNC_LARGE_ICON_REDRAW_FILENAME = "outline.png";
   89 |     public static final String GAME_APP_FILE_CHECK = "game_app.png";
   90 |     public static final String ICON_NIGHT_UX_FILE_NAME_PREFIX = "rec_night";
   91 |     public static final String ICON_PEBBLE_UX_FILE_NAME_PREFIX = "peb";
   92 |     private static final String MONO_CHROME_DRAEABLE = "monochrome";
   93 |     private static final String PACKEGE_NAME_UXDESIGN = "com.oplus.uxdesign";
   94 |     private static final float RATIO_SHORT_CUT_FG_AND_BG_EMPTY_MARGIN = 0.63f;
   95 |     private static final float RATIO_SHORT_CUT_FG_AND_BG_NORMAL = 1.0f;
   96 |     private static final int SHORT_CUT_FG_DEF_SIZE = 216;
   97 |     private static final String TAG = "UxIconLoaderUtil";
   98 |     private static IconConfig sDefaultIconConfig = null;
   99 |     private static IconConfig sIconConfig = null;
  100 |     private static volatile UxIconLoaderUtil sInstance = null;
  101 |     private static boolean sNoSupportUxIcon = false;
  102 |     private Resources mAppPmResource;
  103 |     private String[] mCommonStylePathArray;
  104 |     private String[] mCommonStylePrefixArray;
  105 |     private LightingColorFilter mDarkModeColorFilter;
  106 |     private Drawable mDefaultBackgroundDrawable;
  107 |     private Path mIconMask;
  108 |     private LauncherApps mLauncherApps;
  109 |     private Path mNoClipPath;
  110 |     private String[] mSpecialStylePathArray;
  111 |     private String[] mSpecialStylePrefixArray;
```

原文件第 2394–2462 行：

```text
 2394 |     }
 2395 |
 2396 |     public boolean isClassicTheme(IconConfig iconConfig, Context context) {
 2397 |         return iconConfig != null && context != null && iconConfig.getTheme() == 2 && isDefaultTheme(context.getResources().getConfiguration());
 2398 |     }
 2399 |
 2400 |     public boolean isDarkRedraw(IconConfig iconConfig, Context context) {
 2401 |         boolean z5 = false;
 2402 |         if (context == null || iconConfig == null) {
 2403 |             Log.e(TAG, "loadMorphUxIcon params is null");
 2404 |             return false;
 2405 |         }
 2406 |         if (iconConfig.getTheme() == 2 && iconConfig.isDarkModeIcon() && MonoIconColorHelper.isDarkMode(context)) {
 2407 |             z5 = true;
 2408 |         }
 2409 |         Log.i(TAG, "isDarkRedraw:" + z5);
 2410 |         return z5;
 2411 |     }
 2412 |
 2413 |     public boolean isDefaultTheme(Configuration configuration) {
 2414 |         try {
 2415 |             OplusBaseConfiguration oplusBaseConfiguration = (OplusBaseConfiguration) m.a(OplusBaseConfiguration.class, configuration);
 2416 |             return oplusBaseConfiguration == null || (oplusBaseConfiguration.mOplusExtraConfiguration.mThemeChangedFlags & 16) == 0;
 2417 |         } catch (Exception e4) {
 2418 |             com.android.common.debug.a.b(e4, new StringBuilder("isDefaultTheme error: "), TAG);
 2419 |         }
 2420 |         return true;
 2421 |     }
 2422 |
 2423 |     public boolean isFuncIconSupported(Context context, ComponentName componentName) {
 2424 |         if (context == null || componentName == null) {
 2425 |             return false;
 2426 |         }
 2427 |         return RusManager.getInstance().hasShortcutRes(componentName.getPackageName());
 2428 |     }
 2429 |
 2430 |     public boolean isIconPackTheme(IconConfig iconConfig, Context context) {
 2431 |         return iconConfig != null && context != null && iconConfig.getTheme() == 5 && isDefaultTheme(context.getResources().getConfiguration());
 2432 |     }
 2433 |
 2434 |     public boolean isNightShadowTheme(IconConfig iconConfig, Context context) {
 2435 |         return iconConfig != null && context != null && iconConfig.getTheme() == 7 && isDefaultTheme(context.getResources().getConfiguration());
 2436 |     }
 2437 |
 2438 |     public boolean isPebbleTheme(IconConfig iconConfig, Context context) {
 2439 |         return iconConfig != null && context != null && iconConfig.getTheme() == 4 && isDefaultTheme(context.getResources().getConfiguration());
 2440 |     }
 2441 |
 2442 |     public boolean isShortcutSupported(String str, String str2) {
 2443 |         if (!RusManager.getInstance().hasShortcutRes(str)) {
 2444 |             Log.w(TAG, "isShortcutSupported hasShortcutRes false");
 2445 |         }
 2446 |         return !TextUtils.isEmpty(findAppShortcutFile(str, str2));
 2447 |     }
 2448 |
 2449 |     public boolean isSingleColorTheme(IconConfig iconConfig, Context context) {
 2450 |         return iconConfig != null && context != null && iconConfig.getTheme() == 3 && isDefaultTheme(context.getResources().getConfiguration());
 2451 |     }
 2452 |
 2453 |     /* JADX WARN: Code duplicated, block: B:75:0x015f A[PHI: r0
 2454 |   0x015f: PHI (r0v2 android.graphics.drawable.Drawable) = (r0v0 android.graphics.drawable.Drawable), (r0v4 android.graphics.drawable.Drawable) binds: [B:64:0x0126, B:73:0x0158] A[DONT_GENERATE, DONT_INLINE]] */
 2455 |     public Drawable loadMorphUxIcon(Context context, MorphIconInfo morphIconInfo) {
 2456 |         Drawable drawableClipCircleDrawable;
 2457 |         Drawable thirdThemeIconBgRes = null;
 2458 |         if (context == null || morphIconInfo == null || morphIconInfo.isEmpty()) {
 2459 |             Log.e(TAG, "loadMorphUxIcon param is null");
 2460 |             return null;
 2461 |         }
 2462 |         boolean zIsDarkRedraw = isDarkRedraw(morphIconInfo.getIconConfig(), context);
```

原文件第 2798–2832 行：

```text
 2798 |         canvas.clipPath(pathA);
 2799 |         drawable.setBounds(0, 0, i11, i11);
 2800 |         drawable.draw(canvas);
 2801 |         return new BitmapDrawable((Resources) null, bitmapCreateBitmap);
 2802 |     }
 2803 |
 2804 |     public Drawable createBg(Context context, IconFormat iconFormat, int... iArr) {
 2805 |         GradientDrawable gradientDrawable = new GradientDrawable();
 2806 |         int iDp2px = dp2px(context, Math.max(iconFormat.getSpanX(), 2));
 2807 |         int iDp2px2 = dp2px(context, Math.max(iconFormat.getSpanY(), 2));
 2808 |         gradientDrawable.setShape(0);
 2809 |         gradientDrawable.setCornerRadius(iconFormat.getRoundRectRadius() == null ? 0.0f : iconFormat.getRoundRectRadius().floatValue());
 2810 |         gradientDrawable.setSize(iDp2px, iDp2px2);
 2811 |         gradientDrawable.setGradientType(0);
 2812 |         gradientDrawable.mutate();
 2813 |         if (iArr != null && iArr.length == 1) {
 2814 |             gradientDrawable.setColor(iArr[0]);
 2815 |         } else if (iArr != null && iArr.length >= 2) {
 2816 |             gradientDrawable.setColors(iArr);
 2817 |         }
 2818 |         return gradientDrawable;
 2819 |     }
 2820 |
 2821 |     /* JADX WARN: Code duplicated, block: B:100:0x02af A[RETURN] */
 2822 |     /* JADX WARN: Code duplicated, block: B:101:0x02b0  */
 2823 |     /* JADX WARN: Code duplicated, block: B:103:0x02b6 A[RETURN] */
 2824 |     /* JADX WARN: Code duplicated, block: B:104:0x02b7  */
 2825 |     /* JADX WARN: Code duplicated, block: B:106:0x0305  */
 2826 |     /* JADX WARN: Code duplicated, block: B:108:0x030f  */
 2827 |     /* JADX WARN: Code duplicated, block: B:62:0x01de  */
 2828 |     /* JADX WARN: Code duplicated, block: B:64:0x01e8  */
 2829 |     /* JADX WARN: Code duplicated, block: B:65:0x01f9  */
 2830 |     /* JADX WARN: Code duplicated, block: B:67:0x0203  */
 2831 |     /* JADX WARN: Code duplicated, block: B:69:0x020a A[ADDED_TO_REGION] */
 2832 |     /* JADX WARN: Code duplicated, block: B:72:0x0211  */
```

## source-040

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-launcher-icons-analysis-20261111/com/oplus/uxicon/ui/morphicon/BuildInThemeIconLoaderFactory.java`  
全文 SHA-256：`41c0fa30e24659fc4551b71822d56cc1d8c19fd03e6c79681d391a768ef73d3d`  
原始引用行：73, 77, 218, 238

原文件第 67–105 行：

```text
   67 |         Canvas canvas = new Canvas(bitmapCreateBitmap);
   68 |         gradientDrawable.setBounds(0, 0, bitmapFromDrawable.getWidth(), bitmapFromDrawable.getHeight());
   69 |         gradientDrawable.draw(canvas);
   70 |         return new BitmapDrawable(Resources.getSystem(), bitmapCreateBitmap);
   71 |     }
   72 |
   73 |     private final Drawable createNightBg(Drawable fgDrawable, Context context, IconFormat iconFormat) {
   74 |         return createColorfulBg(fgDrawable, context, iconFormat, Color.parseColor(UxIconLoaderUtil.BG_COLOR_MORPH_ICON_DARK_THEME_FIRST), Color.parseColor(UxIconLoaderUtil.BG_COLOR_MORPH_ICON_DARK_THEME_SECOND));
   75 |     }
   76 |
   77 |     private final Drawable createNightShadowBg(Drawable fgDrawable, Context context, IconFormat iconFormat) {
   78 |         return createColorfulBg(fgDrawable, context, iconFormat, Color.parseColor(UxIconLoaderUtil.BG_COLOR_MORPH_ICON_NIGHT_SHADOW));
   79 |     }
   80 |
   81 |     private final String getCommonMorphIconPathUnchecked(IconFormat iconFormat, String pkgName, String fileName, String extraFilenamePrefix) {
   82 |         String absolutePath;
   83 |         final int i10 = DisplayMetrics.DENSITY_DEVICE_STABLE;
   84 |         String MORPH_ICON_ROOT_PATH_COMMON2 = MORPH_ICON_ROOT_PATH_COMMON;
   85 |         Intrinsics.checkNotNullExpressionValue(MORPH_ICON_ROOT_PATH_COMMON2, "MORPH_ICON_ROOT_PATH_COMMON");
   86 |         String morphIconPathFromRootDir = MorphIconUtils.getMorphIconPathFromRootDir(MORPH_ICON_ROOT_PATH_COMMON2, iconFormat, pkgName, fileName, extraFilenamePrefix, Integer.valueOf(i10));
   87 |         File file = new File(morphIconPathFromRootDir);
   88 |         if (file.exists() && file.canRead()) {
   89 |             return morphIconPathFromRootDir;
   90 |         }
   91 |         ArrayList arrayListM = s.m(640, 480, 320);
   92 |         arrayListM.removeIf(new e(new Function1<Integer, Boolean>() { // from class: com.oplus.uxicon.ui.morphicon.BuildInThemeIconLoaderFactory.getCommonMorphIconPathUnchecked.1
   93 |             /* JADX WARN: 'super' call moved to the top of the method (can break code semantics) */
   94 |             {
   95 |                 super(1);
   96 |             }
   97 |
   98 |             @Override // kotlin.jvm.functions.Function1
   99 |             public final Boolean invoke(Integer it) {
  100 |                 Intrinsics.checkNotNullParameter(it, "it");
  101 |                 return Boolean.valueOf(it.intValue() == i10);
  102 |             }
  103 |         }, 1));
  104 |         Iterator it = arrayListM.iterator();
  105 |         File file2 = null;
```

原文件第 212–266 行：

```text
  212 |                 tA = str2;
  213 |                 tA = com.android.launcher3.util.a.a(cn.getClassName(), "_");
  214 |             }
  215 |             tA = str2;
  216 |             objectRef.element = tA;
  217 |         }
  218 |         StylePrefixAdapter stylePrefixAdapter = new StylePrefixAdapter();
  219 |         final Ref.ObjectRef objectRef2 = new Ref.ObjectRef();
  220 |         ?? name = stylePrefixAdapter.getName(iconConfig);
  221 |         objectRef2.element = name;
  222 |         if (name.getForeground() == null && ((StylePrefix) objectRef2.element).getBackground() == null) {
  223 |             j.f21453a.a(LOG_TAG, "Style prefix not found! Unsupported config:" + iconConfig);
  224 |             return null;
  225 |         }
  226 |         boolean zIsDarkRedraw = uxIconLoaderUtil.isDarkRedraw(iconConfig, context);
  227 |         boolean zIsNightShadowTheme = uxIconLoaderUtil.isNightShadowTheme(iconConfig, context);
  228 |         if (zIsDarkRedraw) {
  229 |             objectRef2.element = stylePrefixAdapter.getNightStyleName();
  230 |         }
  231 |         Function1<String, Drawable> function1 = new Function1<String, Drawable>() { // from class: com.oplus.uxicon.ui.morphicon.BuildInThemeIconLoaderFactory$assembleDrawable$loadIconFromStyleName$1
  232 |             /* JADX WARN: 'super' call moved to the top of the method (can break code semantics) */
  233 |             {
  234 |                 super(1);
  235 |             }
  236 |
  237 |             @Override // kotlin.jvm.functions.Function1
  238 |             public final Drawable invoke(String str3) {
  239 |                 if (str3 == null) {
  240 |                     return null;
  241 |                 }
  242 |                 String availableMorphIconPath = this.this$0.getAvailableMorphIconPath(iconFormat, packageName, str3, objectRef.element);
  243 |                 boolean z5 = uxIconLoaderUtil.hasComponentFile(packageName) || MorphIconUtils.isDialtacts(cn);
  244 |                 Drawable drawableLoadUxIconByPath = z5 ? UxIconLoaderUtil.getInstance().loadUxIconByPath(availableMorphIconPath, context.getResources()) : null;
  245 |                 if (drawableLoadUxIconByPath == null && (drawableLoadUxIconByPath = UxIconLoaderUtil.getInstance().loadUxIconByPath((availableMorphIconPath = this.this$0.getAvailableMorphIconPath(iconFormat, packageName, str3, "")), context.getResources())) != null && z5) {
  246 |                     j jVar = j.f21453a;
  247 |                     StringBuilder sbB = com.android.common.debug.e.b("Fallback to load icon without prefix. pkg:", packageName, ", className:", cn.getClassName(), ", path:");
  248 |                     sbB.append(availableMorphIconPath);
  249 |                     jVar.d("MorphIcon_BuildIn", sbB.toString());
  250 |                 }
  251 |                 j.f21453a.b("MorphIcon_BuildIn", "Try load morph icon. path:" + availableMorphIconPath + ", d:" + drawableLoadUxIconByPath + ", prefix:" + ((Object) objectRef.element));
  252 |                 return drawableLoadUxIconByPath;
  253 |             }
  254 |         };
  255 |         Drawable drawableInvoke2 = function1.invoke(((StylePrefix) objectRef2.element).getForeground());
  256 |         if (zIsDarkRedraw) {
  257 |             drawableInvoke = createNightBg(drawableInvoke2, context, iconFormat);
  258 |         } else if (zIsNightShadowTheme) {
  259 |             drawableInvoke = createNightShadowBg(drawableInvoke2, context, iconFormat);
  260 |         } else {
  261 |             drawableInvoke = function1.invoke(((StylePrefix) objectRef2.element).getBackground());
  262 |         }
  263 |         if (drawableInvoke2 == null && drawableInvoke == null && (zIsDarkRedraw || zIsNightShadowTheme)) {
  264 |             j.f21453a.a(LOG_TAG, k.a("fg and bg is null isDarkRedraw:", " isNightShadow:", zIsDarkRedraw, zIsNightShadowTheme));
  265 |             return null;
  266 |         }
```

## source-041

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-launcher-icons-analysis-20261111/com/oplus/uxicon/ui/util/UxIconResPathUtil.java`  
全文 SHA-256：`619e9e4ecf26f679880d836452677081464aee6ae1bec48d11448e6ded7dbad2`  
原始引用行：16

原文件第 10–44 行：

```text
   10 |     public static final String MY_CARRIER_FILE_PATH = "/my_carrier/media/theme/uxicons/";
   11 |     public static final String MY_CARRIER_ROOT_PATH = "/my_carrier";
   12 |     public static final String MY_COMMON_ICON_THEME_FILE_PATH;
   13 |     public static final String MY_COUNTRY_ROOT_PATH = "/my_country";
   14 |     public static final String MY_ICON_THEME_FILE_PATH;
   15 |     public static final String MY_PRODUCT_ROOT_PATH = "/my_product";
   16 |     public static final String MY_REGION_FILE_PATH = "/my_region/media/theme/uxicons/";
   17 |     public static final String MY_STOCK_FILE_PATH = "/my_stock/media/theme/uxicons/";
   18 |     public static final String OS16_DENSITY_NAME = "hdpi";
   19 |     public static final String OS16_MY_PRODUCT_FILE_PATH = "/my_product/media/theme/uxicons/hdpi/";
   20 |     public static final String UX_DOWNLOAD_FILE_PATH = "/data/oplus/uxicons/";
   21 |     public static final String BASE_PRODUCT_DEFAULT_THEME_FILE_PATH = getMyProductDirectory() + "/media/theme/default/";
   22 |     public static final String MY_COUNTRY_DEFAULT_THEME_FILE_PATH = getMyCountryDirectory() + "/media/theme/uxicons/";
   23 |     public static final String MY_CARRIER_DEFAULT_THEME_FILE_PATH = getMyCarrierDirectory() + "/media/theme/uxicons/";
   24 |     public static final String MY_PRODUCT_FILE_PATH = "/my_product/media/theme/uxicons/";
   25 |     public static final String[] MY_SHORTCUT_ICON_PATHS = {MY_PRODUCT_FILE_PATH, "/data/oplus/uxicons/"};
   26 |
   27 |     static {
   28 |         if (new File("/my_product/media/theme/uxicons/hdpi/").exists()) {
   29 |             MY_ICON_THEME_FILE_PATH = MY_PRODUCT_FILE_PATH;
   30 |             IS_OS16_PRODUCT = true;
   31 |         } else if (new File(MY_PRODUCT_FILE_PATH).exists()) {
   32 |             MY_ICON_THEME_FILE_PATH = MY_PRODUCT_FILE_PATH;
   33 |             IS_OS16_PRODUCT = false;
   34 |         } else if (new File(MY_STOCK_FILE_PATH).exists()) {
   35 |             MY_ICON_THEME_FILE_PATH = MY_STOCK_FILE_PATH;
   36 |             IS_OS16_PRODUCT = false;
   37 |         } else {
   38 |             MY_ICON_THEME_FILE_PATH = MY_REGION_FILE_PATH;
   39 |             IS_OS16_PRODUCT = false;
   40 |         }
   41 |         String str = MY_ICON_THEME_FILE_PATH;
   42 |         if (!new File(str).exists()) {
   43 |             str = MY_CARRIER_FILE_PATH;
   44 |         }
```

## source-042

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-material-shader-20261111/com/oplus/posteffect/agsl/BlurDrawableShader.java`  
全文 SHA-256：`3ae398a64d9733327875cec68664916e55677333fa4fc3fab047f56ee7d48a61`  
原始引用行：68, 218

原文件第 62–96 行：

```text
   62 |         BlurDrawableShaderBaseStringKt.appendShaderString$default(sb2, 0, 0, false, null, 8, null);
   63 |         RuntimeShader runtimeShader = new RuntimeShader(this.shaderStringBuilder.toString());
   64 |         setBaseUniform(runtimeShader);
   65 |         this.shader = runtimeShader;
   66 |     }
   67 |
   68 |     private final void mappingBgBlendParams() {
   69 |         int blendMode = this.bgBlendParam.getBlendMode();
   70 |         if (blendMode == 1) {
   71 |             this.blendAlgorithmMask |= 1;
   72 |             this.summaryBlendParam.add(new ShaderBlendParam(1, this.bgBlendParam.getBlendColorA()));
   73 |             return;
   74 |         }
   75 |         if (blendMode == 2) {
   76 |             this.blendAlgorithmMask |= 20;
   77 |             this.summaryBlendParam.add(new ShaderBlendParam(5, this.bgBlendParam.getBlendColorA()));
   78 |             this.summaryBlendParam.add(new ShaderBlendParam(3, this.bgBlendParam.getBlendColorB()));
   79 |             return;
   80 |         }
   81 |         if (blendMode == 3) {
   82 |             this.blendAlgorithmMask |= 5;
   83 |             this.summaryBlendParam.add(new ShaderBlendParam(1, this.bgBlendParam.getBlendColorA()));
   84 |             this.summaryBlendParam.add(new ShaderBlendParam(3, this.bgBlendParam.getBlendColorB()));
   85 |         } else if (blendMode == 4) {
   86 |             this.blendAlgorithmMask |= 3;
   87 |             this.summaryBlendParam.add(new ShaderBlendParam(1, this.bgBlendParam.getBlendColorA()));
   88 |             this.summaryBlendParam.add(new ShaderBlendParam(2, this.bgBlendParam.getBlendColorB()));
   89 |         } else {
   90 |             if (blendMode != 5) {
   91 |                 return;
   92 |             }
   93 |             this.blendAlgorithmMask |= 18;
   94 |             this.summaryBlendParam.add(new ShaderBlendParam(5, this.bgBlendParam.getBlendColorA()));
   95 |             this.summaryBlendParam.add(new ShaderBlendParam(2, this.bgBlendParam.getBlendColorB()));
   96 |         }
```

原文件第 212–246 行：

```text
  212 |         if ((i10 & 1) != 0) {
  213 |             arrayList = null;
  214 |         }
  215 |         blurDrawableShader.setMultiBlendParams(arrayList);
  216 |     }
  217 |
  218 |     private final void setShaderBlendParams(float[] blendParams) {
  219 |         RuntimeShader runtimeShader;
  220 |         if ((blendParams.length == 0) || (runtimeShader = this.shader) == null) {
  221 |             return;
  222 |         }
  223 |         runtimeShader.setFloatUniform(BlurDrawableShaderBlendStringKt.BLUR_DRAWABLE_SHADER_UNIFORM_MULTI_BLEND_PARAMS, blendParams);
  224 |     }
  225 |
  226 |     private final void updateShaderBlendParams(boolean gradientStrokeValidChanged, boolean cornerTypeChanged) {
  227 |         int i10 = this.blendAlgorithmMask;
  228 |         int size = this.summaryBlendParam.size();
  229 |         this.summaryBlendParam.clear();
  230 |         this.blendAlgorithmMask = 0;
  231 |         mappingBgBlendParams();
  232 |         mappingFgBlendParams();
  233 |         mappingMultiBlendParams();
  234 |         if (this.blendAlgorithmMask != i10 || this.summaryBlendParam.size() != size || gradientStrokeValidChanged || (this.gradientStrokeLineParams.isValid() && cornerTypeChanged)) {
  235 |             StringBuilder sbA = g0.a(i10, "updateShaderIfNeed: blendAlgorithmMask: ", "->");
  236 |             a0.a(this.blendAlgorithmMask, size, ", blendCount: ", "->", sbA);
  237 |             sbA.append(this.summaryBlendParam.size());
  238 |             sbA.append(", gradientStrokeChanged = ");
  239 |             sbA.append(gradientStrokeValidChanged);
  240 |             sbA.append(", cornerChanged = ");
  241 |             sbA.append(cornerTypeChanged);
  242 |             Log.d(TAG, sbA.toString());
  243 |             try {
  244 |                 try {
  245 |                     try {
  246 |                         BlurDrawableShaderBaseStringKt.appendShaderString(this.shaderStringBuilder, this.blendAlgorithmMask, this.summaryBlendParam.size(), this.gradientStrokeLineParams.isValid(), this.gradientStrokeCornerParams.getType());
```

## source-043

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-material-shader-20261111/com/oplus/posteffect/agsl/BlurDrawableShaderBaseStringKt.java`  
全文 SHA-256：`fd5b39812c4f75049b322d7387451cb5a86883d011b6f4d9b45c83a3a49768af`  
原始引用行：14

原文件第 8–42 行：

```text
    8 | /* JADX INFO: compiled from: BlurDrawableShaderBaseString.kt */
    9 | /* JADX INFO: loaded from: classes3.dex */
   10 | @Metadata(d1 = {"\u0000,\n\u0002\u0018\u0002\n\u0002\u0018\u0002\n\u0002\u0010\b\n\u0002\b\u0002\n\u0002\u0010\u000b\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0007\n\u0002\u0010\u000e\n\u0002\b\r\u001a7\u0010\n\u001a\u00020\t*\u00060\u0000j\u0002`\u00012\u0006\u0010\u0003\u001a\u00020\u00022\u0006\u0010\u0004\u001a\u00020\u00022\u0006\u0010\u0006\u001a\u00020\u00052\b\b\u0002\u0010\b\u001a\u00020\u0007¢\u0006\u0004\b\n\u0010\u000b\u001a%\u0010\f\u001a\u00020\t*\u00060\u0000j\u0002`\u00012\u0006\u0010\u0004\u001a\u00020\u00022\u0006\u0010\u0006\u001a\u00020\u0005¢\u0006\u0004\b\f\u0010\r\u001a-\u0010\u000f\u001a\u00020\t*\u00060\u0000j\u0002`\u00012\u0006\u0010\u000e\u001a\u00020\u00022\u0006\u0010\u0004\u001a\u00020\u00022\u0006\u0010\u0006\u001a\u00020\u0005¢\u0006\u0004\b\u000f\u0010\u0010\"\u0014\u0010\u0012\u001a\u00020\u00118\u0006X\u0086T¢\u0006\u0006\n\u0004\b\u0012\u0010\u0013\"\u0014\u0010\u0014\u001a\u00020\u00118\u0006X\u0086T¢\u0006\u0006\n\u0004\b\u0014\u0010\u0013\"\u0014\u0010\u0015\u001a\u00020\u00118\u0006X\u0086T¢\u0006\u0006\n\u0004\b\u0015\u0010\u0013\"\u0014\u0010\u0016\u001a\u00020\u00118\u0006X\u0086T¢\u0006\u0006\n\u0004\b\u0016\u0010\u0013\"\u0014\u0010\u0017\u001a\u00020\u00118\u0006X\u0086T¢\u0006\u0006\n\u0004\b\u0017\u0010\u0013\"\u0014\u0010\u0018\u001a\u00020\u00118\u0006X\u0086T¢\u0006\u0006\n\u0004\b\u0018\u0010\u0013\"\u0014\u0010\u0019\u001a\u00020\u00118\u0006X\u0086T¢\u0006\u0006\n\u0004\b\u0019\u0010\u0013\"\u0014\u0010\u001a\u001a\u00020\u00118\u0006X\u0086T¢\u0006\u0006\n\u0004\b\u001a\u0010\u0013\"\u0014\u0010\u001b\u001a\u00020\u00118\u0006X\u0086T¢\u0006\u0006\n\u0004\b\u001b\u0010\u0013\"\u0014\u0010\u001c\u001a\u00020\u00118\u0006X\u0086T¢\u0006\u0006\n\u0004\b\u001c\u0010\u0013\"\u0014\u0010\u001d\u001a\u00020\u00118\u0006X\u0086T¢\u0006\u0006\n\u0004\b\u001d\u0010\u0013¨\u0006\u001e"}, d2 = {"Ljava/lang/StringBuilder;", "Lkotlin/text/StringBuilder;", "", "blendAlgorithmMask", "blendCount", "", "enableGradientStroke", "Lcom/oplus/posteffect/GradientStrokeCornerType;", "strokeCornerType", "Lk9/n;", "appendShaderString", "(Ljava/lang/StringBuilder;IIZLcom/oplus/posteffect/GradientStrokeCornerType;)V", "appendHeaderString", "(Ljava/lang/StringBuilder;IZ)V", "algorithmMask", "appendMainMethodString", "(Ljava/lang/StringBuilder;IIZ)V", "", "STRING_EMPTY", "Ljava/lang/String;", "STRING_ELSE", "BLUR_DRAWABLE_SHADER_UNIFORM_BITMAP", "BLUR_DRAWABLE_SHADER_UNIFORM_ENABLE_BLEND", "BLUR_DRAWABLE_SHADER_UNIFORM_CORNER", "BLUR_DRAWABLE_SHADER_UNIFORM_WEIGHT", "BLUR_DRAWABLE_SHADER_UNIFORM_SIZE", "BLUR_DRAWABLE_SHADER_UNIFORM_MATRIX", "BLUR_DRAWABLE_SHADER_UNIFORM_MATRIX_PARAMS", "BLUR_DRAWABLE_SHADER_STRING_HEAD_UNIFORMS_NORMAL", "BLUR_DRAWABLE_SHADER_STRING_MAIN_METHOD_BITMAP_SAMPLING", "app-sdk_release"}, k = 2, mv = {1, 8, 0}, xi = 48)
   11 | public final class BlurDrawableShaderBaseStringKt {
   12 |     public static final String BLUR_DRAWABLE_SHADER_STRING_HEAD_UNIFORMS_NORMAL = "\n    uniform shader uBitmap;\n    uniform int uEnableBlend;\n    uniform float u_corner;\n    uniform float u_weight;\n    uniform float2 u_size;\n    uniform float3x3 uMatrix;\n    uniform float4 uMatrixParams;\n";
   13 |     public static final String BLUR_DRAWABLE_SHADER_STRING_MAIN_METHOD_BITMAP_SAMPLING = "\n    vec2 matrixScale = max(vec2(0.0000001), vec2(uMatrixParams[0], uMatrixParams[1]));\n    vec2 matrixTrans = vec2(uMatrixParams[2], uMatrixParams[3]);\n    vec2 mapCoords = (uMatrix * float3((coords - matrixTrans) / matrixScale / matrixScale, 0.0)).xy;\n    vec4 outputCol = vec4(uBitmap.eval(mapCoords).rgb, 1.0);\n";
   14 |     public static final String BLUR_DRAWABLE_SHADER_UNIFORM_BITMAP = "uBitmap";
   15 |     public static final String BLUR_DRAWABLE_SHADER_UNIFORM_CORNER = "u_corner";
   16 |     public static final String BLUR_DRAWABLE_SHADER_UNIFORM_ENABLE_BLEND = "uEnableBlend";
   17 |     public static final String BLUR_DRAWABLE_SHADER_UNIFORM_MATRIX = "uMatrix";
   18 |     public static final String BLUR_DRAWABLE_SHADER_UNIFORM_MATRIX_PARAMS = "uMatrixParams";
   19 |     public static final String BLUR_DRAWABLE_SHADER_UNIFORM_SIZE = "u_size";
   20 |     public static final String BLUR_DRAWABLE_SHADER_UNIFORM_WEIGHT = "u_weight";
   21 |     public static final String STRING_ELSE = "else ";
   22 |     public static final String STRING_EMPTY = "";
   23 |
   24 |     public static final void appendHeaderString(StringBuilder sb2, int i10, boolean z5) {
   25 |         Intrinsics.checkNotNullParameter(sb2, "<this>");
   26 |         sb2.append("uniform shader uBitmap;\nuniform int uEnableBlend;\nuniform float u_corner;\nuniform float u_weight;\nuniform float2 u_size;\nuniform float3x3 uMatrix;\nuniform float4 uMatrixParams;");
   27 |         if (i10 > 0) {
   28 |             sb2.append("uniform float[" + (i10 * 5) + "] u_multiBlendParams;");
   29 |         }
   30 |         if (z5) {
   31 |             sb2.append("layout(color) uniform vec4 uColor;\nuniform float uRatio;\nuniform float[6] uNearLineParams;\nuniform float[6] uFarLineParams;\nstruct LineParams {float width;float alpha;float2 fadeToSides;float2 fadeTowardsCenter;};\nstruct GradientStrokeResult {vec4 color;float sdf;};");
   32 |         }
   33 |     }
   34 |
   35 |     public static final void appendMainMethodString(StringBuilder sb2, int i10, int i11, boolean z5) {
   36 |         Intrinsics.checkNotNullParameter(sb2, "<this>");
   37 |         sb2.append("vec4 main(vec2 coords) {");
   38 |         if (z5) {
   39 |             BlurDrawableShaderStrokeStringKt.appendGradientStrokeMainMethodHeadString(sb2);
   40 |         }
   41 |         sb2.append("vec2 matrixScale = max(vec2(0.0000001), vec2(uMatrixParams[0], uMatrixParams[1]));\nvec2 matrixTrans = vec2(uMatrixParams[2], uMatrixParams[3]);\nvec2 mapCoords = (uMatrix * float3((coords - matrixTrans) / matrixScale / matrixScale, 0.0)).xy;\nvec4 outputCol = vec4(uBitmap.eval(mapCoords).rgb, 1.0);");
   42 |         BlurDrawableShaderBlendStringKt.appendBlendMainMethodString(sb2, i10, i11);
```

## source-044

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-material-shader-20261111/com/oplus/posteffect/agsl/BlurDrawableShaderBlendStringKt.java`  
全文 SHA-256：`48aa153c809b857423ecb5fb41c4f84d1d2b6dc5f1ebc79d9f8e23372562d510`  
原始引用行：69

原文件第 63–97 行：

```text
   63 |         StringBuilder sb3 = new StringBuilder();
   64 |         sb3.append(z5 ? "" : BlurDrawableShaderBaseStringKt.STRING_ELSE);
   65 |         sb3.append(str);
   66 |         sb2.append(g.c(sb3.toString()));
   67 |     }
   68 |
   69 |     public static final void appendBlendOptionMethodString(StringBuilder sb2, int i10) {
   70 |         Intrinsics.checkNotNullParameter(sb2, "<this>");
   71 |         if (i10 == 0) {
   72 |             return;
   73 |         }
   74 |         sb2.append("vec4 doBlend(vec4 col, float blendMode, vec4 blendColor) {");
   75 |         boolean z5 = true;
   76 |         boolean z10 = false;
   77 |         if ((i10 & 1) != 0) {
   78 |             appendBlendOption(sb2, "if (blendMode == 1) { col.xyz = mix(col.xyz, blendColor.xyz, blendColor.w);}", true);
   79 |             z5 = false;
   80 |         }
   81 |         if ((i10 & 2) != 0) {
   82 |             appendBlendOption(sb2, "if (blendMode == 2) { col.xyz = mix(col.xyz, overlay(blendColor.xyz, col.xyz), blendColor.w);}", z5);
   83 |             z5 = false;
   84 |         }
   85 |         if ((i10 & 4) != 0) {
   86 |             appendBlendOption(sb2, "if (blendMode == 3) { col.xyz = mix(col.xyz, colorDodge(blendColor.xyz, col.xyz), blendColor.w);}", z5);
   87 |             z5 = false;
   88 |         }
   89 |         if ((i10 & 8) != 0) {
   90 |             appendBlendOption(sb2, "if (blendMode == 4) { col = colorDodgeBlend(blendColor, col);}", z5);
   91 |             z5 = false;
   92 |         }
   93 |         if ((i10 & 16) != 0) {
   94 |             appendBlendOption(sb2, "if (blendMode == 5) { col.xyz = mix(col.xyz, luminosity(blendColor.xyz, col.xyz), blendColor.w);}", z5);
   95 |             z5 = false;
   96 |         }
   97 |         if ((i10 & 32) != 0) {
```
