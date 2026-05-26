import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function listTables() {
  // Supabase JS doesn't have a direct listTables, but we can try to query common tables
  // or use the RPC if one is defined.
  // Alternatively, let's just check if there's any data in 'products' without a limit
  // and see if there are other suspected tables.
  
  const tables = ['products', 'vip_members', 'orders', 'categories'];
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`Table ${table} check failed: ${error.message}`);
    } else {
      console.log(`Table ${table} exists and has ${count} rows.`);
    }
  }
}

listTables();
