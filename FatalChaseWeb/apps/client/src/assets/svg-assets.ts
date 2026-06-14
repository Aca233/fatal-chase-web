import { Assets, type Texture } from "pixi.js";

type SvgAssets = {
  bow: Texture;
  arrow: Texture;
};

let loadedAssets: SvgAssets | null = null;

export const loadSvgAssets = async (): Promise<void> => {
  const [bow, arrow] = await Promise.all([
    Assets.load<Texture>("/assets/bow.svg"),
    Assets.load<Texture>("/assets/arrow.svg")
  ]);
  loadedAssets = { bow, arrow };
};

export const getSvgAssets = (): SvgAssets => {
  if (!loadedAssets) {
    throw new Error("SVG assets must be loaded before creating game objects");
  }
  return loadedAssets;
};
