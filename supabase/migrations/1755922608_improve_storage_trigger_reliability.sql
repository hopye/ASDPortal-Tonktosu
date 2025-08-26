-- Migration: improve_storage_trigger_reliability
-- Created at: 1755922608

-- Drop the existing trigger that might be unreliable
DROP TRIGGER IF EXISTS trigger_storage_upload ON storage.objects;

-- Create a more reliable approach: add a status column to medical_documents 
-- and create a simple notification mechanism
ALTER TABLE medical_documents 
ADD COLUMN IF NOT EXISTS embedding_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS embedding_processed_at TIMESTAMPTZ;

-- Update existing documents that have embeddings
UPDATE medical_documents 
SET 
    embedding_status = 'completed',
    embedding_processed_at = NOW()
WHERE id IN (
    SELECT DISTINCT document_id 
    FROM document_embeddings
);

-- Create an index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_medical_documents_embedding_status 
ON medical_documents(embedding_status);

-- Create a function that can be called to check and process pending documents
CREATE OR REPLACE FUNCTION public.process_pending_embeddings()
RETURNS TABLE(
    document_id UUID,
    title TEXT,
    status TEXT,
    message TEXT
) 
SECURITY DEFINER
AS $$
DECLARE
    doc_record RECORD;
    result_record RECORD;
BEGIN
    -- Find documents that don't have embeddings yet
    FOR doc_record IN 
        SELECT md.id, md.title, md.file_url, md.file_type
        FROM medical_documents md
        WHERE md.embedding_status = 'pending'
        AND md.file_url IS NOT NULL
    LOOP
        -- Return the document info for external processing
        document_id := doc_record.id;
        title := doc_record.title;
        status := 'needs_processing';
        message := 'Document ready for embedding generation';
        
        RETURN NEXT;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;;