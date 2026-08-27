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
    subtitle: 'The Long Gauntlet to the Finish Line',
    icon: '',
    hasFinishLine: true,
    // Shortened from 19,000 alongside the new curve: the gentler opening drops
    // the average speed, and the same distance would have run 6.1 minutes.
    // This holds the ~5 minutes the length was chosen for.
    finishDistance: 15300,
    speedMultiplier: 1.0,
    hazardMultiplier: 1.0,
    medals: {
      bronze: 25000,
      silver: 60000,
      gold: 120000,
      master: 200000,
    },
  },
  time_attack: {
    id: 'time_attack',
    name: 'TIME ATTACK',
    subtitle: 'Race Against the Clock & Your Ghost',
    icon: '',
    hasFinishLine: true,
    finishDistance: 1400,
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
      bronze: 50000,
      silver: 150000,
      gold: 300000,
      master: 550000,
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
      bronze: 1000,  // Distance in meters
      silver: 2500,
      gold: 5000,
      master: 10000,
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
      bronze: 1200,
      silver: 3000,
      gold: 6000,
      master: 12000,
    },
  },
  master: {
    id: 'master',
    name: 'MASTER GAUNTLET',
    subtitle: 'Hyper Speed + Tight Landing Windows',
    icon: '',
    hasFinishLine: true,
    finishDistance: 19300,
    speedMultiplier: 1.35,
    hazardMultiplier: 1.5,
    medals: {
      bronze: 80000,
      silver: 180000,
      gold: 350000,
      master: 600000,
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
