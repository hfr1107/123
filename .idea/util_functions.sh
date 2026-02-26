check_magisk_version() {
  ui_print "- Magisk 版本: $MAGISK_VER_CODE"
  if [ "$FLAVOR" == "riru" ] || [ "$FLAVOR" == "zygisk" ]; then
    if [ "$MAGISK_VER_CODE" -lt 26000 ]; then
      ui_print "*********************************************************"
      ui_print "! 请安装 Magisk v26+"
      abort    "*********************************************************"
    fi
  else
    ui_print "*********************************************************"
    ui_print "! 不支持flavor $FLAVOR"
    abort    "*********************************************************"
  fi
}

require_new_android() {
  ui_print "*********************************************************"
  ui_print "! 不支持的 Android 版本 ${1} (below Oreo MR1)"
  ui_print "! 从我们的 GitHub 了解更多信息"
  [ "$BOOTMODE" == "true" ] && am start -a android.intent.action.VIEW -d https://github.com/JingMatrix/LSPosed/#supported-versions
  abort    "*********************************************************"
}

check_android_version() {
  if [ "$API" -ge 27 ]; then
    ui_print "- 安卓SDK版本: $API"
  else
    require_new_android "$API"
  fi
}

check_incompatible_module() {
  MODULEDIR="$(magisk --path)/.magisk/modules"
  for id in "riru_dreamland" "riru_edxposed" "riru_edxposed_sandhook" "taichi"; do
    if [ -d "$MODULEDIR/$id" ] && [ ! -f "$MODULEDIR/$id/disable" ] && [ ! -f "$MODULEDIR/$id/remove" ]; then
      ui_print "*********************************************************"
      ui_print "! 请禁用或卸载不兼容的框架:"
      ui_print "! $id"
      abort    "*********************************************************"
      break
    fi
  done
}
