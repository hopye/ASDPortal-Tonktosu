-- Migration: create_indexes
-- Created at: 1755667840

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_family_members_caregiver_id ON family_members(caregiver_id);
CREATE INDEX IF NOT EXISTS idx_medical_documents_family_member_id ON medical_documents(family_member_id);
CREATE INDEX IF NOT EXISTS idx_communication_boards_family_member_id ON communication_boards(family_member_id);
CREATE INDEX IF NOT EXISTS idx_communication_symbols_board_id ON communication_symbols(board_id);
CREATE INDEX IF NOT EXISTS idx_routines_family_member_id ON routines(family_member_id);
CREATE INDEX IF NOT EXISTS idx_routine_steps_routine_id ON routine_steps(routine_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_family_member_id ON journal_entries(family_member_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_id ON ai_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id ON document_embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_activities_family_member_id ON activities(family_member_id);
CREATE INDEX IF NOT EXISTS idx_activities_start_time ON activities(start_time);
CREATE INDEX IF NOT EXISTS idx_guides_category ON guides(category);
CREATE INDEX IF NOT EXISTS idx_guides_conditions ON guides USING GIN(conditions);

-- Add vector similarity search index
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector ON document_embeddings USING hnsw (embedding vector_cosine_ops);;