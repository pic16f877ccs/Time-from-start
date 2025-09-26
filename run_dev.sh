#!/bin/bash
set -e

EXTENSION='timeFromStart@pic16f877ccs.github.com'
EXTENSIONNAME='Time from start (Uptime)'

first_arg="$1"
second_arg="$2"

build() {
    mkdir -p './build/temp'
    mkdir -p './build/dist'

    MULTIPATHS=('./assets/sounds' './src')
    rm -rf './build/temp/*'
    cp -r $(find './src' -mindepth 1 -maxdepth 1 -not -name 'assets') './build/temp/.'
    cp -r './assets/sounds' './build/temp/.'

    echo 'Packing...'

    EXTRASRCS=$(find './build/temp/' -mindepth 1 -maxdepth 1 ! -name "metadata.json" ! -name "extension.js" ! -name "prefs.js" ! -name "stylesheet.css")

    ESOURCES=()

    for ELEM in $EXTRASRCS; do
      ESOURCES+=("--extra-source=${PWD}/${ELEM}")
    done

    SCHEMA='./../../assets/org.gnome.shell.extensions.time-from-start.gschema.xml'
    PODIR='./../../assets/locale'

    if gnome-extensions pack -f -o './build/dist' --schema="$SCHEMA" "$ESOURCES" --podir="$PODIR" './build/temp'; then
        echo '...'
        echo 'Success!'
    fi
}

nested() {
    if [ "$first_arg" = 'fullhd' ]; then
        echo 'Full Hd screen size...'

        export MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 
        export MUTTER_DEBUG_DUMMY_MONITOR_SCALES=1.5 
    else
        echo 'UHD screen size...'
        export MUTTER_DEBUG_DUMMY_MODE_SPECS=3840x2100 
        export MUTTER_DEBUG_DUMMY_MONITOR_SCALES=2.0 
        export MUTTER_DEBUG_NUM_DUMMY_MONITORS=1 
    fi

    dbus-run-session -- gnome-shell --unsafe-mode --nested --wayland --no-x11
}

debug() {
    echo 'Debugging...'
    echo '...'
    if gnome-extensions list | grep -Ewoq "$EXTENSION"; then
        echo "The ${EXTENSION} is installed"
    else
        echo "The ${EXTENSION} is not installed"
        exit 1
    fi

    if gnome-extensions show "$extension" | grep -Ewoq 'INACTIVE'; then
        enable
    #else
    #    if ! [[ "$second_arg" == "--force" ]]; then
    #        exit 1
    #    fi
    fi

    nested
}

install() {
    if [[ "$second_arg" == '-b' ]]; then
        build
        echo "..."
    fi

    echo 'Installing...'
    gnome-extensions install --force "./build/dist/${EXTENSION}.shell-extension.zip"
    echo '...'
    echo 'Success!'
}

uninstall() {
    echo 'Uninstalling...'
    gnome-extensions uninstall "$EXTENSION"
    echo '...'
    echo 'Success!'
}

enable() {
    echo 'Enabling...'
    gnome-extensions enable "$EXTENSION"
    echo '...'
    echo 'Success!'
}

disable() {
    echo 'Disabling...'
    gnome-extensions disable "$EXTENSION"
    echo '...'
    echo 'Success!'
}

watch() {
  echo 'Watching for setting changes...'
  dconf watch "/org/gnome/shell/extensions/${EXTENSIONNAME}/"
}

reset() {
  echo 'Watching for setting changes...'
  dconf reset -f "/org/gnome/shell/extensions/${EXTENSIONNAME}/"
}

prefs() {
  echo 'Opening prefs...'
  gnome-extensions prefs "$EXTENSION"
}

translations() {
  echo "Updating translations..."

  touch "assets/locale/${EXTENSION}.pot"

  find ./src -type f -a -iname "*.js" | xargs xgettext --from-code=UTF-8 \
    --add-comments \
    --join-existing \
    --keyword=_ \
    --keyword=C_:1c,2 \
    --language=Javascript \
    --output="assets/locale/${EXTENSION}.pot"

  for pofile in assets/locale/*.po; do
    echo "Updating: $pofile"
    msgmerge -U "$pofile" "assets/locale/${EXTENSION}.pot"
  done

  rm assets/locale/*.po~ 2>/dev/null
  echo "Done"
}

case "$1" in
debug)
  debug
  ;;
install)
  install
  ;;
uninstall)
  uninstall
  ;;
enable)
  enable
  ;;
disable)
  disable
  ;;
build)
  build
  ;;
# release)
#   build "release"
#   ;;
translations)
  translations
  ;;
prefs)
  prefs
  ;;
watch)
  watch
  ;;
reset)
  reset
  ;;
*)
  echo "Usage: $0 {debug|build|install|uninstall|enable|disable|prefs|watch|reset|translations}"
  exit 1
  ;;
esac
