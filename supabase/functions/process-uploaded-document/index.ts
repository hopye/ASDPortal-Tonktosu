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
        console.log('=== Document Upload Processing Started ===');
        
        // Parse the storage webhook payload
        const payload = await req.json();
        console.log('Webhook payload received:', JSON.stringify(payload, null, 2));

        // Extract file information from the webhook
        const { type, record, schema, table } = payload;
        
        if (type !== 'INSERT') {
            console.log('Ignoring non-INSERT event:', type);
            return new Response(JSON.stringify({ data: { skipped: true, reason: 'Non-insert event' } }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const filePath = record?.name;
        const bucketId = record?.bucket_id;
        
        console.log('Processing file:', { filePath, bucketId });

        if (!filePath) {
            throw new Error('File path not found in webhook payload');
        }

        // Check if this is a PDF file
        if (!filePath.toLowerCase().endsWith('.pdf')) {
            console.log('Skipping non-PDF file:', filePath);
            return new Response(JSON.stringify({ 
                data: { 
                    skipped: true, 
                    reason: 'Not a PDF file',
                    filePath: filePath
                } 
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Get environment variables
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        if (!openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        // Find the corresponding medical document record by checking file URLs
        const documentsResponse = await fetch(`${supabaseUrl}/rest/v1/medical_documents?select=id,title,file_name,file_url&file_url=like.*${filePath.split('/').pop()}*`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            }
        });

        if (!documentsResponse.ok) {
            throw new Error('Failed to query medical documents');
        }

        const documents = await documentsResponse.json();
        console.log('Found medical documents:', documents);

        if (documents.length === 0) {
            // If we can't find by URL, try to find by file name pattern
            const fileName = filePath.split('/').pop();
            const alternateResponse = await fetch(`${supabaseUrl}/rest/v1/medical_documents?select=id,title,file_name,file_url`, {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            });
            
            if (alternateResponse.ok) {
                const allDocuments = await alternateResponse.json();
                const matchingDoc = allDocuments.find((doc: any) => 
                    doc.file_url && doc.file_url.includes(fileName)
                );
                
                if (matchingDoc) {
                    documents.push(matchingDoc);
                }
            }
        }

        if (documents.length === 0) {
            throw new Error(`No medical document found for file: ${filePath}. Available documents may not be PDF files.`);
        }

        const document = documents[0];
        const documentId = document.id;

        console.log('Processing document:', { documentId, title: document.title });

        // Use the advanced document processor
        console.log('Calling advanced document processor...');
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

        console.log('=== Document Processing Completed Successfully ===');
        
        return new Response(JSON.stringify({
            data: {
                success: true,
                documentId: documentId,
                title: document.title,
                extractionMethod: processingResult.data.extractionMethod,
                contentQuality: processingResult.data.contentQuality,
                textExtracted: processingResult.data.contentLength,
                totalChunks: processingResult.data.totalChunks,
                embeddingsCreated: processingResult.data.embeddingsCreated
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== Document Processing Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        const errorResponse = {
            error: {
                code: 'DOCUMENT_PROCESSING_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

// Note: Using advanced document processor - no longer need primitive extraction methods
