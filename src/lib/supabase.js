import { createClient } from '@supabase/supabase-js';
import {
  PUBLIC_SERVICE_UNAVAILABLE_MESSAGE,
  resolvePublicSupabaseConfig,
} from '@/lib/publicRuntimeConfig';

const publicConfiguration = resolvePublicSupabaseConfig({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

if (!publicConfiguration.ready) {
  console.error('XERT public service configuration failed validation.');
}

export const supabase = createClient(
  publicConfiguration.supabaseUrl,
  publicConfiguration.supabaseAnonKey
);

export const supabaseConfigurationReady = publicConfiguration.ready;

export function requireSupabaseConfiguration() {
  if (!supabaseConfigurationReady) {
    throw new Error(PUBLIC_SERVICE_UNAVAILABLE_MESSAGE);
  }
}
