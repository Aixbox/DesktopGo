# SystemUI 与 COUI证据摘录

归档日期：2026-11-11。保留原始行号及引用附近上下文；不是完整反编译副本，不代表运行观察。全文 SHA-256、摘录范围及来源见 [sources.json](sources.json)。较长 shader 字符串保留原始 Java 转义。

## source-007

原文件：`D:/Project/other/ColorOS16/analysis/decoded/Settings/resources/res/values-night/colors.xml`  
全文 SHA-256：`5fe8a3cbbf1b71c9433264e688ee6520d294e043ba19af5013f8ff1b22a04bcc`  
原始引用行：287

原文件第 281–315 行：

```text
  281 |     <color name="coui_color_assist_yellow">#c29427</color>
  282 |     <color name="coui_color_azure">#209de5</color>
  283 |     <color name="coui_color_azure_variant">#3d98cc</color>
  284 |     <color name="coui_color_background_elevated">#1e1e1e</color>
  285 |     <color name="coui_color_background_elevatedWithCard">#1e1e1e</color>
  286 |     <color name="coui_color_background_top">#333333</color>
  287 |     <color name="coui_color_background_with_card">#ffffff</color>
  288 |     <color name="coui_color_bar">#1e1e1e</color>
  289 |     <color name="coui_color_blue">#247cff</color>
  290 |     <color name="coui_color_bottom_bar">#1e1e1e</color>
  291 |     <color name="coui_color_card">#1affffff</color>
  292 |     <color name="coui_color_card_background">#1affffff</color>
  293 |     <color name="coui_color_card_pressed">#33ffffff</color>
  294 |     <color name="coui_color_container12">#33ffffff</color>
  295 |     <color name="coui_color_container16">#40ffffff</color>
  296 |     <color name="coui_color_container4">#14ffffff</color>
  297 |     <color name="coui_color_container8">#26ffffff</color>
  298 |     <color name="coui_color_container_azure">#373f42</color>
  299 |     <color name="coui_color_container_blue">#323739</color>
  300 |     <color name="coui_color_container_cyan">#343e3d</color>
  301 |     <color name="coui_color_container_green">#353e36</color>
  302 |     <color name="coui_color_container_mint">#394342</color>
  303 |     <color name="coui_color_container_orange">#39332c</color>
  304 |     <color name="coui_color_container_purple">#3a3540</color>
  305 |     <color name="coui_color_container_red">#3a3030</color>
  306 |     <color name="coui_color_container_solid">#262626</color>
  307 |     <color name="coui_color_container_theme_blue">#247cff</color>
  308 |     <color name="coui_color_container_theme_green">#24b232</color>
  309 |     <color name="coui_color_container_theme_halftone_blue">#40247cff</color>
  310 |     <color name="coui_color_container_theme_halftone_green">#4024b232</color>
  311 |     <color name="coui_color_container_theme_halftone_orange">#40f08222</color>
  312 |     <color name="coui_color_container_theme_halftone_red">#40eb493d</color>
  313 |     <color name="coui_color_container_theme_halftone_yellow">#40e5a100</color>
  314 |     <color name="coui_color_container_theme_orange">#f08222</color>
  315 |     <color name="coui_color_container_theme_red">#eb493d</color>
```

## source-008

原文件：`D:/Project/other/ColorOS16/analysis/decoded/Settings/resources/res/values/colors.xml`  
全文 SHA-256：`74b25b4ea7c58766d91a95bf3d64eee130277cadae0516218eee79f25651e29f`  
原始引用行：888

原文件第 882–916 行：

```text
  882 |     <color name="coui_color_background_elevated_dark">#1e1e1e</color>
  883 |     <color name="coui_color_background_elevated_light">#ffffff</color>
  884 |     <color name="coui_color_background_light">#ffffff</color>
  885 |     <color name="coui_color_background_top">#ffffff</color>
  886 |     <color name="coui_color_background_top_dark">#333333</color>
  887 |     <color name="coui_color_background_top_light">#ffffff</color>
  888 |     <color name="coui_color_background_with_card">#f0f1f2</color>
  889 |     <color name="coui_color_background_with_card_dark">#000000</color>
  890 |     <color name="coui_color_background_with_card_light">#f0f1f2</color>
  891 |     <color name="coui_color_bar">#fafafa</color>
  892 |     <color name="coui_color_bar_dark">#1e1e1e</color>
  893 |     <color name="coui_color_bar_light">#fafafa</color>
  894 |     <color name="coui_color_blue">#0066ff</color>
  895 |     <color name="coui_color_blue_dark">#247cff</color>
  896 |     <color name="coui_color_blue_light">#0066ff</color>
  897 |     <color name="coui_color_blue_variant">#5c93e5</color>
  898 |     <color name="coui_color_blue_variant_dark">#5c93e5</color>
  899 |     <color name="coui_color_blue_variant_light">#5c93e5</color>
  900 |     <color name="coui_color_bottom_bar">#fafafa</color>
  901 |     <color name="coui_color_card">#ffffff</color>
  902 |     <color name="coui_color_card_background">#ffffff</color>
  903 |     <color name="coui_color_card_background_dark">#1affffff</color>
  904 |     <color name="coui_color_card_background_light">#ffffff</color>
  905 |     <color name="coui_color_card_dark">#1affffff</color>
  906 |     <color name="coui_color_card_light">#ffffff</color>
  907 |     <color name="coui_color_card_pressed">#e6e6e6</color>
  908 |     <color name="coui_color_card_pressed_dark">#33ffffff</color>
  909 |     <color name="coui_color_card_pressed_light">#e6e6e6</color>
  910 |     <color name="coui_color_container12">#1f000000</color>
  911 |     <color name="coui_color_container12_dark">#33ffffff</color>
  912 |     <color name="coui_color_container12_light">#1f000000</color>
  913 |     <color name="coui_color_container16">#29000000</color>
  914 |     <color name="coui_color_container16_dark">#40ffffff</color>
  915 |     <color name="coui_color_container16_light">#29000000</color>
  916 |     <color name="coui_color_container4">#0a000000</color>
```

## source-009

原文件：`D:/Project/other/ColorOS16/analysis/decoded/Settings/resources/res/values/styles.xml`  
全文 SHA-256：`947670256b925d8b97ea59159b8480f92b9c0712ff9a114dcd617257d5f4c60a`  
原始引用行：11938

原文件第 11932–11966 行：

```text
11932 |         <item name="couiColorPrimaryText">@color/coui_color_primary_text_blue</item>
11933 |         <item name="couiColorPrimaryTextOnPopup">@color/coui_color_primary_on_popup_blue</item>
11934 |         <item name="couiColorSecondary">@color/coui_color_secondary_blue</item>
11935 |         <item name="couiDefaultTextColor">#ff32ceb2</item>
11936 |         <item name="couiThemeIdentifier">@integer/couiBlueIdentifier</item>
11937 |     </style>
11938 |     <style name="Theme.COUI.Dark" parent="@style/Theme.COUI">
11939 |         <item name="android:backgroundDimAmount">0.5</item>
11940 |         <item name="android:windowBackground">?attr/couiColorBackground</item>
11941 |         <item name="android:editTextStyle">@style/Widget.COUI.EditText.Dark</item>
11942 |         <item name="buttonStyle">@style/Widget.COUI.Button.Dark</item>
11943 |         <item name="couiBtnDefaultTextColorDisable">@color/coui_btn_default_text_color_disable_dark</item>
11944 |         <item name="couiBtnDrawableColorDisabled">@color/coui_dark_btn_drawable_color_disabled</item>
11945 |         <item name="couiBtnPartCheckInnerColorOnDisabled">@color/coui_btn_part_check_inner_dark_color_on_disabled</item>
11946 |         <item name="couiBtnRadioColorOn">@color/coui_btn_radio_dark_color_on</item>
11947 |         <item name="couiBtnSecondaryTextColorDisable">@color/coui_btn_secondary_text_color_disable_dark</item>
11948 |         <item name="couiColorAdditional">@color/coui_color_additional_blue_dark</item>
11949 |         <item name="couiColorAssist">@color/coui_color_assist_blue_dark</item>
11950 |         <item name="couiColorAzure">@color/coui_color_azure_dark</item>
11951 |         <item name="couiColorAzureVariant">@color/coui_color_azure_variant_dark</item>
11952 |         <item name="couiColorBackground">@color/coui_color_background_dark</item>
11953 |         <item name="couiColorBackgroundElevated">@color/coui_color_background_elevated_dark</item>
11954 |         <item name="couiColorBackgroundElevatedWithCard">@color/coui_color_background_elevatedWithCard_dark</item>
11955 |         <item name="couiColorBackgroundTop">@color/coui_color_background_top_dark</item>
11956 |         <item name="couiColorBackgroundWithCard">@color/coui_color_background_with_card_dark</item>
11957 |         <item name="couiColorBar">@color/coui_color_bar_dark</item>
11958 |         <item name="couiColorBlue">@color/coui_color_blue_dark</item>
11959 |         <item name="couiColorBlueVariant">@color/coui_color_blue_variant_dark</item>
11960 |         <item name="couiColorCard">@color/coui_color_card_dark</item>
11961 |         <item name="couiColorCardBackground">@color/coui_color_card_background_dark</item>
11962 |         <item name="couiColorCardPressed">@color/coui_color_card_pressed_dark</item>
11963 |         <item name="couiColorContainer12">@color/coui_color_container12_dark</item>
11964 |         <item name="couiColorContainer16">@color/coui_color_container16_dark</item>
11965 |         <item name="couiColorContainer4">@color/coui_color_container4_dark</item>
11966 |         <item name="couiColorContainer8">@color/coui_color_container8_dark</item>
```

## source-010

原文件：`D:/Project/other/ColorOS16/analysis/decoded/SystemUI/resources/res/drawable/_bg_flashlight_brightness_levelbase_fluid_glass_bg__0_res_0x7f0804c0.xml`  
全文 SHA-256：`7cb37a5ef138a36d2065b56d7c63ee835495b1ad8eafa8eaaa4bde216045faab`  
原始引用行：8

原文件第 2–20 行：

```text
    2 | <gradient xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"
    3 |     android:type="linear"
    4 |     android:startX="22.02"
    5 |     android:startY="-225.52"
    6 |     android:endX="181.06"
    7 |     android:endY="-161.63">
    8 |     <item
    9 |         android:color="#ffffffff"
   10 |         android:offset="0"/>
   11 |     <item
   12 |         android:color="#0cffffff"
   13 |         android:offset="0.4"/>
   14 |     <item
   15 |         android:color="#0cffffff"
   16 |         android:offset="0.6"/>
   17 |     <item
   18 |         android:color="#ffffffff"
   19 |         android:offset="1"/>
   20 | </gradient>
```

## source-011

原文件：`D:/Project/other/ColorOS16/analysis/decoded/SystemUI/resources/res/drawable/bg_flashlight_brightness_levelbase_fluid_glass_bg.xml`  
全文 SHA-256：`18bb3ace0fc55987b3ba34e926645a5ae0f7a931efbe494263d030408d035ced`  
原始引用行：10

原文件第 4–17 行：

```text
    4 |     android:width="130dp"
    5 |     android:autoMirrored="true"
    6 |     android:viewportWidth="130"
    7 |     android:viewportHeight="67">
    8 |     <group>
    9 |         <clip-path android:pathData="M0,0h130v67h-130z"/>
   10 |         <path
   11 |             android:fillColor="#000000"
   12 |             android:pathData="M38,-271.5L92,-271.5A37.5,37.5 0,0 1,129.5 -234L129.5,29A37.5,37.5 0,0 1,92 66.5L38,66.5A37.5,37.5 0,0 1,0.5 29L0.5,-234A37.5,37.5 0,0 1,38 -271.5z"
   13 |             android:strokeColor="@drawable/_bg_flashlight_brightness_levelbase_fluid_glass_bg__0_res_0x7f0804c0"
   14 |             android:strokeWidth="1"
   15 |             android:fillAlpha="0.22"/>
   16 |     </group>
   17 | </vector>
```

## source-012

原文件：`D:/Project/other/ColorOS16/analysis/decoded/SystemUI/resources/res/drawable/status_bar_qs_highlighttile_active_icon_fluid_glass_bg.xml`  
全文 SHA-256：`23818ea3aebed29f8e16df511c328aad766939d0bd0683ed6c38d9299be93bef`  
原始引用行：8

原文件第 2–12 行：

```text
    2 | <vector xmlns:android="http://schemas.android.com/apk/res/android"
    3 |     android:height="42dp"
    4 |     android:width="42dp"
    5 |     android:autoMirrored="true"
    6 |     android:viewportWidth="42"
    7 |     android:viewportHeight="42">
    8 |     <path
    9 |         android:fillColor="#3282f9"
   10 |         android:pathData="M21,21m-21,0a21,21 0,1 1,42 0a21,21 0,1 1,-42 0"
   11 |         android:fillAlpha="0.8"/>
   12 | </vector>
```

## source-013

原文件：`D:/Project/other/ColorOS16/analysis/decoded/SystemUI/resources/res/values-night/colors.xml`  
全文 SHA-256：`a93f2b97e6ab5ecfa8da393d09462e4f9bfb32bf66b30b950ed17de36edd9919`  
原始引用行：425, 596

原文件第 419–453 行：

```text
  419 |     <color name="media_panel_bg_blur">#c0282828</color>
  420 |     <color name="media_panel_text_primary">#d9ffffff</color>
  421 |     <color name="nav_bar_background_opaque">#ff000000</color>
  422 |     <color name="nav_bar_background_translucent_opaque">#80000000</color>
  423 |     <color name="no_notification_text_color">#4dffffff</color>
  424 |     <color name="notification_action_rounded_bg_color">#0affffff</color>
  425 |     <color name="notification_card_low_gaussian_mixed_color_bottom_layer">#808080</color>
  426 |     <color name="notification_card_low_gaussian_mixed_color_top_layer">#b3262626</color>
  427 |     <color name="notification_card_mixed_color_bottom_layer">#66383838</color>
  428 |     <color name="notification_card_mixed_color_bottom_layer_first_stack">#66383838</color>
  429 |     <color name="notification_card_mixed_color_bottom_layer_second_stack">#66383838</color>
  430 |     <color name="notification_card_mixed_color_top_layer">#cc262626</color>
  431 |     <color name="notification_card_mixed_color_top_layer_first_stack">#99262626</color>
  432 |     <color name="notification_card_mixed_color_top_layer_second_stack">#66404040</color>
  433 |     <color name="notification_close_black">#d9ffffff</color>
  434 |     <color name="notification_color_primary_label_default">#e6ffffff</color>
  435 |     <color name="notification_color_primary_neutral_default">#e6ffffff</color>
  436 |     <color name="notification_color_secondary_label_default">#8affffff</color>
  437 |     <color name="notification_color_secondary_neutral_default">#8affffff</color>
  438 |     <color name="notification_color_send_input_hint">#4dffffff</color>
  439 |     <color name="notification_expand_button_pill_color_new">#1affffff</color>
  440 |     <color name="notification_gear_color">#ffffff</color>
  441 |     <color name="notification_guts_priority_button_bg_fill_color_selected">@color/GM2_grey_800</color>
  442 |     <color name="notification_guts_priority_button_bg_stroke_color">@color/GM2_grey_700</color>
  443 |     <color name="notification_guts_priority_button_content_color">@color/GM2_grey_500</color>
  444 |     <color name="notification_icon_filter">#ffdddddd</color>
  445 |     <color name="notification_legacy_background_color">@color/GM2_grey_900</color>
  446 |     <color name="notification_material_background_click">#99ffffff</color>
  447 |     <color name="notification_material_background_click_level_a">#e6ffffff</color>
  448 |     <color name="notification_material_background_color_compass">#ff404040</color>
  449 |     <color name="notification_material_blur_bg">#cc333333</color>
  450 |     <color name="notification_menu_icon_background">#4d4d4d</color>
  451 |     <color name="notification_popup_menu_app_name_color">#8affffff</color>
  452 |     <color name="notification_popup_menu_icon_color">#ffffff</color>
  453 |     <color name="notification_popup_menu_panel_background_color_no_blur">#f2424242</color>
```

原文件第 590–624 行：

```text
  590 |     <color name="status_bar_qs_footer_date">#e6ffffff</color>
  591 |     <color name="status_bar_qs_footer_edit_button_selector_color">#e6ffffff</color>
  592 |     <color name="status_bar_qs_footer_text_color">#e6ffffff</color>
  593 |     <color name="status_bar_qs_page_indicator_color">@color/coui_color_primary_neutral_dark</color>
  594 |     <color name="status_bar_qs_page_indicator_unselected_color">@color/coui_color_disabled_neutral_dark</color>
  595 |     <color name="status_bar_qs_setting_icon_color">#e6ffffff</color>
  596 |     <color name="status_bar_qs_tile_bg_color_inactive">@color/coui_color_card_pressed_dark</color>
  597 |     <color name="status_bar_qs_tile_bg_color_inactive_default">@color/coui_color_card_pressed_dark</color>
  598 |     <color name="status_bar_qs_tile_icon_color_inactive">#e5ffffff</color>
  599 |     <color name="status_bar_qs_tile_icon_color_inactive_default">#e6ffffff</color>
  600 |     <color name="status_bar_qs_tile_icon_color_unavailable">#4dffffff</color>
  601 |     <color name="status_bar_qs_tile_icon_color_unavailable_default">#4dffffff</color>
  602 |     <color name="status_bar_qs_tile_label_color">#e6ffffff</color>
  603 |     <color name="status_bar_qs_tile_label_color_default">#e6ffffff</color>
  604 |     <color name="status_bar_qs_tile_label_color_unavailable">#4dffffff</color>
  605 |     <color name="status_bar_qs_tile_label_color_unavailable_default">#4dffffff</color>
  606 |     <color name="status_bar_qs_tile_second_label_color">#e6ffffff</color>
  607 |     <color name="status_bar_qs_tile_second_label_color_unavailable">#4dffffff</color>
  608 |     <color name="sub_lock_pattern_launcher_success_color">#ffffff</color>
  609 |     <color name="sub_pattern_bg_color">#ffffff</color>
  610 |     <color name="sud_color_on_surface">@android:color/system_on_surface_dark</color>
  611 |     <color name="sud_color_primary">@color/sud_system_primary_dark</color>
  612 |     <color name="sud_color_surface_container_high">@color/sud_system_surface_container_high_dark</color>
  613 |     <color name="sud_glif_expressive_footer_secondary_button_disable_text_color">@color/sud_system_neutral2_200</color>
  614 |     <color name="sud_on_secondary_container">@color/sud_system_on_secondary_container_dark</color>
  615 |     <color name="sud_on_surface_variant">@color/sud_system_on_surface_variant_dark</color>
  616 |     <color name="sud_system_background_surface">@color/sud_system_neutral1_900</color>
  617 |     <color name="sud_system_hyperlink_text">@color/sud_system_accent1_300</color>
  618 |     <color name="sud_system_on_primary">@color/sud_system_on_primary_dark</color>
  619 |     <color name="sud_system_primary_text">@color/sud_system_neutral1_50</color>
  620 |     <color name="sud_system_secondary_text">@color/sud_system_neutral2_200</color>
  621 |     <color name="sud_system_surface">@color/sud_system_neutral1_800</color>
  622 |     <color name="sud_system_tertiary_text_inactive">@color/sud_system_neutral2_400</color>
  623 |     <color name="switch_outer_circle_check_disable_color">#29ffffff</color>
  624 |     <color name="switch_outer_circle_disable_color">#29ffffff</color>
```

## source-014

原文件：`D:/Project/other/ColorOS16/analysis/decoded/SystemUI/resources/res/values/colors.xml`  
全文 SHA-256：`375213f5e76f120117b77eb6826a93cd0c9d1e78ee5920d1fb64fcc325379a02`  
原始引用行：562, 1570, 2043

原文件第 556–590 行：

```text
  556 |     <color name="coui_color_card_background">#ffffff</color>
  557 |     <color name="coui_color_card_background_dark">#1affffff</color>
  558 |     <color name="coui_color_card_background_light">#ffffff</color>
  559 |     <color name="coui_color_card_dark">#1affffff</color>
  560 |     <color name="coui_color_card_light">#ffffff</color>
  561 |     <color name="coui_color_card_pressed">#e6e6e6</color>
  562 |     <color name="coui_color_card_pressed_dark">#33ffffff</color>
  563 |     <color name="coui_color_card_pressed_light">#e6e6e6</color>
  564 |     <color name="coui_color_container12">#1f000000</color>
  565 |     <color name="coui_color_container12_dark">#33ffffff</color>
  566 |     <color name="coui_color_container12_light">#1f000000</color>
  567 |     <color name="coui_color_container16">#29000000</color>
  568 |     <color name="coui_color_container16_dark">#40ffffff</color>
  569 |     <color name="coui_color_container16_light">#29000000</color>
  570 |     <color name="coui_color_container4">#0a000000</color>
  571 |     <color name="coui_color_container4_dark">#14ffffff</color>
  572 |     <color name="coui_color_container4_light">#0a000000</color>
  573 |     <color name="coui_color_container8">#14000000</color>
  574 |     <color name="coui_color_container8_dark">#26ffffff</color>
  575 |     <color name="coui_color_container8_default">#14000000</color>
  576 |     <color name="coui_color_container8_light">#14000000</color>
  577 |     <color name="coui_color_container_azure">#cee5eb</color>
  578 |     <color name="coui_color_container_azure_dark">#373f42</color>
  579 |     <color name="coui_color_container_azure_light">#cee5eb</color>
  580 |     <color name="coui_color_container_blue">#c9dae4</color>
  581 |     <color name="coui_color_container_blue_dark">#323739</color>
  582 |     <color name="coui_color_container_blue_light">#c9dae4</color>
  583 |     <color name="coui_color_container_cyan">#bedadd</color>
  584 |     <color name="coui_color_container_cyan_dark">#343e3d</color>
  585 |     <color name="coui_color_container_cyan_light">#bedadd</color>
  586 |     <color name="coui_color_container_green">#badeca</color>
  587 |     <color name="coui_color_container_green_dark">#353e36</color>
  588 |     <color name="coui_color_container_green_light">#badeca</color>
  589 |     <color name="coui_color_container_mint">#badedb</color>
  590 |     <color name="coui_color_container_mint_dark">#394342</color>
```

原文件第 1564–1598 行：

```text
 1564 |     <color name="navigation_bar_home_handle_split_screen_color">#e6808080</color>
 1565 |     <color name="navigation_bar_icon_color">#e5ffffff</color>
 1566 |     <color name="no_notification_text_color">#4d000000</color>
 1567 |     <color name="notification_action_color_filter">@color/secondary_text_default_material_light</color>
 1568 |     <color name="notification_action_rounded_bg_color">#0a000000</color>
 1569 |     <color name="notification_bubble_holo">#2ad181</color>
 1570 |     <color name="notification_card_low_gaussian_mixed_color_bottom_layer">#ff333333</color>
 1571 |     <color name="notification_card_low_gaussian_mixed_color_top_layer">#b2a8a8a8</color>
 1572 |     <color name="notification_card_mixed_color_bottom_layer">#73bfbfbf</color>
 1573 |     <color name="notification_card_mixed_color_bottom_layer_first_stack">#73bfbfbf</color>
 1574 |     <color name="notification_card_mixed_color_bottom_layer_second_stack">#73bfbfbf</color>
 1575 |     <color name="notification_card_mixed_color_top_layer">#b3cccccc</color>
 1576 |     <color name="notification_card_mixed_color_top_layer_first_stack">#99999999</color>
 1577 |     <color name="notification_card_mixed_color_top_layer_second_stack">#5e737373</color>
 1578 |     <color name="notification_close_black">#d9000000</color>
 1579 |     <color name="notification_color_primary_label_default">#e6000000</color>
 1580 |     <color name="notification_color_primary_neutral_default">#e6000000</color>
 1581 |     <color name="notification_color_secondary_label_default">#8a000000</color>
 1582 |     <color name="notification_color_secondary_neutral_default">#8a000000</color>
 1583 |     <color name="notification_color_send_input_hint">#42000000</color>
 1584 |     <color name="notification_expand_button_pill_color_new">#14000000</color>
 1585 |     <color name="notification_gear_color">#262626</color>
 1586 |     <color name="notification_guts_priority_button_bg_fill_color">@color/transparent</color>
 1587 |     <color name="notification_guts_priority_button_bg_fill_color_selected">#ffffff</color>
 1588 |     <color name="notification_guts_priority_button_bg_stroke_color">@color/GM2_grey_300</color>
 1589 |     <color name="notification_guts_priority_button_content_color">@color/GM2_grey_700</color>
 1590 |     <color name="notification_icon_bg_color">#ff9e9e9e</color>
 1591 |     <color name="notification_icon_filter">#ff707173</color>
 1592 |     <color name="notification_legacy_background_color">#ff1a1a1a</color>
 1593 |     <color name="notification_material_background_click">#99000000</color>
 1594 |     <color name="notification_material_background_click_level_a">#e6000000</color>
 1595 |     <color name="notification_material_background_color_compass">#fffafafa</color>
 1596 |     <color name="notification_material_blur_bg">#ccffffff</color>
 1597 |     <color name="notification_menu_icon_background">#ffffff</color>
 1598 |     <color name="notification_panoramic_aod_bg">#1f1f1f</color>
```

原文件第 2037–2071 行：

```text
 2037 |     <color name="status_bar_qs_smalltile_bg_color_active">#19ffffff</color>
 2038 |     <color name="status_bar_qs_smalltile_bg_color_inactive">#19ffffff</color>
 2039 |     <color name="status_bar_qs_tile_accent_color_default">#0066ff</color>
 2040 |     <color name="status_bar_qs_tile_accent_color_default_one_plus_ext">#247cff</color>
 2041 |     <color name="status_bar_qs_tile_accent_color_default_separate">#ccffffff</color>
 2042 |     <color name="status_bar_qs_tile_bg_color_active">#1875f5</color>
 2043 |     <color name="status_bar_qs_tile_bg_color_inactive">#ffffff</color>
 2044 |     <color name="status_bar_qs_tile_bg_color_inactive_default">#ffffff</color>
 2045 |     <color name="status_bar_qs_tile_icon_color_active">#e5ffffff</color>
 2046 |     <color name="status_bar_qs_tile_icon_color_active_default">#e5ffffff</color>
 2047 |     <color name="status_bar_qs_tile_icon_color_active_night">@color/coui_color_white</color>
 2048 |     <color name="status_bar_qs_tile_icon_color_inactive">#b3000000</color>
 2049 |     <color name="status_bar_qs_tile_icon_color_inactive_default">#e6000000</color>
 2050 |     <color name="status_bar_qs_tile_icon_color_inactive_night">#e5ffffff</color>
 2051 |     <color name="status_bar_qs_tile_icon_color_unavailable">#4d000000</color>
 2052 |     <color name="status_bar_qs_tile_icon_color_unavailable_default">#42000000</color>
 2053 |     <color name="status_bar_qs_tile_icon_color_unavailable_night">#4dffffff</color>
 2054 |     <color name="status_bar_qs_tile_label_color">#000000</color>
 2055 |     <color name="status_bar_qs_tile_label_color_default">#ff000000</color>
 2056 |     <color name="status_bar_qs_tile_label_color_unavailable">#4d000000</color>
 2057 |     <color name="status_bar_qs_tile_label_color_unavailable_default">#4d000000</color>
 2058 |     <color name="status_bar_qs_tile_second_label_color">#000000</color>
 2059 |     <color name="status_bar_qs_tile_second_label_color_unavailable">#4d000000</color>
 2060 |     <color name="status_bar_qs_user_icon_default_gray">#66999999</color>
 2061 |     <color name="status_qs_device_charging_image_color">#00bd13</color>
 2062 |     <color name="status_qs_device_charging_image_color_under">#1f000000</color>
 2063 |     <color name="status_qs_device_classic_pattern_container_color">#8cffffff</color>
 2064 |     <color name="sub_display_continue_sub_title_color">#8cffffff</color>
 2065 |     <color name="sub_display_continue_title_color">#d9ffffff</color>
 2066 |     <color name="sub_edit_input_widget_bg">#0f000000</color>
 2067 |     <color name="sub_keyguard_bg_color">#26000000</color>
 2068 |     <color name="sub_lock_pattern_launcher_success_color">#1e1e1e</color>
 2069 |     <color name="sub_num_bg">#33ffffff</color>
 2070 |     <color name="sub_pattern_bg_color">#26000000</color>
 2071 |     <color name="sub_threekey_dialog_blur_background">#b3ffffff</color>
```

## source-015

原文件：`D:/Project/other/ColorOS16/analysis/decoded/SystemUI/resources/res/values/integers.xml`  
全文 SHA-256：`122356f9237d03dae5952fcf90311d50472dc9f5df041549705e1ddb0e69a654`  
原始引用行：19

原文件第 13–47 行：

```text
   13 |     <integer name="aod_surface_bitmap_right_margin">4</integer>
   14 |     <integer name="aod_surface_bitmap_scale_width">33</integer>
   15 |     <integer name="app_bar_elevation_anim_duration">150</integer>
   16 |     <integer name="avatar_picker_columns">3</integer>
   17 |     <integer name="biometric_dialog_text_gravity">8388611</integer>
   18 |     <integer name="biometric_prompt_content_list_item_max_lines_if_two_column">3</integer>
   19 |     <integer name="blur_radius_platform_config">450</integer>
   20 |     <integer name="bottom_sheet_slide_duration">150</integer>
   21 |     <integer name="bouncer_secondary_message_lines">2</integer>
   22 |     <integer name="bubbles_max_overflow">16</integer>
   23 |     <integer name="bubbles_max_rendered">5</integer>
   24 |     <integer name="bubbles_overflow_columns">4</integer>
   25 |     <integer name="cancel_button_image_alpha">127</integer>
   26 |     <integer name="complete_page_grid_guide_column">4</integer>
   27 |     <integer name="complicationFadeInMs">500</integer>
   28 |     <integer name="complicationFadeOutDelayMs">200</integer>
   29 |     <integer name="complicationFadeOutMs">500</integer>
   30 |     <integer name="complicationRestoreMs">1000</integer>
   31 |     <integer name="config_QL_settings_order">200</integer>
   32 |     <integer name="config_QL_settings_order_v2">2650</integer>
   33 |     <integer name="config_anim_repeat_total_count_oneplus">0</integer>
   34 |     <integer name="config_aod_new_aon_expanded_polling_duration">2000</integer>
   35 |     <integer name="config_chargingFastThreshold">7500000</integer>
   36 |     <integer name="config_chargingFastThreshold_v2">20000000</integer>
   37 |     <integer name="config_chargingSlowlyThreshold">5000000</integer>
   38 |     <integer name="config_communalSourceMaxReconnectAttempts">10</integer>
   39 |     <integer name="config_communalSourceReconnectBaseDelay">1000</integer>
   40 |     <integer name="config_connectionMinDuration">1000</integer>
   41 |     <integer name="config_criticalBatteryWarningLevel">2</integer>
   42 |     <integer name="config_defaultPictureInPictureGravity">0x55</integer>
   43 |     <integer name="config_dialogHideAnimationDurationMs">250</integer>
   44 |     <integer name="config_dialogShowAnimationDurationMs">300</integer>
   45 |     <integer name="config_dreamOverlayBurnInProtectionUpdateIntervalMillis">1000</integer>
   46 |     <integer name="config_dreamOverlayInBlurDurationMs">250</integer>
   47 |     <integer name="config_dreamOverlayInComplicationsDurationMs">250</integer>
```

## source-023

原文件：`D:/Project/other/ColorOS16/analysis/focused/notification-material-20261111/com/oplus/systemui/notification/blur/ViewBlurManager.java`  
全文 SHA-256：`381f7f774daf3c10bf4668683d3730d7b2fb47a3c113a3585cdc856f65514ef1`  
原始引用行：729, 755, 871, 894

原文件第 723–783 行：

```text
  723 |             Trace.traceBegin(8L, "motionBlurHelper-refreshMotionBlurAmount");
  724 |             motionBlurHelper$vendor__oplus__packages__apps__systemui__oplus_common__android_common__OplusCommon.tryRefreshBlurAmount$vendor__oplus__packages__apps__systemui__oplus_common__android_common__OplusCommon();
  725 |             Trace.traceEnd(8L);
  726 |         }
  727 |     }
  728 |
  729 |     public static final void access$updateColorValues(ViewBlurManager viewBlurManager, boolean z) {
  730 |         WallpaperColors wallpaperColors = viewBlurManager.keyguardWallpaperColors;
  731 |         MaterialStyle materialStyle = MaterialStyle.CONTENT;
  732 |         if (wallpaperColors != null) {
  733 |             Context context = viewBlurManager.context;
  734 |             int argb = wallpaperColors.getPrimaryColor().toArgb();
  735 |             double d = z ? 30.0d : 95.0d;
  736 |             int i = UxWallpaperColors.COLOR_MIDDLE_GRAY;
  737 |             viewBlurManager.keyguardMaterialColor = new Material3ColorManager().getUxSn(context, argb, z, d, materialStyle);
  738 |             viewBlurManager.keyguardButtonMaterialColor = new Material3ColorManager().getUxSn(viewBlurManager.context, wallpaperColors.getPrimaryColor().toArgb(), z, z ? 40.0d : 70.0d, materialStyle);
  739 |         }
  740 |         WallpaperColors wallpaperColors2 = viewBlurManager.wallpaperColors;
  741 |         if (wallpaperColors2 != null) {
  742 |             Context context2 = viewBlurManager.context;
  743 |             int argb2 = wallpaperColors2.getPrimaryColor().toArgb();
  744 |             double d2 = z ? 30.0d : 95.0d;
  745 |             int i2 = UxWallpaperColors.COLOR_MIDDLE_GRAY;
  746 |             viewBlurManager.notificationCenterMaterialColor = new Material3ColorManager().getUxSn(context2, argb2, z, d2, materialStyle);
  747 |             viewBlurManager.notificationCenterButtonMaterialColor = new Material3ColorManager().getUxSn(viewBlurManager.context, wallpaperColors2.getPrimaryColor().toArgb(), z, z ? 40.0d : 70.0d, materialStyle);
  748 |         }
  749 |     }
  750 |
  751 |     public static final void access$updatePlatformBlurMode(ViewBlurManager viewBlurManager, boolean z) {
  752 |         ((PlatformBlurManager) viewBlurManager.platformBlurManager.get()).setPlatformBlurMode((!z || ScrimUtil.isLowGaussianLevel(viewBlurManager.context)) ? PlatformBlurManager.PlatformBlurMode.AUTO : PlatformBlurManager.PlatformBlurMode.MOTION);
  753 |     }
  754 |
  755 |     public static ViewBlurProxy.BlurType decideBlurType() {
  756 |         if (!SuperPowerSaveSettingsObserver.Companion.getInstance().isSuperPowerSaveState && !ScrimUtil.isBAnimLevel()) {
  757 |             ScrimControllerEx.Companion.getClass();
  758 |             if (!ScrimControllerEx.isThirdTheme) {
  759 |                 if (ScrimUtil.isBPAnimLevel()) {
  760 |                     return ViewBlurProxy.BlurType.BlurTypeBlendWallpaper.INSTANCE;
  761 |                 }
  762 |                 return GaussBlurUtils.isGaussBlurDisabled() ? ViewBlurProxy.BlurType.BlurTypeNon.INSTANCE : ViewBlurProxy.BlurType.BlurTypePlatformStatic.INSTANCE;
  763 |             }
  764 |         }
  765 |         return ViewBlurProxy.BlurType.BlurTypeNon.INSTANCE;
  766 |     }
  767 |
  768 |     public static void logViewBlurInfo(ViewBlurProxy viewBlurProxy, String str) {
  769 |         LogBuffer logBuffer = DebugTool.INSTANCE.getLogBuffer();
  770 |         if (logBuffer != null) {
  771 |             logBuffer.log(TAG, LogLevel.DEBUG, "updateBlurType-from-" + str + " " + viewBlurProxy.getBlurType() + " for " + DebugToolKt.getName(viewBlurProxy.getView(), false), (Throwable) null);
  772 |         }
  773 |     }
  774 |
  775 |     /* JADX INFO: Access modifiers changed from: private */
  776 |     public final void setCurrentColorsByState(boolean z) {
  777 |         if (this.statusBarStateController.getState() == 1) {
  778 |             Integer num = this.keyguardMaterialColor;
  779 |             setCurrentMaterialColorWithTransition(num != null ? num.intValue() : 0, z);
  780 |             Integer num2 = this.keyguardButtonMaterialColor;
  781 |             this.currentButtonMaterialColor = num2 != null ? num2.intValue() : 0;
  782 |         } else if (ScrimUtil.isBAnimLevel()) {
  783 |             Integer num3 = this.notificationCenterMaterialColor;
```

原文件第 865–922 行：

```text
  865 |     }
  866 |
  867 |     public final Integer getKeyguardMaterialColor() {
  868 |         return this.keyguardMaterialColor;
  869 |     }
  870 |
  871 |     public final BlurMixConfig getMixConfig(CardType cardType) {
  872 |         if (ScrimUtil.isBPAnimLevel()) {
  873 |             return OplusDarkModeUtil.isNightMode(this.context) ? NotifiAndQsPlatformBlurExKt.panelElementPlatformMixConfig(new MixColor(4, this.lowGaussianNormalCardMixedTopLayerColor, this.lowGaussianNormalCardMixedBottomLayerColor)) : new BlurMixConfig.BlurMixSingle(new MixColor(2, this.lowGaussianNormalCardMixedTopLayerColor, this.lowGaussianNormalCardMixedBottomLayerColor));
  874 |         }
  875 |         int iOrdinal = cardType.ordinal();
  876 |         if (iOrdinal == 1) {
  877 |             return customCardPlatformMixConfig();
  878 |         }
  879 |         if (iOrdinal == 2) {
  880 |             return NotifiAndQsPlatformBlurExKt.capsuleCardPlatformMixConfig(new MixColor(2, this.lockscreenCapsuleMixedTop, this.lockscreenCapsuleMixedBottom));
  881 |         }
  882 |         Context context = this.context;
  883 |         return NotifiAndQsPlatformBlurExKt.panelElementPlatformMixWithShaderConfig(context, new MixColorWithShader(5, this.normalCardMixedTopLayerColor, OplusDarkModeUtil.isNightMode(context) ? 2 : 4, this.normalCardMixedBottomLayerColor));
  884 |     }
  885 |
  886 |     public final Integer getNotificationCenterButtonMaterialColor() {
  887 |         return this.notificationCenterButtonMaterialColor;
  888 |     }
  889 |
  890 |     public final Integer getNotificationCenterMaterialColor() {
  891 |         return this.notificationCenterMaterialColor;
  892 |     }
  893 |
  894 |     public final BlurMixConfig.BlurMixSingle headsupCardMotionMixConfig(CardType cardType) {
  895 |         ScrimControllerEx.Companion.getClass();
  896 |         if (ScrimControllerEx.isThirdTheme) {
  897 |             return null;
  898 |         }
  899 |         if (WhenMappings.$EnumSwitchMapping$0[cardType.ordinal()] == 1) {
  900 |             return new BlurMixConfig.BlurMixSingle(new MixColor(4, this.customCardMixedTopLayerColor, this.customCardMixedBottomLayerColor));
  901 |         }
  902 |         return new BlurMixConfig.BlurMixSingle(new MixColor(OplusDarkModeUtil.isNightMode(this.context) ? 4 : 5, this.headsUpCardMixedTopLayerColor, this.headsUpCardMixedBottomLayerColor));
  903 |     }
  904 |
  905 |     public final void initOnDrawListener(final View view) {
  906 |         if (view != null) {
  907 |             if (view.isAttachedToWindow()) {
  908 |                 LogUtil.d$default(8, LogUtil.TAG_NOTIFICATION, TAG, "[doOnAttach] " + view);
  909 |                 view.getViewTreeObserver().addOnDrawListener(this.onDrawListener);
  910 |             } else {
  911 |                 final int i = 0;
  912 |                 view.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() { // from class: com.oplus.systemui.notification.blur.ViewBlurManager$initOnDrawListener$lambda$22$$inlined$doOnAttach$1
  913 |                     @Override // android.view.View.OnAttachStateChangeListener
  914 |                     public final void onViewAttachedToWindow(View view2) {
  915 |                         switch (i) {
  916 |                             case 0:
  917 |                                 view.removeOnAttachStateChangeListener(this);
  918 |                                 LogUtil.d$default(8, LogUtil.TAG_NOTIFICATION, "ViewBlurManager", "[doOnAttach] " + view2);
  919 |                                 view2.getViewTreeObserver().addOnDrawListener(this.onDrawListener);
  920 |                                 break;
  921 |                         }
  922 |                     }
```

## source-024

原文件：`D:/Project/other/ColorOS16/analysis/focused/notification-material-20261111/com/oplus/systemui/notification/lockscreen/effect/BlurStroke.java`  
全文 SHA-256：`de48dd6ad3f73b85580e47b48c6a5e27c5e6af1ede301719461a17545ad6596a`  
原始引用行：21

原文件第 15–49 行：

```text
   15 |     private final GradientStrokeLineParams strokeParams;
   16 |
   17 |     /* JADX INFO: compiled from: go/retraceme c8d3092c319854c1e1f5c3e52789e3ee1113927496398e838173c381d04d9b15 */
   18 |     public final class Companion {
   19 |     }
   20 |
   21 |     public BlurStroke() {
   22 |         GradientStrokeLineParams.LineParams lineParams = new GradientStrokeLineParams.LineParams(6, 0.4f, 0.2f, 0.2f, 0.0f, 0.0f);
   23 |         this.lineParamsLT = lineParams;
   24 |         GradientStrokeLineParams.LineParams lineParams2 = new GradientStrokeLineParams.LineParams(6, 0.2f, 0.2f, 0.2f, 0.0f, 0.0f);
   25 |         this.lineParamsRB = lineParams2;
   26 |         GradientStrokeLineParams gradientStrokeLineParams = new GradientStrokeLineParams(-1, 0.67f, lineParams, lineParams2);
   27 |         this.normalGradientStrokeParams = gradientStrokeLineParams;
   28 |         GradientStrokeLineParams gradientStrokeLineParams2 = new GradientStrokeLineParams();
   29 |         gradientStrokeLineParams2.copyFrom(gradientStrokeLineParams);
   30 |         this.strokeParams = gradientStrokeLineParams2;
   31 |     }
   32 |
   33 |     public final void bindCard(BlurConfig blurConfig, float f) {
   34 |         NotificationEffectRepository.Companion.getClass();
   35 |         if (NotificationEffectRepository.isSupportBlurStroke) {
   36 |             if (f == 0.0f) {
   37 |                 blurConfig.setGradientStrokeLineParam(null);
   38 |                 return;
   39 |             }
   40 |             if (f <= this.normalGradientStrokeParams.getNearLineParams().getAlpha()) {
   41 |                 this.strokeParams.getNearLineParams().setAlpha(f);
   42 |             } else if (this.strokeParams.getNearLineParams().getAlpha() != this.normalGradientStrokeParams.getNearLineParams().getAlpha()) {
   43 |                 this.strokeParams.getNearLineParams().setAlpha(this.normalGradientStrokeParams.getNearLineParams().getAlpha());
   44 |             }
   45 |             if (f <= this.normalGradientStrokeParams.getFarLineParams().getAlpha()) {
   46 |                 this.strokeParams.getFarLineParams().setAlpha(f);
   47 |             } else if (this.strokeParams.getFarLineParams().getAlpha() != this.normalGradientStrokeParams.getFarLineParams().getAlpha()) {
   48 |                 this.strokeParams.getFarLineParams().setAlpha(this.normalGradientStrokeParams.getFarLineParams().getAlpha());
   49 |             }
```

## source-025

原文件：`D:/Project/other/ColorOS16/analysis/focused/notification-material-20261111/com/oplusos/systemui/common/blurability/platformblur/KeyguardStackingBlurConfig.java`  
全文 SHA-256：`28f330a91fdc650b48887eeb2124967649f48071a1a8b97aef05dd89d9d09a83`  
原始引用行：54

原文件第 48–68 行：

```text
   48 |         blurConfig2.setCornerRadius(f2);
   49 |         linkedHashMap.put(1, blurConfig);
   50 |         linkedHashMap.put(2, blurConfig2);
   51 |         return linkedHashMap;
   52 |     }
   53 |
   54 |     @Override // com.oplusos.systemui.common.blurability.platformblur.BlurConfigsProvider
   55 |     public BlurMixConfig createPlatformMixConfig(int i) {
   56 |         if (i == 1) {
   57 |             return OplusDarkModeUtil.isNightMode(this.context) ? NotifiAndQsPlatformBlurExKt.panelElementPlatformMixWithShaderConfig(this.context, new MixColorWithShader(5, this.normalCardMixedTopLayerColorFirstStack, 2, this.normalCardMixedBottomLayerColorFirstStack)) : new BlurMixConfig.BlurMixMultiWithShader(new MixColorWithShader(5, this.normalCardMixedTopLayerColorFirstStack, 4, this.normalCardMixedBottomLayerColorFirstStack), MixColorWithShader.Companion.getEMPTY());
   58 |         }
   59 |         return OplusDarkModeUtil.isNightMode(this.context) ? NotifiAndQsPlatformBlurExKt.panelElementPlatformMixWithShaderConfig(this.context, new MixColorWithShader(5, this.normalCardMixedTopLayerColorSecondStack, 2, this.normalCardMixedBottomLayerColorSecondStack)) : new BlurMixConfig.BlurMixMultiWithShader(new MixColorWithShader(5, this.normalCardMixedTopLayerColorSecondStack, 4, this.normalCardMixedBottomLayerColorSecondStack), MixColorWithShader.Companion.getEMPTY());
   60 |     }
   61 |
   62 |     public final void updateResource() {
   63 |         this.normalCardMixedTopLayerColorFirstStack = this.context.getColor(R.color.notification_card_mixed_color_top_layer_first_stack);
   64 |         this.normalCardMixedBottomLayerColorFirstStack = this.context.getColor(R.color.notification_card_mixed_color_bottom_layer_first_stack);
   65 |         this.normalCardMixedTopLayerColorSecondStack = this.context.getColor(R.color.notification_card_mixed_color_top_layer_second_stack);
   66 |         this.normalCardMixedBottomLayerColorSecondStack = this.context.getColor(R.color.notification_card_mixed_color_bottom_layer_second_stack);
   67 |     }
   68 | }
```

## source-026

原文件：`D:/Project/other/ColorOS16/analysis/focused/notification-material-20261111/com/oplusos/systemui/common/util/NotifiAndQsPlatformBlurExKt.java`  
全文 SHA-256：`071ef153e97e681ce8a1cfcdfac631d42f0af23748a4e628f4daaa790202f437`  
原始引用行：16

原文件第 10–44 行：

```text
   10 | import com.oplusos.systemui.common.blurability.ViewBlurProxy;
   11 |
   12 | /* JADX INFO: compiled from: go/retraceme c8d3092c319854c1e1f5c3e52789e3ee1113927496398e838173c381d04d9b15 */
   13 | /* JADX INFO: loaded from: classes4.dex */
   14 | public abstract class NotifiAndQsPlatformBlurExKt {
   15 |     public static final String TAG = "NotifiAndQsPlatformBlurEx";
   16 |     private static final MixColor PANEL_DEPRECATED_MIX_COLOR = new MixColor(5, Color.parseColor("#99333333"), Color.parseColor("#80999999"));
   17 |     private static final MixColorWithShader PANEL_LIGHT_MIX_COLOR = new MixColorWithShader(5, Color.parseColor("#99333333"), 2, Color.parseColor("#80999999"));
   18 |     private static final MixColorWithShader PANEL_NIGHT_MIX_COLOR = new MixColorWithShader(5, Color.parseColor("#A6404040"), 2, Color.parseColor("#80999999"));
   19 |     private static final MixColor BOUNCER_MIX_COLOR = new MixColor(5, Color.parseColor("#99262626"), Color.parseColor("#66A6A6A6"));
   20 |
   21 |     public static final void applyPanelMirrorScale(boolean z, float f, ViewBlurProxy viewBlurProxy) {
   22 |         viewBlurProxy.getBlurConfig().getPlatformMixConfig().setMirrorScale(z ? MathUtils.lerp(1.0f, 0.9f, f) : 1.0f);
   23 |     }
   24 |
   25 |     public static final BlurMixConfig capsuleCardPlatformMixConfig(MixColor mixColor) {
   26 |         return new BlurMixConfig.BlurMixMulti(mixColor, new MixColor(0, 0, 0));
   27 |     }
   28 |
   29 |     public static final MixColor getBOUNCER_MIX_COLOR() {
   30 |         return BOUNCER_MIX_COLOR;
   31 |     }
   32 |
   33 |     public static final MixColor getPANEL_DEPRECATED_MIX_COLOR() {
   34 |         return PANEL_DEPRECATED_MIX_COLOR;
   35 |     }
   36 |
   37 |     public static final MixColorWithShader getPANEL_LIGHT_MIX_COLOR() {
   38 |         return PANEL_LIGHT_MIX_COLOR;
   39 |     }
   40 |
   41 |     public static final MixColorWithShader getPANEL_NIGHT_MIX_COLOR() {
   42 |         return PANEL_NIGHT_MIX_COLOR;
   43 |     }
   44 |
```

## source-027

原文件：`D:/Project/other/ColorOS16/analysis/focused/notification-pipeline-20261111/com/oplus/systemui/notification/lockscreen/effect/NotificationEffectRepository.java`  
全文 SHA-256：`59b3a462783592bedb05661aaa696088560d2a2e89e05b410c0e0e313bac76a0`  
原始引用行：17

原文件第 11–45 行：

```text
   11 | import kotlinx.coroutines.flow.StateFlow;
   12 |
   13 | /* JADX INFO: compiled from: go/retraceme c8d3092c319854c1e1f5c3e52789e3ee1113927496398e838173c381d04d9b15 */
   14 | /* JADX INFO: loaded from: classes3.dex */
   15 | public final class NotificationEffectRepository {
   16 |     public static final Companion Companion = new Companion();
   17 |     private static final String STROKE_ENABLE_KEY = "system_material_stroke_enable";
   18 |     private static final String TAG = "CapsuleEffectRepository";
   19 |     public static boolean isSupportBlurStroke;
   20 |     private final Context context;
   21 |     private final StateFlow isStrokeLineEnable;
   22 |     private final Flow isSupportStrokeLine;
   23 |     private final SystemSettings systemSettings;
   24 |
   25 |     /* JADX INFO: compiled from: go/retraceme c8d3092c319854c1e1f5c3e52789e3ee1113927496398e838173c381d04d9b15 */
   26 |     public final class Companion {
   27 |     }
   28 |
   29 |     public NotificationEffectRepository(Context context, SystemSettings systemSettings, SelectedUserInteractor selectedUserInteractor) {
   30 |         this.context = context;
   31 |         this.systemSettings = systemSettings;
   32 |         Flow flowTransformLatest = FlowKt.transformLatest(selectedUserInteractor.getSelectedUser(), new NotificationEffectRepository$special$$inlined$flatMapLatest$1(null, this));
   33 |         CoroutineScope settingsScope = systemSettings.getSettingsScope();
   34 |         SharingStarted sharingStartedWhileSubscribed$default = SharingStarted.Companion.WhileSubscribed$default(SharingStarted.Companion, 0L, 3);
   35 |         Boolean bool = Boolean.FALSE;
   36 |         StateFlow stateFlowStateIn = FlowKt.stateIn(flowTransformLatest, settingsScope, sharingStartedWhileSubscribed$default, bool);
   37 |         this.isStrokeLineEnable = stateFlowStateIn;
   38 |         this.isSupportStrokeLine = CapsuleBlurHelper.INSTANCE.userNormalDrawable(context) ? FlowKt.flowOf(bool) : stateFlowStateIn;
   39 |     }
   40 |
   41 |     public static final boolean access$iSupportStrokeSettingEnabled(NotificationEffectRepository notificationEffectRepository, int i) {
   42 |         return notificationEffectRepository.systemSettings.getIntForUser(STROKE_ENABLE_KEY, 0, i) == 1;
   43 |     }
   44 |
   45 |     public final StateFlow isStrokeLineEnable() {
```

## source-028

原文件：`D:/Project/other/ColorOS16/analysis/focused/notification-pipeline-20261111/com/oplusos/systemui/common/blurability/platformblur/PlatformBlurDrawable.java`  
全文 SHA-256：`217c255da5704f12e3daa9487b5d0790604befa816fac2b4992bc692112caba0`  
原始引用行：77, 124

原文件第 71–105 行：

```text
   71 |                 logBuffer.log(TAG, LogLevel.DEBUG, "[setBlurMaskColor] " + Integer.toHexString(i) + " for " + ((String) this.getHostViewName.invoke()), (Throwable) null);
   72 |             }
   73 |             this.blurMaskColor = i;
   74 |             this.maskPaint.setColor(i);
   75 |         }
   76 |     }
   77 |
   78 |     public final BlurDrawable applyBlurConfig(BlurConfig blurConfig, float f) {
   79 |         BlurDrawable blurDrawable = this.blurDrawable;
   80 |         int i = 0;
   81 |         setBlurMaskColor(0);
   82 |         float mirrorScale = blurConfig.getPlatformMixConfig().getMirrorScale();
   83 |         this.currentBlurMixConfig = blurConfig.getPlatformMixConfig();
   84 |         BlurMixConfig platformMixConfig = blurConfig.getPlatformMixConfig();
   85 |         int i2 = 63;
   86 |         if ((platformMixConfig instanceof BlurMixConfig.None) || (platformMixConfig instanceof BlurMixConfig.OverlayColor)) {
   87 |             BlurParam blurParam = new BlurParam(i, i2);
   88 |             blurParam.setBlurRadius((int) (blurConfig.getBlurRadius() * f));
   89 |             blurDrawable.setBlurParamsSync(blurParam);
   90 |             if (platformMixConfig instanceof BlurMixConfig.OverlayColor) {
   91 |                 BlurMixConfig.OverlayColor overlayColor = (BlurMixConfig.OverlayColor) platformMixConfig;
   92 |                 ShaderBlendParamHelper.INSTANCE.updateOverlayColorShaderParams(overlayColor, blurConfig.getBlurColor());
   93 |                 blurDrawable.setShaderBlendParams(overlayColor.getMixOverlayColorShaderParams());
   94 |                 setBlurMaskColor(blurConfig.getBlurColor());
   95 |             }
   96 |         } else if (platformMixConfig instanceof BlurMixConfig.BlurMixSingle) {
   97 |             BlurParam blurParam2 = new BlurParam(i, i2);
   98 |             applyMixColorAndScale(blurParam2, ((BlurMixConfig.BlurMixSingle) platformMixConfig).getMixColor(), mirrorScale, f);
   99 |             blurParam2.setBlurRadius((int) (blurConfig.getBlurRadius() * f));
  100 |             blurDrawable.setBlurParamsSync(blurParam2);
  101 |         } else if (platformMixConfig instanceof BlurMixConfig.BlurMixMulti) {
  102 |             BlurMixConfig.BlurMixMulti blurMixMulti = (BlurMixConfig.BlurMixMulti) platformMixConfig;
  103 |             BlurParam blurParam3 = new BlurParam(i, i2);
  104 |             applyMixColorAndScale(blurParam3, blurMixMulti.getBackgroundMixColor(), mirrorScale, f);
  105 |             blurParam3.setBlurRadius((int) (blurConfig.getBlurRadius() * f));
```

原文件第 118–152 行：

```text
  118 |                 blurDrawable.setEnableBlurShader(true);
  119 |                 blurDrawable.setShaderBlendParams(blurMixSingleWithShader.getMixSingleShaderParams());
  120 |                 blurDrawable.setBlurParamsSync(blurParam4);
  121 |             }
  122 |         } else {
  123 |             if (!(platformMixConfig instanceof BlurMixConfig.BlurMixMultiWithShader)) {
  124 |                 throw new NoWhenBranchMatchedException();
  125 |             }
  126 |             BlurMixConfig.BlurMixMultiWithShader blurMixMultiWithShader = (BlurMixConfig.BlurMixMultiWithShader) platformMixConfig;
  127 |             if (this.blurParam == null) {
  128 |                 this.blurParam = new BlurParam(i, i2);
  129 |             }
  130 |             BlurParam blurParam5 = this.blurParam;
  131 |             if (blurParam5 != null) {
  132 |                 ShaderBlendParamHelper.INSTANCE.updateMixMultiShaderParams(blurMixMultiWithShader, f);
  133 |                 blurParam5.getBaseParam().setZoomScale(mirrorScale);
  134 |                 blurParam5.setBlurRadius((int) (blurConfig.getBlurRadius() * f));
  135 |                 blurDrawable.setEnableBlurShader(true);
  136 |                 blurDrawable.setShaderBlendParams(blurMixMultiWithShader.getMixMultiShaderParams());
  137 |                 blurDrawable.setBlurParamsSync(blurParam5);
  138 |             }
  139 |         }
  140 |         BlurMixConfig blurMixConfig = this.aodBlurMixConfig;
  141 |         if (this.isAodState && this.isAodDirty && blurMixConfig != null && blurMixConfig.getClass().equals(this.currentBlurMixConfig.getClass())) {
  142 |             changeBlurColor(blurMixConfig, false);
  143 |         } else {
  144 |             this.isAodDirty = false;
  145 |         }
  146 |         blurDrawable.setGradientStrokeLineParams(blurConfig.getGradientStrokeLineParam());
  147 |         blurDrawable.setCornerParams(blurConfig.getGradientStrokeCornerParam());
  148 |         BlurDrawablePathProvider pathProvider = blurConfig.getPathProvider();
  149 |         if (pathProvider != null) {
  150 |             blurDrawable.setPathProvider(pathProvider);
  151 |         } else {
  152 |             Float radiusWeight = blurConfig.getRadiusWeight();
```

## source-029

原文件：`D:/Project/other/ColorOS16/analysis/focused/notification-pipeline-20261111/com/oplusos/systemui/common/blurability/ViewBlurProxy.java`  
全文 SHA-256：`7b77ccc773c03b1b023f2eb77955f23a6c9b0156190a8969baa44aecff7842b2`  
原始引用行：324

原文件第 318–352 行：

```text
  318 |         BlendWallpaperBlurDrawable blendDrawable = getBlendWallpaperBlurHelper().getBlendDrawable();
  319 |         if (blendDrawable == null || blendDrawable.applyBlurConfig(this.blurConfig, this.blurAmount, this.currentWallpaperBlurBitmap) == null) {
  320 |             getBlendWallpaperBlurHelper().ensureBlendDrawable();
  321 |         }
  322 |     }
  323 |
  324 |     public final void applyConfigToMotionBlur() {
  325 |         IBackgroundBlurDrawableExt extImpl;
  326 |         BackgroundBlurDrawable blurDrawable = getMotionBlurHelper$vendor__oplus__packages__apps__systemui__oplus_common__android_common__OplusCommon().getBlurDrawable();
  327 |         if (blurDrawable != null) {
  328 |             LogUtil.d$default(8, LogUtil.TAG_COMMON, TAG, "[applyConfigToMotionBlur] for " + DebugToolKt.getName(this.view, false) + ",blurAmount=" + this.blurAmount + ",configRadius=" + this.blurConfig.getBlurRadius());
  329 |             blurDrawable.setAlpha((int) (((float) 255) * this.blurAmount));
  330 |             blurDrawable.setBlurRadius((int) (((float) this.blurConfig.getBlurRadius()) * this.blurAmount));
  331 |             blurDrawable.setCornerRadius(this.blurConfig.getLeftTopCornerRadius(), this.blurConfig.getRightTopCornerRadius(), this.blurConfig.getLeftBottomCornerRadius(), this.blurConfig.getRightBottomCornerRadius());
  332 |             BlurMixConfig.BlurMixSingle motionBlurMixConfig = this.blurConfig.getMotionBlurMixConfig();
  333 |             MixColor mixColor = motionBlurMixConfig != null ? motionBlurMixConfig.getMixColor() : null;
  334 |             IBackgroundBlurDrawableWrapper wrapper = blurDrawable.getWrapper();
  335 |             if (wrapper == null) {
  336 |                 wrapper = null;
  337 |             }
  338 |             if (wrapper != null && (extImpl = wrapper.getExtImpl()) != null) {
  339 |                 OplusBlurParam oplusBlurParam = new OplusBlurParam();
  340 |                 if (mixColor != null) {
  341 |                     oplusBlurParam.setMaterialParams(mixColor.getMode(), colorToFloatArray(mixColor.getBottomLayerColor()), colorToFloatArray(mixColor.getTopLayerColor()));
  342 |                 }
  343 |                 oplusBlurParam.setBlurType(2);
  344 |                 Float radiusWeight = this.blurConfig.getRadiusWeight();
  345 |                 if (radiusWeight != null) {
  346 |                     oplusBlurParam.setSmoothCornerWeight(radiusWeight.floatValue());
  347 |                 }
  348 |                 extImpl.setBlurParams(oplusBlurParam);
  349 |             }
  350 |             blurDrawable.setColor(motionBlurMixConfig == null ? this.blurConfig.getBlurColor() : 0);
  351 |             if (this.blurConfig.getEnableMotionAmountWithAlphaToUser()) {
  352 |                 getMotionBlurHelper$vendor__oplus__packages__apps__systemui__oplus_common__android_common__OplusCommon().setOnViewAlphaToUser$vendor__oplus__packages__apps__systemui__oplus_common__android_common__OplusCommon(new ViewBlurProxy$$ExternalSyntheticLambda7(this, 0));
```

## source-045

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-backend-analysis-20261111/com/oplus/posteffect/agsl/ShaderBlendParam.java`  
全文 SHA-256：`4ed3afef91000ffc9cf3ab7585212bdf63956739c9c300c0a6017c92d978aec3`  
原始引用行：60, 62

原文件第 54–90 行：

```text
   54 |     public String toString() {
   55 |         return "ShaderBlendParam{Mode: " + Companion.getModeString(this.mode) + ", RGBA=(" + (Color.red(this.color) / 255.0f) + ',' + (Color.green(this.color) / 255.0f) + ',' + (Color.blue(this.color) / 255.0f) + ',' + (Color.alpha(this.color) / 255.0f) + ")}";
   56 |     }
   57 |
   58 |     /* JADX INFO: compiled from: go/retraceme c8d3092c319854c1e1f5c3e52789e3ee1113927496398e838173c381d04d9b15 */
   59 |     public final class Companion {
   60 |         public final String getModeString(int i) {
   61 |             switch (i) {
   62 |                 case 0:
   63 |                     return "NONE";
   64 |                 case 1:
   65 |                     return "MIX";
   66 |                 case 2:
   67 |                     return "OVERLAY";
   68 |                 case 3:
   69 |                     return "DODGE_BG";
   70 |                 case 4:
   71 |                     return "DODGE";
   72 |                 case 5:
   73 |                     return "LUMINOSITY";
   74 |                 case 6:
   75 |                     return "LIGHTEN";
   76 |                 case 7:
   77 |                     return "SATURATION";
   78 |                 case 8:
   79 |                     return "SOFT_LIGHT";
   80 |                 case 9:
   81 |                     return "PLUS_DARKER";
   82 |                 case 10:
   83 |                     return "PLUS_LIGHTER";
   84 |                 default:
   85 |                     return "MODE_UNKNOWN";
   86 |             }
   87 |         }
   88 |
   89 |         public final boolean isDiff(ArrayList<ShaderBlendParam> arrayList, ArrayList<ShaderBlendParam> arrayList2) {
   90 |             if ((arrayList != null ? arrayList.size() : 0) != (arrayList2 != null ? arrayList2.size() : 0)) {
```

## source-046

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-base-analysis-20261111/com/oplus/posteffect/drawable/BaseDrawable.java`  
全文 SHA-256：`8e4caaf57e8e2e8520b34faca4a664c3aadfced2b3739382fa9f1b67efc53bd9`  
原始引用行：31

原文件第 25–59 行：

```text
   25 | import com.oplus.posteffect.BaseParam;
   26 | import com.oplus.posteffect.BlurParam;
   27 | import com.oplus.posteffect.CornerParams;
   28 | import com.oplus.posteffect.CornerType;
   29 | import com.oplus.posteffect.ForegroundBlurParam;
   30 | import com.oplus.posteffect.GradientStrokeLineParams;
   31 | import com.oplus.posteffect.agsl.BlurDrawableShaderBaseStringKt;
   32 | import com.oplus.posteffect.agsl.DrawableShader;
   33 | import com.oplus.posteffect.config.ConfigurationObserver;
   34 | import com.oplus.posteffect.config.ConfigurationObserverImpl;
   35 | import com.oplus.posteffect.image.ContentImage;
   36 | import com.oplus.posteffect.interfaces.IBase;
   37 | import com.oplus.posteffect.path.BaseRoundRectPathProvider;
   38 | import com.oplus.posteffect.path.BlurDrawablePathProvider;
   39 | import com.oplus.posteffect.path.RoundRectPathProvider;
   40 | import com.oplus.posteffect.path.SmoothRoundRectPathProvider;
   41 | import com.oplus.posteffect.util.Log;
   42 | import com.oplus.posteffect.util.OplusPathAdapterCompatUtils;
   43 | import com.oplus.posteffect.util.OsdkUtilsKt;
   44 | import com.oplus.posteffect.util.PointUtilKt;
   45 | import com.oplus.posteffect.util.TraceUtilsKt;
   46 | import com.oplus.wrapper.app.WindowConfiguration;
   47 | import java.lang.reflect.InvocationTargetException;
   48 | import kotlin.Lazy;
   49 | import kotlin.LazyKt__LazyJVMKt;
   50 | import kotlin.LazyThreadSafetyMode;
   51 | import kotlin.Unit;
   52 | import kotlin.jvm.functions.Function0;
   53 | import kotlin.jvm.internal.Intrinsics;
   54 |
   55 | /* JADX INFO: compiled from: go/retraceme c8d3092c319854c1e1f5c3e52789e3ee1113927496398e838173c381d04d9b15 */
   56 | /* JADX INFO: loaded from: classes3.dex */
   57 | public class BaseDrawable extends Drawable implements IBase {
   58 |     public static final Companion Companion = new Companion();
   59 |     public static final String TAG = "BaseDrawable";
```

## source-047

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-blend-analysis-20261111/com/oplus/posteffect/drawable/BlendDrawable.java`  
全文 SHA-256：`6d33f46637ef32e41e2c23b52f9ffdbe3a301da6e783b6b15e1ba30db5510b26`  
原始引用行：111

原文件第 105–139 行：

```text
  105 |
  106 |     @Override // com.oplus.posteffect.interfaces.IBlendable
  107 |     public void setBlendParams(BlendParam blendParam) {
  108 |         setBlendParams(blendParam, null);
  109 |     }
  110 |
  111 |     public final void setShaderBlendParams(ArrayList<ShaderBlendParam> arrayList) {
  112 |         synchronized (getDataLock()) {
  113 |             try {
  114 |                 if (getEnableShader()) {
  115 |                     getDrawableShader().setMultiBlendParams(arrayList);
  116 |                     invalidate();
  117 |                 } else {
  118 |                     Log.w(BaseDrawable.TAG, "[setShaderBlendParams] failed to set shader blend params when enableBlurShader is false. ");
  119 |                 }
  120 |             } catch (Throwable th) {
  121 |                 throw th;
  122 |             }
  123 |         }
  124 |     }
  125 |
  126 |     public void setBlendParams(BlendParam blendParam, ForegroundBlurParam foregroundBlurParam) {
  127 |         synchronized (getDataLock()) {
  128 |             try {
  129 |                 boolean foreColorParams = setForeColorParams(foregroundBlurParam);
  130 |                 if (!Intrinsics.areEqual(getDrawingParam().getBlendParam(), blendParam) || foreColorParams) {
  131 |                     if (getEnableShader()) {
  132 |                         if (getDrawingParam().getBlendParam().isDiffBlend(blendParam) || foreColorParams) {
  133 |                             getDrawableShader().setBgAndFgBlendParams(blendParam, getForegroundBlurParams());
  134 |                         }
  135 |                         invalidate();
  136 |                     }
  137 |                     getDrawingParam().getBlendParam().copyFrom(blendParam);
  138 |                 }
  139 |             } catch (Throwable th) {
```

## source-048

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-continuous-analysis-20261111/com/oplus/posteffect/drawable/ContinuousBlurDrawable.java`  
全文 SHA-256：`e898d9d51539ea0f0857e332193fff64330ab1434e06c62eb041f384728fc645`  
原始引用行：127

原文件第 121–155 行：

```text
  121 |                     invalidate();
  122 |                 }
  123 |             }
  124 |         }
  125 |     }
  126 |
  127 |     public final void addBlurDrawable() {
  128 |         Log.d(TAG, "addBlurDrawable sfc=" + this.surfaceControl);
  129 |         if (this.isRegistered) {
  130 |             return;
  131 |         }
  132 |         getBlurDrawableManager().addBlurDrawable(this.surfaceControl, getDrawableId(), getDrawingParam(), this.exclusive.get(), this.blurStateListener, getEnableShader());
  133 |         if (Log.DEBUG) {
  134 |             setShaderBlendTypeValue(BlurDrawableManager.Companion.getSBlendTypeValue());
  135 |         }
  136 |         this.isRegistered = true;
  137 |     }
  138 |
  139 |     @Override // com.oplus.posteffect.interfaces.IBlurable
  140 |     public BlurParam getBlurParams() {
  141 |         BlurParam blurParamCopy$default;
  142 |         synchronized (getDataLock()) {
  143 |             blurParamCopy$default = BlurParam.copy$default(getDrawingParam(), null, 63);
  144 |         }
  145 |         return blurParamCopy$default;
  146 |     }
  147 |
  148 |     public final SurfaceControl getSurfaceControl() {
  149 |         return this.surfaceControl;
  150 |     }
  151 |
  152 |     @Override // com.oplus.posteffect.drawable.BaseDrawable
  153 |     public void onPositionStateChanged(PositionState positionState, PositionState positionState2) {
  154 |         if (getCurPositionState() == PositionState.LOST) {
  155 |             removeBlurDrawable(false);
```

## source-049

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-drawable-analysis-20261111/com/oplus/systemui/qs/base/res/FluidGlassResPool$$ExternalSyntheticLambda0.java`  
全文 SHA-256：`36553a3428958a12b2f0313b585d67f5b3b4fe1fc36bd78d890792f12ba41bda`  
原始引用行：21

原文件第 15–34 行：

```text
   15 |     }
   16 |
   17 |     @Override // kotlin.jvm.functions.Function0
   18 |     public final Object invoke() {
   19 |         boolean z;
   20 |         switch (this.$r8$classId) {
   21 |             case 0:
   22 |                 FlavorOneFeatureOption.INSTANCE.getClass();
   23 |                 if (FlavorOneFeatureOption.isFlavorOneDevice()) {
   24 |                     z = ScrimUtil.isDevice4GbMemInfo() ? FlavorOneFeatureOption.sLowMemoryGlassModeOn : true;
   25 |                 } else {
   26 |                     z = false;
   27 |                 }
   28 |                 return Boolean.valueOf(z);
   29 |             default:
   30 |                 FluidGlassResPool.INSTANCE.getClass();
   31 |                 return new FluidGlassResPool$sepBuilder$1(R.drawable.status_bar_qs_highlighttile_inactive_fluid_glass_bg, R.drawable.status_bar_qs_highlighttile_inactive_fluid_glass_bg, R.drawable.status_bar_qs_highlighttile_unavailable_fluid_glass_bg);
   32 |         }
   33 |     }
   34 | }
```

## source-050

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-glass-analysis-20261111/com/oplus/systemui/qs/base/res/FluidGlassResPool.java`  
全文 SHA-256：`d681963b3b6dcff0cc145a343c2a2ed820572028590b49e83edae0611944bda5`  
原始引用行：93

原文件第 87–121 行：

```text
   87 |     }
   88 |
   89 |     public final StateFlow getFluidGlassEnabled() {
   90 |         return fluidGlassEnabled;
   91 |     }
   92 |
   93 |     public final QSDrawableConfig tileConfig(boolean z) {
   94 |         return new QSDrawableConfig(z ? R.drawable.status_bar_qs_tile_active_colorful_fluid_glass_bg : R.drawable.status_bar_qs_tile_active_fluid_glass_bg, z) { // from class: com.oplus.systemui.qs.base.res.FluidGlassResPool.tileConfig.1
   95 |             public final Lazy sepHighlightIconBgBuilder$delegate;
   96 |             public final Lazy sepHighlightTypeBuilder$delegate = LazyKt__LazyJVMKt.lazy(new FluidGlassResPool$$ExternalSyntheticLambda0(1));
   97 |             public final Lazy sepTileTypeBuilder$delegate;
   98 |
   99 |             {
  100 |                 this.sepTileTypeBuilder$delegate = LazyKt__LazyJVMKt.lazy(new Function0() { // from class: com.oplus.systemui.qs.base.res.FluidGlassResPool$tileConfig$1$$ExternalSyntheticLambda0
  101 |                     @Override // kotlin.jvm.functions.Function0
  102 |                     public final Object invoke() {
  103 |                         FluidGlassResPool.INSTANCE.getClass();
  104 |                         return new FluidGlassResPool$sepBuilder$1(i, R.drawable.status_bar_qs_tile_inactive_fluid_glass_bg, R.drawable.status_bar_qs_tile_unavailable_fluid_glass_bg);
  105 |                     }
  106 |                 });
  107 |                 this.sepHighlightIconBgBuilder$delegate = LazyKt__LazyJVMKt.lazy(new Function0() { // from class: com.oplus.systemui.qs.base.res.FluidGlassResPool$tileConfig$1$$ExternalSyntheticLambda2
  108 |                     @Override // kotlin.jvm.functions.Function0
  109 |                     public final Object invoke() {
  110 |                         FluidGlassResPool.INSTANCE.getClass();
  111 |                         final boolean z2 = z;
  112 |                         return new QSDrawableBuilder() { // from class: com.oplus.systemui.qs.base.res.FluidGlassResPool$sepHighlightIconBgBuilder$1
  113 |                             @Override // com.oplus.systemui.qs.base.res.model.QSDrawableBuilder
  114 |                             public final Drawable build(View view, boolean z3) {
  115 |                                 int i;
  116 |                                 Context context = view.getContext();
  117 |                                 if (z2) {
  118 |                                     FluidGlassResPool fluidGlassResPool = FluidGlassResPool.INSTANCE;
  119 |                                     i = R.drawable.status_bar_qs_tile_active_colorful_fluid_glass_bg;
  120 |                                 } else {
  121 |                                     FluidGlassResPool fluidGlassResPool2 = FluidGlassResPool.INSTANCE;
```

## source-051

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-glass-analysis-20261111/com/oplus/systemui/qs/res/data/repository/QSFluidGlassRepository$special$$inlined$map$2$2.java`  
全文 SHA-256：`bd00a83e7d5d02624053d33009680febe352011603c162a64d5874216ff09660`  
原始引用行：60

原文件第 54–73 行：

```text
   54 |         }
   55 |         Object obj2 = anonymousClass1.result;
   56 |         Object coroutine_suspended = IntrinsicsKt__IntrinsicsKt.getCOROUTINE_SUSPENDED();
   57 |         int i2 = anonymousClass1.label;
   58 |         if (i2 == 0) {
   59 |             ResultKt.throwOnFailure(obj2);
   60 |             Boolean boolBoxBoolean = Boxing.boxBoolean(((((Number) obj).intValue() >> 1) & 1) == 1);
   61 |             anonymousClass1.label = 1;
   62 |             if (this.$this_unsafeFlow.emit(boolBoxBoolean, anonymousClass1) == coroutine_suspended) {
   63 |                 return coroutine_suspended;
   64 |             }
   65 |         } else {
   66 |             if (i2 != 1) {
   67 |                 throw new IllegalStateException("call to 'resume' before 'invoke' with coroutine");
   68 |             }
   69 |             ResultKt.throwOnFailure(obj2);
   70 |         }
   71 |         return Unit.INSTANCE;
   72 |     }
   73 | }
```

## source-052

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-glass-analysis-20261111/com/oplusos/systemui/common/util/ShaderBlendParamHelper$$ExternalSyntheticLambda0.java`  
全文 SHA-256：`ab9340cca98329bfeb4003de2d4aaddb98a251e65d3059e1d73ec59a541e1ca8`  
原始引用行：12

原文件第 6–15 行：

```text
    6 |
    7 | /* JADX INFO: compiled from: go/retraceme c8d3092c319854c1e1f5c3e52789e3ee1113927496398e838173c381d04d9b15 */
    8 | /* JADX INFO: loaded from: classes4.dex */
    9 | public final /* synthetic */ class ShaderBlendParamHelper$$ExternalSyntheticLambda0 implements Function2 {
   10 |     @Override // kotlin.jvm.functions.Function2
   11 |     public final Object invoke(Object obj, Object obj2) {
   12 |         int iIntValue = ((Integer) obj).intValue();
   13 |         return Integer.valueOf(ColorUtils.setAlphaComponent(iIntValue, (int) (Color.alpha(iIntValue) * ((Float) obj2).floatValue())));
   14 |     }
   15 | }
```

## source-053

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-material-analysis-20261111/com/oplusos/systemui/common/blurability/MixColorWithShader.java`  
全文 SHA-256：`859f8f49719176d15d1136f045d5280477ab35d65a6e637b10aa193918185515`  
原始引用行：24

原文件第 18–52 行：

```text
   18 |             return MixColorWithShader.EMPTY;
   19 |         }
   20 |     }
   21 |
   22 |     public MixColorWithShader(int i, int i2, int i3, int i4) {
   23 |         this.topMode = i;
   24 |         this.topLayerColor = i2;
   25 |         this.bottomMode = i3;
   26 |         this.bottomLayerColor = i4;
   27 |     }
   28 |
   29 |     public final MixColorWithShader copy(int i, int i2, int i3, int i4) {
   30 |         return new MixColorWithShader(i, i2, i3, i4);
   31 |     }
   32 |
   33 |     public boolean equals(Object obj) {
   34 |         if (this == obj) {
   35 |             return true;
   36 |         }
   37 |         if (!(obj instanceof MixColorWithShader)) {
   38 |             return false;
   39 |         }
   40 |         MixColorWithShader mixColorWithShader = (MixColorWithShader) obj;
   41 |         return this.topMode == mixColorWithShader.topMode && this.topLayerColor == mixColorWithShader.topLayerColor && this.bottomMode == mixColorWithShader.bottomMode && this.bottomLayerColor == mixColorWithShader.bottomLayerColor;
   42 |     }
   43 |
   44 |     public final int getBottomLayerColor() {
   45 |         return this.bottomLayerColor;
   46 |     }
   47 |
   48 |     public final int getBottomMode() {
   49 |         return this.bottomMode;
   50 |     }
   51 |
   52 |     public final int getTopLayerColor() {
```

## source-054

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-material-analysis-20261111/com/oplusos/systemui/common/util/QSBlurConfigProvider.java`  
全文 SHA-256：`3d52ded2c39c0a044b3bd9f272abb51a8b2553a4d74ef751bed0ed45c0d173e0`  
原始引用行：20

原文件第 14–48 行：

```text
   14 | import com.oplusos.systemui.common.blurability.MixColorWithShader;
   15 |
   16 | /* JADX INFO: compiled from: go/retraceme c8d3092c319854c1e1f5c3e52789e3ee1113927496398e838173c381d04d9b15 */
   17 | /* JADX INFO: loaded from: classes4.dex */
   18 | public final class QSBlurConfigProvider {
   19 |     public static final QSBlurConfigProvider INSTANCE = new QSBlurConfigProvider();
   20 |     private static final MixColorWithShader QS_ACTIVE_MIX_COLOR = new MixColorWithShader(5, Color.parseColor("#B3E6E6E6"), 4, Color.parseColor("#80CCCCCC"));
   21 |     public static final int QS_INACTIVE_LIGHT_BG_COLOR;
   22 |     public static final int QS_INACTIVE_LIGHT_FG_COLOR;
   23 |     private static final MixColorWithShader QS_INACTIVE_LIGHT_MIX_COLOR;
   24 |     public static final int QS_INACTIVE_NIGHT_BG_COLOR;
   25 |     public static final int QS_INACTIVE_NIGHT_FG_COLOR;
   26 |     private static final MixColorWithShader QS_INACTIVE_NIGHT_MIX_COLOR;
   27 |     private static final MixColorWithShader SEP_QS_EMPTY_LIGHT_MIX_COLOR;
   28 |     private static final MixColorWithShader SEP_QS_EMPTY_NIGHT_MIX_COLOR;
   29 |
   30 |     static {
   31 |         int color = Color.parseColor("#4D8C8C8C");
   32 |         QS_INACTIVE_LIGHT_FG_COLOR = color;
   33 |         int color2 = Color.parseColor("#80B2B2B2");
   34 |         QS_INACTIVE_LIGHT_BG_COLOR = color2;
   35 |         int color3 = Color.parseColor("#66262626");
   36 |         QS_INACTIVE_NIGHT_FG_COLOR = color3;
   37 |         int color4 = Color.parseColor("#66383838");
   38 |         QS_INACTIVE_NIGHT_BG_COLOR = color4;
   39 |         QS_INACTIVE_LIGHT_MIX_COLOR = new MixColorWithShader(5, color, 2, color2);
   40 |         QS_INACTIVE_NIGHT_MIX_COLOR = new MixColorWithShader(5, color3, 2, color4);
   41 |         int color5 = Color.parseColor("#1AE6E6E6");
   42 |         int color6 = Color.parseColor("#14838383");
   43 |         int color7 = Color.parseColor("#5C1F1F1F");
   44 |         int color8 = Color.parseColor("#3D383838");
   45 |         SEP_QS_EMPTY_LIGHT_MIX_COLOR = new MixColorWithShader(5, color5, 2, color6);
   46 |         SEP_QS_EMPTY_NIGHT_MIX_COLOR = new MixColorWithShader(5, color7, 2, color8);
   47 |     }
   48 |
```

## source-055

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-renderer-analysis-20261111/com/oplus/posteffect/agsl/BlurDrawableShaderBaseStringKt.java`  
全文 SHA-256：`684f747a697102873a3efd4e05cf2987defd30363497806645bce8ddf9c3b919`  
原始引用行：112

原文件第 106–118 行：

```text
  106 |         if (z && !z2) {
  107 |             BlurDrawableShaderStrokeStringKt.appendGradientStrokeMainMethodHeadString(sb, false);
  108 |         }
  109 |         sb.append("vec2 matrixScale = max(vec2(0.0000001), vec2(uMatrixParams[0], uMatrixParams[1]));\nvec2 matrixTrans = vec2(uMatrixParams[2], uMatrixParams[3]);\nvec2 mapCoords = (uMatrix * float3((coords - matrixTrans) / matrixScale / matrixScale, 0.0)).xy;\nvec4 outputCol = vec4(uBitmap.eval(mapCoords).rgb, 1.0);");
  110 |         BlurDrawableShaderBlendStringKt.appendBlendMainMethodString(sb, i, i2);
  111 |         if (z2) {
  112 |             BlurDrawableShaderMetaBallStringKt.appendMetaBallMainMethodHeadString(sb);
  113 |             if (z) {
  114 |                 BlurDrawableShaderStrokeStringKt.appendGradientStrokeMainMethodHeadString(sb, true);
  115 |             }
  116 |         }
  117 |     }
  118 | }
```

## source-056

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-renderer-analysis-20261111/com/oplus/posteffect/agsl/BlurDrawableShaderBlendStringKt.java`  
全文 SHA-256：`b84f0763e2da86e6f308de271eb69f3c23da76b0bf215f394e9eb8a686b6710c`  
原始引用行：12, 50

原文件第 6–40 行：

```text
    6 | /* JADX INFO: compiled from: go/retraceme c8d3092c319854c1e1f5c3e52789e3ee1113927496398e838173c381d04d9b15 */
    7 | /* JADX INFO: loaded from: classes3.dex */
    8 | public abstract class BlurDrawableShaderBlendStringKt {
    9 |     private static final String BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_DODGE = "\n    vec4 colorDodgeBlend(vec4 src, vec4 dst) {\n        float alpha_out = src.a + dst.a - src.a * dst.a;\n        vec3 color_out = vec3(0.0);\n        for (int i = 0; i < 3; i++) {\n            if (dst[i] == 0.0) {\n                color_out[i] = src[i] * (1.0 - dst.a);\n            } else {\n                float c = abs(src.a - src[i]);\n                if (c == 0.0) {\n                    color_out[i] = src.a * dst.a + src[i] * (1.0 - dst.a) + dst[i] * (1.0 - src.a);\n                } else {\n                    c = min(dst.a, (dst[i] * src.a) / (c + 0.00000001));\n                    color_out[i] = (c * src.a + src[i] * (1.0 - dst.a)) + dst[i] * (1.0 - src.a);\n                }\n            }\n        }\n        return vec4(color_out, alpha_out);\n    }";
   10 |     private static final String BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_DODGE_BG = "\n    float colorDodge(float s, float d) {return d / (1.0 - s + 0.00000001);}\n    vec3 colorDodge(vec3 s, vec3 d) {\n        vec3 c;c.x = colorDodge(s.x,d.x);c.y = colorDodge(s.y,d.y);c.z = colorDodge(s.z,d.z);return c;\n    }";
   11 |     private static final String BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_LIGHTER = "\n    vec4 lighter(vec4 src, vec4 dst) {\n        float r = (1.0 - dst.a) * src.r + (1.0 - src.a) * dst.r + max(src.r, dst.r);\n        float g = (1.0 - dst.a) * src.g + (1.0 - src.a) * dst.g + max(src.g, dst.g);\n        float b = (1.0 - dst.a) * src.b + (1.0 - src.a) * dst.b + max(src.b, dst.b);\n        float a = src.a + dst.a  - src.a * dst.a;\n        return vec4(r, g, b, a);\n    }";
   12 |     private static final String BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_LUMINOSITY = "\n    vec3 luminosity( vec3 s, vec3 d ) {\n        float dLum = dot(d, vec3(0.3, 0.59, 0.11));\n        float sLum = dot(s, vec3(0.3, 0.59, 0.11));\n        float lum = sLum - dLum;\n        vec3 c = d + lum;\n        float minC = min(min(c.x, c.y), c.z);\n        float maxC = max(max(c.x, c.y), c.z);\n        if(minC < 0.0) return sLum + ((c - sLum) * sLum) / (sLum - minC);\n        else if(maxC > 1.0) return sLum + ((c - sLum) * (1.0 - sLum)) / (maxC - sLum);\n        else return c;\n    }";
   13 |     private static final String BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_OVERLAY = "\n    float overlay(float s, float d) {\n        return (d < 0.5) ? 2.0 * s * d : 1.0 - 2.0 * (1.0 - s) * (1.0 - d);\n    }\n    vec3 overlay(vec3 s, vec3 d) {\n        vec3 c;c.x = overlay(s.x,d.x);c.y = overlay(s.y,d.y);c.z = overlay(s.z,d.z);return c;\n    }";
   14 |     private static final String BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_PLUS_DARKER = "\n    vec4 plusDarker(vec4 src, vec4 dst) {\n        float r = clamp(src.r + dst.r - 1.0, 0.0, 1.0);\n        float g = clamp(src.g + dst.g - 1.0, 0.0, 1.0);\n        float b = clamp(src.b + dst.b - 1.0, 0.0, 1.0);\n        float a = clamp(src.a + dst.a - 1.0, 0.0, 1.0);\n        return vec4(r, g , b, a);\n    }";
   15 |     private static final String BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_PLUS_LIGHTER = "\n    vec4 plusLighter(vec4 src, vec4 dst) {\n        float r = clamp(src.r + dst.r, 0.0, 1.0);\n        float g = clamp(src.g + dst.g, 0.0, 1.0);\n        float b = clamp(src.b + dst.b, 0.0, 1.0);\n        float a = clamp(src.a + dst.a, 0.0, 1.0);\n        return vec4(r, g , b, a);\n    }";
   16 |     private static final String BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_SATURATION = "\n    vec3 rgb2hsv(vec3 c) {\n        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);\n        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));\n        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));\n        float d = q.x - min(q.w, q.y);\n        float e = 1.0e-10;\n        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);\n    }\n    vec3 hsv2rgb(vec3 c) {\n        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);\n        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);\n        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);\n    }\n    vec4 saturation(vec4 src, vec4 dst) {\n        float a = src.a + dst.a - src.a * dst.a;\n        vec3 srcHsv = rgb2hsv(src.rgb);\n        vec3 dstHsv = rgb2hsv(dst.rgb);\n        dstHsv.y = srcHsv.y;\n        return vec4(hsv2rgb(dstHsv), a);\n    }";
   17 |     private static final String BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_SOFT_LIGHT = "\n    float softLight(vec2 s, vec2 d) {\n        if (2.0*s.x <= s.y) {\n            return (d.x*d.x*(s.y - 2.0*s.x) / (d.y + 0.00000001)) + (1.0 - d.y)*s.x + d.x*(-s.y + 2.0*s.x + 1.0);\n        } else if (4.0 * d.x <= d.y) {\n            float DSqd = d.x*d.x;\n            float DCub = DSqd*d.x;\n            float DaSqd = d.y*d.y;\n            float DaCub = DaSqd*d.y;\n            return (DaSqd*(s.x - d.x*(3.0*s.y - 6.0*s.x - 1.0)) + 12.0*d.y*DSqd*(s.y - 2.0*s.x) - 16.0*DCub * (s.y - 2.0*s.x) - DaCub*s.x) / (DaSqd + 0.00000001);\n        } else {\n            return d.x*(s.y - 2.0*s.x + 1) + s.x - sqrt(d.y*d.x)*(s.y - 2.0*s.x) - d.y*s.x;\n        }\n    }\n    vec4 soft_light(vec4 src, vec4 dst) {\n        if (dst.a == 0.0) { return src; }\n        float a = src.a + (1.0 - src.a) * dst.a;\n        float r = softLight(vec2(src.r, src.a), vec2(dst.r, dst.a));\n        float g = softLight(vec2(src.g, src.a), vec2(dst.g, dst.a));\n        float b = softLight(vec2(src.b, src.a), vec2(dst.b, dst.a));\n        return vec4(clamp(r, 0.0, 1.0), clamp(g, 0.0, 1.0), clamp(b, 0.0, 1.0), a);\n    }";
   18 |     public static final String BLUR_DRAWABLE_SHADER_UNIFORM_MULTI_BLEND_PARAMS = "u_multiBlendParams";
   19 |
   20 |     public static final void appendBlendAlgorithmMethodString(StringBuilder sb, int i) {
   21 |         if ((i & 2) != 0) {
   22 |             sb.append(BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_OVERLAY);
   23 |         }
   24 |         if ((i & 4) != 0) {
   25 |             sb.append(BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_DODGE_BG);
   26 |         }
   27 |         if ((i & 8) != 0) {
   28 |             sb.append(BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_DODGE);
   29 |         }
   30 |         if ((i & 16) != 0) {
   31 |             sb.append(BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_LUMINOSITY);
   32 |         }
   33 |         if ((i & 32) != 0) {
   34 |             sb.append(BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_LIGHTER);
   35 |         }
   36 |         if ((i & 64) != 0) {
   37 |             sb.append(BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_SATURATION);
   38 |         }
   39 |         if ((i & 128) != 0) {
   40 |             sb.append(BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_SOFT_LIGHT);
```

原文件第 44–78 行：

```text
   44 |         }
   45 |         if ((i & FastPairConstants.PAIR_TYPE_BT_INSECURE_IN_PAIR) != 0) {
   46 |             sb.append(BLUR_DRAWABLE_SHADER_STRING_ALGORITHM_PLUS_LIGHTER);
   47 |         }
   48 |     }
   49 |
   50 |     public static final void appendBlendMainMethodString(StringBuilder sb, int i, int i2) {
   51 |         sb.append("if (uEnableBlend != 0) {");
   52 |         if (i != 0 && i2 > 0) {
   53 |             sb.append(StringsKt__IndentKt.trimIndent("\n            for (int i = 0; i < " + (i2 * 5) + "; i += 5) {\n                outputCol = doBlend(outputCol, u_multiBlendParams[i], \n                    vec4(u_multiBlendParams[i + 1], u_multiBlendParams[i + 2], u_multiBlendParams[i + 3], u_multiBlendParams[i + 4])\n                );}"));
   54 |         }
   55 |         sb.append("}");
   56 |     }
   57 |
   58 |     public static final void appendBlendOption(String str, StringBuilder sb, boolean z) {
   59 |         sb.append(StringsKt__IndentKt.trimIndent((z ? "" : BlurDrawableShaderBaseStringKt.STRING_ELSE).concat(str)));
   60 |     }
   61 |
   62 |     public static final void appendBlendOptionMethodString(StringBuilder sb, int i) {
   63 |         if (i == 0) {
   64 |             return;
   65 |         }
   66 |         sb.append("vec4 doBlend(vec4 col, float blendMode, vec4 blendColor) {");
   67 |         boolean z = true;
   68 |         boolean z2 = false;
   69 |         if ((i & 1) != 0) {
   70 |             appendBlendOption("if (blendMode == 1) { col.xyz = mix(col.xyz, blendColor.xyz, blendColor.w);}", sb, true);
   71 |             z = false;
   72 |         }
   73 |         if ((i & 2) != 0) {
   74 |             appendBlendOption("if (blendMode == 2) { col.xyz = mix(col.xyz, overlay(blendColor.xyz, col.xyz), blendColor.w);}", sb, z);
   75 |             z = false;
   76 |         }
   77 |         if ((i & 4) != 0) {
   78 |             appendBlendOption("if (blendMode == 3) { col.xyz = mix(col.xyz, colorDodge(blendColor.xyz, col.xyz), blendColor.w);}", sb, z);
```

## source-057

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-renderer-analysis-20261111/com/oplus/posteffect/agsl/DrawableShader.java`  
全文 SHA-256：`5bf4acf928d24da30b47ea973fc856c68aef77d45ce7c6315bfb81e57180e926`  
原始引用行：319

原文件第 313–347 行：

```text
  313 |         ArrayList arrayList;
  314 |         boolean z = (i & 1) == 0;
  315 |         boolean z2 = (i & 2) == 0;
  316 |         boolean z3 = (i & 4) == 0;
  317 |         boolean z4 = (i & 8) == 0;
  318 |         int i3 = drawableShader.blendAlgorithmMask;
  319 |         int size = drawableShader.summaryBlendParam.size();
  320 |         drawableShader.summaryBlendParam.clear();
  321 |         drawableShader.blendAlgorithmMask = 0;
  322 |         int blendMode = drawableShader.bgBlendParam.getBlendMode();
  323 |         if (blendMode == 1) {
  324 |             drawableShader.blendAlgorithmMask |= 1;
  325 |             drawableShader.summaryBlendParam.add(new ShaderBlendParam(1, drawableShader.bgBlendParam.getBlendColorA()));
  326 |         } else if (blendMode == 2) {
  327 |             drawableShader.blendAlgorithmMask |= 20;
  328 |             drawableShader.summaryBlendParam.add(new ShaderBlendParam(5, drawableShader.bgBlendParam.getBlendColorA()));
  329 |             drawableShader.summaryBlendParam.add(new ShaderBlendParam(3, drawableShader.bgBlendParam.getBlendColorB()));
  330 |         } else if (blendMode == 3) {
  331 |             drawableShader.blendAlgorithmMask |= 5;
  332 |             drawableShader.summaryBlendParam.add(new ShaderBlendParam(1, drawableShader.bgBlendParam.getBlendColorA()));
  333 |             drawableShader.summaryBlendParam.add(new ShaderBlendParam(3, drawableShader.bgBlendParam.getBlendColorB()));
  334 |         } else if (blendMode == 4) {
  335 |             drawableShader.blendAlgorithmMask |= 3;
  336 |             drawableShader.summaryBlendParam.add(new ShaderBlendParam(1, drawableShader.bgBlendParam.getBlendColorA()));
  337 |             drawableShader.summaryBlendParam.add(new ShaderBlendParam(2, drawableShader.bgBlendParam.getBlendColorB()));
  338 |         } else if (blendMode == 5) {
  339 |             drawableShader.blendAlgorithmMask |= 18;
  340 |             drawableShader.summaryBlendParam.add(new ShaderBlendParam(5, drawableShader.bgBlendParam.getBlendColorA()));
  341 |             drawableShader.summaryBlendParam.add(new ShaderBlendParam(2, drawableShader.bgBlendParam.getBlendColorB()));
  342 |         }
  343 |         int blendMode2 = drawableShader.fgBlendParam.getBlendMode();
  344 |         if (blendMode2 == 1) {
  345 |             drawableShader.blendAlgorithmMask |= 24;
  346 |             drawableShader.summaryBlendParam.add(new ShaderBlendParam(5, drawableShader.fgBlendParam.getBlendColorA()));
  347 |             drawableShader.summaryBlendParam.add(new ShaderBlendParam(4, drawableShader.fgBlendParam.getBlendColorB()));
```

## source-058

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-shader-analysis-20261111/com/oplus/systemui/qs/res/data/repository/QSFluidGlassRepository.java`  
全文 SHA-256：`581bcada02bebda247a67713eaeafa0f97e1b4aa875956aa797ab00fac8837e6`  
原始引用行：39

原文件第 33–67 行：

```text
   33 |     }
   34 |
   35 |     public QSFluidGlassRepository(SecureSettings secureSettings, SelectedUserInteractor selectedUserInteractor) {
   36 |         this.secureSettings = secureSettings;
   37 |         this.selectedUserInteractor = selectedUserInteractor;
   38 |         boolean z = false;
   39 |         Flow flowFlowOf = !FluidGlassResPool.isSupportFluidGlass() ? FlowKt.flowOf(0) : FlowKt.transformLatest(selectedUserInteractor.getSelectedUser(), new QSFluidGlassRepository$special$$inlined$flatMapLatest$1(null, this));
   40 |         CoroutineScope settingsScope = secureSettings.getSettingsScope();
   41 |         SharingStarted.Companion companion = SharingStarted.Companion;
   42 |         final StateFlow stateFlowStateIn = FlowKt.stateIn(flowFlowOf, settingsScope, SharingStarted.Companion.WhileSubscribed$default(companion, 0L, 3), 0);
   43 |         this.fluidGlassSettingsValue = stateFlowStateIn;
   44 |         final int i = 0;
   45 |         this.stdFluidGlassEnabled = FlowKt.stateIn(new Flow() { // from class: com.oplus.systemui.qs.res.data.repository.QSFluidGlassRepository$special$$inlined$map$1
   46 |
   47 |             /* JADX INFO: renamed from: com.oplus.systemui.qs.res.data.repository.QSFluidGlassRepository$special$$inlined$map$1$2, reason: invalid class name */
   48 |             /* JADX INFO: compiled from: go/retraceme c8d3092c319854c1e1f5c3e52789e3ee1113927496398e838173c381d04d9b15 */
   49 |             public final class AnonymousClass2 implements FlowCollector {
   50 |                 public final /* synthetic */ FlowCollector $this_unsafeFlow;
   51 |                 public final /* synthetic */ QSFluidGlassRepository this$0;
   52 |
   53 |                 /* JADX INFO: renamed from: com.oplus.systemui.qs.res.data.repository.QSFluidGlassRepository$special$$inlined$map$1$2$1, reason: invalid class name */
   54 |                 public final class AnonymousClass1 extends ContinuationImpl {
   55 |                     Object L$0;
   56 |                     int label;
   57 |                     /* synthetic */ Object result;
   58 |
   59 |                     public AnonymousClass1(Continuation continuation) {
   60 |                         super(continuation);
   61 |                     }
   62 |
   63 |                     @Override // kotlin.coroutines.jvm.internal.BaseContinuationImpl
   64 |                     public final Object invokeSuspend(Object obj) {
   65 |                         this.result = obj;
   66 |                         this.label |= Integer.MIN_VALUE;
   67 |                         return AnonymousClass2.this.emit(null, this);
```

## source-059

原文件：`D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-shader-analysis-20261111/com/oplusos/systemui/common/util/ShaderBlendParamHelper.java`  
全文 SHA-256：`3f931f5703894dc32d5aba8af20711a83b27d9539fd17374e2cd257a711a0e3e`  
原始引用行：20

原文件第 14–48 行：

```text
   14 |
   15 |     public static void update(ShaderBlendParam shaderBlendParam, int i, int i2) {
   16 |         shaderBlendParam.setMode(i);
   17 |         shaderBlendParam.setColor(i2);
   18 |     }
   19 |
   20 |     public final void updateMixMultiShaderParams(BlurMixConfig.BlurMixMultiWithShader blurMixMultiWithShader, float f) {
   21 |         MixColorWithShader backgroundShaderParam = blurMixMultiWithShader.getBackgroundShaderParam();
   22 |         MixColorWithShader foregroundShaderParam = blurMixMultiWithShader.getForegroundShaderParam();
   23 |         if (blurMixMultiWithShader.getMixMultiShaderParams().size() != 4) {
   24 |             ArrayList<ShaderBlendParam> mixMultiShaderParams = blurMixMultiWithShader.getMixMultiShaderParams();
   25 |             mixMultiShaderParams.clear();
   26 |             int topMode = backgroundShaderParam.getTopMode();
   27 |             Function2 function2 = colorWithBlurAmount;
   28 |             mixMultiShaderParams.add(new ShaderBlendParam(topMode, ((Number) function2.invoke(Integer.valueOf(backgroundShaderParam.getTopLayerColor()), Float.valueOf(f))).intValue()));
   29 |             mixMultiShaderParams.add(new ShaderBlendParam(backgroundShaderParam.getBottomMode(), ((Number) function2.invoke(Integer.valueOf(backgroundShaderParam.getBottomLayerColor()), Float.valueOf(f))).intValue()));
   30 |             mixMultiShaderParams.add(new ShaderBlendParam(foregroundShaderParam.getTopMode(), foregroundShaderParam.getTopLayerColor()));
   31 |             mixMultiShaderParams.add(new ShaderBlendParam(foregroundShaderParam.getBottomMode(), foregroundShaderParam.getBottomLayerColor()));
   32 |             return;
   33 |         }
   34 |         ArrayList<ShaderBlendParam> mixMultiShaderParams2 = blurMixMultiWithShader.getMixMultiShaderParams();
   35 |         ShaderBlendParamHelper shaderBlendParamHelper = INSTANCE;
   36 |         ShaderBlendParam shaderBlendParam = mixMultiShaderParams2.get(0);
   37 |         int topMode2 = backgroundShaderParam.getTopMode();
   38 |         Function2 function3 = colorWithBlurAmount;
   39 |         int iIntValue = ((Number) function3.invoke(Integer.valueOf(backgroundShaderParam.getTopLayerColor()), Float.valueOf(f))).intValue();
   40 |         shaderBlendParamHelper.getClass();
   41 |         update(shaderBlendParam, topMode2, iIntValue);
   42 |         update(mixMultiShaderParams2.get(1), backgroundShaderParam.getBottomMode(), ((Number) function3.invoke(Integer.valueOf(backgroundShaderParam.getBottomLayerColor()), Float.valueOf(f))).intValue());
   43 |         update(mixMultiShaderParams2.get(2), foregroundShaderParam.getTopMode(), foregroundShaderParam.getTopLayerColor());
   44 |         update(mixMultiShaderParams2.get(3), foregroundShaderParam.getBottomMode(), foregroundShaderParam.getBottomLayerColor());
   45 |     }
   46 |
   47 |     public final void updateMixSingleShaderParams(BlurMixConfig.BlurMixSingleWithShader blurMixSingleWithShader, float f) {
   48 |         MixColorWithShader backgroundShaderParam = blurMixSingleWithShader.getBackgroundShaderParam();
```
