import { Application } from "pixi.js";
import "./styles.css";
import { loadSvgAssets } from "./assets/svg-assets";
import { Game } from "./game/game";

const host = document.querySelector<HTMLDivElement>("#app");

if (!host) {
  throw new Error("Missing #app host");
}

const app = new Application();
await app.init({
  resizeTo: window,
  antialias: true,
  backgroundColor: 0x1d1a17,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true
});

host.appendChild(app.canvas);

await loadSvgAssets();

const game = new Game(app, host);
game.start();
