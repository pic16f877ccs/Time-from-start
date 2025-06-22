export class Uptime extends Date {
    constructor(uptimeMilliseconds) {
        super();

        this.timeStampMilliseconds = uptimeMilliseconds;
        this.startDatetimeString = new Date(this.timeStampMilliseconds).toLocaleString();
    }

    uptimeMilliseconds() {
        return Date.now() - this.timeStampMilliseconds;
    }

    uptimeSeconds() {
        return Math.floor(this.uptimeMilliseconds() / 1000.0);
    }

    uptimeMinutes() {
        return Math.floor(this.uptimeSeconds() / 60.0);
    }
}

