/**
 * Real art drop-in. The ART compartment puts image files under public/art/
 * and lists them in public/art/manifest.json:
 *
 *   { "images": [ { "key": "troop.hedgehog_roller", "url": "art/troops/shinobi.png" } ] }
 *
 * Each key is an asset key from docs/art/ASSET_KEYS.md. A loaded image wins
 * over the code-drawn placeholder with the same key (assets.ts skips keys
 * that already exist). A missing or broken manifest just means "no real art".
 */
import type Phaser from 'phaser';

export interface ArtImage {
  key: string;
  url: string;
}

let images: ArtImage[] = [];

const valid = (i: unknown): i is ArtImage =>
  !!i && typeof (i as ArtImage).key === 'string' && typeof (i as ArtImage).url === 'string' && !/^[a-z]+:/i.test((i as ArtImage).url);

export async function loadArtManifest(url = './art/manifest.json'): Promise<number> {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return 0;
    const j = (await r.json()) as { images?: unknown[] };
    images = Array.isArray(j.images) ? j.images.filter(valid) : [];
  } catch {
    images = [];
  }
  return images.length;
}

/** Queue every listed image in a scene's preload step (skips keys already loaded). */
export function queueArt(scene: Phaser.Scene): void {
  for (const i of images) if (!scene.textures.exists(i.key)) scene.load.image(i.key, i.url);
}
