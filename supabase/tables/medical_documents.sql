CREATE TABLE medical_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_member_id UUID NOT NULL,
    caregiver_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    document_type VARCHAR(100),
    date_of_document DATE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tags TEXT[],
    is_sensitive BOOLEAN DEFAULT false
);