export const DAY_LENGTH = 30; // seconds at 1x
export const DAYS_PER_SEASON = 4;
export const SEASON_LENGTH = DAY_LENGTH * DAYS_PER_SEASON;
export const YEAR_LENGTH = SEASON_LENGTH * 4;

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];
export const WINTER = 3;

// Farm output by season; autumn is harvest, winter fields lie fallow.
export const FARM_SEASON_MULT = [0.75, 1.25, 1.5, 0];

export interface Calendar {
  day: number; // absolute day index
  season: number; // 0..3
  dayOfSeason: number;
  year: number; // 1-based
  seasonProgress: number; // 0..1
}

export function calendar(time: number): Calendar {
  const day = Math.floor(time / DAY_LENGTH);
  return {
    day,
    season: Math.floor(day / DAYS_PER_SEASON) % 4,
    dayOfSeason: day % DAYS_PER_SEASON,
    year: Math.floor(time / YEAR_LENGTH) + 1,
    seasonProgress: (time % SEASON_LENGTH) / SEASON_LENGTH,
  };
}
