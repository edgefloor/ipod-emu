import type { Ipod } from '../device';
import { Screen } from './base';
export class BrickScreen extends Screen {
  paddle = 43;
  lives = 3;
  score = 0;
  level = 1;
  over = false;
  paused = false;
  launched = false;
  lastTick: number | null = null;
  ball = { x: 50, y: 92, dx: 27, dy: -48 };
  bricks: Array<{ x: number; y: number; width: number; height: number; alive: boolean }> = [];
  constructor(device: Ipod) {
    super(device);
    this.reset();
  }

  reset() {
    this.paddle = 43;
    this.lives = 3;
    this.score = 0;
    this.level = 1;
    this.over = false;
    this.paused = false;
    this.makeBricks();
    this.readyBall();
  }

  makeBricks() {
    this.bricks = Array.from({ length: 36 }, (_, i) => ({
      x: 2 + (i % 12) * 8, y: 4 + Math.floor(i / 12) * 7,
      width: 6.5, height: 3.5, alive: true
    }));
  }

  readyBall() {
    this.launched = false;
    this.lastTick = null;
    this.ball = { x: this.paddle + 7, y: 92, dx: 27, dy: -48 };
  }

  onWheel(step: number) {
    if (this.over || this.paused) return;
    this.paddle = Math.max(0, Math.min(86, this.paddle + step * 4));
    if (!this.launched) this.ball.x = this.paddle + 7;
    this.render();
  }

  onCenter() {
    if (this.over) this.reset();
    this.launched = true;
    this.paused = false;
    this.lastTick = performance.now();
    this.render();
  }

  onPlay() {
    if (!this.launched || this.over) return this.onCenter();
    this.paused = !this.paused;
    this.lastTick = null;
    this.render();
  }

  onNext() { this.onWheel(1); }
  onPrevious() { this.onWheel(-1); }

  onFrame() {
    if (!this.launched || this.over || this.paused || this.device.ui.sliding) {
      this.lastTick = null;
      return;
    }
    const now = performance.now();
    const elapsed = this.lastTick === null ? 0 : Math.min((now - this.lastTick) / 1000, 0.05);
    this.lastTick = now;
    this.advance(elapsed);
    this.render();
  }

  /** Small time steps prevent the ball skipping a brick on a slow frame. */
  advance(seconds: number) {
    while (seconds > 0 && this.launched && !this.over && !this.paused) {
      const dt = Math.min(seconds, 1 / 240);
      seconds -= dt;
      const b = this.ball;
      const previous = { x: b.x, y: b.y };
      b.x += b.dx * dt;
      b.y += b.dy * dt;
      if (b.x < 1) { b.x = 1; b.dx = Math.abs(b.dx); }
      if (b.x > 99) { b.x = 99; b.dx = -Math.abs(b.dx); }
      if (b.y < 1) { b.y = 1; b.dy = Math.abs(b.dy); }
      for (const brick of this.bricks) {
        if (!brick.alive || b.x + 1 < brick.x || b.x - 1 > brick.x + brick.width ||
            b.y + 1 < brick.y || b.y - 1 > brick.y + brick.height) continue;
        brick.alive = false;
        this.score += 1;
        if (previous.y + 1 <= brick.y || previous.y - 1 >= brick.y + brick.height) b.dy *= -1;
        else b.dx *= -1;
        this.device.audio.blip(600 + this.score * 5, 35);
        break;
      }
      // Paddle top is at 96; the ball has a radius of one field unit.
      if (b.dy > 0 && previous.y < 95 && b.y >= 95 && b.x >= this.paddle - 1 && b.x <= this.paddle + 15) {
        b.y = 95;
        const angle = (b.x - this.paddle - 7) / 7;
        b.dx = angle * 42;
        b.dy = -Math.sqrt(58 * 58 - b.dx * b.dx);
        this.device.audio.blip(450, 25);
      }
      if (b.y > 102) {
        this.lives -= 1;
        this.over = this.lives === 0;
        this.readyBall();
      } else if (this.bricks.every(brick => !brick.alive)) {
        this.level += 1;
        this.makeBricks();
        this.readyBall();
      }
    }
  }

  render() {
    const ui = this.device.ui;
    ui.setStatusbar("");
    ui.statusbarEl.classList.add("statusbar__title--game");
    const lives = document.createElement("span");
    lives.textContent = String(this.lives);
    lives.setAttribute("aria-label", `${this.lives} lives`);
    const score = document.createElement("span");
    score.textContent = String(this.score);
    score.setAttribute("aria-label", `Score ${this.score}`);
    ui.statusbarEl.replaceChildren(lives, score);
    ui.clear();
    const field = document.createElement("div");
    field.className = "brick-field";
    field.setAttribute("data-testid", "brick-field");
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const el = document.createElement("span");
      el.className = "brick-block";
      Object.assign(el.style, { left: `${brick.x}%`, top: `${brick.y}%`, width: `${brick.width}%`, height: `${brick.height}%` });
      field.appendChild(el);
    }
    const pad = document.createElement("span");
    pad.className = "brick-paddle";
    pad.style.left = `${this.paddle}%`;
    const ball = document.createElement("span");
    ball.className = "brick-ball";
    ball.style.left = `${this.ball.x}%`;
    ball.style.top = `${this.ball.y}%`;
    field.append(pad, ball);
    if (!this.launched || this.paused || this.over) {
      const info = document.createElement("div");
      info.className = "brick-message";
      info.textContent = this.over ? "Game Over. Center to restart." : this.paused ? "Paused" : "Center to launch";
      field.appendChild(info);
    }
    ui.contentEl.appendChild(field);
  }
}

