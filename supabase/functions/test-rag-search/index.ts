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
        console.log('=== RAG Search Test Started ===');
        
        const { query, userId } = await req.json();
        
        if (!query) {
            throw new Error('Query is required');
        }

        console.log('Testing RAG search for query:', query);

        // Get environment variables
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        if (!serviceRoleKey || !supabaseUrl || !openaiApiKey) {
            throw new Error('Required configuration missing');
        }

        // Step 1: Create embedding for the query
        console.log('Creating embedding for query...');
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'text-embedding-ada-002',
                input: query
            })
        });

        if (!embeddingResponse.ok) {
            const errorData = await embeddingResponse.text();
            throw new Error(`OpenAI embedding error: ${errorData}`);
        }

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.data[0].embedding;
        console.log('Query embedding created successfully');

        // Step 2: Search for similar documents using pgvector
        console.log('Searching for similar documents...');
        const searchQuery = `
            SELECT 
                de.document_id,
                de.content,
                de.metadata,
                md.title,
                md.file_name,
                (de.embedding <=> $1::vector) as similarity_distance
            FROM document_embeddings de
            LEFT JOIN medical_documents md ON de.document_id = md.id
            WHERE ($2::uuid IS NULL OR md.caregiver_id = $2 OR md.family_member_id IN (
                SELECT id FROM family_members WHERE caregiver_id = $2
            ))
            ORDER BY de.embedding <=> $1::vector
            LIMIT 5
        `;

        const searchResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_search`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query_embedding: JSON.stringify(queryEmbedding),
                user_id: userId || null
            })
        });

        let searchResults = [];
        
        if (!searchResponse.ok) {
            // Fallback: Direct SQL approach if RPC doesn't exist
            console.log('RPC search failed, trying direct approach...');
            
            // Create a temporary function for this test
            const directSearchResponse = await fetch(`${supabaseUrl}/rest/v1/document_embeddings?select=document_id,content,metadata&limit=5`, {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            });
            
            if (directSearchResponse.ok) {
                const embeddings = await directSearchResponse.json();
                
                // Get document titles for each embedding
                for (const embedding of embeddings) {
                    const docResponse = await fetch(`${supabaseUrl}/rest/v1/medical_documents?select=title,file_name&id=eq.${embedding.document_id}`, {
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey
                        }
                    });
                    
                    if (docResponse.ok) {
                        const docs = await docResponse.json();
                        if (docs.length > 0) {
                            searchResults.push({
                                document_id: embedding.document_id,
                                content: embedding.content,
                                metadata: embedding.metadata,
                                title: docs[0].title,
                                file_name: docs[0].file_name,
                                similarity_distance: 'N/A (fallback search)'
                            });
                        }
                    }
                }
            }
        } else {
            searchResults = await searchResponse.json();
        }

        console.log('Found', searchResults.length, 'similar documents');

        // Step 3: Format results
        const contextChunks = searchResults.map((result, index) => {
            return `Document ${index + 1}: ${result.title || 'Unknown Document'}
Content: ${result.content}
`;
        }).join('\n');

        console.log('=== RAG Search Test Completed ===');
        
        return new Response(JSON.stringify({
            data: {
                query: query,
                resultsFound: searchResults.length,
                contextChunks: contextChunks,
                searchResults: searchResults.map(r => ({
                    documentId: r.document_id,
                    title: r.title,
                    content: r.content.substring(0, 200) + '...',
                    similarityDistance: r.similarity_distance
                })),
                success: true
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== RAG Search Test Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        return new Response(JSON.stringify({
            error: {
                code: 'RAG_SEARCH_TEST_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
