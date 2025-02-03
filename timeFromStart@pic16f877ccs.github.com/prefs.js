import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ExamplePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({ title: 'Duration' });
        page.add(group);

        const timeFormatOptions = Gtk.StringList.new(Object.keys(
            {
                'default': 'default',
                'short': 'short',
                'long': 'long'
            }));
        const timeFormatComboRow = new Adw.ComboRow({
            title: 'Time duration format',
            subtitle: "Duration time format of the extension in the panel",
            model: timeFormatOptions,
            selected: Object.values(
                {
                    'default': 'default',
                    'short': 'short',
                    'long': 'long'
                }).indexOf(window._settings.get_string('time-format')),
        });
        timeFormatComboRow.connect('notify::selected-item', () => {
			window._settings.set_string('time-format', Object.values(
                {
                    'default': 'default',
                    'short': 'short',
                    'long': 'long'
                })[timeFormatComboRow.get_selected()]
            );
        });
        group.add(timeFormatComboRow);

        const systemUserOptions = Gtk.StringList.new(Object.keys({'system': 'system', 'user': 'user'}));
        const systemUserComboRow = new Adw.ComboRow({
            title: 'Show system or user',
            subtitle: "Show the system or user in the panel",
            model: systemUserOptions,
            selected: Object.values({'system': 'system', 'user': 'user'})
                .indexOf(window._settings.get_string('system-user')),
        });
        systemUserComboRow.connect('notify::selected-item', () => {
			window._settings.set_string('system-user', 
                Object.values({'system': 'system', 'user': 'user'})[systemUserComboRow.get_selected()]
            );
        });
        group.add(systemUserComboRow);

        let minutesSpinRow = Adw.SpinRow.new_with_range(0, 59, 1);
        minutesSpinRow.set_value(window._settings.get_uint('timer-minutes'));
        minutesSpinRow.set_wrap(true);
        minutesSpinRow.set_title('Settings of a minutes');
        minutesSpinRow.set_subtitle('Setting the reminder time in minutes');
        minutesSpinRow.connect('notify::value', () => {
			window._settings.set_uint('timer-minutes', minutesSpinRow.get_value());
        });
        group.add(minutesSpinRow);

        let hoursSpinRow = Adw.SpinRow.new_with_range(0, 23, 1);
        hoursSpinRow.set_value(window._settings.get_uint('timer-hours'));
        hoursSpinRow.set_wrap(true);
        hoursSpinRow.set_title('Settings of a hours');
        hoursSpinRow.set_subtitle('Setting the reminder time in hours');
        hoursSpinRow.connect('notify::value', () => {
			window._settings.set_uint('timer-hours', hoursSpinRow.get_value());
        });
        group.add(hoursSpinRow);
    }
}
