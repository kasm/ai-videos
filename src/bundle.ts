// What a HyperFrames build carries so that it renders with the network off. HyperFrames fetches
// GSAP from its CDN, and asks Google Fonts about every font family the HTML names but does not
// declare with @font-face (even Inter, which it embeds). So GSAP and the captions' font are copied
// in from npm, the font declared to local files.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** The build's folder for them, beside assets/vo/ and assets/clips/, and the two files index.html links. */
const VENDOR = "assets/vendor";
export const GSAP_SRC = `${VENDOR}/gsap.min.js`;
export const FONTS_CSS = `${VENDOR}/fonts.css`;

/** The captions' font (scenes/clip/scene.html): Inter, bold, upright. */
export const FONT = { family: "Inter", pkg: "@fontsource/inter", weight: 700 };

/**
 * One of the tool's fonts in one weight: the package's own @font-face rules, each subset's woff2
 * at the url `src` gives for its file (the woff after it, for old browsers, left out).
 */
export async function fontSheet(root: string, pkg: string, weight: number, src: (file: string) => Promise<string>): Promise<string> {
  const dir = path.join(root, "node_modules", pkg);
  const css = await readFile(path.join(dir, `${weight}.css`), "utf8");
  const woff2 = /url\(\.\/files\/([\w.-]+\.woff2)\) format\('woff2'\)(?:, url\([^)]*\) format\('woff'\))?/g;
  const urls = new Map<string, string>();
  for (const [, file] of css.matchAll(woff2)) urls.set(file!, await src(path.join(dir, "files", file!)));
  return css.replace(woff2, (_, file: string) => `url(${urls.get(file)}) format('woff2')`);
}

/** Copies GSAP and the captions' font into `project`: each subset's woff2, and a stylesheet of their @font-face rules. */
export async function bundle(root: string, project: string): Promise<void> {
  const modules = path.join(root, "node_modules");
  await mkdir(path.join(project, VENDOR), { recursive: true });
  await copyFile(path.join(modules, "gsap", "dist", "gsap.min.js"), path.join(project, GSAP_SRC));
  // Each subset's woff2 beside the sheet.
  const copied = async (file: string) => {
    await copyFile(file, path.join(project, VENDOR, path.basename(file)));
    return path.basename(file);
  };
  const sheet = await fontSheet(root, FONT.pkg, FONT.weight, copied);
  await writeFile(path.join(project, FONTS_CSS), `/* The captions' font, from npm (src/bundle.ts). Generated. */\n${sheet}`);
}
