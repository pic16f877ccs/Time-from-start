import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { Uptime } from './uptime.js';

export default class UptimeWithTimerExtension extends Extension {
    constructor(metadata) {
        super(metadata);

        this._sessionModes = null;
    }

    enable() {
        // Comments on using the "unlock-dialog" mode in the extension.
        // The timer in the extension should continue to count the elapsed time after the screen is unlocked.
        // Using "session modes" allows you to avoid using external commands,
        // easily handle the end of the reminder timer, and send a message to the user "when the screen is locked".
        if (this._sessionModes === null) {
            this._sessionModes = new SessionModes(this.getSettings(), this);
        }
    }

    disable() {
        this._sessionModes?.destroy();
        this._sessionModes = null;
    }
}

class SessionModes {
    constructor(settings, extension) {
        this._settings = settings;
        this._extension = extension;
        this._timeFromStart = null;
        this._timerIsFinished = false;
        this._timerStopMinutes = this._settings.get_uint('timer-stop-minutes');
        this._timerEnabled = this._timerStopMinutes > 0 ? true : false;
        this._settings.set_boolean('timer-enabled', this._timerEnabled);
        this._unlockedDialogTimestamp = Date.now();
        this._unlockedDialogTime = 0;

        this._onSessionModeChanged(Main.sessionMode);

        this._addReminderTimer();

        this._settings.connectObject(
            'changed::timer-stop-minutes', this._updateTimerSettings.bind(this),
            'changed::timer-enabled', () => {
                this._timerEnabled = this._settings.get_boolean('timer-enabled');
            },
            this);

        this._sessionMode = Main.sessionMode.connect('updated', this._onSessionModeChanged.bind(this));
    }

    _showNotification(message) {
        if (this._extensionNotificationSource) {
            this._extensionNotificationSource.destroy(MessageTray.NotificationDestroyedReason.REPLACED);
        }

        if (!this._extensionNotificationSource) {

            this._extensionNotificationSource = new MessageTray.Source({
                title: _('Time from start'),
                iconName: 'dialog-information',
            });

            this._extensionNotificationSource.connect('destroy', _source => {
                this._extensionNotificationSource = null;
            });
            Main.messageTray.add(this._extensionNotificationSource);
        }

        this._extensionNotification = new MessageTray.Notification({
            source: this._extensionNotificationSource,
            body: message,
        });

        this._extensionNotificationSource.addNotification(this._extensionNotification);
    }

    _updateTimerSettings() {
        this._timerStopMinutes = this._settings.get_uint('timer-stop-minutes');

        this._removeReminderTimer();
        this._addReminderTimer();
    }

    _onSessionModeChanged(session) {
        if (session.currentMode === 'user' || session.parentMode === 'user') {
            this._unlockedDialogTime = Date.now() - this._unlockedDialogTimestamp + this._unlockedDialogTime;

            this._addIndicator();
        } else if (session.currentMode === 'unlock-dialog') {
            this._unlockedDialogTimestamp = Date.now();

            this._removeIndicator();
        }
    }

    _addIndicator() {
        if (this._timeFromStart === null) {
            this._timeFromStart = new TimeFromStart(this._settings, this._extension, this._unlockedDialogTime, {
                finished: this._timerIsFinished,
            });

            this._timerIsFinished = false;

            if(this._timeFromStart) {
                Main.panel.addToStatusArea(this.uuid, this._timeFromStart);
            }
        }
    }

    _addReminderTimer() {
        if (!this._timerEnabled) {
            return;
        }

        if (this._reminderTimer) {
            GLib.Source.remove(this._reminderTimer);
            this._reminderTimer = null;
        }

        this._reminderTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,  this._timerStopMinutes * 60, () => {
            this._timerIsFinished = true;
            this._settings.set_boolean('timer-enabled', false);

            if (this._timeFromStart) {
                this._timeFromStart.finished = this._timerIsFinished;
            }

            if (this._settings.get_boolean('play-sound')) {
                const soundFilePath = Gio.File.new_for_path(this._settings.get_value('sound-file-map').deepUnpack().soundPath);

                const player = global.display.get_sound_player();
                player.play_from_file(soundFilePath, 'Notification sound', null);
            }

            this._showNotification(_('Reminder, the timer is finished!'));

            return GLib.SOURCE_REMOVE;
        });
    }

    _removeIndicator() {
        this._timeFromStart?.destroy();
        this._timeFromStart = null;
    }

    _removeReminderTimer() {
        if (this._reminderTimer) {
            GLib.Source.remove(this._reminderTimer);
            this._reminderTimer = null;
        }
    }

    destroy() {
        this._removeReminderTimer();

        if(this._timeFromStart._timeTick) {
            GLib.Source.remove(this._timeFromStart._timeTick);
            this._timeFromStart._timeTick = null;
        }

        if (this._timeFromStart._delayOneMinute) {
            GLib.Source.remove(this._timeFromStart._delayOneMinute);
            this._timeFromStart._delayOneMinute = null;
        }

        if (this._sessionMode) {
            Main.sessionMode.disconnect(this._sessionMode);
            this._sessionMode = null;
        }

        if (this._extensionNotificationSource) {
            this._extensionNotificationSource.destroy();
            this._extensionNotificationSource = null;
        }

        this._settings.disconnectObject(this);
        this._settings = null;

        this._removeIndicator();
    }
}

const TimeFromStart = GObject.registerClass({
    GTypeName: 'TimeFromStart',
    Properties: {
        'finished': GObject.ParamSpec.boolean(
            'finished',
            'Finished',
            'A timer finished read-write boolean property',
            GObject.ParamFlags.READWRITE,
            false
        ),
    },
}, class TimeFromStart extends PanelMenu.Button {
    constructor(settings, extension, downtimeTimestamp, properties = {}) {
        super(0.0, _('Time from start'));

        this._timerFinishId = null;
        this.finished = properties.finished;
        this._extension = properties.extension;

        this._extension = extension;
        this._settings = settings;

        this._timeFormat = this._settings.get_string('time-format');
        this._systemUser = this._settings.get_string('system-user');
        this._timerIsEnabled = this._settings.get_boolean('timer-enabled');
        this._timerStopMinutes = this._settings.get_uint('timer-stop-minutes');
        this._downtimeMinutes = Math.floor(downtimeTimestamp / 1000 / 60);
        this._withoutDowntime = this._settings.get_boolean('without-downtime');

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

       	this._box = new St.BoxLayout({
            x_align: Clutter.ActorAlign.FILL 
        });
	    this.add_child(this._box);

        this._buttonText = new St.Label({ 
            text: "",
            y_align: Clutter.ActorAlign.CENTER
        });
        this._buttonText.clutter_text.set_use_markup(true);

        this._displayButtonText()
        this._box.add_child(this._buttonText);

        this._systemUserIcon = {
            "system": 'emblem-system-symbolic',
            "user": 'avatar-default-symbolic',
            "alarm": 'alarm-symbolic'
        };

        this._icon = new St.Icon({
                icon_name: this._systemUserIcon[this._systemUser],
                style_class: 'system-status-icon',
        });
		this._box.insert_child_at_index(this._icon, 0);

        const systemPopupMenuItem = new PopupImgMenuItem(
            this._systemUptime.startDatetimeString,
            _('System start time'),
            'emblem-system-symbolic',
        );
        this.menu.addMenuItem(systemPopupMenuItem);

        const userPopupMenuItem = new PopupImgMenuItem(
            this._userUptime.startDatetimeString,
            _('User login time'),
            'avatar-default-symbolic',
        );
        this.menu.addMenuItem(userPopupMenuItem);

        this._timerPopupMenuItem = new PopupImgMenuItem(
            this._popupTimeFormatted(this._timerStopMinutes),
            _('Show Message After'),
            'alarm-symbolic',
        );
        this.menu.addMenuItem(this._timerPopupMenuItem);

        const downtimePopupMenuItem = new PopupImgMenuItem(
            this._popupTimeFormatted(this._downtimeMinutes),
            _('Show user inactivity'),
            'user-info-symbolic',
        );
        this.menu.addMenuItem(downtimePopupMenuItem);

        if(Math.floor(this._downtimeMinutes) === 0) {
           downtimePopupMenuItem.sensitive = false;
        }
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        let settingsMenuItem = new PopupMenu.PopupMenuItem('Settings');
        settingsMenuItem.setOrnament(PopupMenu.Ornament.NONE);
        settingsMenuItem.connect('activate', () => { 
            this._extension.openPreferences();
        });
        this.menu.addMenuItem(settingsMenuItem);

        this._settings.connectObject(
            'changed::time-format', () => {
                this._timeFormat = this._settings.get_string('time-format');
                this._displayButtonText()
            },
            'changed::system-user', () => {
                this._systemUser = this._settings.get_string('system-user');
                this._indicatorIconChange(this._systemUser)
                this._displayButtonText()
            },
            'changed::timer-stop-minutes', () => {
                this._timerStopMinutes = this._settings.get_uint('timer-stop-minutes');
                this._timerPopupMenuItem.label.text = this._popupTimeFormatted(this._timerStopMinutes);
            },
            'changed::without-downtime', () => {
                this._withoutDowntime = this._settings.get_boolean('without-downtime');
                this._displayButtonText()
            },
            this,
        );

        this._onTimerFinishedChanged();
        if (this._timerFinishId === null) {
            this._timerFinishId = this.connect('notify::finished', this._onTimerFinishedChanged.bind(this));
        }

        this.notify('finished');

        this._settings.bind('timer-enabled', this._timerPopupMenuItem, 'reactive', Gio.SettingsBindFlags.DEFAULT);

        this._addTimeTicks();
    } 

    _onTimerFinishedChanged() {
        if (this.finished) {
            this._clearTimeTicks();

            this._indicatorIconChange('alarm');
            
            this._buttonText.set_text(this._timerFormatted());

            this._clearDelayOneMinute();

            this._delayOneMinute = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
                this.finished = false;
                this._displayButtonText();
                this._indicatorIconChange(this._systemUser);
                this._addTimeTicks();

                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _indicatorIconChange(systemUser) {
        if(this._icon) {
            this._box.remove_child(this._icon);
        }

        this._icon = new St.Icon({
                icon_name: this._systemUserIcon[systemUser],
                style_class: 'system-status-icon',
        });

        this._box.insert_child_at_index(this._icon, 0);
    }

    _displayButtonText() {
        this._buttonText.clutter_text.set_markup(this._uptimeFormatted(this._getSystemUser[this._systemUser]));
    }

    _displayButtonTimerText() {
        this._buttonText.set_text(this._uptimeFormatted(this._getSystemUser['user']));
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

    _uptimeFormatted(uptime) {
        let timeMinutes = uptime.uptimeMinutes();

        if (this._systemUser === 'user') {
            if (this._withoutDowntime) {
                timeMinutes = Math.abs(timeMinutes - this._downtimeMinutes);
            }
        }

        const time = this._timeFormatted(timeMinutes);

        const formattedDaysTime = {
            "long": `${time.days} ${time.hours}h ${time.minutes}m`,
            "short": `${time.hours}:${time.minutes}`,
            "default": `${time.days} ${time.hours}:${time.minutes}`,
            "multiline": `${time.hours}<tt>h</tt>\n${time.minutes}<tt>m</tt>`
        };

        return formattedDaysTime[this._timeFormat];
    }

    _popupTimeFormatted(timeMinutes) {
        const time = this._timeFormatted(timeMinutes);

        return `${time.days} ${time.hours}h ${time.minutes}m`;
    }

    _timerTimeFormatted() {
        const time = this._timeFormatted(this._timerStopMinutes);

        return `Timer: ${time.days} ${time.hours}h ${time.minutes}m`;
    }

    _timeFormatted(timeMinutes) {
        const timeHours = Math.floor(timeMinutes / 60);
        const days = Math.floor(timeHours / 24) + 'd';
        const hours = Math.floor((timeHours % 24)).toString().padStart(2, '0');
        const minutes = Math.floor((timeMinutes % 60)).toString().padStart(2, '0');

        return {
            minutes,
            hours,
            days,
        };
    }

    _timerFormatted() {
        const formattedDaysTime = {
            "long": "00 00h 00m",
            "short": "00:00",
            "default": "00 00:00"
        };

        return formattedDaysTime[this._timeFormat];
    }

    _addTimeTicks() {
        if(this._timeTick) {
            return;
        }

        this._timeTick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,  60, () => {
            this._displayButtonText();

            return GLib.SOURCE_CONTINUE;
        });
    }

    _clearTimeTicks() {
        if(this._timeTick) {
            GLib.Source.remove(this._timeTick);
        }
        delete this._timeTick;
    }

    _clearDelayOneMinute() {
        if (this._delayOneMinute) {
            GLib.Source.remove(this._delayOneMinute);
        }
        delete this._delayOneMinute;
    }

    destroy() {
        this._clearDelayOneMinute();
        this._clearTimeTicks();

        if (this._timerFinishId) {
            this.disconnect(this._timerFinishId);
            this._timerFinishId = null;
        }

        this._settings.disconnectObject(this);
        delete this._settings;
        super.destroy();
    }
});

export const PopupImgMenuItem = GObject.registerClass(
class PopupImgMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(text, subtext, icon, params) {
        super._init(params);

        this.set_x_expand(true);

        this._icon = new St.Icon({
            style_class: 'popup-img-icon',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._icon);

        const boxLayout = St.BoxLayout.new();
        boxLayout.set_vertical(true);

        this.label = new St.Label({
            text,
            style_class: 'popup-img-label',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        boxLayout.add_child(this.label);

        const subLabel = new St.Label({
            text: subtext,
            style_class: 'popup-img-sublabel',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        boxLayout.add_child(subLabel);

        this.add_child(boxLayout);
        this.setIcon(icon);
    }

    setIcon(icon) {
        if (icon instanceof GObject.Object && GObject.type_is_a(icon, Gio.Icon))
            this._icon.gicon = icon;
        else
            this._icon.icon_name = icon;
    }
});
