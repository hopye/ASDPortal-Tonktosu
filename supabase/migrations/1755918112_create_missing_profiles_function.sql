-- Migration: create_missing_profiles_function
-- Created at: 1755918112

-- Function to create profiles for any users missing them
CREATE OR REPLACE FUNCTION public.create_missing_profiles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  profiles_created INTEGER := 0;
  user_record RECORD;
BEGIN
  -- Find all auth users without profiles and create profiles for them
  FOR user_record IN 
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.profiles p ON au.id = p.user_id
    WHERE p.id IS NULL
  LOOP
    BEGIN
      INSERT INTO public.profiles (id, user_id, full_name, email, role, language_preference, timezone)
      VALUES (
        user_record.id,
        user_record.id,
        COALESCE(user_record.raw_user_meta_data->>'full_name', 'User'),
        user_record.email,
        'caregiver',
        'en',
        'America/New_York'
      );
      profiles_created := profiles_created + 1;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to create profile for user %: %', user_record.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN profiles_created;
END;
$$;;