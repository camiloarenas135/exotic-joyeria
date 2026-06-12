import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function checkDBCategories() {
  const { data, error } = await supabase.from('products').select('category');
  if (error) {
    console.error('Error fetching categories:', error);
    return;
  }
  
  const uniqueCategories = Array.from(new Set(data.map(p => p.category)));
  console.log('Unique categories in database:', uniqueCategories);
}

checkDBCategories();
