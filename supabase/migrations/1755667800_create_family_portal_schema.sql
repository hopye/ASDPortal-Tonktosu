-- Migration: create_family_portal_schema
-- Created at: 1755667800

-- Create profiles table (extends auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create family_members table
CREATE TABLE family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caregiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date_of_birth DATE,
    relationship TEXT, -- 'child', 'spouse', 'parent', 'sibling', 'other'
    conditions TEXT[], -- Array of conditions: 'ASD', 'ADHD', 'ADD', etc.
    notes TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create guides table
CREATE TABLE guides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    content TEXT, -- Rich text content
    category TEXT NOT NULL, -- 'communication', 'behavior', 'education', 'medical', 'daily_living'
    age_ranges TEXT[], -- Array like ['2-5', '6-12', '13-18', '18+']
    conditions TEXT[], -- Array of applicable conditions
    activity_type TEXT, -- 'interactive', 'reading', 'exercise', 'art', 'music'
    difficulty_level TEXT DEFAULT 'beginner', -- 'beginner', 'intermediate', 'advanced'
    estimated_time INTEGER, -- In minutes
    tags TEXT[],
    image_url TEXT,
    is_featured BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create medical_documents table
CREATE TABLE medical_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'pdf', 'jpg', 'png', etc.
    file_size INTEGER,
    document_type TEXT, -- 'diagnosis', 'treatment_plan', 'medication', 'therapy_notes', 'assessment', 'other'
    date_of_document DATE,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create communication_boards table
CREATE TABLE communication_boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create communication_symbols table
CREATE TABLE communication_symbols (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES communication_boards(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    image_url TEXT,
    category TEXT, -- 'emotions', 'actions', 'objects', 'people', 'places', 'needs'
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    color TEXT DEFAULT '#3B82F6',
    size TEXT DEFAULT 'medium', -- 'small', 'medium', 'large'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create routines table
CREATE TABLE routines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    routine_type TEXT, -- 'morning', 'bedtime', 'school', 'therapy', 'custom'
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create routine_steps table
CREATE TABLE routine_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    estimated_duration INTEGER, -- In minutes
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create journal_entries table
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    mood_rating INTEGER CHECK (mood_rating >= 1 AND mood_rating <= 10),
    behavior_notes TEXT,
    achievements TEXT,
    challenges TEXT,
    medication_taken BOOLEAN,
    therapy_session BOOLEAN,
    sleep_hours DECIMAL(3,1),
    activities TEXT[],
    notes TEXT,
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ai_chat_sessions table
CREATE TABLE ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ai_chat_messages table
CREATE TABLE ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create document_embeddings table for RAG functionality
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES medical_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI embedding dimension
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create activities table
CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    activity_type TEXT, -- 'therapy', 'appointment', 'school', 'social', 'medical', 'other'
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    location TEXT,
    notes TEXT,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_pattern JSONB, -- For recurring events
    reminder_minutes INTEGER[], -- Array of minutes before event to remind
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX idx_family_members_caregiver_id ON family_members(caregiver_id);
CREATE INDEX idx_medical_documents_family_member_id ON medical_documents(family_member_id);
CREATE INDEX idx_communication_boards_family_member_id ON communication_boards(family_member_id);
CREATE INDEX idx_communication_symbols_board_id ON communication_symbols(board_id);
CREATE INDEX idx_routines_family_member_id ON routines(family_member_id);
CREATE INDEX idx_routine_steps_routine_id ON routine_steps(routine_id);
CREATE INDEX idx_journal_entries_family_member_id ON journal_entries(family_member_id);
CREATE INDEX idx_journal_entries_date ON journal_entries(date);
CREATE INDEX idx_ai_chat_messages_session_id ON ai_chat_messages(session_id);
CREATE INDEX idx_document_embeddings_document_id ON document_embeddings(document_id);
CREATE INDEX idx_activities_family_member_id ON activities(family_member_id);
CREATE INDEX idx_activities_start_time ON activities(start_time);
CREATE INDEX idx_guides_category ON guides(category);
CREATE INDEX idx_guides_conditions ON guides USING GIN(conditions);

-- Add vector similarity search index
CREATE INDEX ON document_embeddings USING hnsw (embedding vector_cosine_ops);;