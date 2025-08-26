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
        console.log('=== AI Assistant Debug Function Started ===');
        
        const requestBody = await req.json();
        const { message, sessionId, useRAG = false } = requestBody;
        console.log('Request body:', JSON.stringify(requestBody));

        if (!message) {
            throw new Error('Message is required');
        }

        // Get environment variables
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        console.log('Environment check:', {
            hasOpenAI: !!openaiApiKey,
            hasServiceRole: !!serviceRoleKey,
            hasSupabaseUrl: !!supabaseUrl,
            openaiKeyLength: openaiApiKey ? openaiApiKey.length : 0
        });

        if (!openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Get user from auth header
        const authHeader = req.headers.get('authorization');
        console.log('Auth header present:', !!authHeader);
        
        if (!authHeader) {
            throw new Error('Authorization header is required. Please log in to use this feature.');
        }

        const token = authHeader.replace('Bearer ', '');
        console.log('Token length:', token.length);

        // Verify token and get user using Supabase Auth API
        console.log('Attempting user authentication...');
        const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': serviceRoleKey
            }
        });

        console.log('User auth response status:', userResponse.status);

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('User auth failed:', errorText);
            throw new Error(`Authentication failed: ${errorText}. Please log in again.`);
        }

        const userData = await userResponse.json();
        const userId = userData.id;
        console.log('User ID obtained:', userId);

        if (!userId) {
            throw new Error('No user ID found in authentication response');
        }

        let currentSessionId = sessionId;
        console.log('Session ID provided:', currentSessionId);

        // Create or get chat session
        if (!currentSessionId) {
            console.log('Creating new chat session...');
            const sessionResponse = await fetch(`${supabaseUrl}/rest/v1/ai_chat_sessions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    user_id: userId,
                    title: message.substring(0, 50) + (message.length > 50 ? '...' : '')
                })
            });

            console.log('Session creation response status:', sessionResponse.status);

            if (!sessionResponse.ok) {
                const errorText = await sessionResponse.text();
                console.error('Session creation failed:', errorText);
                throw new Error(`Failed to create chat session: ${errorText}`);
            }

            const sessionData = await sessionResponse.json();
            currentSessionId = sessionData[0].id;
            console.log('New session created:', currentSessionId);
        }

        // Save user message
        console.log('Saving user message...');
        const userMessageResponse = await fetch(`${supabaseUrl}/rest/v1/ai_chat_messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                role: 'user',
                content: message
            })
        });

        console.log('User message save status:', userMessageResponse.status);

        if (!userMessageResponse.ok) {
            const errorText = await userMessageResponse.text();
            console.error('User message save failed:', errorText);
            throw new Error(`Failed to save user message: ${errorText}`);
        }

        let contextualInfo = '';
        
        // If RAG is enabled, search for relevant documents
        if (useRAG) {
            console.log('RAG enabled, attempting document search...');
            try {
                // Create embedding for the user's message
                console.log('Creating embedding with OpenAI...');
                const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openaiApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'text-embedding-ada-002',
                        input: message
                    })
                });

                console.log('Embedding response status:', embeddingResponse.status);

                if (embeddingResponse.ok) {
                    const embeddingData = await embeddingResponse.json();
                    const queryEmbedding = embeddingData.data[0].embedding;
                    console.log('Embedding created, length:', queryEmbedding.length);

                    // Search for similar document embeddings
                    console.log('Searching for similar documents...');
                    const similarDocsResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/search_documents`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            query_embedding: queryEmbedding,
                            match_threshold: 0.7,
                            match_count: 3,
                            user_id: userId
                        })
                    });

                    console.log('Document search response status:', similarDocsResponse.status);

                    if (similarDocsResponse.ok) {
                        const similarDocs = await similarDocsResponse.json();
                        console.log('Found similar docs:', similarDocs.length);
                        if (similarDocs && similarDocs.length > 0) {
                            contextualInfo = '\n\nRelevant information from your documents:\n' + 
                                similarDocs.map(doc => `- ${doc.content}`).join('\n');
                        }
                    } else {
                        const searchError = await similarDocsResponse.text();
                        console.warn('Document search failed:', searchError);
                    }
                } else {
                    const embeddingError = await embeddingResponse.text();
                    console.warn('Embedding creation failed:', embeddingError);
                }
            } catch (ragError) {
                console.warn('RAG search failed:', ragError.message);
                // Continue without RAG context
            }
        }

        // Get recent conversation history
        console.log('Fetching conversation history...');
        const historyResponse = await fetch(`${supabaseUrl}/rest/v1/ai_chat_messages?session_id=eq.${currentSessionId}&order=created_at.asc&limit=10`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        console.log('History response status:', historyResponse.status);

        let conversationHistory = [];
        if (historyResponse.ok) {
            const messages = await historyResponse.json();
            conversationHistory = messages.slice(-9); // Exclude the current message
            console.log('Conversation history length:', conversationHistory.length);
        }

        // Prepare messages for OpenAI
        const systemPrompt = `You are a compassionate and knowledgeable AI assistant specializing in autism spectrum disorders (ASD), ADHD, ADD, and related conditions. You provide support to families and caregivers.

Key Guidelines:
- Be empathetic, supportive, and understanding
- Provide practical, actionable advice
- Always recommend consulting healthcare professionals for medical decisions
- Focus on evidence-based strategies and interventions
- Be sensitive to the challenges families face
- Offer encouragement and hope
- Respect individual differences and needs

Your goal is to empower families with knowledge while being a source of emotional support.${contextualInfo}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: message }
        ];

        console.log('Prepared messages for OpenAI, count:', messages.length);

        // Call OpenAI API
        console.log('Calling OpenAI API...');
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: messages,
                max_tokens: 1000,
                temperature: 0.7
            })
        });

        console.log('OpenAI response status:', openaiResponse.status);

        if (!openaiResponse.ok) {
            const errorData = await openaiResponse.text();
            console.error('OpenAI API error:', errorData);
            throw new Error(`OpenAI API error: ${errorData}`);
        }

        const openaiData = await openaiResponse.json();
        const assistantMessage = openaiData.choices[0].message.content;
        console.log('OpenAI response received, message length:', assistantMessage.length);

        // Save assistant response
        console.log('Saving assistant response...');
        const assistantSaveResponse = await fetch(`${supabaseUrl}/rest/v1/ai_chat_messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                role: 'assistant',
                content: assistantMessage
            })
        });

        console.log('Assistant message save status:', assistantSaveResponse.status);

        if (!assistantSaveResponse.ok) {
            const saveError = await assistantSaveResponse.text();
            console.warn('Assistant message save failed:', saveError);
        }

        console.log('=== AI Assistant Debug Function Completed Successfully ===');
        
        return new Response(JSON.stringify({
            data: {
                message: assistantMessage,
                sessionId: currentSessionId
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== AI Assistant Debug Function Error ===');
        console.error('Error type:', typeof error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        const errorResponse = {
            error: {
                code: 'AI_ASSISTANT_FAILED',
                message: error.message,
                debug: {
                    type: typeof error,
                    stack: error.stack
                }
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});