import { createClient } from '@supabase/supabase-js';

// These come from your Vercel project's Environment Variables, or a local
// .env file when running on your own machine (see .env.example).
// Never hardcode real keys here — they end up in your git history.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surfaced clearly rather than failing silently with a confusing
  // network error later — this is the #1 setup mistake for a first deploy.
  console.error(
    'Missing Supabase environment variables. ' +
    'Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set ' +
    '(in Vercel project settings, or a local .env file).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
