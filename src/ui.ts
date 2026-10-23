import { icon } from "./icons";
import type { Ipod } from "./device";
import type { DisplayRow } from "./types";
import { $ } from "./dom";
export class IpodUI {
  device: Ipod;
  statusbarEl: HTMLElement;
  playEl: HTMLElement;
  contentEl: HTMLElement;
  sliding = false;
  flushTransition: (() => void) | null = null;
  constructor(device: Ipod) {
    this.device = device;
    this.statusbarEl = $("statusbar-title");
    this.playEl = $("statusbar-play");
    this.contentEl = $("content");
    const play = icon('play'); play.classList.add('icon-play');
    const pause = icon('pause'); pause.classList.add('icon-pause');
    this.playEl.replaceChildren(play, pause);
    const battery = icon('batteryFull', 'Full battery (simulated)');
    battery.classList.add('statusbar__battery');
    $("battery").replaceChildren(battery);
  }

  setStatusbar(text: string) {
    this.statusbarEl.classList.remove("statusbar__title--game");
    this.statusbarEl.textContent = text;
    this.syncChrome();
  }

  /** Title-bar chrome that mirrors playback state (classic ▶ / ❚❚ indicator). */
  syncChrome() {
    if (!this.playEl) return;
    const { player: audio, current } = this.device;
    this.playEl.classList.toggle("playing", audio.playing);
    this.playEl.classList.toggle("paused", !audio.playing && !!current);
  }

  clear() {
    this.flushTransition?.();
    this.contentEl.replaceChildren();
  }

  /**
   * Screen push animation (observed: 240 ms ease-in-out sine, full-width
   * slide). direction "push": new screen enters from the right; "pop": from
   * the left. renderFn draws the incoming screen synchronously.
   */
  slide(direction: "push" | "pop", renderFn: () => void) {
    this.flushTransition?.();
    this.flushTransition = null;
    // Classic menu changes are immediate on touch devices. Avoid compositing
    // translated panes inside a zoomed LCD, which can flash black on mobile WebKit.
    if (window.matchMedia?.("(pointer: coarse), (prefers-reduced-motion: reduce)").matches) {
      renderFn();
      return;
    }
    const oldPane = document.createElement("div");
    while (this.contentEl.firstChild) oldPane.appendChild(this.contentEl.firstChild);
    if (!oldPane.hasChildNodes()) {
      renderFn();
      return;
    }
    renderFn();
    const newPane = document.createElement("div");
    while (this.contentEl.firstChild) newPane.appendChild(this.contentEl.firstChild);
    const sign = direction === "push" ? 1 : -1;
    for (const [pane, from] of [
      [oldPane, "0%"],
      [newPane, `${sign * 100}%`]
    ] as const) {
      pane.className = "pane";
      pane.style.transform = `translateX(${from})`;
      this.contentEl.appendChild(pane);
    }
    void this.contentEl.offsetWidth; // force reflow so the transition runs
    for (const [pane, to] of [
      [oldPane, `${-sign * 100}%`],
      [newPane, "0%"]
    ] as const) {
      pane.style.transition = "transform 240ms cubic-bezier(0.37, 0, 0.63, 1)";
      pane.style.transform = `translateX(${to})`;
    }
    this.sliding = true;
    const finish = () => {
      if (this.flushTransition !== finish) return;
      clearTimeout(timer);
      while (newPane.firstChild) this.contentEl.appendChild(newPane.firstChild);
      oldPane.remove();
      newPane.remove();
      this.sliding = false;
      this.flushTransition = null;
    };
    this.flushTransition = finish;
    newPane.addEventListener("transitionend", finish, { once: true });
    // transitionend is not guaranteed (hidden tab pauses transitions)
    const timer = setTimeout(finish, 260);
  }

  /** Standard inverted-selection menu rows. Passes rows already windowed. */
  drawList(title: string, rows: DisplayRow[], selIndex: number, scroll?: { top: number; total: number }) {
    this.setStatusbar(title);
    this.clear();
    const ul = document.createElement("div");
    ul.className = "menu";
    rows.forEach((row, i) => {
      const div = document.createElement("div");
      div.className = "menu__row";
      div.appendChild(labelFor(row.label));
      if (i === selIndex) {
        div.classList.add("menu__row--selected");
        div.setAttribute("data-testid", "menu-selected");
      }
      if (row.value !== undefined) {
        const val = document.createElement("span");
        val.className = "set__value";
        val.textContent = row.value;
        div.appendChild(val);
      } else if (row.chevron) {
        const chev = icon("chevron");
        chev.classList.add("chev");
        div.appendChild(chev);
      }
      ul.appendChild(div);
    });
    if (scroll && scroll.total > 0 && scroll.total > rows.length) {
      ul.classList.add("menu--scroll");
      const track = document.createElement("div");
      track.className = "menu-scroll";
      track.setAttribute("role", "img");
      track.setAttribute("aria-label", `Items ${scroll.top + 1}–${scroll.top + rows.length} of ${scroll.total}`);
      const rail = document.createElement("div");
      rail.className = "menu-scroll__rail";
      const thumb = document.createElement("div");
      thumb.className = "menu-scroll__thumb";
      // Its size conveys how much of this folder is visible, not selection progress.
      thumb.style.height = `${(rows.length / scroll.total) * 100}%`;
      thumb.style.top = `${(scroll.top / scroll.total) * 100}%`;
      rail.appendChild(thumb);
      track.appendChild(rail);
      ul.appendChild(track);
    }
    this.contentEl.appendChild(ul);
  }
}

function labelFor(text: string) {
  const span = document.createElement("span");
  span.className = "label";
  span.textContent = text;
  return span;
}

