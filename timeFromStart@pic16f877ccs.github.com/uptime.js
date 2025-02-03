export class Uptime extends Date {
    constructor(uptimeMilliseconds) {
        super();
        this.timeStampMilliseconds = uptimeMilliseconds;
        this.startDatetimeString = new Date(this.timeStampMilliseconds).toLocaleString();
    }

    uptimeMilliseconds() {
        return new Date().getTime() - this.timeStampMilliseconds;
    }

    uptimeSeconds() {
        return Math.floor((new Date().getTime() - this.timeStampMilliseconds) / 1000.0);
    }

    uptimeMinutes() {
        return Math.floor(this.uptimeSeconds() / 60);
    }
}

