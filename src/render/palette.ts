// Ink-on-parchment palette. Map colors are watercolor-ish washes laid under
// sepia ink linework; vermilion is reserved for danger.
import type { Terrain } from '../map';
import type { BuildingType, Resource } from '../sim/buildings';

export const INK = '#2b1d0e';
export const INK_SOFT = 'rgba(43,29,14,0.55)';
export const INK_FAINT = 'rgba(60,40,20,0.18)';
export const PAPER = '#efe2c0';
export const PAPER_DARK = '#d9c391';
export const VERMILION = '#b5452a';
export const TEAL_INK = '#2f6a66';
export const MOSS = '#4f6a2c';
export const OCHRE = '#a8741a';

export const TERRAIN_WASH: Record<Terrain, string> = {
  grass: '#ddd7a3',
  meadow: '#d6dc96',
  heath: '#d6c8a0',
  crags: '#cfc1a3',
  forest: '#b9c08f',
  hills: '#dcc495',
  water: '#a7bcbc',
  marsh: '#c4c9a2',
  wetwood: '#adbd95',
};

export const BUILDING_WASH: Record<BuildingType, string> = {
  hearth: '#e7c08a',
  road: '#c9a875',
  house: '#e6d2a6',
  farm: '#dcc277',
  woodcutter: '#cfb48a',
  quarry: '#cfc6b2',
  storehouse: '#d8bb88',
  well: '#c4d0cc',
  tower: '#d3c4a4',
  dike: '#c2bba8',
  granary: '#e3cc8c',
  market: '#d9c08e',
  barracks: '#c9b49a',
  mine: '#bdb3a3',
  fishery: '#cdd6d0',
  woodshed: '#cfb48a',
  stoneyard: '#cbc3b1',
  oreshed: '#b9b5ad',
  cathedral: '#e6dcc3',
  chapel: '#e3d8bd',
};

export const FLOOD_WASH = 'rgba(96,132,148,0.5)';
export const BLIGHT_INK = '#4a3550';

export const ROAD_WASH = ['#c9a875', '#b9b2a2'];

export const RESOURCE_WASH: Record<Resource, string> = {
  food: '#d9a83a',
  wood: '#7a4f28',
  stone: '#9a968c',
  iron: '#5d6670',
  coin: '#c9a227',
};

export const WARRIOR_INK = '#24405a'; // indigo, so soldiers read apart from villagers

export const SERIF = '"Iowan Old Style","Palatino Linotype","Book Antiqua",Palatino,Georgia,serif';
