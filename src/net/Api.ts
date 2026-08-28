/**
 * BOUNCE - Master Backend Network & Offline Sync Layer
 *
 * Single gateway for Supabase Auth, Progression, Run Submission, and Leaderboards.
 * Maintains localStorage as the offline source of truth and write-through cache.
 */

import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { GameModeId } from '../config/modes';

export interface UserProfile {
  id: string;
  shortId: string;
  displayName: string;
  equippedSkin: string;
  equippedAbility: string;
  isAnonymous: boolean;
}

export interface ProgressionStats {
  lifetimeCoins: number;
  totalRuns: number;
  totalPerfects: number;
  bestDistance: number;
  bestCombo: number;
  bestTime: number | null;
}

export interface RunSubmissionPayload {
  runUuid?: string;
  mode: GameModeId;
  score: number;
  distance: number;
  coins: number;
  maxCombo: number;
  runTime: number;
  perfects: number;
  nearMisses: number;
  topSpeed: number;
  clientVersion?: string;
}

export interface RunSubmissionResult {
  success: boolean;
  progression: ProgressionStats;
  newlyUnlocked: string[];
  offlineQueued?: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  score: number;
  distance: number;
  runTime: number;
  createdAt: string;
  rank: number;
  isYou: boolean;
}

export type LeaderboardWindow = 'all' | 'week' | 'today';
export type LeaderboardScope = 'global' | 'friends' | 'me';

const CACHE_TTL_MS = 2 * 1000; // 2s client cache so leaderboards update instantly

// Local storage keys
const KEY_COINS = 'bounce.coins.lifetime';
const KEY_ABILITY = 'bounce.ability.equipped';
const KEY_SKIN = 'bounce.skin.equipped';
const KEY_BEST_DIST = 'bounce.stat.bestDistance';
const KEY_BEST_COMBO = 'bounce.stat.bestCombo';
const KEY_RUNS = 'bounce.stat.runs';
const KEY_PERFECTS = 'bounce.stat.perfects';
const KEY_BEST_TIME = 'bounce.stat.bestTime';
const KEY_DISPLAY_NAME = 'bounce.profile.displayName';
const KEY_USERNAME_PROMPTED = 'bounce.profile.prompted';
const KEY_PENDING_RUNS = 'bounce.pending_runs';
const KEY_ANON_UID = 'bounce.auth.anon_uid';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateDefaultName(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Wanderer ${num}`;
}

export class NetworkApi {
  private static instance: NetworkApi;
  private supabase: SupabaseClient | null = null;
  private user: User | null = null;
  private profile: UserProfile | null = null;
  private isInitialized = false;
  private isOnline = navigator.onLine;
  private isSyncingRuns = false;

  private leaderboardCache = new Map<
    string,
    { data: LeaderboardEntry[]; timestamp: number }
  >();

  private onProfileChangeCallbacks = new Set<(p: UserProfile) => void>();
  private onSyncStatusCallbacks = new Set<
    (status: { isOnline: boolean; pendingCount: number }) => void
  >();

  private constructor() {
    this.initSupabaseClient();
    this.initNetworkListeners();
  }

  public static getInstance(): NetworkApi {
    if (!NetworkApi.instance) {
      NetworkApi.instance = new NetworkApi();
    }
    return NetworkApi.instance;
  }

  private initSupabaseClient(): void {
    const env = (import.meta as any).env || {};
    const supabaseUrl =
      env.VITE_PUBLIC_SUPABASE_URL ||
      env.VITE_SUPABASE_URL ||
      'https://pnytidpsgjuuudtzrdym.supabase.co';
    const supabaseAnonKey =
      env.VITE_PUBLIC_SUPABASE_ANON_KEY ||
      env.VITE_SUPABASE_ANON_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueXRpZHBzZ2p1dXVkdHpyZHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MzQ4NjUsImV4cCI6MjEwMzQxMDg2NX0.3dmxKFhZ4NSNqQcCmUHu86qElUJX52AmS4FkIl6yKYs';

    try {
      if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
        this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
        });
      }
    } catch (e) {
      console.warn('[BOUNCE API] Failed to initialize Supabase client:', e);
      this.supabase = null;
    }
  }

  private initNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifySyncStatus();
      this.flushPendingRuns();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifySyncStatus();
    });

    // Periodic check for pending runs flush
    window.setInterval(() => {
      if (this.isOnline && this.getPendingRunsCount() > 0) {
        this.flushPendingRuns();
      }
    }, 15000);
  }

  // --------------------------------------------------------------------------
  // Lifecycle & Auth
  // --------------------------------------------------------------------------

  public async init(): Promise<UserProfile> {
    if (this.isInitialized && this.profile) {
      return this.profile;
    }

    // 1. Establish local profile representation
    let localName = localStorage.getItem(KEY_DISPLAY_NAME);
    if (!localName) {
      localName = generateDefaultName();
      localStorage.setItem(KEY_DISPLAY_NAME, localName);
    }

    let anonUid = localStorage.getItem(KEY_ANON_UID);
    if (!anonUid) {
      anonUid = generateUuid();
      localStorage.setItem(KEY_ANON_UID, anonUid);
    }

    this.profile = {
      id: anonUid,
      shortId: anonUid.slice(0, 4),
      displayName: localName,
      equippedSkin: localStorage.getItem(KEY_SKIN) || 'porcelain',
      equippedAbility: localStorage.getItem(KEY_ABILITY) || 'featherfall',
      isAnonymous: true,
    };

    // 2. Connect to Supabase Auth if available
    if (this.supabase && this.isOnline) {
      try {
        const {
          data: { session },
        } = await this.supabase.auth.getSession();

        if (!session) {
          // Sign in anonymously
          const { data, error } =
            await this.supabase.auth.signInAnonymously();
          if (!error && data.user) {
            this.user = data.user;
            this.profile.id = data.user.id;
            this.profile.shortId = data.user.id.slice(0, 4);
            this.profile.isAnonymous = data.user.is_anonymous ?? true;
            localStorage.setItem(KEY_ANON_UID, data.user.id);
          }
        } else {
          this.user = session.user;
          this.profile.id = session.user.id;
          this.profile.shortId = session.user.id.slice(0, 4);
          this.profile.isAnonymous = session.user.is_anonymous ?? true;
          localStorage.setItem(KEY_ANON_UID, session.user.id);
        }

        // Fetch or create profile on server
        await this.syncProfileWithServer();
        // Sync server progression with local cache
        await this.syncProgressionOnSignIn();
        // Flush any queued runs
        await this.flushPendingRuns();
      } catch (err) {
        console.warn('[BOUNCE API] Remote auth sync skipped/failed:', err);
      }
    }

    this.isInitialized = true;
    this.notifyProfileChange();
    this.notifySyncStatus();
    return this.profile;
  }

  private async syncProfileWithServer(): Promise<void> {
    if (!this.supabase || !this.user) return;

    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', this.user.id)
        .single();

      if (data && !error) {
        if (data.display_name) {
          this.profile!.displayName = data.display_name;
          localStorage.setItem(KEY_DISPLAY_NAME, data.display_name);
        }
        if (data.equipped_skin) {
          this.profile!.equippedSkin = data.equipped_skin;
          localStorage.setItem(KEY_SKIN, data.equipped_skin);
        }
        if (data.equipped_ability) {
          this.profile!.equippedAbility = data.equipped_ability;
          localStorage.setItem(KEY_ABILITY, data.equipped_ability);
        }
      } else {
        // Insert or update profile on server
        await this.supabase.from('profiles').upsert({
          id: this.user.id,
          display_name: this.profile!.displayName,
          equipped_skin: this.profile!.equippedSkin,
          equipped_ability: this.profile!.equippedAbility,
        });
      }
    } catch (e) {
      console.warn('[BOUNCE API] Profile server sync failed:', e);
    }
  }

  private async syncProgressionOnSignIn(): Promise<void> {
    if (!this.supabase || !this.user) return;

    try {
      const { data, error } = await this.supabase
        .from('progression')
        .select('*')
        .eq('user_id', this.user.id)
        .single();

      if (data && !error && Number(data.total_runs) > 0) {
        // Server owns lifetime_coins and progression numbers
        const serverCoins = Number(data.lifetime_coins) || 0;
        localStorage.setItem(KEY_COINS, String(serverCoins));
        localStorage.setItem(KEY_RUNS, String(data.total_runs));
        localStorage.setItem(KEY_PERFECTS, String(data.total_perfects));
        localStorage.setItem(
          KEY_BEST_DIST,
          String(Math.floor(data.best_distance))
        );
        localStorage.setItem(KEY_BEST_COMBO, String(data.best_combo));
        if (data.best_time) {
          localStorage.setItem(KEY_BEST_TIME, String(data.best_time));
        }
      } else {
        // First-ever sign-in: seed local progression once
        const localCoins = Number(localStorage.getItem(KEY_COINS) ?? 0) || 0;
        const localRuns = Number(localStorage.getItem(KEY_RUNS) ?? 0) || 0;
        const localPerf = Number(localStorage.getItem(KEY_PERFECTS) ?? 0) || 0;
        const localDist =
          Number(localStorage.getItem(KEY_BEST_DIST) ?? 0) || 0;
        const localCombo =
          Number(localStorage.getItem(KEY_BEST_COMBO) ?? 1) || 1;
        const localTime =
          Number(localStorage.getItem(KEY_BEST_TIME) ?? 0) || null;

        if (localRuns > 0 || localCoins > 0) {
          const { data: seeded } = await this.supabase.rpc(
            'seed_initial_progression',
            {
              p_coins: localCoins,
              p_runs: localRuns,
              p_perfects: localPerf,
              p_best_dist: localDist,
              p_best_combo: localCombo,
              p_best_time: localTime,
            }
          );
          if (seeded) {
            localStorage.setItem(
              KEY_COINS,
              String(seeded.lifetime_coins || localCoins)
            );
          }
        }
      }
    } catch (e) {
      console.warn('[BOUNCE API] Progression sync skipped:', e);
    }
  }

  // --------------------------------------------------------------------------
  // Profile & Username
  // --------------------------------------------------------------------------

  public getProfile(): UserProfile {
    if (this.profile) return this.profile;
    const localName =
      localStorage.getItem(KEY_DISPLAY_NAME) || generateDefaultName();
    const anonUid = localStorage.getItem(KEY_ANON_UID) || generateUuid();
    return {
      id: anonUid,
      shortId: anonUid.slice(0, 4),
      displayName: localName,
      equippedSkin: localStorage.getItem(KEY_SKIN) || 'porcelain',
      equippedAbility: localStorage.getItem(KEY_ABILITY) || 'featherfall',
      isAnonymous: true,
    };
  }

  public hasPromptedUsername(): boolean {
    return localStorage.getItem(KEY_USERNAME_PROMPTED) === '1';
  }

  public setPromptedUsername(val: boolean = true): void {
    localStorage.setItem(KEY_USERNAME_PROMPTED, val ? '1' : '0');
  }

  public async updateDisplayName(newName: string): Promise<boolean> {
    const trimmed = newName.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      return false;
    }

    localStorage.setItem(KEY_DISPLAY_NAME, trimmed);
    if (this.profile) {
      this.profile.displayName = trimmed;
    }

    if (this.supabase && this.user) {
      try {
        await this.supabase
          .from('profiles')
          .update({ display_name: trimmed })
          .eq('id', this.user.id);
      } catch (e) {
        console.warn('[BOUNCE API] Failed to update remote display name:', e);
      }
    }

    this.setPromptedUsername(true);
    this.notifyProfileChange();
    return true;
  }

  public async setEquippedSkin(skinId: string): Promise<void> {
    localStorage.setItem(KEY_SKIN, skinId);
    if (this.profile) this.profile.equippedSkin = skinId;
    if (this.supabase && this.user) {
      try {
        await this.supabase
          .from('profiles')
          .update({ equipped_skin: skinId })
          .eq('id', this.user.id);
      } catch {}
    }
  }

  public async setEquippedAbility(abilityId: string): Promise<void> {
    localStorage.setItem(KEY_ABILITY, abilityId);
    if (this.profile) this.profile.equippedAbility = abilityId;
    if (this.supabase && this.user) {
      try {
        await this.supabase
          .from('profiles')
          .update({ equipped_ability: abilityId })
          .eq('id', this.user.id);
      } catch {}
    }
  }

  // --------------------------------------------------------------------------
  // Account Linking (Upgrades Anonymous User without losing coins)
  // --------------------------------------------------------------------------

  public async linkEmail(email: string): Promise<{ error: string | null }> {
    if (!this.supabase) {
      return { error: 'Backend connection not configured. Check environment variables.' };
    }

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await this.supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: origin,
        },
      });
      if (error) {
        if (error.message?.includes('Failed to fetch')) {
          return { error: 'CORS/Network error. Add http://localhost:5173 to Supabase Redirect URLs.' };
        }
        return { error: error.message };
      }
      return { error: null };
    } catch (e: any) {
      const msg = e.message || 'Linking request failed';
      if (msg.includes('Failed to fetch')) {
        return { error: 'CORS/Network error. Add http://localhost:5173 to Supabase Redirect URLs.' };
      }
      return { error: msg };
    }
  }

  public async verifyEmailOtp(
    email: string,
    token: string
  ): Promise<{ success: boolean; error: string | null }> {
    if (!this.supabase) {
      return { success: false, error: 'Backend not available' };
    }

    try {
      const { data, error } = await this.supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });

      if (error) return { success: false, error: error.message };

      if (data.user) {
        this.user = data.user;
        if (this.profile) {
          this.profile.id = data.user.id;
          this.profile.shortId = data.user.id.slice(0, 4);
          this.profile.isAnonymous = false;
        }
        await this.syncProfileWithServer();
        await this.syncProgressionOnSignIn();
        this.notifyProfileChange();
      }
      return { success: true, error: null };
    } catch (e: any) {
      return { success: false, error: e.message || 'OTP verification failed' };
    }
  }

  // --------------------------------------------------------------------------
  // Run Submission & Offline Queue
  // --------------------------------------------------------------------------

  public async submitRun(
    payload: RunSubmissionPayload
  ): Promise<RunSubmissionResult> {
    const runUuid = payload.runUuid || generateUuid();
    payload.runUuid = runUuid;

    // 1. Optimistic write-through to localStorage
    const localCoins =
      (Number(localStorage.getItem(KEY_COINS) ?? 0) || 0) + payload.coins;
    const localRuns =
      (Number(localStorage.getItem(KEY_RUNS) ?? 0) || 0) + 1;
    const localPerfects =
      (Number(localStorage.getItem(KEY_PERFECTS) ?? 0) || 0) + payload.perfects;
    const curBestDist =
      Number(localStorage.getItem(KEY_BEST_DIST) ?? 0) || 0;
    const newBestDist = Math.max(curBestDist, Math.floor(payload.distance));
    const curBestCombo =
      Number(localStorage.getItem(KEY_BEST_COMBO) ?? 1) || 1;
    const newBestCombo = Math.max(curBestCombo, payload.maxCombo);

    localStorage.setItem(KEY_COINS, String(localCoins));
    localStorage.setItem(KEY_RUNS, String(localRuns));
    localStorage.setItem(KEY_PERFECTS, String(localPerfects));
    localStorage.setItem(KEY_BEST_DIST, String(newBestDist));
    localStorage.setItem(KEY_BEST_COMBO, String(newBestCombo));

    // Migration: ensure legacy inflated scores (> 5000) are wiped so new runs register
    const version = localStorage.getItem('bounce_score_version');
    if (version !== 'v2') {
      const modes: GameModeId[] = ['arcade', 'time_attack', 'score_attack', 'endless', 'daily', 'master'];
      modes.forEach(m => {
        const s = Number(localStorage.getItem(`bounce_high_score_${m}`) ?? 0) || 0;
        if (s > 5000) localStorage.removeItem(`bounce_high_score_${m}`);
      });
      const glob = Number(localStorage.getItem('bounce.stat.bestScore') ?? 0) || 0;
      if (glob > 5000) localStorage.removeItem('bounce.stat.bestScore');
      localStorage.setItem('bounce_score_version', 'v2');
    }

    // Save guaranteed highest score for the specific mode
    const curHighScore = Number(localStorage.getItem(`bounce_high_score_${payload.mode}`) ?? 0) || 0;
    const bestModeScore = Math.max(curHighScore, payload.score);
    localStorage.setItem(`bounce_high_score_${payload.mode}`, String(bestModeScore));

    const curGlobalBest = Number(localStorage.getItem('bounce.stat.bestScore') ?? 0) || 0;
    if (bestModeScore > curGlobalBest) {
      localStorage.setItem('bounce.stat.bestScore', String(bestModeScore));
    }

    if (
      payload.mode === 'time_attack' &&
      payload.runTime > 3 &&
      payload.distance > 60
    ) {
      const curBestTime =
        Number(localStorage.getItem(KEY_BEST_TIME) ?? 0) || 0;
      const minBestTime = curBestTime === 0 ? payload.runTime : Math.min(curBestTime, payload.runTime);
      localStorage.setItem(KEY_BEST_TIME, String(minBestTime));
      localStorage.setItem(`bounce_best_time_${payload.mode}`, String(minBestTime));
    }

    this.invalidateLeaderboardCache();

    const optimisticProgression: ProgressionStats = {
      lifetimeCoins: localCoins,
      totalRuns: localRuns,
      totalPerfects: localPerfects,
      bestDistance: newBestDist,
      bestCombo: newBestCombo,
      bestTime:
        Number(localStorage.getItem(KEY_BEST_TIME) ?? 0) || null,
    };

    // 2. Submit to server if online
    if (this.supabase && this.user && this.isOnline) {
      try {
        const session = (await this.supabase.auth.getSession()).data.session;
        const supabaseUrl = (this.supabase as any).supabaseUrl || '';

        // Call Edge Function submit-run
        const response = await fetch(
          `${supabaseUrl}/functions/v1/submit-run`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token || ''}`,
            },
            body: JSON.stringify(payload),
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (result.progression) {
            const p = result.progression;
            const updatedProg: ProgressionStats = {
              lifetimeCoins: Number(p.lifetime_coins) || localCoins,
              totalRuns: Number(p.total_runs) || localRuns,
              totalPerfects: Number(p.total_perfects) || localPerfects,
              bestDistance: Number(p.best_distance) || newBestDist,
              bestCombo: Number(p.best_combo) || newBestCombo,
              bestTime: p.best_time ?? optimisticProgression.bestTime,
            };
            localStorage.setItem(KEY_COINS, String(updatedProg.lifetimeCoins));
            this.invalidateLeaderboardCache();
            return {
              success: true,
              progression: updatedProg,
              newlyUnlocked: result.newlyUnlocked || [],
            };
          }
        } else if (response.status === 400) {
          console.warn('[BOUNCE API] Run rejected by server validation rules');
          return {
            success: false,
            progression: optimisticProgression,
            newlyUnlocked: [],
          };
        }
      } catch (e) {
        console.warn('[BOUNCE API] Edge Function call failed, queuing offline:', e);
      }
    }

    // Queue run in offline queue
    this.queuePendingRun(payload);
    return {
      success: true,
      progression: optimisticProgression,
      newlyUnlocked: [],
      offlineQueued: true,
    };
  }

  private queuePendingRun(run: RunSubmissionPayload): void {
    try {
      const queue = this.getPendingRuns();
      queue.push(run);
      localStorage.setItem(KEY_PENDING_RUNS, JSON.stringify(queue));
      this.notifySyncStatus();
    } catch {}
  }

  public getPendingRuns(): RunSubmissionPayload[] {
    try {
      const raw = localStorage.getItem(KEY_PENDING_RUNS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public getPendingRunsCount(): number {
    return this.getPendingRuns().length;
  }

  public async flushPendingRuns(): Promise<void> {
    if (this.isSyncingRuns || !this.isOnline || !this.supabase || !this.user) {
      return;
    }

    const queue = this.getPendingRuns();
    if (queue.length === 0) return;

    this.isSyncingRuns = true;
    const remaining: RunSubmissionPayload[] = [];

    for (const run of queue) {
      try {
        const session = (await this.supabase.auth.getSession()).data.session;
        const supabaseUrl = (this.supabase as any).supabaseUrl || '';

        const res = await fetch(`${supabaseUrl}/functions/v1/submit-run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify(run),
        });

        if (!res.ok && res.status !== 400) {
          remaining.push(run);
        }
      } catch {
        remaining.push(run);
      }
    }

    localStorage.setItem(KEY_PENDING_RUNS, JSON.stringify(remaining));
    this.isSyncingRuns = false;
    this.notifySyncStatus();
    this.invalidateLeaderboardCache();
  }

  // --------------------------------------------------------------------------
  // Leaderboards
  // --------------------------------------------------------------------------

  public async getLeaderboard(
    mode: GameModeId,
    windowRange: LeaderboardWindow = 'all',
    scope: LeaderboardScope = 'global',
    limit: number = 100
  ): Promise<LeaderboardEntry[]> {
    const cacheKey = `${mode}:${windowRange}:${scope}:${limit}`;
    const cached = this.leaderboardCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    if (this.supabase && this.isOnline) {
      try {
        const { data, error } = await this.supabase.rpc('leaderboard', {
          p_mode: mode,
          p_window: windowRange,
          p_scope: scope,
          p_limit: limit,
        });

        if (data && !error) {
          const profile = this.getProfile();
          let entries: LeaderboardEntry[] = data.map((row: any) => {
            let score = Number(row.score) || 0;
            // Normalize legacy inflated scores (> 5000) from earlier version
            if (score > 5000) {
              score = Math.round(score * 0.08);
            }
            const isYou = Boolean(row.is_you) || (profile.displayName && row.display_name === profile.displayName);
            return {
              userId: row.user_id,
              displayName: row.display_name,
              score,
              distance: Number(row.distance) || 0,
              runTime: Number(row.run_time) || 0,
              createdAt: row.created_at,
              rank: Number(row.rank),
              isYou,
            };
          });

          const localScore = Number(localStorage.getItem(`bounce_high_score_${mode}`) ?? 0) || 0;
          const localTime = Number(localStorage.getItem(`bounce_best_time_${mode}`) ?? 0) || 0;

          let you = entries.find((e) => e.isYou);
          if (you) {
            you.isYou = true;
            if (localScore > 0) you.score = localScore;
            if (localTime > 0 && (you.runTime === 0 || localTime < you.runTime)) you.runTime = localTime;
          } else if (localScore > 0 || localTime > 0) {
            entries.push({
              userId: profile.id,
              displayName: profile.displayName,
              score: localScore,
              distance: Number(localStorage.getItem(KEY_BEST_DIST) ?? 0) || 0,
              runTime: localTime > 0 ? localTime : 65.0,
              createdAt: new Date().toISOString(),
              rank: 1,
              isYou: true,
            });
          }

          if (mode === 'time_attack') {
            entries.sort((a, b) => a.runTime - b.runTime);
          } else {
            entries.sort((a, b) => b.score - a.score);
          }
          entries.forEach((e, i) => { e.rank = i + 1; });

          if (scope === 'me') {
            entries = entries.filter((e) => e.isYou);
          }

          this.leaderboardCache.set(cacheKey, {
            data: entries,
            timestamp: Date.now(),
          });
          return entries;
        }
      } catch (e) {
        console.warn('[BOUNCE API] Remote leaderboard fetch failed:', e);
      }
    }

    // Fallback offline simulated rivals with current player rank
    return this.getFallbackLeaderboard(mode, windowRange, scope);
  }

  public invalidateLeaderboardCache(): void {
    this.leaderboardCache.clear();
  }

  private getFallbackLeaderboard(
    mode: GameModeId,
    _windowRange: LeaderboardWindow = 'all',
    scope: LeaderboardScope = 'global'
  ): LeaderboardEntry[] {
    const defaultRivalsByMode: Record<GameModeId, Array<{ name: string; t: number; s: number; d: number }>> = {
      arcade: [
        { name: 'Kaira', t: 54.384, s: 3450, d: 1400 },
        { name: 'Nox', t: 56.633, s: 2980, d: 1350 },
        { name: 'Pip', t: 57.467, s: 2620, d: 1280 },
        { name: 'Luna', t: 58.920, s: 2280, d: 1210 },
        { name: 'Zephyr', t: 59.301, s: 1950, d: 1140 },
        { name: 'Aurora', t: 60.112, s: 1680, d: 1060 },
        { name: 'Rift', t: 60.778, s: 1420, d: 980 },
        { name: 'Solace', t: 61.335, s: 1190, d: 890 },
        { name: 'Vex', t: 61.889, s: 980, d: 780 },
        { name: 'Wren', t: 62.740, s: 780, d: 680 },
        { name: 'Halcyon', t: 63.508, s: 590, d: 550 },
        { name: 'Ember', t: 64.221, s: 420, d: 420 },
      ],
      time_attack: [
        { name: 'Kaira', t: 26.412, s: 2800, d: 1000 },
        { name: 'Zephyr', t: 28.190, s: 2450, d: 1000 },
        { name: 'Nox', t: 30.245, s: 2100, d: 1000 },
        { name: 'Pip', t: 32.890, s: 1780, d: 1000 },
        { name: 'Luna', t: 35.112, s: 1450, d: 1000 },
        { name: 'Aurora', t: 37.450, s: 1200, d: 1000 },
        { name: 'Solace', t: 41.200, s: 950, d: 1000 },
      ],
      score_attack: [
        { name: 'Pip', t: 60.0, s: 3200, d: 1400 },
        { name: 'Kaira', t: 60.0, s: 2750, d: 1320 },
        { name: 'Zephyr', t: 60.0, s: 2320, d: 1240 },
        { name: 'Nox', t: 60.0, s: 1910, d: 1150 },
        { name: 'Luna', t: 60.0, s: 1480, d: 1020 },
      ],
      endless: [
        { name: 'Zephyr', t: 142.0, s: 3800, d: 3200 },
        { name: 'Kaira', t: 120.5, s: 3100, d: 2600 },
        { name: 'Nox', t: 98.4, s: 2450, d: 2050 },
        { name: 'Aurora', t: 75.0, s: 1750, d: 1480 },
      ],
      daily: [
        { name: 'Luna', t: 88.0, s: 3100, d: 2400 },
        { name: 'Pip', t: 72.0, s: 2450, d: 1950 },
        { name: 'Vex', t: 55.0, s: 1680, d: 1350 },
      ],
      master: [
        { name: 'Kaira', t: 48.0, s: 4200, d: 1800 },
        { name: 'Nox', t: 42.0, s: 3450, d: 1550 },
        { name: 'Zephyr', t: 36.0, s: 2700, d: 1280 },
      ],
    };

    const rivals = defaultRivalsByMode[mode] || defaultRivalsByMode.arcade;
    const localProfile = this.getProfile();
    const savedScore =
      Number(localStorage.getItem(`bounce_high_score_${mode}`) ?? 0) || 0;
    const savedTime =
      Number(localStorage.getItem(`bounce_best_time_${mode}`) ?? 0) ||
      Number(localStorage.getItem(KEY_BEST_TIME) ?? 0) ||
      0;
    const savedDist =
      Number(localStorage.getItem(KEY_BEST_DIST) ?? 0) || 0;

    let list: Array<{
      name: string;
      s: number;
      t: number;
      d: number;
      isYou: boolean;
      id: string;
    }> = rivals.map((r, i) => ({
      name: r.name,
      s: r.s,
      t: r.t,
      d: r.d,
      isYou: false,
      id: `bot-${i}`,
    }));

    if (savedScore > 0 || savedTime > 0 || savedDist > 0) {
      list.push({
        name: localProfile.displayName,
        s: savedScore,
        t: savedTime > 0 ? savedTime : 65.0,
        d: savedDist,
        isYou: true,
        id: localProfile.id,
      });
    }

    if (mode === 'time_attack') {
      list.sort((a, b) => a.t - b.t);
    } else {
      list.sort((a, b) => b.s - a.s);
    }

    const allRanked = list.map((r, i) => ({
      userId: r.id,
      displayName: r.name,
      score: r.s,
      distance: r.d,
      runTime: r.t,
      createdAt: new Date().toISOString(),
      rank: i + 1,
      isYou: r.isYou,
    }));

    if (scope === 'me') {
      const youEntry = allRanked.find((r) => r.isYou);
      return youEntry ? [youEntry] : [];
    }

    if (scope === 'friends') {
      return allRanked.filter((r, i) => r.isYou || i < 5);
    }

    return allRanked;
  }

  // --------------------------------------------------------------------------
  // Friends & Follows
  // --------------------------------------------------------------------------

  public async followUser(targetId: string): Promise<boolean> {
    if (!this.supabase || !this.user) return false;
    try {
      const { error } = await this.supabase
        .from('follows')
        .insert({ follower_id: this.user.id, followee_id: targetId });
      this.invalidateLeaderboardCache();
      return !error;
    } catch {
      return false;
    }
  }

  public async unfollowUser(targetId: string): Promise<boolean> {
    if (!this.supabase || !this.user) return false;
    try {
      const { error } = await this.supabase
        .from('follows')
        .delete()
        .eq('follower_id', this.user.id)
        .eq('followee_id', targetId);
      this.invalidateLeaderboardCache();
      return !error;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Event Subscriptions
  // --------------------------------------------------------------------------

  public subscribeProfile(cb: (p: UserProfile) => void): () => void {
    this.onProfileChangeCallbacks.add(cb);
    if (this.profile) cb(this.profile);
    return () => this.onProfileChangeCallbacks.delete(cb);
  }

  public subscribeSyncStatus(
    cb: (status: { isOnline: boolean; pendingCount: number }) => void
  ): () => void {
    this.onSyncStatusCallbacks.add(cb);
    cb({
      isOnline: this.isOnline,
      pendingCount: this.getPendingRunsCount(),
    });
    return () => this.onSyncStatusCallbacks.delete(cb);
  }

  private notifyProfileChange(): void {
    if (!this.profile) return;
    this.onProfileChangeCallbacks.forEach((cb) => cb(this.profile!));
  }

  private notifySyncStatus(): void {
    const status = {
      isOnline: this.isOnline,
      pendingCount: this.getPendingRunsCount(),
    };
    this.onSyncStatusCallbacks.forEach((cb) => cb(status));
  }
}

export const Api = NetworkApi.getInstance();
