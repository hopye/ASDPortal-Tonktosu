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
        console.log('=== Process Pending Documents Started ===');
        
        // Get environment variables
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        if (!serviceRoleKey || !supabaseUrl || !openaiApiKey) {
            throw new Error('Required configuration missing');
        }

        // Get pending documents using the database function
        const pendingResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/process_pending_embeddings`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        if (!pendingResponse.ok) {
            throw new Error('Failed to get pending documents');
        }

        const pendingDocs = await pendingResponse.json();
        console.log('Found', pendingDocs.length, 'pending documents');

        if (pendingDocs.length === 0) {
            return new Response(JSON.stringify({
                data: {
                    message: 'No pending documents to process',
                    processed: 0
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Process each pending document
        const results = [];
        const manualProcessUrl = `${supabaseUrl}/functions/v1/process-document-manually`;
        
        for (const doc of pendingDocs) {
            try {
                console.log('Processing pending document:', doc.title);
                
                // Mark as processing
                await fetch(`${supabaseUrl}/rest/v1/medical_documents?id=eq.${doc.document_id}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        embedding_status: 'processing'
                    })
                });
                
                // Process the document
                const processResponse = await fetch(manualProcessUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        documentId: doc.document_id
                    })
                });
                
                if (processResponse.ok) {
                    const result = await processResponse.json();
                    
                    // Mark as completed
                    await fetch(`${supabaseUrl}/rest/v1/medical_documents?id=eq.${doc.document_id}`, {
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
                    
                    results.push({
                        documentId: doc.document_id,
                        title: doc.title,
                        success: true,
                        embeddingsCreated: result.data?.embeddingsCreated || 0
                    });
                    console.log('Successfully processed:', doc.title);
                } else {
                    const errorData = await processResponse.text();
                    
                    // Mark as failed
                    await fetch(`${supabaseUrl}/rest/v1/medical_documents?id=eq.${doc.document_id}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            embedding_status: 'failed'
                        })
                    });
                    
                    results.push({
                        documentId: doc.document_id,
                        title: doc.title,
                        success: false,
                        error: errorData
                    });
                    console.error('Failed to process:', doc.title, errorData);
                }
            } catch (error) {
                // Mark as failed
                await fetch(`${supabaseUrl}/rest/v1/medical_documents?id=eq.${doc.document_id}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        embedding_status: 'failed'
                    })
                });
                
                results.push({
                    documentId: doc.document_id,
                    title: doc.title,
                    success: false,
                    error: error.message
                });
                console.error('Error processing:', doc.title, error.message);
            }
        }

        const successfulProcesses = results.filter(r => r.success).length;
        const failedProcesses = results.filter(r => !r.success).length;
        
        console.log('=== Pending Documents Processing Completed ===');
        console.log('Successful:', successfulProcesses, 'Failed:', failedProcesses);
        
        return new Response(JSON.stringify({
            data: {
                pendingDocuments: pendingDocs.length,
                successful: successfulProcesses,
                failed: failedProcesses,
                results: results
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== Pending Documents Processing Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        return new Response(JSON.stringify({
            error: {
                code: 'PENDING_PROCESSING_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
