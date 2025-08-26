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
        console.log('=== Vision API Test Started ===');
        
        const { documentUrl, documentTitle } = await req.json();
        
        if (!documentUrl) {
            throw new Error('documentUrl is required');
        }

        console.log('Testing Vision API with document:', documentUrl);

        // Get environment variables
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        if (!openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        console.log('OpenAI API key found, testing Vision API...');

        // Download the document
        console.log('Downloading document from:', documentUrl);
        const fileResponse = await fetch(documentUrl);
        if (!fileResponse.ok) {
            throw new Error(`Failed to download document: ${fileResponse.statusText}`);
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        console.log('Downloaded file size:', fileBuffer.byteLength, 'bytes');

        // Convert to base64 with size limit
        const maxFileSize = 10 * 1024 * 1024; // 10MB limit
        if (fileBuffer.byteLength > maxFileSize) {
            throw new Error(`File too large: ${fileBuffer.byteLength} bytes (max: ${maxFileSize})`);
        }
        
        const uint8Array = new Uint8Array(fileBuffer);
        
        // Use a more efficient base64 conversion for large files
        let base64String = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize);
            base64String += btoa(String.fromCharCode(...chunk));
        }
        
        console.log('Base64 conversion completed, length:', base64String.length);

        // Test Vision API call
        const prompt = `You are analyzing a medical document. Please extract all the text content from this image document with high accuracy.

Document title: ${documentTitle || 'Medical Document'}

Focus on:
1. All visible text, numbers, and values
2. Medical terminology and lab results
3. Patient information and test results
4. Dates and reference ranges
5. Any tables or structured data

Provide a comprehensive text extraction that captures all the information visible in the document.`;
        
        console.log('Making Vision API call...');
        
        const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { 
                                type: 'image_url', 
                                image_url: { 
                                    url: `data:image/jpeg;base64,${base64String}`,
                                    detail: 'high'
                                } 
                            }
                        ]
                    }
                ],
                max_tokens: 2000,
                temperature: 0.1
            })
        });
        
        console.log('Vision API response status:', visionResponse.status);
        
        if (!visionResponse.ok) {
            const errorData = await visionResponse.text();
            console.error('Vision API error response:', errorData);
            throw new Error(`Vision API error (${visionResponse.status}): ${errorData}`);
        }
        
        const visionData = await visionResponse.json();
        console.log('Vision API response received');
        
        const extractedText = visionData.choices[0]?.message?.content || '';
        
        console.log('Vision extraction result:', {
            success: true,
            textLength: extractedText.length,
            preview: extractedText.substring(0, 200) + '...'
        });

        console.log('=== Vision API Test Completed Successfully ===');
        
        return new Response(JSON.stringify({
            data: {
                success: true,
                documentUrl: documentUrl,
                documentTitle: documentTitle,
                extractedTextLength: extractedText.length,
                extractedText: extractedText,
                preview: extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : '')
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== Vision API Test Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        return new Response(JSON.stringify({
            error: {
                code: 'VISION_API_TEST_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
