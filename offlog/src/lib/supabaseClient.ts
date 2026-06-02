import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 가 .env 에 설정되어야 합니다.',
  )
}

// 세션은 localStorage에 자동 저장·갱신된다 (persistSession 기본값)
export const supabase = createClient(supabaseUrl, supabaseKey)
