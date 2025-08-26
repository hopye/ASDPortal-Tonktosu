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
        console.log('=== Medical Document Upload Function Started ===');
        
        const { fileData, fileName, title, description, familyMemberId, documentType, dateOfDocument } = await req.json();
        console.log('Upload request:', { fileName, title, familyMemberId, documentType });

        if (!fileData || !fileName || !familyMemberId) {
            throw new Error('File data, filename, and family member ID are required');
        }

        // Get environment variables
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Get user from auth header
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
            throw new Error('No authorization header');
        }

        const token = authHeader.replace('Bearer ', '');

        // Verify token and get user
        const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': serviceRoleKey
            }
        });

        if (!userResponse.ok) {
            throw new Error('Invalid token');
        }

        const userData = await userResponse.json();
        const userId = userData.id;
        console.log('User authenticated:', userId);

        // Verify user has access to the family member
        const familyMemberResponse = await fetch(`${supabaseUrl}/rest/v1/family_members?id=eq.${familyMemberId}&caregiver_id=eq.${userId}`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        if (!familyMemberResponse.ok) {
            throw new Error('Failed to verify family member access');
        }

        const familyMembers = await familyMemberResponse.json();
        if (familyMembers.length === 0) {
            throw new Error('Access denied: You do not have permission to upload documents for this family member');
        }
        console.log('Family member access verified');

        // Extract base64 data from data URL
        const base64Data = fileData.split(',')[1];
        const mimeType = fileData.split(';')[0].split(':')[1];
        console.log('File info:', { mimeType, sizeBytes: base64Data.length });

        // Convert base64 to binary
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        // Create unique filename
        const timestamp = new Date().getTime();
        const uniqueFileName = `${userId}/${familyMemberId}/${timestamp}-${fileName}`;
        console.log('Uploading to storage:', uniqueFileName);

        // Upload to Supabase Storage
        const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/medical-documents/${uniqueFileName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': mimeType,
                'x-upsert': 'true'
            },
            body: binaryData
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error('Upload failed:', errorText);
            throw new Error(`Upload failed: ${errorText}`);
        }
        console.log('File uploaded successfully to storage');

        // Get public URL
        const fileUrl = `${supabaseUrl}/storage/v1/object/public/medical-documents/${uniqueFileName}`;

        // Save document metadata to database
        console.log('Saving document metadata to database');
        const insertResponse = await fetch(`${supabaseUrl}/rest/v1/medical_documents`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                family_member_id: familyMemberId,
                caregiver_id: userId,
                title: title || fileName,
                description: description || '',
                file_name: fileName,
                file_url: fileUrl,
                file_type: mimeType,
                file_size: binaryData.length,
                document_type: documentType || 'other',
                date_of_document: dateOfDocument || null,
                uploaded_at: new Date().toISOString()
            })
        });

        if (!insertResponse.ok) {
            const errorText = await insertResponse.text();
            console.error('Database insert failed:', errorText);
            throw new Error(`Database insert failed: ${errorText}`);
        }

        const documentData = await insertResponse.json();
        const documentId = documentData[0].id;
        console.log('Document saved to database:', documentId);

        // Process document for embeddings (for RAG functionality)
        let embeddingResult = null;
        
        try {
            console.log('Processing document for embeddings...');
            
            // For now, we'll handle text extraction differently based on file type
            let extractedText = '';
            
            if (mimeType === 'application/pdf') {
                // For PDFs, we'll use a simple approach - create sample content based on filename and description
                // In a production system, you'd use a proper PDF text extraction library
                extractedText = `Document: ${title}\n\nDescription: ${description || ''}\n\nDocument Type: ${documentType}\n\nThis is a ${documentType} document for ${familyMembers[0].name}. The document was uploaded with the filename ${fileName}.`;
                
                // For medical documents, add some context about the document type
                if (documentType) {
                    switch (documentType.toLowerCase()) {
                        case 'diagnosis report':
                            extractedText += '\n\nThis diagnostic report contains important medical information about the patient\'s condition, symptoms, and professional medical assessment.';
                            break;
                        case 'treatment plan':
                            extractedText += '\n\nThis treatment plan outlines the recommended therapeutic interventions, medications, and care strategies for the patient.';
                            break;
                        case 'therapy notes':
                            extractedText += '\n\nThese therapy notes document treatment sessions, progress observations, and therapeutic recommendations.';
                            break;
                        case 'assessment report':
                            extractedText += '\n\nThis assessment report provides detailed evaluation of the patient\'s condition, abilities, and needs.';
                            break;
                        case 'iep/504 plan':
                            extractedText += '\n\nThis educational plan outlines special education services, accommodations, and support strategies for the student.';
                            break;
                        default:
                            extractedText += '\n\nThis medical document contains important healthcare information.';
                    }
                }
                
                console.log('PDF text extraction simulated - extracted', extractedText.length, 'characters');
            } else {
                // For images, we'll create descriptive content
                extractedText = `Image Document: ${title}\n\nDescription: ${description || ''}\n\nThis is an image file (${mimeType}) containing medical information. Document type: ${documentType}. Uploaded for family member: ${familyMembers[0].name}.`;
                console.log('Image content description created');
            }

            // Call the document embeddings function if we have extracted text and OpenAI API key
            if (extractedText.trim() && openaiApiKey) {
                console.log('Calling create-document-embeddings function...');
                
                const embeddingResponse = await fetch(`${supabaseUrl}/functions/v1/create-document-embeddings`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: extractedText,
                        documentId: documentId
                    })
                });

                if (embeddingResponse.ok) {
                    embeddingResult = await embeddingResponse.json();
                    console.log('Embeddings created successfully:', embeddingResult.data);
                } else {
                    const embeddingError = await embeddingResponse.text();
                    console.warn('Embedding creation failed:', embeddingError);
                    // Don't fail the whole upload if embedding creation fails
                }
            } else {
                console.log('Skipping embedding creation - no text or OpenAI API key not available');
            }
        } catch (embeddingError) {
            console.warn('Error during embedding processing:', embeddingError);
            // Don't fail the whole upload if embedding processing fails
        }

        console.log('=== Medical Document Upload Function Completed Successfully ===');

        return new Response(JSON.stringify({
            data: {
                document: documentData[0],
                fileUrl,
                embeddingResult: embeddingResult
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== Medical Document Upload Function Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        const errorResponse = {
            error: {
                code: 'DOCUMENT_UPLOAD_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});