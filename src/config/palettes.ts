/**
 * Color Palettes and Ball Skins for BOUNCE
 */

export interface SkinDefinition {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
  trailColor: string;
  faceStyle: 'button' | 'visor' | 'star' | 'devil' | 'hypno' | 'retro';
  trailType?: 'beams' | 'sparks' | 'rainbow' | 'glitch';
}

export const SKINS: Record<string, SkinDefinition> = {
  cyan:    { id: 'cyan',    name: 'Seraph',     primaryColor: '#E8A93C', secondaryColor: '#6B4A14', glowColor: '#FFE9B0', trailColor: '#F7DC9C', faceStyle: 'button', trailType: 'beams' },
  magenta: { id: 'magenta', name: 'Rosewind',   primaryColor: '#C4757D', secondaryColor: '#E3CE9E', glowColor: '#E0969C', trailColor: '#E0969C', faceStyle: 'visor',  trailType: 'beams' },
  gold:    { id: 'gold',    name: 'Gloriole',   primaryColor: '#C8A868', secondaryColor: '#7C5A1C', glowColor: '#F2E2C4', trailColor: '#E3CE9E', faceStyle: 'star',   trailType: 'sparks' },
  violet:  { id: 'violet',  name: 'Vesper',     primaryColor: '#8F86B8', secondaryColor: '#C8A868', glowColor: '#CFC6EE', trailColor: '#B6ADDC', faceStyle: 'devil',  trailType: 'beams' },
  mint:    { id: 'mint',    name: 'Verdant',    primaryColor: '#7F9B70', secondaryColor: '#E3DED0', glowColor: '#B9D9A4', trailColor: '#A6C98F', faceStyle: 'hypno',  trailType: 'sparks' },
  chrome:  { id: 'chrome',  name: 'Reliquary',  primaryColor: '#BFC6D4', secondaryColor: '#7E8EA9', glowColor: '#EDF2F8', trailColor: '#AFBACE', faceStyle: 'visor',  trailType: 'rainbow' },
  sunset:  { id: 'sunset',  name: 'Vespertine', primaryColor: '#D48E6E', secondaryColor: '#A3C4E2', glowColor: '#F2C79A', trailColor: '#E0AC88', faceStyle: 'star',   trailType: 'rainbow' },
  void:    { id: 'void',    name: 'Umbra',      primaryColor: '#3A2E4E', secondaryColor: '#C8A868', glowColor: '#6B4C86', trailColor: '#4A3A63', faceStyle: 'devil',  trailType: 'glitch' },

  // --- unlocked with coins ------------------------------------------------
  // Each of these is a distinct *material* read rather than just another hue:
  // a porcelain, a patinated bronze, a lacquer, an ink wash, a pearl and a
  // mercury. Eight recolours of the same shiny sphere is not a cosmetic set.
  porcelain: { id: 'porcelain', name: 'Porcelain',   primaryColor: '#EFE9DE', secondaryColor: '#8FA3BE', glowColor: '#FFFFFF', trailColor: '#DCE6F1', faceStyle: 'button', trailType: 'sparks' },
  bronze:    { id: 'bronze',    name: 'Verdigris',   primaryColor: '#7E9C86', secondaryColor: '#5A4A3C', glowColor: '#A9C4AE', trailColor: '#8FB09A', faceStyle: 'visor',  trailType: 'beams' },
  lacquer:   { id: 'lacquer',   name: 'Cinnabar',    primaryColor: '#B4453F', secondaryColor: '#E3CE9E', glowColor: '#E0645C', trailColor: '#C4564E', faceStyle: 'devil',  trailType: 'sparks' },
  inkwash:   { id: 'inkwash',   name: 'Sumi',        primaryColor: '#4A5468', secondaryColor: '#D3D9E6', glowColor: '#8894A8', trailColor: '#6A758A', faceStyle: 'hypno',  trailType: 'glitch' },
  pearl:     { id: 'pearl',     name: 'Nacre',       primaryColor: '#DCD4E2', secondaryColor: '#A3C4E2', glowColor: '#F4EEF6', trailColor: '#C8BFD4', faceStyle: 'star',   trailType: 'rainbow' },
  mercury:   { id: 'mercury',   name: 'Quicksilver', primaryColor: '#9AA6B4', secondaryColor: '#EDF2F8', glowColor: '#D6DEE8', trailColor: '#B4BEC9', faceStyle: 'visor',  trailType: 'rainbow' },
  ember:     { id: 'ember',     name: 'Emberfall',   primaryColor: '#C4703C', secondaryColor: '#3A2E4E', glowColor: '#E89A5C', trailColor: '#D4834C', faceStyle: 'star',   trailType: 'sparks' },
  aurora:    { id: 'aurora',    name: 'Aurora',      primaryColor: '#7FB0A8', secondaryColor: '#C4757D', glowColor: '#A8D4CC', trailColor: '#8FC0B8', faceStyle: 'hypno',  trailType: 'rainbow' },
};

/** Lifetime coins required to unlock each skin. */
export const SKIN_UNLOCK: Record<string, number> = {
  cyan: 0, magenta: 0, gold: 0, violet: 0, mint: 0, chrome: 0, sunset: 0, void: 0,
  porcelain: 60, bronze: 140, lacquer: 260, inkwash: 420,
  pearl: 640, mercury: 900, ember: 1250, aurora: 1700,
};


/** @deprecated Superseded by rendering/Palette.ts — kept only for CSS-side use. */
export const WORLD_PALETTE = {
  skyTop: '#6D9FD4',
  skyBottom: '#F6E9CE',
  platformTop: '#EDE3CB',
  platformPink: '#BE7079',
  platformYellow: '#E3BC64',
  platformDark: '#9AA6BE',
  metalDark: '#6E7C99',
  hazardStripe: '#B8862B',
  hazardDark: '#241C31',
  inkOutline: '#5A4A3C',
  gridLine: '#B4BCCE',
  lightDirectional: '#FFF6D6',
  lightAmbient: '#D8E6F3',
};
