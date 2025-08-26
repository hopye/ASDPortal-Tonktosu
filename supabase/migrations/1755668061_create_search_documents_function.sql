-- Migration: create_search_documents_function
-- Created at: 1755668061

-- Create function for searching documents using vector similarity
CREATE OR REPLACE FUNCTION search_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.document_id,
    de.content,
    (de.embedding <=> query_embedding) * -1 + 1 AS similarity
  FROM document_embeddings de
  JOIN medical_documents md ON md.id = de.document_id
  JOIN family_members fm ON fm.id = md.family_member_id
  WHERE 
    (user_id IS NULL OR fm.caregiver_id = user_id)
    AND (de.embedding <=> query_embedding) * -1 + 1 > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;;