import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { Uptime } from './uptime.js';

export default class IndicatorExtension extends Extension {
    constructor(metadata) {
        super(metadata);

        this._sessionModes = null;
    }

    enable() {
        if (this._sessionModes === null) {
            this._sessionModes = new SessionModes(this.getSettings());
        }
    }

    disable() {
        this._sessionModes?._destroy();
        this._sessionModes = null;
    }
}

class SessionModes {
    constructor(settings) {
        this._settings = settings;
        this._timeFromStart = null;
        this._timerIsFinished = false;
        this._timerStopMinutes = this._settings.get_uint('timer-stop-minutes');
        this._timerEnabled = this._timerStopMinutes > 0 ? true : false;
        this._settings.set_boolean('timer-enabled', this._timerEnabled);

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

    _updateTimerSettings() {
        this._timerStopMinutes = this._settings.get_uint('timer-stop-minutes');

        this._removeReminderTimer();
        this._addReminderTimer();
    }

    _onSessionModeChanged(session) {
        if (session.currentMode === 'user' || session.parentMode === 'user') {
            log("Session mode user");
            this._addIndicator();
        } else if (session.currentMode === 'unlock-dialog') {
            log("Session mode unlocked-dialog");
            this._removeIndicator();
        }
    }

    _addIndicator() {
        if (this._timeFromStart === null) {
            this._timeFromStart = new TimeFromStart(this._settings, {
                finished: this._timerIsFinished,
            });

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

            Main.notify('Reminder', 'the timer is finished!');

            return GLib.SOURCE_REMOVE;
        });
    }

    _removeIndicator() {
        this._timeFromStart?._clear();
        this._timeFromStart?.destroy();
        this._timeFromStart = null;
    }

    _removeReminderTimer() {
        if (this._reminderTimer) {
            GLib.Source.remove(this._reminderTimer);
            this._reminderTimer = null;
        }
    }

    _destroy() {
        this._removeReminderTimer();

        if (this._sessionMode) {
            Main.sessionMode.disconnect(this._sessionMode);
            this._sessionMode = null;
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
    constructor(settings, properties = {}) {
        super(0.0, 'Time from start');

        this._timerFinishId = null;
        this.finished = properties.finished;

        this._settings = settings;

        this._timeFormat = this._settings.get_string('time-format');
        this._systemUser = this._settings.get_string('system-user');
        this._timerIsEnabled = this._settings.get_boolean('timer-enabled');
        this._timerDelayMinutes = this._settings.get_string('timer-time');

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

        const systemPopupMenuItem = new PopupMenu.PopupImageMenuItem(
            this._systemUptime.startDatetimeString,
            'emblem-system-symbolic',
            {
                style_class: 'PopupSubMenuMenuItemStyle'
        });
        this.menu.addMenuItem(systemPopupMenuItem);

        const userPopupMenuItem = new PopupMenu.PopupImageMenuItem(
            this._userUptime.startDatetimeString, 'avatar-default-symbolic', {
                style_class: 'PopupSubMenuMenuItemStyle'
        });
        this.menu.addMenuItem(userPopupMenuItem);

        this._timerPopupMenuItem = new PopupMenu.PopupImageMenuItem(
            this._timerDelayMinutes,
            'alarm-symbolic',
            {
                style_class: 'PopupSubMenuMenuItemStyle',
                can_focus: true,
        });
        this.menu.addMenuItem(this._timerPopupMenuItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        let settingsMenuItem = new PopupMenu.PopupMenuItem('Settings');
        settingsMenuItem.setOrnament(PopupMenu.Ornament.NONE);
        settingsMenuItem.connect('activate', () => { 
                Extension.lookupByUUID('timeFromStart@pic16f877ccs.github.com').openPreferences()
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
            this);

        this._onTimerFinishedChanged();
        if (this._timerFinishId === null) {
            this._timerFinishId = this.connect('notify::finished', this._onTimerFinishedChanged.bind(this));
        }

        this.notify('finished');

        this._settings.bind('timer-time', this._timerPopupMenuItem.label, 'text', Gio.SettingsBindFlags.DEFAULT);
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

                log('stop minutes: wait one minute');
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
        this._buttonText.set_text(this._uptimeFormatted(this._getSystemUser[this._systemUser]));
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

    _clear() {
        this._clearDelayOneMinute();
        this._clearTimeTicks();

        if (this._timerFinishId) {
            this.disconnect(this._timerFinishId);
            this._timerFinishId = null;
        }

        this._settings.disconnectObject(this);
        delete this._settings;
    }
});
