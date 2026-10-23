import type { Ipod } from '../device';
import type { MenuRow } from '../types';
import { LIST_ROWS } from '../constants';
export abstract class Screen {
  constructor(public device: Ipod) {}
  onWheel(_step: number) {}
  get wakeOnSelect(): boolean { return true; }
  abstract render(): void;
  onCenter() {}
  onNext() {}
  onPrevious() {}
  onPlay() {}
  onFrame() {}
  onBack() {
    this.device.pop();
  }
}

export class MenuScreen extends Screen {
  sel = 0;
  scrollTop = 0;
  constructor(device: Ipod, public title: string, public rows: MenuRow[], private boundary: "wrap" | "clamp" = "wrap") {
    super(device);
  }

  /** Rows currently shown (rows may declare a `visible` predicate). */
  get visibleRows() {
    return this.rows.filter((row) => !row.visible || row.visible());
  }

  get wakeOnSelect() {
    return this.visibleRows[this.sel]?.wake !== false;
  }

  /** First row index of the visible window, following the selection. */
  get visibleRange() {
    const rows = this.visibleRows;
    const start = Math.max(0, Math.min(this.scrollTop, Math.max(rows.length - LIST_ROWS, 0)));
    if (this.sel < start) return this.sel;
    if (this.sel >= start + LIST_ROWS) return this.sel - LIST_ROWS + 1;
    return start;
  }

  onWheel(step: number) {
    this.moveSel(step);
  }

  onCenter() {
    const rows = this.visibleRows;
    if (!rows.length) return;
    rows[this.sel]?.onSelect?.();
  }

  onNext() {
    this.device.stepTrack(1);
  }

  onPrevious() {
    this.device.stepTrack(-1);
  }

  moveSel(step: number) {
    const rows = this.visibleRows;
    if (!rows.length) return;
    const next = this.boundary === "clamp"
      ? Math.max(0, Math.min(rows.length - 1, this.sel + step))
      : ((this.sel + step) % rows.length + rows.length) % rows.length;
    if (next === this.sel) return;
    this.sel = next;
    this.scrollTop = this.visibleRange;
    this.render();
  }

  onPlay() {
    if (this.device.current) {
      this.device.player.toggle();
      this.render();
    } else if (this.device.deck.songs.length) {
      this.device.play(this.device.deck.songs, 0);
    }
  }

  render() {
    this.renderList();
  }

  renderList() {
    const rows = this.visibleRows;
    this.sel = Math.min(this.sel, Math.max(rows.length - 1, 0));
    this.scrollTop = this.visibleRange;
    const seen = [];
    for (let i = this.scrollTop; i < Math.min(this.scrollTop + LIST_ROWS, rows.length); i++) {
      const row = rows[i];
      seen.push({ label: row.title, value: row.value?.(), chevron: row.chevron });
    }
    this.device.ui.drawList(this.title, seen, this.sel - this.scrollTop, {
      top: this.scrollTop,
      total: rows.length
    });
  }
}

export class ListScreen extends MenuScreen {
  constructor(device: Ipod, title: string, rows: MenuRow[]) {
    super(device, title, rows.length ? rows : [{ title: "(empty)" }]);
  }
}

