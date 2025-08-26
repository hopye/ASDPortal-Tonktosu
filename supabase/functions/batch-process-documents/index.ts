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
        console.log('=== Batch Document Processing Started ===');
        
        // Get environment variables
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        if (!serviceRoleKey || !supabaseUrl || !openaiApiKey) {
            throw new Error('Required configuration missing');
        }

        // Get all medical documents
        const docsResponse = await fetch(`${supabaseUrl}/rest/v1/medical_documents?select=id,title,file_name,file_url,file_type`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        if (!docsResponse.ok) {
            throw new Error('Failed to fetch medical documents');
        }

        const allDocuments = await docsResponse.json();
        console.log('Found', allDocuments.length, 'medical documents');

        // Get existing embeddings to see which documents already have them
        const embeddingsResponse = await fetch(`${supabaseUrl}/rest/v1/document_embeddings?select=document_id`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        const existingEmbeddings = embeddingsResponse.ok ? await embeddingsResponse.json() : [];
        const documentsWithEmbeddings = new Set(existingEmbeddings.map((e: any) => e.document_id));
        
        console.log('Documents with existing embeddings:', documentsWithEmbeddings.size);

        // Find documents that don't have embeddings
        const documentsToProcess = allDocuments.filter((doc: any) => 
            !documentsWithEmbeddings.has(doc.id)
        );

        console.log('Documents to process:', documentsToProcess.length);

        if (documentsToProcess.length === 0) {
            return new Response(JSON.stringify({
                data: {
                    message: 'All documents already have embeddings',
                    totalDocuments: allDocuments.length,
                    documentsWithEmbeddings: documentsWithEmbeddings.size
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Process each document
        const results = [];
        const manualProcessUrl = `${supabaseUrl}/functions/v1/process-document-manually`;
        
        for (const doc of documentsToProcess) {
            try {
                console.log('Processing document:', doc.title);
                
                const processResponse = await fetch(manualProcessUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        documentId: doc.id
                    })
                });
                
                if (processResponse.ok) {
                    const result = await processResponse.json();
                    results.push({
                        documentId: doc.id,
                        title: doc.title,
                        success: true,
                        embeddingsCreated: result.data?.embeddingsCreated || 0
                    });
                    console.log('Successfully processed:', doc.title);
                } else {
                    const errorData = await processResponse.text();
                    results.push({
                        documentId: doc.id,
                        title: doc.title,
                        success: false,
                        error: errorData
                    });
                    console.error('Failed to process:', doc.title, errorData);
                }
            } catch (error) {
                results.push({
                    documentId: doc.id,
                    title: doc.title,
                    success: false,
                    error: error.message
                });
                console.error('Error processing:', doc.title, error.message);
            }
        }

        const successfulProcesses = results.filter(r => r.success).length;
        const failedProcesses = results.filter(r => !r.success).length;
        
        console.log('=== Batch Processing Completed ===');
        console.log('Successful:', successfulProcesses, 'Failed:', failedProcesses);
        
        return new Response(JSON.stringify({
            data: {
                totalDocuments: allDocuments.length,
                documentsToProcess: documentsToProcess.length,
                successful: successfulProcesses,
                failed: failedProcesses,
                results: results
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== Batch Processing Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        return new Response(JSON.stringify({
            error: {
                code: 'BATCH_PROCESSING_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
