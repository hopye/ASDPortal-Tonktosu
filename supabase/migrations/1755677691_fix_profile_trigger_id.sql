-- Migration: fix_profile_trigger_id
-- Created at: 1755677691

-- Update the function to handle new user profile creation with correct ID mapping
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, full_name, email, role, language_preference, timezone)
  VALUES (
    new.id,  -- Use auth user's ID as profile's primary key
    new.id,  -- Also store as user_id for consistency
    COALESCE(new.raw_user_meta_data->>'full_name', 'User'), 
    new.email,
    'caregiver',
    'en',
    'America/New_York'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;;