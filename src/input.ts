import type { Ipod } from './device';
import { $ } from './dom';
import { WHEEL_STEP_DEGREES, WHEEL_ENGAGE_DEGREES } from './constants';
export function attachWheel(device: Ipod) {
  const wheel = $("wheel");
  let pointer: number | null = null;
  let lastAngle: number | null = null;
  let lockedDir: number | null = null;
  let lockedTravel = 0;
  let engaged = false;
  let suppressClick = false;

  const metrics = (_event: PointerEvent) => {
    const r = wheel.getBoundingClientRect();
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      r: r.width / 2
    };
  };

  const angleOf = (event: PointerEvent, cx: number, cy: number) => Math.atan2(event.clientY - cy, event.clientX - cx);

  wheel.addEventListener("pointerdown", (event) => {
    if (event.button || pointer !== null || event.isPrimary === false) return;
    suppressClick = false;
    device.audio.unlock();
    pointer = event.pointerId;
    const { cx, cy } = metrics(event);
    lastAngle = angleOf(event, cx, cy);
    lockedDir = null;
    lockedTravel = 0;
    engaged = false;
    // no pointer capture yet: a plain press must still click the pie buttons
  });

  wheel.addEventListener("pointermove", (event) => {
    if (pointer !== event.pointerId || lastAngle === null) return;
    const { cx, cy, r } = metrics(event);
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    if (Math.hypot(dx, dy) < r * 0.3) return; // hub dead zone
    const angle = angleOf(event, cx, cy);

    let delta = angle - lastAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const degrees = Math.abs(delta * (180 / Math.PI));
    if (degrees < 1.5) return; // accumulate small movements from the last accepted angle
    lastAngle = angle;

    // engage the drag only after real travel; before that the press may
    // still turn out to be a button click
    if (!engaged) {
      lockedTravel += degrees;
      if (lockedTravel < WHEEL_ENGAGE_DEGREES) return;
      lockedTravel = 0;
      engaged = true;
      suppressClick = true;
      try {
        wheel.setPointerCapture(pointer);
      } catch {
        /* synthetic or already-released pointer — drag still works without capture */
      }
      wheel.classList.add("dragging");
      return;
    }

    if (event.cancelable) event.preventDefault();
    const dir = delta > 0 ? 1 : -1;
    if (lockedDir === null) {
      lockedDir = dir; // first decisive direction locks, like real hardware
    } else if (dir !== lockedDir) {
      lockedTravel -= degrees; // reversals pay back travel before re-engaging
      if (lockedTravel < 0) {
        lockedDir = dir;
        lockedTravel = -lockedTravel;
      }
      return;
    }
    lockedTravel += degrees;
    while (lockedTravel >= WHEEL_STEP_DEGREES) {
      lockedTravel -= WHEEL_STEP_DEGREES;
      wheel.dispatchEvent(
        new CustomEvent("wheelscroll", { detail: { step: lockedDir, degrees: WHEEL_STEP_DEGREES, speed: 1 } })
      );
    }
  });

  const endDrag = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    lastAngle = null;
    lockedDir = null;
    lockedTravel = 0;
    engaged = false;
    wheel.classList.remove("dragging");
  };

  // A completed touch drag may still synthesize a click on its starting button.
  wheel.addEventListener("click", event => {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);
  wheel.addEventListener("pointerup", endDrag);
  wheel.addEventListener("pointercancel", endDrag);
  wheel.addEventListener("lostpointercapture", event => {
    // Touch implicitly captures the starting button. Its capture-loss event bubbles
    // when we transfer capture to the wheel; that transfer is not the end of a drag.
    if (event.target === wheel) endDrag(event);
  });
  wheel.addEventListener("wheelscroll", (event) => {
    const { step } = event.detail ?? {};
    device.wheelStepBy(step || 0);
  });
}

export function attachButtons(device: Ipod) {
  const wire = (id: string, action: () => void) =>
    $(id).addEventListener("click", () => {
      action();
      $(id).blur(); // keep later Enter/Space for the device, not the button
    });
  wire("btn-menu", () => device.menu());
  wire("btn-select", () => device.select());
  wire("btn-prev", () => device.previous());
  wire("btn-next", () => device.next());
  wire("btn-play", () => device.playPause());
}

export function attachKeyboard(device: Ipod) {
  document.addEventListener("keydown", (event) => {
    if (event.isComposing || document.querySelector("dialog[open]") || (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]"))) return;
    switch (event.key) {
      case " ":
        event.preventDefault();
        device.playPause();
        break;
      case "ArrowUp":
        event.preventDefault();
        device.wheelStepBy(-1);
        break;
      case "ArrowDown":
        event.preventDefault();
        device.wheelStepBy(1);
        break;
      case "ArrowLeft":
        device.previous();
        break;
      case "ArrowRight":
        device.next();
        break;
      case "Enter":
        device.select();
        break;
      case "Escape":
        device.menu();
        break;
      default:
        break;
    }
  });
}

/* Keep mobile geometry fixed while browser chrome or the keyboard changes height. */
let mobileViewport: { width: number; height: number } | null = null;
export function fitDevice(force: boolean | Event = false) {
  const width = window.innerWidth;
  const mobile = width < 640 || window.matchMedia("(pointer: coarse)").matches;
  if (force !== true && mobile && mobileViewport?.width === width) return;
  const height = mobile
    ? document.querySelector("#viewport-size")?.getBoundingClientRect().height || window.innerHeight
    : window.innerHeight;
  mobileViewport = mobile ? { width, height } : null;
  const stage = document.querySelector(".stage");
  const padding = stage ? window.getComputedStyle(stage) : null;
  const horizontal = padding ? (parseFloat(padding.paddingLeft) || 0) + (parseFloat(padding.paddingRight) || 0) + 8 : 40;
  const vertical = padding ? (parseFloat(padding.paddingTop) || 0) + (parseFloat(padding.paddingBottom) || 0) : 40;
  const youtubeReserve = document.body.classList.contains('youtube-active') && width < 1100 ? 260 : 0;
  const reserve = mobile ? vertical + 44 : youtubeReserve + (width >= 640 && height >= 850 ? 220 : 96);
  const scale = Math.max(0.2, Math.min(1, (width - horizontal) / 415, (height - reserve) / 692));
  document.documentElement.style.setProperty("--layout-height", mobile ? `${height}px` : "100svh");
  document.documentElement.style.setProperty("--device-scale", String(scale));
}

