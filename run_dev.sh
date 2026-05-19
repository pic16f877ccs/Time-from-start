#!/bin/bash
set -e

readonly _EXTENSION='timeFromStart@pic16f877ccs.github.com'
readonly _EXTENSION_NAME='Time from start (Uptime)'
readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BUILD_DIST="${PROJECT_ROOT}/build/dist/"

first_arg="$1"
second_arg="$2"

build() {
    local build_temp="${PROJECT_ROOT}/build/temp/"
    local path_to_schema="${PROJECT_ROOT}/assets/org.gnome.shell.extensions.time-from-start.gschema.xml"
    local path_to_podir="${PROJECT_ROOT}/assets/locale/"
    local path_to_src="${PROJECT_ROOT}/src/"
    local extra_sources_list=()
    local extra_sources=()

    mkdir -p "$build_temp"
    mkdir -p "$BUILD_DIST"

    rm -rf "${build_temp:?}"/*

find "$path_to_src" -mindepth 1 -maxdepth 1 -not -name 'assets' -exec cp -r {} "$build_temp" \;

    cp -r "${PROJECT_ROOT}"/assets/sounds "$build_temp"

    echo 'Packing...'

    mapfile -t extra_source_list < <(find "${build_temp}" -mindepth 1 -maxdepth 1 \
        ! -name 'metadata.json' ! -name 'extension.js' ! -name 'prefs.js' ! -name 'stylesheet.css')

    local extra_source
    for extra_source in "${extra_source_list[@]}"; do
        extra_sources+=("--extra-source=${extra_source}")
    done

    if gnome-extensions pack -f -o "$BUILD_DIST" \
        --schema="$path_to_schema" \
        "${extra_sources[@]}" \
        --podir="$path_to_podir" \
        "$build_temp"; then

        echo '...'
        echo 'Build successful.'
    fi
}

nested() {
    local first_arg="${1}"

    echo '...'
    export MUTTER_DEBUG_NUM_DUMMY_MONITORS=1 

    if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
        dbus-run-session gnome-shell --devkit --wayland
    else
        if [ "$first_arg" = '--fullhd' ]; then
            echo 'Full Hd screen size...'
            echo '...' 

            export MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 
            export MUTTER_DEBUG_DUMMY_MONITOR_SCALES=1.5 
        else
            echo 'UHD screen size...'
            echo '...' 

            export MUTTER_DEBUG_DUMMY_MODE_SPECS=3840x2100 
            export MUTTER_DEBUG_DUMMY_MONITOR_SCALES=2.0 
        fi

        export MUTTER_DEBUG_NUM_DUMMY_MONITORS=1 
        dbus-run-session -- gnome-shell --unsafe-mode --nested --wayland --no-x11
    fi
}

debug() {
    local fullhd="${1}"
    echo 'Debugging...'
    echo '...'

    build
    install

    if gnome-extensions list | grep -Ewoq "$_EXTENSION"; then
        echo "The ${_EXTENSION} is installed"
    else
        echo "The ${_EXTENSION} is not installed"
        exit 1
    fi

    if gnome-extensions show "$_EXTENSION" | grep -Ewoq 'INACTIVE'; then
        enable
    fi

    nested "$fullhd"
}

install() {
    local flag="${1}"
    if [[ "$flag" == '-b' ]]; then
        build
        echo "..."
    fi

    echo 'Installing...'
    gnome-extensions install --force "${BUILD_DIST}${_EXTENSION}.shell-extension.zip"
    echo '...'
    echo 'Success!'
}

uninstall() {
    echo 'Uninstalling...'
    gnome-extensions uninstall "$_EXTENSION"
    echo '...'
    echo 'Success!'
}

enable() {
    echo 'Enabling...'
    gnome-extensions enable "$_EXTENSION"
    echo '...'
    echo 'Success!'
}

disable() {
    echo 'Disabling...'
    gnome-extensions disable "$_EXTENSION"
    echo '...'
    echo 'Success!'
}

prefs() {
    echo 'Opening prefs...'
    gnome-extensions prefs "$_EXTENSION"
}
 
key() {
    local first_arg="${1:?Error: key name required}"

    echo 'Reading setting key...'
    echo '...'

    dconf read "/org/gnome/shell/extensions/${_EXTENSION_NAME}/$first_arg"
}
 
list() {
    echo 'List all setting keys...'
    echo '...'
    dconf list "/org/gnome/shell/extensions/${_EXTENSION_NAME}/"
}

watch() {
    echo 'Watching for setting changes...'
    dconf watch "/org/gnome/shell/extensions/${_EXTENSION_NAME}/"
}

reset() {
    echo 'Resetting all settings...'
    dconf reset -f "/org/gnome/shell/extensions/${_EXTENSION_NAME}/"
}

case "$1" in
debug)
    debug "$2"
    ;;
build)
    build
    ;;
install)
    install "$2"
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
prefs)
    prefs
    ;;
key)
     key "$2"
     ;;
list)
     list
     ;;
watch)
    watch
    ;;
reset)
    reset
    ;;
*)
    echo "Usage: $0 {debug|build|install|uninstall|enable|disable|prefs|key|list|watch|reset}"
    exit 1
    ;;
esac
