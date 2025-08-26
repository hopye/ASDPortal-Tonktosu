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
        console.log('AI Assistant function called');
        
        const { message, sessionId, useRAG = false } = await req.json();
        console.log('Request data:', { message, sessionId, useRAG });

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
            hasSupabaseUrl: !!supabaseUrl 
        });

        if (!openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Get user from auth header
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
            throw new Error('Authorization header is required. Please log in to use this feature.');
        }

        const token = authHeader.replace('Bearer ', '');
        console.log('Token received:', token.substring(0, 20) + '...');

        // Verify token and get user using Supabase Auth API
        const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': serviceRoleKey
            }
        });

        console.log('User response status:', userResponse.status);

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('User auth failed:', errorText);
            throw new Error(`Authentication failed: ${errorText}. Please log in again.`);
        }

        const userData = await userResponse.json();
        const userId = userData.id;
        console.log('User ID:', userId);

        if (!userId) {
            throw new Error('No user ID found in authentication response');
        }

        let currentSessionId = sessionId;

        // Create or get chat session
        if (!currentSessionId) {
            console.log('Creating new session for user:', userId);
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
            console.log('Created session ID:', currentSessionId);
        }

        // Save user message
        console.log('Saving user message to session:', currentSessionId);
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

        // For debugging, let's return a simple response without calling OpenAI
        const assistantMessage = "Hello! I'm your AI assistant. I'm here to help you with questions about autism, ADHD, and related conditions. This is a test response to confirm the system is working properly.";

        // Save assistant response
        console.log('Saving assistant message');
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
            const errorText = await assistantSaveResponse.text();
            console.error('Assistant message save failed:', errorText);
        }

        console.log('Function completed successfully');
        return new Response(JSON.stringify({
            data: {
                message: assistantMessage,
                sessionId: currentSessionId
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('AI Assistant error:', error);

        const errorResponse = {
            error: {
                code: 'AI_ASSISTANT_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});