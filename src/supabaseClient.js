import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const ADMIN_EMAIL = 'moralcruzrodrigo@gmail.com'

export const DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1ltXrmWHGBAGs1vAVUf24-_b9IUzhBKza?authuser=trampadeldragon%40gmail.com'

