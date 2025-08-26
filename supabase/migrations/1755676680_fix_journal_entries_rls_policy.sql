-- Migration: fix_journal_entries_rls_policy
-- Created at: 1755676680

-- Fix journal_entries RLS policy to include with_check clause for INSERT/UPDATE operations
DROP POLICY IF EXISTS "Caregivers can manage journal entries for their family members" ON journal_entries;

CREATE POLICY "Caregivers can manage journal entries for their family members" ON journal_entries
FOR ALL 
TO public
USING (
    EXISTS (
        SELECT 1 FROM family_members fm 
        WHERE fm.id = journal_entries.family_member_id 
        AND fm.caregiver_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM family_members fm 
        WHERE fm.id = journal_entries.family_member_id 
        AND fm.caregiver_id = auth.uid()
    )
);;