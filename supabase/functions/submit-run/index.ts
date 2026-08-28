// Supabase Edge Function: submit-run
// Strict run validation & anti-cheat engine for BOUNCE

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

const MAX_SPEED = 78;
const MAX_SPEED_CEILING = MAX_SPEED * 1.05; // 81.9 u/s
const COMBO_COUNT_MAX = 20;
const MIN_AIRTIME = 0.4; // minimum plausible seconds per perfect bounce
const VALID_MODES = ['arcade', 'time_attack', 'score_attack', 'endless', 'daily', 'master'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? supabaseAnonKey;

    // Client for auth check
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized user token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      runUuid,
      mode,
      score,
      distance,
      coins,
      maxCombo,
      runTime,
      perfects = 0,
      nearMisses = 0,
      topSpeed = 0,
      clientVersion,
    } = body;

    // --------------------------------------------------------------------------
    // Hard Rejects (§5) - Return 400 Bad Request, nothing written
    // --------------------------------------------------------------------------

    if (!mode || !VALID_MODES.includes(mode)) {
      return new Response(JSON.stringify({ error: `Invalid mode: ${mode}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. runTime <= 0, or greater than 2 hours (7200s)
    if (typeof runTime !== 'number' || runTime <= 0 || runTime > 7200 || isNaN(runTime)) {
      return new Response(JSON.stringify({ error: 'Invalid runTime duration' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. distance > MAX_SPEED * runTime
    if (typeof distance !== 'number' || distance < 0 || distance > (MAX_SPEED * runTime) + 5 || isNaN(distance)) {
      return new Response(JSON.stringify({ error: 'Physical impossibility: distance exceeded theoretical max speed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. topSpeed > MAX_SPEED * 1.05
    if (typeof topSpeed === 'number' && topSpeed > MAX_SPEED_CEILING + 0.1) {
      return new Response(JSON.stringify({ error: 'Physical impossibility: top speed exceeded maximum velocity cap' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. maxCombo > COMBO_COUNT_MAX (99)
    if (typeof maxCombo !== 'number' || maxCombo < 1 || maxCombo > COMBO_COUNT_MAX) {
      return new Response(JSON.stringify({ error: 'Combo count exceeds maximum ceiling (99)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Score ceiling check (§5 bound: 480 * coins + 900 * perfects + 40 * distance + 5000)
    // Slack calculation: COIN_SCORE 60 at COMBO_MAX_MULTIPLIER 8x = 480, plus trick slack
    const maxPlausibleScore = Math.ceil(480 * (coins || 0) + 900 * (perfects || 0) + 40 * distance + 5000);
    if (typeof score !== 'number' || score < 0 || (score > maxPlausibleScore && mode !== 'master')) {
      return new Response(JSON.stringify({ error: 'Score validation rejected: score exceeds physical ceiling' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service Role Client for database operations & rate checks
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 6. Rate limits: Max 1 run per 20s, max 200 runs per 24h
    const now = new Date();
    const twentySecAgo = new Date(now.getTime() - 20 * 1000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentRuns, error: rateError } = await adminClient
      .from('runs')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false });

    if (!rateError && recentRuns && recentRuns.length > 0) {
      if (recentRuns.length >= 200) {
        return new Response(JSON.stringify({ error: 'Daily run quota reached (200 runs/day)' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const lastRunTime = new Date(recentRuns[0].created_at).getTime();
      if (now.getTime() - lastRunTime < 20 * 1000) {
        return new Response(JSON.stringify({ error: 'Rate limit: minimum 20 seconds between run submissions' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // --------------------------------------------------------------------------
    // Soft Flags (§5) - Populated in flags[], excluded from public leaderboards
    // --------------------------------------------------------------------------
    const flags: string[] = [];

    // Coin density check: normal courses spawn ~1 coin every 8-15m
    if (coins > (distance / 4) + 25) {
      flags.push('SUSPICIOUS_COIN_DENSITY');
    }

    // Perfects per second check
    if (perfects > (runTime / MIN_AIRTIME) + 2) {
      flags.push('IMPLAUSIBLE_PERFECT_FREQUENCY');
    }

    // Account age anomaly
    const userCreatedAt = new Date(user.created_at).getTime();
    if (now.getTime() - userCreatedAt < 60 * 60 * 1000 && score > 60000) {
      flags.push('NEW_ACCOUNT_HIGH_SCORE');
    }

    // --------------------------------------------------------------------------
    // Atomic Run Record & Progression Update
    // --------------------------------------------------------------------------
    const { data: result, error: rpcError } = await adminClient.rpc('submit_run_record', {
      p_run_uuid: runUuid || null,
      p_user_id: user.id,
      p_mode: mode,
      p_score: Math.floor(score),
      p_distance: distance,
      p_coins: Math.floor(coins || 0),
      p_max_combo: Math.floor(maxCombo || 1),
      p_run_time: runTime,
      p_perfects: Math.floor(perfects || 0),
      p_near_misses: Math.floor(nearMisses || 0),
      p_top_speed: topSpeed || 0,
      p_flags: flags,
    });

    if (rpcError) {
      console.error('submit_run_record RPC failed:', rpcError);
      return new Response(JSON.stringify({ error: 'Database transaction error', details: rpcError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        progression: result.progression,
        newlyUnlocked: result.newlyUnlocked || [],
        flags,
        duplicate: result.duplicate || false,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('Edge Function Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
