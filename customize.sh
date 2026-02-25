SKIPUNZIP=1

FLAVOR=zygisk

enforce_install_from_magisk_app() {
  if $BOOTMODE; then
    ui_print "- 从 Magisk 应用程序安装"
  else
    ui_print "*********************************************************"
    ui_print "- 不支持从REC安装"
    ui_print "- 某些恢复已损坏实施，因此请从 Magisk 应用程序安装"
    abort "*********************************************************"
  fi
}

VERSION=$(grep_prop version "${TMPDIR}/module.prop")
ui_print "- LSPosed 版本： ${VERSION}"

# Extract verify.sh
ui_print "- 提取 verify.sh"
unzip -o "$ZIPFILE" 'verify.sh' -d "$TMPDIR" >&2
if [ ! -f "$TMPDIR/verify.sh" ]; then
  ui_print "*********************************************************"
  ui_print "- 无法提取 verify.sh!"
  ui_print "! 该zip可能已损坏，请尝试重新下载"
  abort    "*********************************************************"
fi
. "$TMPDIR/verify.sh"

# Base check
extract "$ZIPFILE" 'customize.sh' "$TMPDIR"
extract "$ZIPFILE" 'verify.sh' "$TMPDIR"
extract "$ZIPFILE" 'util_functions.sh' "$TMPDIR"
. "$TMPDIR/util_functions.sh"
check_android_version
if [ -z "$KSU" ] && [ -z "$APATCH" ]; then
  check_magisk_version
fi
check_incompatible_module

enforce_install_from_magisk_app

# Check architecture
if [ "$ARCH" != "arm" ] && [ "$ARCH" != "arm64" ] && [ "$ARCH" != "x86" ] && [ "$ARCH" != "x64" ]; then
  abort "! 不支持的平台: $ARCH"
else
  ui_print "- 设备平台: $ARCH"
fi

# Extract libs
ui_print "- 提取模块文件"

extract "$ZIPFILE" 'module.prop'        "$MODPATH"
extract "$ZIPFILE" 'action.sh'          "$MODPATH"
extract "$ZIPFILE" 'service.sh'         "$MODPATH"
extract "$ZIPFILE" 'uninstall.sh'       "$MODPATH"
extract "$ZIPFILE" 'framework/lspd.dex' "$MODPATH"
extract "$ZIPFILE" 'sepolicy.rule'      "$MODPATH"
extract "$ZIPFILE" 'daemon.apk'         "$MODPATH"
extract "$ZIPFILE" 'daemon'             "$MODPATH"
rm -f /data/adb/lspd/manager.apk
extract "$ZIPFILE" 'manager.apk'        "$MODPATH"

if [ "$FLAVOR" == "zygisk" ]; then

  if [ "$ARCH" = "arm" ] || [ "$ARCH" = "arm64" ]; then
    extract "$ZIPFILE" "lib/armeabi-v7a/liblspd.so" "$MODPATH/zygisk" true
    mv "$MODPATH/zygisk/liblspd.so" "$MODPATH/zygisk/armeabi-v7a.so"

    if [ "$IS64BIT" = true ]; then
      extract "$ZIPFILE" "lib/arm64-v8a/liblspd.so" "$MODPATH/zygisk" true
      mv "$MODPATH/zygisk/liblspd.so" "$MODPATH/zygisk/arm64-v8a.so"
    fi
  fi

  if [ "$ARCH" = "x86" ] || [ "$ARCH" = "x64" ]; then
    extract "$ZIPFILE" "lib/x86/liblspd.so" "$MODPATH/zygisk" true
    mv "$MODPATH/zygisk/liblspd.so" "$MODPATH/zygisk/x86.so"

    if [ "$IS64BIT" = true ]; then
      extract "$ZIPFILE" "lib/x86_64/liblspd.so" "$MODPATH/zygisk" true
      mv "$MODPATH/zygisk/liblspd.so" "$MODPATH/zygisk/x86_64.so"
    fi
  fi
fi

chmod 0744 "$MODPATH/daemon"

if [ "$(grep_prop ro.maple.enable)" == "1" ] && [ "$FLAVOR" == "zygisk" ]; then
  ui_print "- Add ro.maple.enable=0"
  echo "ro.maple.enable=0" >> "$MODPATH/system.prop"
fi
rm -f "/data/local/tmp/daemon.apk"
rm -f "/data/local/tmp/manager.apk"
rm -f "/data/adb/lspd/log"
rm -f "/data/adb/lspd/log.old"
ui_print " "
ui_print "- 更新日志："
ui_print "- 修复LSPosed-日志不可点击问题"
ui_print "- 去日志-去特征版-去dex2ota"
ui_print " "
ui_print "- 欢迎来到LSPosed！"
