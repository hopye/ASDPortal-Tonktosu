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
        console.log('=== Process Documents by User ID Function Started ===');
        
        const { userId } = await req.json();
        console.log('Processing documents for user:', userId);

        if (!userId) {
            throw new Error('User ID is required');
        }

        // Get environment variables
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!openaiApiKey || !serviceRoleKey || !supabaseUrl) {
            throw new Error('Required environment variables not configured');
        }

        // Get all documents for this user
        const documentsResponse = await fetch(
            `${supabaseUrl}/rest/v1/medical_documents?caregiver_id=eq.${userId}&select=*,family_members!inner(name)`, 
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (!documentsResponse.ok) {
            const errorText = await documentsResponse.text();
            throw new Error(`Failed to fetch documents: ${errorText}`);
        }

        const documents = await documentsResponse.json();
        console.log('Found', documents.length, 'documents for user');

        let processedCount = 0;
        let embeddingsCreated = 0;

        for (const document of documents) {
            try {
                console.log('Processing document:', document.id, '-', document.title);

                // Check if embeddings already exist for this document
                const existingEmbeddingsResponse = await fetch(
                    `${supabaseUrl}/rest/v1/document_embeddings?document_id=eq.${document.id}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey
                        }
                    }
                );

                if (existingEmbeddingsResponse.ok) {
                    const existingEmbeddings = await existingEmbeddingsResponse.json();
                    if (existingEmbeddings.length > 0) {
                        console.log('Document already has', existingEmbeddings.length, 'embeddings, skipping');
                        continue;
                    }
                }

                // Generate content for embedding based on document metadata
                let extractedText = '';
                const familyMemberName = document.family_members?.name || 'Unknown';
                const mimeType = document.file_type || '';
                
                if (mimeType === 'application/pdf') {
                    // Enhanced PDF content generation
                    extractedText = `Medical Document: ${document.title}\n\n`;
                    extractedText += `Patient: ${familyMemberName}\n`;
                    extractedText += `Document Type: ${document.document_type || 'Medical Document'}\n`;
                    
                    if (document.description) {
                        extractedText += `Description: ${document.description}\n\n`;
                    }
                    
                    if (document.date_of_document) {
                        extractedText += `Document Date: ${document.date_of_document}\n`;
                    }
                    
                    // Add context based on document type
                    if (document.document_type) {
                        switch (document.document_type.toLowerCase()) {
                            case 'diagnosis report':
                                extractedText += '\nThis diagnostic report contains medical assessment information including symptoms, clinical findings, diagnostic tests results, and professional medical evaluation. It provides important details about the patient\'s medical condition and diagnosis.';
                                break;
                            case 'treatment plan':
                                extractedText += '\nThis treatment plan outlines therapeutic interventions, medication protocols, care strategies, and treatment goals. It includes recommendations for ongoing medical care and management strategies.';
                                break;
                            case 'therapy notes':
                                extractedText += '\nThese therapy session notes document treatment progress, therapeutic interventions used, patient responses, and recommendations for continued care. They track the patient\'s development and response to therapy.';
                                break;
                            case 'assessment report':
                                extractedText += '\nThis comprehensive assessment evaluates the patient\'s condition, abilities, needs, and functioning levels. It provides detailed analysis for treatment planning and care coordination.';
                                break;
                            case 'iep/504 plan':
                                extractedText += '\nThis educational plan documents special education services, classroom accommodations, support strategies, and learning goals. It ensures appropriate educational support for the student\'s needs.';
                                break;
                            case 'medical history':
                                extractedText += '\nThis medical history document contains important background information about the patient\'s health, previous conditions, treatments, and family medical history.';
                                break;
                            case 'medication list':
                                extractedText += '\nThis medication list includes current prescriptions, dosages, administration instructions, and important medication-related information for the patient.';
                                break;
                            default:
                                extractedText += '\nThis medical document contains important healthcare information relevant to the patient\'s care and treatment.';
                        }
                    }
                    
                    // Add autism/ADHD specific context if relevant
                    if (document.document_type && 
                        (document.document_type.toLowerCase().includes('autism') || 
                         document.document_type.toLowerCase().includes('adhd') ||
                         document.title.toLowerCase().includes('autism') ||
                         document.title.toLowerCase().includes('adhd'))) {
                        extractedText += '\n\nThis document is specifically related to autism spectrum disorder (ASD) or ADHD care and may contain information about behavioral strategies, sensory needs, communication supports, or developmental considerations.';
                    }
                    
                } else if (mimeType.startsWith('image/')) {
                    // Image document content
                    extractedText = `Medical Image: ${document.title}\n\n`;
                    extractedText += `Patient: ${familyMemberName}\n`;
                    extractedText += `Document Type: ${document.document_type || 'Medical Image'}\n`;
                    
                    if (document.description) {
                        extractedText += `Description: ${document.description}\n\n`;
                    }
                    
                    extractedText += 'This is a medical image file that may contain visual information such as scan results, test images, charts, or other medical visual data relevant to the patient\'s healthcare.';
                }

                if (!extractedText.trim()) {
                    console.log('No content generated for document, skipping');
                    continue;
                }

                console.log('Generated content length:', extractedText.length, 'characters');

                // Call the embeddings creation function
                const embeddingResponse = await fetch(`${supabaseUrl}/functions/v1/create-document-embeddings`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: extractedText,
                        documentId: document.id
                    })
                });

                if (embeddingResponse.ok) {
                    const embeddingResult = await embeddingResponse.json();
                    console.log('Embeddings created for document:', document.id, '-', embeddingResult.data);
                    embeddingsCreated += embeddingResult.data.embeddingsCreated || 0;
                } else {
                    const embeddingError = await embeddingResponse.text();
                    console.error('Failed to create embeddings for document:', document.id, '-', embeddingError);
                }

                processedCount++;

            } catch (docError) {
                console.error('Error processing document:', document.id, '-', docError);
            }
        }

        console.log('=== Process Documents by User ID Function Completed ===');
        console.log('Processed:', processedCount, 'documents');
        console.log('Total embeddings created:', embeddingsCreated);

        return new Response(JSON.stringify({
            data: {
                userId: userId,
                totalDocuments: documents.length,
                processedCount: processedCount,
                embeddingsCreated: embeddingsCreated,
                message: `Successfully processed ${processedCount} documents and created ${embeddingsCreated} embeddings for user ${userId}`
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== Process Documents by User ID Function Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        const errorResponse = {
            error: {
                code: 'PROCESS_DOCUMENTS_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});