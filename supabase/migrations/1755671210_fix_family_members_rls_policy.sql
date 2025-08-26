-- Migration: fix_family_members_rls_policy
-- Created at: 1755671210

-- Fix family_members RLS policy to include with_check clause for INSERT/UPDATE operations
DROP POLICY IF EXISTS "Caregivers can manage their family members" ON family_members;

CREATE POLICY "Caregivers can manage their family members" ON family_members
FOR ALL 
TO public
USING (auth.uid() = caregiver_id)
WITH CHECK (auth.uid() = caregiver_id);;