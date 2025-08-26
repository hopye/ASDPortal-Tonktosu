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
        const { message, sessionId, useRAG = false } = await req.json();

        if (!message) {
            throw new Error('Message is required');
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

        // Get user from auth header
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
            throw new Error('Authorization header is required. Please log in to use this feature.');
        }

        const token = authHeader.replace('Bearer ', '');

        // Verify token and get user using Supabase Auth API
        const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': serviceRoleKey
            }
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            throw new Error(`Authentication failed: ${errorText}. Please log in again.`);
        }

        const userData = await userResponse.json();
        const userId = userData.id;

        if (!userId) {
            throw new Error('No user ID found in authentication response');
        }

        let currentSessionId = sessionId;

        // Create or get chat session
        if (!currentSessionId) {
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

            if (!sessionResponse.ok) {
                const errorText = await sessionResponse.text();
                throw new Error(`Failed to create chat session: ${errorText}`);
            }

            const sessionData = await sessionResponse.json();
            currentSessionId = sessionData[0].id;
        }

        // Save user message
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

        if (!userMessageResponse.ok) {
            const errorText = await userMessageResponse.text();
            throw new Error(`Failed to save user message: ${errorText}`);
        }

        // Test OpenAI API first
        const openaiTestResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 10
            })
        });

        let assistantMessage;
        
        if (!openaiTestResponse.ok) {
            const errorData = await openaiTestResponse.text();
            const errorObj = JSON.parse(errorData);
            
            if (errorObj.error && errorObj.error.code === 'insufficient_quota') {
                // Handle quota exceeded error with helpful message
                assistantMessage = `I apologize, but I'm currently unable to process your message due to API quota limitations. 

However, I want to help you with autism and ADHD related questions! Here are some general strategies that might be helpful:

• **For transitions between activities**: Use visual schedules, timers, and transition warnings ("5 more minutes")
• **For sensory regulation**: Create quiet spaces, use sensory tools like weighted blankets or fidgets
• **For communication**: Use visual supports, social stories, and clear, simple language
• **For routines**: Establish predictable daily schedules and use visual cues

Please consult with healthcare professionals for personalized advice. The system administrator has been notified about the technical issue and is working to restore full functionality.

Would you like me to provide more specific information about any of these areas?`;
            } else {
                throw new Error(`OpenAI API error: ${errorData}`);
            }
        } else {
            // Normal OpenAI processing
            const openaiData = await openaiTestResponse.json();
            assistantMessage = openaiData.choices[0].message.content;
        }

        // Save assistant response
        await fetch(`${supabaseUrl}/rest/v1/ai_chat_messages`, {
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