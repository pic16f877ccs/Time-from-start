import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { Uptime } from './uptime.js';

export default class IndicatorExampleExtension extends Extension {
    enable() {
        this._timeFromStart = new TimeFromStart(this.getSettings());
        if(this._timeFromStart) {
            Main.panel.addToStatusArea(this.uuid, this._timeFromStart);
        }
    }

    disable() {
        this._timeFromStart?.destroy();
        this._timeFromStart = null;
    }
}

const TimeFromStart = GObject.registerClass(
    { GTypeName: 'TimeFromStart' },
    class TimeFromStart extends PanelMenu.Button {
        _init(settings) {
            super._init(0.0, 'Time from start');

            this._settings = settings;
            this._timeFormat = this._settings.get_string('time-format');
            this._systemUser = this._settings.get_string('system-user');
            this._timerMinutes = this._settings.get_uint('timer-minutes');
            this._timerHours = this._settings.get_uint('timer-hours');

           	this.box = new St.BoxLayout({
                x_align: Clutter.ActorAlign.FILL 
            });
		    this.add_child(this.box);

            this.buttonText = new St.Label({ 
                text: "",
                y_align: Clutter.ActorAlign.CENTER
            });

            const startSystemTimeStampIndex = 340;
            const endSystemTimeStampIndex = 344;
            const startUserTimeStampIndex = -44;
            const endUserTimeStampIndex = -40;

            this._systemUptime = new Uptime(
                this._timeStampMillisFromFile(startSystemTimeStampIndex, endSystemTimeStampIndex)
            );
            this._userUptime = new Uptime(
                this._timeStampMillisFromFile(startUserTimeStampIndex, endUserTimeStampIndex)
            );

            this._getSystemUser = {
                "system": this._systemUptime,
                "user": this._userUptime
            };

            this._displayButtonText()
            this.box.add_child(this.buttonText);

            this._systemUserIcon = {
                "system": 'emblem-system-symbolic',
                "user": 'avatar-default-symbolic',
                "alarm": 'alarm-symbolic'
            };

            this.icon = new St.Icon({
                    icon_name: this._systemUserIcon[this._systemUser],
                    style_class: 'system-status-icon',
            });
			this.box.insert_child_at_index(this.icon, 0);

            const systemStartMenu = new PopupMenu.PopupImageMenuItem(
                this._systemUptime.startDatetimeString, 'emblem-system-symbolic', {
                    style_class: 'PopupSubMenuMenuItemStyle'
            });
            this.menu.addMenuItem(systemStartMenu);

            const userStartMenu = new PopupMenu.PopupImageMenuItem(
                this._userUptime.startDatetimeString, 'avatar-default-symbolic', {
                    style_class: 'PopupSubMenuMenuItemStyle'
            });
            this.menu.addMenuItem(userStartMenu);

            this._timerStartMenu = new PopupMenu.PopupImageMenuItem(
                `Timer: ${this._timerHours}h ${this._timerMinutes}m`, 
                'alarm-symbolic', {
                    style_class: 'PopupSubMenuMenuItemStyle',
                    reactive: this._stopMinutes() == 0 ? false : true,
                    can_focus: true,
            });
            this.menu.addMenuItem(this._timerStartMenu);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            let settingsMenuItem = new PopupMenu.PopupMenuItem('Settings');
            settingsMenuItem.setOrnament(PopupMenu.Ornament.NONE);
            settingsMenuItem.connect('activate', () => { 
                    Extension.lookupByUUID('timeFromStart@pic16f877ccs.github.com').openPreferences()
            });
            this.menu.addMenuItem(settingsMenuItem);

            this._settings.connect('changed::system-user', (settings, key) => {
                this._systemUser = settings.get_string(key);
                this._indicatorIconChange(this._systemUser)
                this._displayButtonText()
            });

            this._settings.connect('changed::time-format', (settings, key) => {
                this._timeFormat = settings.get_string(key);
                this._displayButtonText()
            });

            this._timeStopUptime = 0;
            this._changeTimeTimer = this._userUptime.uptimeMinutes();

            this._settings.connect('changed::timer-minutes', (settings, key) => {
                this._timerMinutes = settings.get_uint(key);
                this._settingsTime();
            });

            this._settings.connect('changed::timer-hours', (settings, key) => {
                this._timerHours = settings.get_uint(key);
                this._settingsTime();
            });

            this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                const currentUserUptime = this._userUptime.uptimeMinutes();
                const stopMinutes = this._stopMinutes();

                if (stopMinutes == 0) {
                    this._displayButtonText();
                } else if (currentUserUptime == (stopMinutes + this._changeTimeTimer)) {

                    if (this._timeStopUptime == 0) {
                        this._indicatorIconChange('alarm');
                        this.buttonText.set_text(this.uptimeFormatted(this._getSystemUser['user']));
                        this._timeStopUptime = currentUserUptime + 1;
                        this._timerStartMenu.reactive = false;
                        this._timerNotify();
                    }
                } else if (this._timeStopUptime == currentUserUptime) {
                    this._indicatorIconChange(this._systemUser);
                    this._displayButtonText();
                    this._timeStopUptime = 0;
                } else {
                    this._displayButtonText();
                }

                return true;
            });
        }

        _settingsTime() {
            this._displayAlarmSettings();
            this._changeTimeTimer = this._userUptime.uptimeMinutes();
            this._timeStopUptime = 0;

            if (this._stopMinutes() == 0) {
                this._timerStartMenu.reactive = false;
                this._indicatorIconChange(this._systemUser);
            } else if (!this._timerStartMenu.reactive) {
                this._timerStartMenu.reactive = true;
            }
        }

        _timerNotify() {
            const body = `Reminder: The timer has reached ${this._stopMinutes()} minutes!`;
            const source = MessageTray.getSystemSource();

            const notification = new MessageTray.Notification({
                source,
                title: 'Reminder timer',
                body,
                gicon: new Gio.ThemedIcon({name: 'alarm-symbolic'}),
                iconName: 'alarm-symbolic',
                urgency: MessageTray.Urgency.NORMAL,
            });

            source.addNotification(notification);
        }

        _indicatorIconChange(systemUser) {
            if(this.icon) {
                this.box.remove_child(this.icon);
		    }

            this.icon = new St.Icon({
                    icon_name: this._systemUserIcon[systemUser],
                    style_class: 'system-status-icon',
            });

            this.box.insert_child_at_index(this.icon, 0);
        }

        _stopMinutes() {
            return this._timerMinutes + this._timerHours * 60;
        }

        _displayButtonText() {
            this.buttonText.set_text(this.uptimeFormatted(this._getSystemUser[this._systemUser]));
        }

        _displayButtonTimerText() {
            this.buttonText.set_text(this.uptimeFormatted(this._getSystemUser['user']));
        }

        _displayAlarmSettings() {
             this._timerStartMenu.label.text = `Timer: ${this._timerHours}h ${this._timerMinutes}m`;
        }

        _timeStampMillisFromFile(begin, end) {
            try {
                const byteArray = GLib.file_get_contents('/var/run/utmp')[1].slice(begin, end);

                return new DataView(Uint8Array.from(byteArray).buffer).getUint32(0, true) * 1000.0;
            }
            catch {
                return new Date().getTime();
            }
        }

        uptimeFormatted(uptime) {
            const totalMinutes = uptime.uptimeMinutes();
            const totalHours = Math.floor(totalMinutes / 60);
            const days = Math.floor(totalHours / 24) + 'd';
            const hours = (totalHours % 24).toString().padStart(2, '0');
            const minutes = (totalMinutes % 60).toString().padStart(2, '0');

            const formattedDaysTime = {
                "long": `${days} ${hours}h ${minutes}m`,
                "short": `${hours}:${minutes}`,
                "default": `${days} ${hours}:${minutes}`
            };

            return formattedDaysTime[this._timeFormat];
        }

        _removeTimeout() {
            if(this._timeout) {
                GLib.source_remove(this._timeout);
                this._timeout = null;
            }
        }

        destroy() {
            this._removeTimeout();
            super.destroy();
        }
    }
);
