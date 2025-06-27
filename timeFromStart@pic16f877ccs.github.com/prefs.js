import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import {ExtensionPreferences,
    gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UptimeWithTimerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();

        const dirPaths = [
            '/usr/share/sounds/gnome/default/alerts',
            '/usr/share/sounds/freedesktop/stereo',
        ];
        const filesExt = ['.ogg', '.oga'];

        const currentSoundName = window._settings.get_value('sound-file-map').deepUnpack().soundName;
        this._soundFileLister = new SoundFileLister(dirPaths, filesExt);

        const page = new Adw.PreferencesPage({
            title: '',
            icon_name: null,
        });
        window.add(page);

        const behaviorGroup = new Adw.PreferencesGroup({ title: _('Behavior')});
        behaviorGroup.set_separate_rows?.(true);
        page.add(behaviorGroup);

        const soundChoiceRow = new Adw.ComboRow({
            title: _('Notification Sound'),
            subtitle: _('Choose which sound to play'),
            model: Gtk.StringList.new([_('Loading...')]),
            selected: 0,
        });
        behaviorGroup.add(soundChoiceRow);

        soundChoiceRow.set_factory(Gtk.SignalListItemFactory.new(() => {
            const label = new Gtk.Label({ xalign: 0 });
            return label;
        }));

        soundChoiceRow.get_factory().connect('setup', (factory, listItem) => {
            const label = new Gtk.Label({ xalign: 0 });
            listItem.set_child(label);
        });

        soundChoiceRow.get_factory().connect('bind', (factory, listItem) => {
            const label = listItem.get_child();
            const item = listItem.get_item();

            if (label && item instanceof Gtk.StringObject) {
                let full = item.get_string();
                let dotIndex = full.lastIndexOf('.');
                let base = dotIndex > 0 ? full.slice(0, dotIndex) : full;
                label.label = base;
            }
        });
        this._soundFileLister.listSoundFiles().then(files => {
            soundChoiceRow.set_model(Gtk.StringList.new(files));
            const currentSoundIndex = files.indexOf(currentSoundName);
            soundChoiceRow.set_selected(currentSoundIndex >= 0 ? currentSoundIndex : 0);
        })
        .catch(errorfile => {
            soundChoiceRow.set_model(Gtk.StringList.new(errorfile));
            soundChoiceRow.set_sensitive(false);
            soundChoiceRow.set_selected(0);
        });

        soundChoiceRow.connect('notify::selected', (row) => {
            if (!row.selected_item) return;

            const selectedKey = row.selected_item.string;
            const soundFilePath = this._soundFileLister.qualifiedName(selectedKey);
            const soundFileName = GLib.Variant.new('a{ss}',
                {
                    soundName: selectedKey,
                    soundPath: soundFilePath,
                }
            );

            window._settings.set_value('sound-file-map', soundFileName);
            const name = window._settings.get_value('sound-file-map').deepUnpack();
        });

        const playSoundSwitchRow = new Adw.SwitchRow({
            title: _('Enable sound'),
            subtitle: _('Enable or disable sound notifications'),
        });

        playSoundSwitchRow.set_icon_name('audio-volume-high-symbolic');
        behaviorGroup.add(playSoundSwitchRow);

        playSoundSwitchRow.bind_property(
            'active',
            soundChoiceRow,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );

        const withoutDowntime = new Adw.SwitchRow({
            title: _('Ignore Idle Time'),
            subtitle: _('Do not take into account downtime'),
        });

        behaviorGroup.add(withoutDowntime);

        const formatGroup = new Adw.PreferencesGroup({ title: _('Format')});
        formatGroup.set_separate_rows?.(true);
        page.add(formatGroup);

        const displayFormat = {
            'default': 'default',
            'short': 'short',
            'long': 'long',
            'multiline': 'multiline'
        };
        const timeFormatOptions = Gtk.StringList.new(Object.keys(displayFormat));

        const timeFormatComboRow = new Adw.ComboRow({
            title: _('Time duration format'),
            subtitle: _('Duration time format of the extension in the panel'),
            model: timeFormatOptions,
            selected: Object.values(displayFormat)
                .indexOf(window._settings.get_string('time-format')),
        });

        timeFormatComboRow.connect('notify::selected-item', () => {
			window._settings.set_string('time-format',
                Object.values(displayFormat)[timeFormatComboRow.get_selected()]);
        });
        formatGroup.add(timeFormatComboRow);

        const modeGroup = new Adw.PreferencesGroup({ title: _('Mode')});
        modeGroup.set_separate_rows?.(true);
        page.add(modeGroup);

        const systemUser = {'system': 'system', 'user': 'user'};
        const systemUserOptions = Gtk.StringList.new(Object.keys(systemUser));

        const systemUserComboRow = new Adw.ComboRow({
            title: _('Show system or user'),
            subtitle: _('Show the system or user in the panel'),
            model: systemUserOptions,
            selected: Object.values(systemUser)
                .indexOf(window._settings.get_string('system-user')),
        });

        systemUserComboRow.connect('notify::selected-item', () => {
			window._settings.set_string('system-user', 
                Object.values(systemUser)[systemUserComboRow.get_selected()]
            );
        });
        modeGroup.add(systemUserComboRow);

        const delayGroup = new Adw.PreferencesGroup({ title: _('Delay settings') });
        delayGroup.set_separate_rows?.(true);
        page.add(delayGroup);

        const minutesSpinRow = Adw.SpinRow.new_with_range(0, 59, 1);
        minutesSpinRow.set_value(window._settings.get_uint('timer-minutes'));
        minutesSpinRow.set_wrap(true);
        minutesSpinRow.set_title(_('Settings of a minutes'));
        minutesSpinRow.set_subtitle(_('Setting the reminder time in minutes'));
        delayGroup.add(minutesSpinRow);

        const hoursSpinRow = Adw.SpinRow.new_with_range(0, 23, 1);
        hoursSpinRow.set_value(window._settings.get_uint('timer-hours'));
        hoursSpinRow.set_wrap(true);
        hoursSpinRow.set_title(_('Settings of a hours'));
        hoursSpinRow.set_subtitle(_('Setting the reminder time in hours'));
        delayGroup.add(hoursSpinRow);

        minutesSpinRow.connect('notify::value', () => {
			window._settings.set_uint('timer-minutes', minutesSpinRow.get_value());

            window._settings.set_uint('timer-stop-minutes', minutesSpinRow.get_value() + hoursSpinRow.get_value() * 60);
        });

        hoursSpinRow.connect('notify::value', () => {
			window._settings.set_uint('timer-hours', hoursSpinRow.get_value());

            window._settings.set_uint('timer-stop-minutes', minutesSpinRow.get_value() + hoursSpinRow.get_value() * 60);
        });

        window._settings.connect('changed::timer-stop-minutes', (settings, key) => {

            if (settings.get_uint(key) > 0) {

                settings.set_boolean('timer-enabled', true);
            } else {

                settings.set_boolean('timer-enabled', false);
            }
        });

        window._settings.bind('play-sound', playSoundSwitchRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        window._settings.bind('without-downtime', withoutDowntime, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }
}

class SoundFileLister {
    constructor(directoryPaths, fileExtensions) {
        this.directoryPaths = Array.isArray(directoryPaths) ? directoryPaths : [directoryPaths];
        this.fileExtensions = fileExtensions.map(ext => ext.toLowerCase());
    }

    listSoundFiles() {
        const allFiles = new Set();

        const readDirPromises = this.directoryPaths.map(path => {
            return new Promise((resolve, reject) => {
                const dir = Gio.File.new_for_path(path);

                dir.enumerate_children_async(
                    'standard::name,standard::type',
                    Gio.FileQueryInfoFlags.NONE,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (sourceObject, result) => {
                        try {
                            const infos = dir.enumerate_children_finish(result);

                            for (const info of infos) {
                                const name = info.get_name().toLowerCase();
                                if (
                                    info.get_file_type() === Gio.FileType.REGULAR &&
                                    this.fileExtensions.some(ext => name.endsWith(ext))
                                ) {
                                    allFiles.add(name);
                                }
                            }

                            resolve();
                        } catch (e) {
                            logError(e, `Failed to read directory: ${path}`);
                            reject([_('Failed to read directory')]);
                        }
                    }
                );
            });
        });

        return Promise.all(readDirPromises)
            .then(() => {
                if (allFiles.size > 0) {
                    return Array.from(allFiles).sort();
                }
                return Promise.reject([_('No matching sound files found')]);
            });
    }

    qualifiedName(fileName) {
        for (const path of this.directoryPaths) {
            const fullPath = GLib.build_filenamev([path, fileName]);

            if (Gio.File.new_for_path(fullPath).query_exists(null)) {
                return fullPath;
            }
        }

        return '';
    }
}
