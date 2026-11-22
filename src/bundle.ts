// What a HyperFrames build carries so that it renders with the network off, and the check that a
// page asks for nothing more. HyperFrames fetches GSAP from its CDN, and asks Google Fonts about
// every font family the HTML names but does not declare with @font-face (even Inter, which it
// embeds). So GSAP and the tool's fonts are copied in from npm, the fonts declared to local files.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LoadedVideo } from "./script.ts";

/** The build's folder for them, beside assets/vo/ and assets/clips/, and the two files index.html links. */
const VENDOR = "assets/vendor";
export const GSAP_SRC = `${VENDOR}/gsap.min.js`;
export const FONTS_CSS = `${VENDOR}/fonts.css`;

/** The tool's fonts: a page names them by family, in these weights, upright. */
export const FONTS = [
  { family: "Inter", pkg: "@fontsource/inter", weights: [400, 700, 900] },
  { family: "JetBrains Mono", pkg: "@fontsource/jetbrains-mono", weights: [400, 700] },
];

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

/** Copies GSAP and the tool's fonts into `project`: each subset's woff2, and a stylesheet of their @font-face rules. */
export async function bundle(root: string, project: string): Promise<void> {
  const modules = path.join(root, "node_modules");
  await mkdir(path.join(project, VENDOR), { recursive: true });
  await copyFile(path.join(modules, "gsap", "dist", "gsap.min.js"), path.join(project, GSAP_SRC));
  const sheets: string[] = [];
  for (const { pkg, weights } of FONTS) {
    for (const weight of weights) {
      // Each subset's woff2 beside the sheet.
      const copied = async (file: string) => {
        await copyFile(file, path.join(project, VENDOR, path.basename(file)));
        return path.basename(file);
      };
      sheets.push(await fontSheet(root, pkg, weight, copied));
    }
  }
  await writeFile(path.join(project, FONTS_CSS), `/* The tool's fonts, from npm (src/bundle.ts). Generated. */\n${sheets.join("\n")}`);
}

const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong", "inherit", "initial", "unset", "revert", "revert-layer"]);

/** The CSS in an HTML file: its <style> blocks and style attributes. */
function cssOfHtml(html: string): string {
  const blocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!);
  const attrs = [...html.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => (m[1] ?? m[2]!).replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
  return [...blocks, ...attrs].join("\n");
}

/** The families in a list of them: quotes off, generic families and var() left out. */
function familiesOf(list: string): string[] {
  return list
    .replace(/!important/i, "")
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, "").trim())
    .filter((f) => f && !f.startsWith("var(") && !GENERIC.has(f.toLowerCase()));
}

/** Every family a stylesheet names, in font-family and in the font shorthand (its families follow the size). */
function familiesNamed(css: string): string[] {
  const named = [...css.matchAll(/font-family\s*:\s*([^;}]+)/gi)].flatMap((m) => familiesOf(m[1]!));
  const size = /(?:^|\s)(?:[\d.]+(?:px|em|rem|%|pt|pc|vw|vh|vmin|vmax|ex|ch|cm|mm|in|q)|(?:xx?-)?(?:small|large)|medium|larger|smaller)(?:\/\S+)?\s+(.+)$/i;
  for (const m of css.matchAll(/(?:^|[\s;{])font\s*:\s*([^;}]+)/gi)) {
    const families = size.exec(m[1]!.trim())?.[1];
    if (families) named.push(...familiesOf(families));
  }
  return named;
}

const FACE = /@font-face\s*\{([^}]*)\}/gi;
/** A URL that leaves the disk: http, https, or protocol-relative. */
const REMOTE = /^(?:https?:)?\/\//i;

/** Where a file loads something from: src-like attributes and stylesheet links, CSS url() and @import. */
function loads(text: string, html: boolean): string[] {
  const css = html ? cssOfHtml(text) : text;
  const urls = [
    ...[...css.matchAll(/url\(\s*["']?([^"')\s]+)/gi)].map((m) => m[1]!),
    ...[...css.matchAll(/@import\s+["']([^"']+)["']/gi)].map((m) => m[1]!),
  ];
  if (html) {
    for (const [, tag, attrs] of text.matchAll(/<(\w+)\b([^>]*)>/g)) {
      for (const [, name, ...value] of attrs!.matchAll(/\b(src|srcset|poster|data|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
        if (name!.toLowerCase() === "href" && tag!.toLowerCase() !== "link") continue; // a link to follow is not loaded
        urls.push(...value.find((v) => v !== undefined)!.split(",").map((u) => u.trim().split(/\s+/)[0]!));
      }
    }
  }
  return urls;
}

/**
 * What in a page's files would make HyperFrames go online at render, a line each: a font family that
 * is neither the tool's nor declared by the page with @font-face, and anything loaded from the network.
 */
export function pageFetches(files: { name: string; text: string; html: boolean }[]): string[] {
  const styles = files.map((f) => ({ ...f, css: f.html ? cssOfHtml(f.text) : f.text }));
  const declared = new Set(FONTS.map((f) => f.family.toLowerCase()));
  for (const { css } of styles) {
    for (const [, face] of css.matchAll(FACE)) for (const family of familiesNamed(face!)) declared.add(family.toLowerCase());
  }
  const tool = FONTS.map((f) => f.family).join(", ");
  const lines: string[] = [];
  for (const { name, css, text, html } of styles) {
    const unknown = new Set(familiesNamed(css.replace(FACE, "")).filter((f) => !declared.has(f.toLowerCase())));
    for (const family of unknown) {
      lines.push(`${name} uses the font "${family}", which is not one of the tool's (${tool}) and has no @font-face in the page: add one, its src a file in the video's assets/`);
    }
    for (const url of new Set(loads(text, html).filter((u) => REMOTE.test(u)))) {
      lines.push(`${name} loads ${url} from the network: save it into the video's assets/ and refer to it as assets/<file>`);
    }
  }
  return lines;
}

/** Throws, naming each, if a page-scroll scene's page would make the render go online. Run before any narration. */
export async function checkPages(video: LoadedVideo): Promise<void> {
  const lines: string[] = [];
  for (const scene of video.script.scenes) {
    if (scene.scene !== "page-scroll") continue;
    const files = [{ name: scene.page, text: await readFile(path.join(video.dir, scene.page), "utf8"), html: true }];
    if (scene.css) files.push({ name: scene.css, text: await readFile(path.join(video.dir, scene.css), "utf8"), html: false });
    lines.push(...pageFetches(files).map((l) => `Scene "${scene.id}": ${l}`));
  }
  if (lines.length) throw new Error(`${lines.join("\n")}\nA video renders with the network off (AGENTS.md, "Offline").`);
}
