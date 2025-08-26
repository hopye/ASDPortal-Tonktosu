-- Migration: create_remaining_tables
-- Created at: 1755667828

-- Create communication_boards table
CREATE TABLE IF NOT EXISTS communication_boards (
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
CREATE TABLE IF NOT EXISTS communication_symbols (
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
CREATE TABLE IF NOT EXISTS routines (
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
CREATE TABLE IF NOT EXISTS routine_steps (
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
CREATE TABLE IF NOT EXISTS journal_entries (
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
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ai_chat_messages table
CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create document_embeddings table for RAG functionality
CREATE TABLE IF NOT EXISTS document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES medical_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI embedding dimension
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create activities table
CREATE TABLE IF NOT EXISTS activities (
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
);;