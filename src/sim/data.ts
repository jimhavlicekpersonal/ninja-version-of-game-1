import buildings from '../data/buildings.json';
import hall from '../data/hall.json';
import economy from '../data/economy.json';
import type { BuildingDef, BuildingType, GameData, LevelDef } from './types';

/** The game's balance data, straight from src/data/*.json. */
export const defaultData: GameData = {
  buildings: buildings as unknown as GameData['buildings'],
  hall: hall as unknown as GameData['hall'],
  economy: economy as unknown as GameData['economy'],
};

export function buildingDef(data: GameData, type: BuildingType): BuildingDef {
  const def = data.buildings[type];
  if (!def) throw new Error(`Unknown building type: ${type}`);
  return def;
}

export function levelDef(data: GameData, type: BuildingType, level: number): LevelDef | undefined {
  return buildingDef(data, type).levels.find((l) => l.level === level);
}

export function maxDefinedLevel(data: GameData, type: BuildingType): number {
  const levels = buildingDef(data, type).levels;
  return levels.length ? levels[levels.length - 1].level : 0;
}

export function hallType(data: GameData): BuildingType {
  const entry = Object.entries(data.buildings).find(([, d]) => d.category === 'hall');
  if (!entry) throw new Error('No hall building defined');
  return entry[0];
}
