-- Migration: create_profile_trigger
-- Created at: 1755677594

-- Create a function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to call the function on new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Manually create profile for existing test user
INSERT INTO public.profiles (id, email, full_name)
VALUES ('7d7b364f-a3f1-43c8-98cd-bb85fd3ee440', 'zmrptxap@minimax.com', 'Test User')
ON CONFLICT (id) DO NOTHING;;