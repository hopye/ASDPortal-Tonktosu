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
        const { documentId, content } = await req.json();

        if (!documentId || !content) {
            throw new Error('Document ID and content are required');
        }

        // Get environment variables
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Split content into chunks (max 8000 characters per chunk)
        const chunks = [];
        const chunkSize = 8000;
        for (let i = 0; i < content.length; i += chunkSize) {
            chunks.push(content.substring(i, i + chunkSize));
        }

        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            // Create embedding
            const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'text-embedding-ada-002',
                    input: chunk
                })
            });

            if (!embeddingResponse.ok) {
                const errorData = await embeddingResponse.text();
                throw new Error(`OpenAI embedding error: ${errorData}`);
            }

            const embeddingData = await embeddingResponse.json();
            const embedding = embeddingData.data[0].embedding;

            // Store embedding in database
            const insertResponse = await fetch(`${supabaseUrl}/rest/v1/document_embeddings`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    document_id: documentId,
                    content: chunk,
                    embedding: embedding,
                    metadata: {
                        chunk_index: i,
                        total_chunks: chunks.length
                    }
                })
            });

            if (!insertResponse.ok) {
                const errorText = await insertResponse.text();
                throw new Error(`Database insert failed: ${errorText}`);
            }
        }

        return new Response(JSON.stringify({
            data: {
                message: `Successfully created embeddings for ${chunks.length} chunks`,
                chunks: chunks.length
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Document embedding error:', error);

        const errorResponse = {
            error: {
                code: 'DOCUMENT_EMBEDDING_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});