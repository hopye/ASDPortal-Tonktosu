-- Migration: create_profile_trigger_fixed
-- Created at: 1755677609

-- Create a function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, full_name, email, role, language_preference, timezone)
  VALUES (
    gen_random_uuid(), 
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'User'), 
    new.email,
    'caregiver',
    'en',
    'America/New_York'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to call the function on new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Manually create profile for existing test user
INSERT INTO public.profiles (id, user_id, full_name, email, role, language_preference, timezone)
VALUES (
  gen_random_uuid(),
  '7d7b364f-a3f1-43c8-98cd-bb85fd3ee440', 
  'Test User',
  'zmrptxap@minimax.com',
  'caregiver',
  'en',
  'America/New_York'
)
ON CONFLICT (user_id) DO NOTHING;;