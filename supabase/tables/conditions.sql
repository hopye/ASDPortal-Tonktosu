CREATE TABLE conditions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100),
    description TEXT,
    resources TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);