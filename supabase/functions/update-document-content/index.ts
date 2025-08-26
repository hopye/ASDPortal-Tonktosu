Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        console.log('=== Direct Content Update Started ===');
        
        const { documentId, extractedContent } = await req.json();
        
        if (!documentId || !extractedContent) {
            throw new Error('documentId and extractedContent are required');
        }

        console.log('Updating document content directly:', { documentId, contentLength: extractedContent.length });

        // Get environment variables
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        if (!serviceRoleKey || !supabaseUrl || !openaiApiKey) {
            throw new Error('Required configuration missing');
        }

        // Get the medical document record
        const docResponse = await fetch(`${supabaseUrl}/rest/v1/medical_documents?select=id,title,file_name,file_url,file_type&id=eq.${documentId}`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        if (!docResponse.ok) {
            throw new Error('Failed to fetch medical document');
        }

        const documents = await docResponse.json();
        if (documents.length === 0) {
            throw new Error('Medical document not found');
        }

        const document = documents[0];
        console.log('Document details:', document.title);

        // Delete existing embeddings
        const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/document_embeddings?document_id=eq.${documentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });
        
        if (deleteResponse.ok) {
            console.log('Deleted existing embeddings for reprocessing');
        }

        // Create embeddings with enhanced metadata
        const result = await createEmbeddingsForDocument(
            documentId, 
            extractedContent, 
            supabaseUrl, 
            serviceRoleKey, 
            openaiApiKey,
            {
                extraction_method: 'vision_api_external',
                content_quality: 'high',
                file_type: document.file_type,
                processing_timestamp: new Date().toISOString(),
                manual_extraction: true
            }
        );

        // Update document status
        await fetch(`${supabaseUrl}/rest/v1/medical_documents?id=eq.${documentId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                embedding_status: 'completed',
                embedding_processed_at: new Date().toISOString()
            })
        });

        console.log('=== Direct Content Update Completed ===');
        
        return new Response(JSON.stringify({
            data: {
                success: true,
                documentId: documentId,
                title: document.title,
                extractionMethod: 'vision_api_external',
                contentQuality: 'high',
                contentLength: extractedContent.length,
                contentPreview: extractedContent.substring(0, 300) + (extractedContent.length > 300 ? '...' : ''),
                embeddingsCreated: result.data.embeddingsCreated,
                totalChunks: result.data.totalChunks
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== Direct Content Update Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        return new Response(JSON.stringify({
            error: {
                code: 'DIRECT_UPDATE_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

// Helper function to call the embeddings creation function
async function createEmbeddingsForDocument(
    documentId: string, 
    content: string, 
    supabaseUrl: string, 
    serviceRoleKey: string, 
    openaiApiKey: string,
    additionalMetadata: any = {}
) {
    const embeddingsUrl = `${supabaseUrl}/functions/v1/create-document-embeddings`;
    
    const embeddingsResponse = await fetch(embeddingsUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            content: content,
            documentId: documentId,
            metadata: additionalMetadata
        })
    });
    
    if (!embeddingsResponse.ok) {
        const errorText = await embeddingsResponse.text();
        console.error('Failed to create embeddings:', errorText);
        throw new Error(`Embeddings creation failed: ${errorText}`);
    }
    
    const embeddingsResult = await embeddingsResponse.json();
    console.log('Enhanced embeddings created successfully:', embeddingsResult);
    
    return embeddingsResult;
}
