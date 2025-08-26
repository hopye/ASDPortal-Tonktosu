-- Migration: setup_corrected_rls_policies
-- Created at: 1755667885

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_symbols ENABLE ROW LEVEL SECURITY;
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Family members policies
CREATE POLICY "Caregivers can manage their family members" ON family_members
    FOR ALL USING (auth.uid() = caregiver_id);

-- Guides policies (public read for all published guides)
CREATE POLICY "Anyone can view published guides" ON guides
    FOR SELECT USING (is_published = true);

-- Medical documents policies
CREATE POLICY "Caregivers can manage documents for their family members" ON medical_documents
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM family_members fm 
            WHERE fm.id = medical_documents.family_member_id 
            AND fm.caregiver_id = auth.uid()
        )
    );

-- Communication boards policies
CREATE POLICY "Caregivers can manage communication boards for their family members" ON communication_boards
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM family_members fm 
            WHERE fm.id = communication_boards.family_member_id 
            AND fm.caregiver_id = auth.uid()
        )
    );

-- Communication symbols policies
CREATE POLICY "Caregivers can manage symbols through their boards" ON communication_symbols
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM communication_boards cb
            JOIN family_members fm ON fm.id = cb.family_member_id
            WHERE cb.id = communication_symbols.board_id 
            AND fm.caregiver_id = auth.uid()
        )
    );

-- Routines policies
CREATE POLICY "Caregivers can manage routines for their family members" ON routines
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM family_members fm 
            WHERE fm.id = routines.family_member_id 
            AND fm.caregiver_id = auth.uid()
        )
    );

-- Routine steps policies
CREATE POLICY "Caregivers can manage routine steps through their routines" ON routine_steps
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM routines r
            JOIN family_members fm ON fm.id = r.family_member_id
            WHERE r.id = routine_steps.routine_id 
            AND fm.caregiver_id = auth.uid()
        )
    );

-- Journal entries policies
CREATE POLICY "Caregivers can manage journal entries for their family members" ON journal_entries
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM family_members fm 
            WHERE fm.id = journal_entries.family_member_id 
            AND fm.caregiver_id = auth.uid()
        )
    );

-- AI chat sessions policies
CREATE POLICY "Users can manage their own chat sessions" ON ai_chat_sessions
    FOR ALL USING (auth.uid() = user_id);

-- AI chat messages policies
CREATE POLICY "Users can manage messages in their own sessions" ON ai_chat_messages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM ai_chat_sessions s 
            WHERE s.id = ai_chat_messages.session_id 
            AND s.user_id = auth.uid()
        )
    );

-- Document embeddings policies
CREATE POLICY "Caregivers can access embeddings for their documents" ON document_embeddings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM medical_documents md
            JOIN family_members fm ON fm.id = md.family_member_id
            WHERE md.id = document_embeddings.document_id 
            AND fm.caregiver_id = auth.uid()
        )
    );

-- Activities policies
CREATE POLICY "Caregivers can manage activities for their family members" ON activities
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM family_members fm 
            WHERE fm.id = activities.family_member_id 
            AND fm.caregiver_id = auth.uid()
        )
    );;