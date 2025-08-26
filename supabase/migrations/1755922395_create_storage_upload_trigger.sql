-- Migration: create_storage_upload_trigger
-- Created at: 1755922395

-- Create a function that will be called when a new file is uploaded to storage
CREATE OR REPLACE FUNCTION public.handle_storage_upload()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process files in the medical-documents bucket
  IF NEW.bucket_id = 'medical-documents' THEN
    -- Call the edge function to process the document
    -- We'll use pg_net (if available) or create a simple function to make HTTP requests
    PERFORM
      net.http_post(
        url := 'https://hafuomkacwtbxueumayr.supabase.co/functions/v1/process-uploaded-document',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := jsonb_build_object(
          'type', 'INSERT',
          'schema', 'storage',
          'table', 'objects',
          'record', jsonb_build_object(
            'name', NEW.name,
            'bucket_id', NEW.bucket_id,
            'id', NEW.id,
            'updated_at', NEW.updated_at,
            'created_at', NEW.created_at
          )
        )
      );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on storage.objects table
DROP TRIGGER IF EXISTS trigger_storage_upload ON storage.objects;
CREATE TRIGGER trigger_storage_upload
  AFTER INSERT ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_storage_upload();;