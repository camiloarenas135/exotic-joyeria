import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function checkColumns() {
  const { data, error } = await supabase.from('products').select('*').limit(1);
  if (error) {
    console.error('Error fetching product:', error);
  } else if (data && data.length > 0) {
    console.log('Product columns/keys:', Object.keys(data[0]));
    console.log('Sample product:', data[0]);
  } else {
    console.log('No products found to inspect.');
  }
}

checkColumns();
