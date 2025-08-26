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
        console.log('=== Direct PDF Content Extraction Test ===');
        
        const { documentId } = await req.json();
        
        if (!documentId) {
            throw new Error('documentId is required');
        }

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        if (!serviceRoleKey || !supabaseUrl || !openaiApiKey) {
            throw new Error('Configuration missing');
        }

        // Get the medical document record
        const docResponse = await fetch(`${supabaseUrl}/rest/v1/medical_documents?select=id,title,file_name,file_url,file_type&id=eq.${documentId}`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        if (!docResponse.ok) {
            throw new Error('Failed to fetch medical document');
        }

        const documents = await docResponse.json();
        if (documents.length === 0) {
            throw new Error('Medical document not found');
        }

        const document = documents[0];
        console.log('Document details:', document);

        // Download the document
        console.log('Downloading document from:', document.file_url);
        const fileResponse = await fetch(document.file_url);
        if (!fileResponse.ok) {
            throw new Error(`Failed to download document: ${fileResponse.statusText}`);
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        console.log('Downloaded file size:', fileBuffer.byteLength, 'bytes');

        // Use Vision API to extract content directly
        console.log('Using Vision API for content extraction...');
        
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
        const imageData = `data:application/pdf;base64,${base64Data}`;
        
        const prompt = `You are analyzing a medical document. Please extract ALL the text content from this PDF document with high accuracy.

Document title: ${document.title}
File name: ${document.file_name}

Focus on:
1. All visible text, numbers, and values
2. Medical terminology and lab results  
3. Patient information and test results
4. Dates and reference ranges
5. Any tables or structured data

Provide a comprehensive text extraction that captures all the information visible in the document. Be precise and include all numeric values, units, and medical terms exactly as they appear.

Do not add any commentary or interpretation - just extract the raw text content.`;
        
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
                                    url: imageData,
                                    detail: 'high'
                                } 
                            }
                        ]
                    }
                ],
                max_tokens: 3000,
                temperature: 0.1
            })
        });
        
        if (!visionResponse.ok) {
            const errorData = await visionResponse.text();
            throw new Error(`Vision API error: ${errorData}`);
        }
        
        const visionData = await visionResponse.json();
        const extractedText = visionData.choices[0]?.message?.content || '';
        
        console.log('Vision extraction successful:', extractedText.length, 'characters');
        console.log('Extracted content preview:', extractedText.substring(0, 500) + '...');

        // Clear existing embeddings and create new ones with correct content
        await fetch(`${supabaseUrl}/rest/v1/document_embeddings?document_id=eq.${documentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        // Create embeddings with the properly extracted content
        const embeddingsUrl = `${supabaseUrl}/functions/v1/create-document-embeddings`;
        
        const embeddingsResponse = await fetch(embeddingsUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: extractedText,
                documentId: documentId,
                metadata: {
                    extraction_method: 'vision_api_direct',
                    content_quality: 'high',
                    file_type: document.file_type,
                    processing_timestamp: new Date().toISOString()
                }
            })
        });
        
        if (!embeddingsResponse.ok) {
            const errorText = await embeddingsResponse.text();
            console.error('Failed to create embeddings:', errorText);
            throw new Error(`Embeddings creation failed: ${errorText}`);
        }
        
        const embeddingsResult = await embeddingsResponse.json();
        console.log('Embeddings created successfully:', embeddingsResult);

        // Update document status
        await fetch(`${supabaseUrl}/rest/v1/medical_documents?id=eq.${documentId}`, {
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

        console.log('=== Direct PDF Content Extraction Completed ===');
        
        return new Response(JSON.stringify({
            data: {
                success: true,
                documentId: documentId,
                title: document.title,
                extractionMethod: 'vision_api_direct',
                contentLength: extractedText.length,
                contentPreview: extractedText.substring(0, 500),
                embeddingsCreated: embeddingsResult.data.embeddingsCreated,
                totalChunks: embeddingsResult.data.totalChunks
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== Direct PDF Content Extraction Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        return new Response(JSON.stringify({
            error: {
                code: 'DIRECT_EXTRACTION_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
