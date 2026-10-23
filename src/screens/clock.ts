import { Screen } from './base';
export class ClockScreen extends Screen {
  timeEl!: HTMLTimeElement;
  dateEl!: HTMLDivElement;
  second = 0;
  render() {
    this.device.ui.setStatusbar("Clock");
    this.device.ui.clear();
    const clock = document.createElement("div");
    clock.className = "clock";
    this.timeEl = document.createElement("time");
    this.timeEl.className = "clock__time";
    this.dateEl = document.createElement("div");
    this.dateEl.className = "clock__date";
    clock.append(this.timeEl, this.dateEl);
    this.device.ui.contentEl.appendChild(clock);
    this.update(new Date());
  }

  update(date: Date) {
    this.second = Math.floor(date.getTime() / 1000);
    this.timeEl.dateTime = date.toISOString();
    this.timeEl.textContent = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
    this.dateEl.textContent = `${date.getDate()} ${date.toLocaleString("en-GB", { month: "long" })} ${date.getFullYear()}`;
  }

  onFrame() {
    if (this.device.ui.sliding) return;
    const now = new Date();
    if (Math.floor(now.getTime() / 1000) !== this.second) this.update(now);
  }
}

