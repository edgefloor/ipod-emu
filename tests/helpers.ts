import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { Ipod } from '../src/device';

export const browser = new Window({ url: 'http://localhost:8123', width: 390, height: 700 });
Object.assign(globalThis, {
  window: browser, document: browser.document, localStorage: browser.localStorage,
  Element: browser.Element, CustomEvent: browser.CustomEvent, requestAnimationFrame: () => 0
});
browser.matchMedia = () => ({ matches: true }) as ReturnType<typeof browser.matchMedia>;
export function device(): Ipod {
  browser.document.body.innerHTML = readFileSync('index.html', 'utf8');
  browser.localStorage.clear();
  return new Ipod();
}
