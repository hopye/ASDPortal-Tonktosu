-- Migration: fix_communication_and_ai_rls_policies
-- Created at: 1755678000

-- Fix communication_boards RLS policy to include WITH CHECK clause for INSERT/UPDATE operations
DROP POLICY IF EXISTS "Caregivers can manage communication boards for their family mem" ON communication_boards;

CREATE POLICY "Caregivers can manage communication boards for their family members" ON communication_boards
FOR ALL 
TO public
USING (
    EXISTS (
        SELECT 1 FROM family_members fm 
        WHERE fm.id = communication_boards.family_member_id 
        AND fm.caregiver_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM family_members fm 
        WHERE fm.id = communication_boards.family_member_id 
        AND fm.caregiver_id = auth.uid()
    )
);

-- Fix communication_symbols RLS policy to include WITH CHECK clause for INSERT/UPDATE operations
DROP POLICY IF EXISTS "Caregivers can manage symbols through their boards" ON communication_symbols;

CREATE POLICY "Caregivers can manage symbols through their boards" ON communication_symbols
FOR ALL 
TO public
USING (
    EXISTS (
        SELECT 1 FROM communication_boards cb
        JOIN family_members fm ON fm.id = cb.family_member_id
        WHERE cb.id = communication_symbols.board_id 
        AND fm.caregiver_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM communication_boards cb
        JOIN family_members fm ON fm.id = cb.family_member_id
        WHERE cb.id = communication_symbols.board_id 
        AND fm.caregiver_id = auth.uid()
    )
);

-- Fix ai_chat_sessions RLS policy to include WITH CHECK clause for INSERT/UPDATE operations
DROP POLICY IF EXISTS "Users can manage their own chat sessions" ON ai_chat_sessions;

CREATE POLICY "Users can manage their own chat sessions" ON ai_chat_sessions
FOR ALL 
TO public
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix ai_chat_messages RLS policy to include WITH CHECK clause for INSERT/UPDATE operations
DROP POLICY IF EXISTS "Users can manage messages in their own sessions" ON ai_chat_messages;

CREATE POLICY "Users can manage messages in their own sessions" ON ai_chat_messages
FOR ALL 
TO public
USING (
    EXISTS (
        SELECT 1 FROM ai_chat_sessions s
        WHERE s.id = ai_chat_messages.session_id 
        AND s.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM ai_chat_sessions s
        WHERE s.id = ai_chat_messages.session_id 
        AND s.user_id = auth.uid()
    )
);