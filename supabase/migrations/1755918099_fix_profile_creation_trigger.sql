-- Migration: fix_profile_creation_trigger
-- Created at: 1755918099

-- Improved handle_new_user function with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if profile already exists to avoid conflicts
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id) THEN
    INSERT INTO public.profiles (id, user_id, full_name, email, role, language_preference, timezone)
    VALUES (
      NEW.id,  -- Use auth user's ID as profile's primary key
      NEW.id,  -- Also store as user_id for consistency
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'), 
      NEW.email,
      'caregiver',
      'en',
      'America/New_York'
    );
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;;