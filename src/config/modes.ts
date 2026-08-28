/**
 * Game Modes & Progression Configuration for BOUNCE
 * 100% pure arcade styling - zero emojis
 */

export type GameModeId = 'arcade' | 'time_attack' | 'score_attack' | 'endless' | 'daily' | 'master';

export interface GameModeConfig {
  id: GameModeId;
  name: string;
  subtitle: string;
  icon: string;
  hasFinishLine: boolean;
  finishDistance: number;
  timeLimit?: number; // In seconds (for Score Attack)
  speedMultiplier: number;
  hazardMultiplier: number;
  medals: {
    bronze: number;  // Time (for Time Attack) or Score/Distance
    silver: number;
    gold: number;
    master: number;
  };
}

export const GAME_MODES: Record<GameModeId, GameModeConfig> = {
  arcade: {
    id: 'arcade',
    name: 'ARCADE RUN',
    subtitle: 'The 1,400m Gauntlet to the Finish Line',
    icon: '',
    hasFinishLine: true,
    finishDistance: 1400,
    speedMultiplier: 1.0,
    hazardMultiplier: 1.0,
    medals: {
      bronze: 800,
      silver: 1800,
      gold: 2800,
      master: 3800,
    },
  },
  time_attack: {
    id: 'time_attack',
    name: 'TIME ATTACK',
    subtitle: 'Race Against the Clock & Your Ghost',
    icon: '',
    hasFinishLine: true,
    finishDistance: 1000,
    speedMultiplier: 1.15,
    hazardMultiplier: 1.0,
    medals: {
      bronze: 45.0, // Target times in seconds
      silver: 36.0,
      gold: 29.5,
      master: 25.0,
    },
  },
  score_attack: {
    id: 'score_attack',
    name: 'SCORE ATTACK',
    subtitle: '60-Second Frenzy: Chain Max Tricks & Combos',
    icon: '',
    hasFinishLine: false,
    finishDistance: 0,
    timeLimit: 60,
    speedMultiplier: 1.1,
    hazardMultiplier: 1.2,
    medals: {
      bronze: 600,
      silver: 1400,
      gold: 2400,
      master: 3500,
    },
  },
  endless: {
    id: 'endless',
    name: 'ENDLESS SEEDED',
    subtitle: 'Procedural Challenge with Deterministic Seed',
    icon: '',
    hasFinishLine: false,
    finishDistance: 0,
    speedMultiplier: 1.0,
    hazardMultiplier: 1.0,
    medals: {
      bronze: 500,  // Distance in meters
      silver: 1200,
      gold: 2500,
      master: 4000,
    },
  },
  daily: {
    id: 'daily',
    name: 'DAILY BOUNCE',
    subtitle: 'Today\'s Universal Challenge Run',
    icon: '',
    hasFinishLine: false,
    finishDistance: 0,
    speedMultiplier: 1.05,
    hazardMultiplier: 1.1,
    medals: {
      bronze: 600,
      silver: 1400,
      gold: 2800,
      master: 4500,
    },
  },
  master: {
    id: 'master',
    name: 'MASTER GAUNTLET',
    subtitle: 'Extreme Speed, Thin Timing, Hardcore Hazards',
    icon: '',
    hasFinishLine: true,
    finishDistance: 1400,
    speedMultiplier: 1.35,
    hazardMultiplier: 1.5,
    medals: {
      bronze: 1000,
      silver: 2200,
      gold: 3400,
      master: 4500,
    },
  },
};

/**
 * Returns today's deterministic seed for Daily Bounce
 */
export function getDailySeed(): number {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 1000000;
}
