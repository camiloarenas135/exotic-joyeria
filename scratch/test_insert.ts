import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function testInsert() {
  const testProduct = {
    name: 'Product Test ' + Date.now(),
    price: '$100.000',
    images: [],
    category: 'Anillos',
    stock: 5,
    description: 'Test product insertion',
    variants: []
  };

  console.log('Inserting test product...');
  const { data: insertData, error: insertError } = await supabase
    .from('products')
    .insert([testProduct])
    .select();

  if (insertError) {
    console.error('Insert Error:', insertError);
  } else {
    console.log('Insert successful:', insertData);
    const id = insertData[0].id;
    console.log('Deleting test product with ID:', id);
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    if (deleteError) {
      console.error('Delete Error:', deleteError);
    } else {
      console.log('Delete successful');
    }
  }
}

testInsert();
