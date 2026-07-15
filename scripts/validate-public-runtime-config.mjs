import { pathToFileURL } from 'node:url';
import {
  validatePublicRuntimeConfig,
  XERT_SUPABASE_HOST,
  XERT_VERCEL_HOST,
} from '../src/lib/publicRuntimeConfig.js';

function runFromEnvironment(environment = process.env) {
  const result = validatePublicRuntimeConfig({
    supabaseUrl: environment.SUPABASE_URL,
    supabaseAnonKey: environment.SUPABASE_ANON_KEY,
    vercelBaseUrl: environment.VERCEL_BASE_URL,
    expectedSupabaseHost: environment.EXPECTED_SUPABASE_HOST || XERT_SUPABASE_HOST,
    expectedVercelHost: environment.EXPECTED_VERCEL_HOST || XERT_VERCEL_HOST,
  });
  console.log(
    `XERT public runtime configuration verified: canonical service origins and ${result.keyFormat} Supabase key.`
  );
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    runFromEnvironment();
  } catch (error) {
    console.error(`::error:: ${error.message}`);
    process.exitCode = 1;
  }
}
