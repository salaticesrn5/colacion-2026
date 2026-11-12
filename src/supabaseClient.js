import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ehivlopiqhefelquzitt.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_btftmQNZ9B9tskiiip7j6A_6pRSd9B9';

export const supabase = createClient(supabaseUrl, supabaseKey);
