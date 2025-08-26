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
        console.log('=== Manual Document Processing Started ===');
        
        const { documentId, forceReprocess } = await req.json();
        
        if (!documentId) {
            throw new Error('documentId is required');
        }

        console.log('Processing document:', { documentId, forceReprocess });

        // Get environment variables
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        if (!serviceRoleKey || !supabaseUrl || !openaiApiKey) {
            throw new Error('Required configuration missing');
        }

        // Check if embeddings already exist (unless force reprocess)
        if (!forceReprocess) {
            const existingEmbeddings = await fetch(`${supabaseUrl}/rest/v1/document_embeddings?select=count&document_id=eq.${documentId}`, {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            });
            
            if (existingEmbeddings.ok) {
                const embeddingCount = await existingEmbeddings.json();
                if (embeddingCount.length > 0 && embeddingCount[0].count > 0) {
                    return new Response(JSON.stringify({
                        data: {
                            skipped: true,
                            reason: 'Embeddings already exist',
                            existingCount: embeddingCount[0].count
                        }
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }
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
        console.log('Found document:', document);

        // Check if it's a PDF file
        if (!document.file_url || !document.file_url.toLowerCase().includes('.pdf')) {
            console.log('Document is not a PDF, using title and description as content');
            const fallbackContent = `Document: ${document.title}. File type: ${document.file_type || 'Unknown'}. This document was uploaded but may not contain extractable text content.`;
            
            // Create embeddings for the fallback content
            const result = await createEmbeddingsForDocument(documentId, fallbackContent, supabaseUrl, serviceRoleKey, openaiApiKey);
            
            return new Response(JSON.stringify({
                data: {
                    success: true,
                    documentId: documentId,
                    message: 'Non-PDF document processed with metadata',
                    embeddingsCreated: result.data.embeddingsCreated
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Download and process the PDF
        console.log('Downloading PDF from:', document.file_url);
        
        const fileResponse = await fetch(document.file_url);
        if (!fileResponse.ok) {
            throw new Error(`Failed to download PDF: ${fileResponse.statusText}`);
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        console.log('Downloaded file size:', fileBuffer.byteLength, 'bytes');

        // Extract text from PDF
        const text = new TextDecoder().decode(fileBuffer);
        const extractedText = extractTextFromPDFBuffer(text);
        
        let contentToProcess;
        if (!extractedText || extractedText.length < 20) {
            console.log('Limited text extracted, using enhanced metadata');
            contentToProcess = `Document: ${document.title}. This PDF document contains medical information but text extraction was limited. The document may contain images, charts, or scanned content that requires OCR processing.`;
        } else {
            console.log('Extracted text length:', extractedText.length);
            contentToProcess = extractedText;
        }

        // Create embeddings
        const result = await createEmbeddingsForDocument(documentId, contentToProcess, supabaseUrl, serviceRoleKey, openaiApiKey);

        console.log('=== Manual Document Processing Completed ===');
        
        return new Response(JSON.stringify({
            data: {
                success: true,
                documentId: documentId,
                title: document.title,
                textExtracted: contentToProcess.length,
                embeddingsCreated: result.data.embeddingsCreated,
                totalChunks: result.data.totalChunks
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== Manual Document Processing Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        return new Response(JSON.stringify({
            error: {
                code: 'MANUAL_PROCESSING_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

// Helper function to extract text from PDF buffer (simplified approach)
function extractTextFromPDFBuffer(pdfText: string): string {
    try {
        // Look for text between common PDF text markers
        const textPattern = /\((.*?)\)/g;
        const matches = [];
        let match;
        
        while ((match = textPattern.exec(pdfText)) !== null) {
            const text = match[1];
            if (text && text.length > 2 && !text.includes('\\') && !/^[0-9.\s]+$/.test(text)) {
                matches.push(text);
            }
        }
        
        let extractedText = matches.join(' ').trim();
        
        // If we didn't find much text, try another approach
        if (extractedText.length < 50) {
            // Look for readable ASCII text patterns
            const readableText = pdfText.replace(/[^\x20-\x7E\n\r\t]/g, '')
                .split('\n')
                .filter(line => line.trim().length > 3 && !line.match(/^[\d\s.]+$/))
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            
            extractedText = readableText;
        }
        
        return extractedText.substring(0, 8000); // Limit to 8000 chars
        
    } catch (error) {
        console.error('Text extraction error:', error);
        return '';
    }
}

// Helper function to call the embeddings creation function
async function createEmbeddingsForDocument(documentId: string, content: string, supabaseUrl: string, serviceRoleKey: string, openaiApiKey: string) {
    const embeddingsUrl = `${supabaseUrl}/functions/v1/create-document-embeddings`;
    
    const embeddingsResponse = await fetch(embeddingsUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            content: content,
            documentId: documentId
        })
    });
    
    if (!embeddingsResponse.ok) {
        const errorText = await embeddingsResponse.text();
        console.error('Failed to create embeddings:', errorText);
        throw new Error(`Embeddings creation failed: ${errorText}`);
    }
    
    const embeddingsResult = await embeddingsResponse.json();
    console.log('Embeddings created successfully:', embeddingsResult);
    
    return embeddingsResult;
}
