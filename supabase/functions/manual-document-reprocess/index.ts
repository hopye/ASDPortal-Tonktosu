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
        console.log('=== Manual Document Reprocessing Started ===');
        
        const { documentId } = await req.json();
        
        if (!documentId) {
            throw new Error('documentId is required');
        }

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        console.log('Processing document ID:', documentId);

        // Reset document status
        await fetch(`${supabaseUrl}/rest/v1/medical_documents?id=eq.${documentId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                embedding_status: 'pending',
                embedding_processed_at: null
            })
        });

        // Delete existing embeddings
        await fetch(`${supabaseUrl}/rest/v1/document_embeddings?document_id=eq.${documentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        // Call advanced processor
        const advancedProcessorUrl = `${supabaseUrl}/functions/v1/advanced-document-processor`;
        
        const advancedResponse = await fetch(advancedProcessorUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                documentId: documentId,
                forceReprocess: true
            })
        });
        
        if (!advancedResponse.ok) {
            const errorText = await advancedResponse.text();
            console.error('Advanced processor failed:', errorText);
            throw new Error(`Advanced document processing failed: ${errorText}`);
        }
        
        const processingResult = await advancedResponse.json();
        console.log('Advanced processing result:', processingResult);

        console.log('=== Manual Document Reprocessing Completed ===');
        
        return new Response(JSON.stringify({
            data: {
                success: true,
                documentId: documentId,
                processingResult: processingResult
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== Manual Document Reprocessing Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        return new Response(JSON.stringify({
            error: {
                code: 'MANUAL_REPROCESSING_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
