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
        console.log('=== Document Embeddings Creation Function Started ===');
        
        const { content, documentId, metadata: additionalMetadata } = await req.json();
        console.log('Request:', { contentLength: content?.length, documentId, additionalMetadata });

        if (!content || !documentId) {
            throw new Error('Content and documentId are required');
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

        // Split content into chunks (for large documents)
        const maxChunkSize = 1000; // characters
        const chunks = [];
        
        for (let i = 0; i < content.length; i += maxChunkSize) {
            chunks.push(content.substring(i, i + maxChunkSize));
        }

        console.log('Created', chunks.length, 'chunks from content');

        // Create embeddings for each chunk
        let embeddingsCreated = 0;
        
        for (const chunk of chunks) {
            try {
                // Create embedding for this chunk
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
                    console.error('OpenAI embedding error:', errorData);
                    continue; // Skip this chunk but continue with others
                }

                const embeddingData = await embeddingResponse.json();
                const embedding = embeddingData.data[0].embedding;

                // Save embedding to database
                const saveResponse = await fetch(`${supabaseUrl}/rest/v1/document_embeddings`, {
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
                            chunk_index: embeddingsCreated,
                            total_chunks: chunks.length,
                            ...(additionalMetadata || {})
                        }
                    })
                });

                if (saveResponse.ok) {
                    embeddingsCreated++;
                    console.log('Created embedding', embeddingsCreated, 'of', chunks.length);
                } else {
                    const saveError = await saveResponse.text();
                    console.error('Failed to save embedding:', saveError);
                }

            } catch (chunkError) {
                console.error('Error processing chunk:', chunkError);
            }
        }

        console.log('=== Document Embeddings Creation Completed ===');
        console.log('Created', embeddingsCreated, 'embeddings out of', chunks.length, 'chunks');
        
        return new Response(JSON.stringify({
            data: {
                embeddingsCreated: embeddingsCreated,
                totalChunks: chunks.length,
                documentId: documentId
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== Document Embeddings Creation Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        const errorResponse = {
            error: {
                code: 'EMBEDDINGS_CREATION_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});