import { db } from "../db";
import { chatThreads, chatMessages } from "../db/schema";
import { WorkflowService } from "./workflow.service";
import { WorkflowStatus, StepStatus } from "../types/workflow";
import { eq } from "drizzle-orm";
import { BASE_WORKFLOW_TEMPLATE } from '../templates/workflows/base-workflow.js';

export class ChatService {
  private workflowService: WorkflowService;

  constructor() {
    this.workflowService = new WorkflowService();
  }

  async createThread(userId: string, title: string) {
    // Create the thread
    const [thread] = await db
      .insert(chatThreads)
      .values({
        userId,
        title,
      })
      .returning();

    // Immediately create and start the base workflow
    try {
      const baseTemplate = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);
      if (!baseTemplate) {
        throw new Error("Base workflow template not found");
      }

      // Create the workflow - this will automatically send the first message
      await this.workflowService.createWorkflow(thread.id, baseTemplate.id);
      console.log(`Base workflow created and initialized for thread ${thread.id}`);
      
      // Add a welcome message as the first message
      await this.addSystemMessage(thread.id, "Welcome to Honeyjar! I'm here to help you create professional PR assets. Let's get started!");
      
    } catch (error) {
      console.error(`Error initializing base workflow for thread ${thread.id}:`, error);
      // Don't throw the error as we still want to return the thread
    }

    return thread;
  }

  async addMessage(threadId: string, content: string, isUser: boolean) {
    // First check for duplicates - this is especially important for assistant messages
    if (!isUser) {  // Only check for assistant duplicates to avoid filtering legitimate user duplicates
      const recentMessages = await db.query.chatMessages.findMany({
        where: eq(chatMessages.threadId, threadId),
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        limit: 5, // Check the 5 most recent messages
      });
      
      // Check if the exact same message exists - focus on announcement type prompt
      const isDuplicate = recentMessages.some(msg => 
        msg.role === "assistant" && 
        msg.content === content
      );
      
      // Special check for the Announcement Type question which commonly gets duplicated
      const isAnnouncementTypeQuestion = 
        content.includes("announcement types") && 
        content.includes("Which type best fits");
        
      const hasAnnouncementTypeQuestion = recentMessages.some(msg => 
        msg.role === "assistant" &&
        msg.content.includes("announcement types") && 
        msg.content.includes("Which type best fits")
      );
      
      // Skip adding the message if it's a duplicate or if it's the announcement type question and we already have one
      if (isDuplicate || (isAnnouncementTypeQuestion && hasAnnouncementTypeQuestion)) {
        console.log(`ChatService: Skipping duplicate assistant message: "${content.substring(0, 50)}..."`);
        // Return the existing message
        const existingMsg = recentMessages.find(msg => 
          msg.role === "assistant" && 
          (msg.content === content || 
           (isAnnouncementTypeQuestion && 
            msg.content.includes("announcement types") && 
            msg.content.includes("Which type best fits")))
        );
        return existingMsg || null;
      }
    }
    
    // Add the message if it's not a duplicate or it's from the user
    const [message] = await db
      .insert(chatMessages)
      .values({
        threadId,
        content,
        role: isUser ? "user" : "assistant",
        userId: isUser ? threadId : "system",
      })
      .returning();
    return message;
  }

  async getThreadMessages(threadId: string) {
    return db.query.chatMessages.findMany({
      where: eq(chatMessages.threadId, threadId),
      orderBy: (messages, { asc }) => [asc(messages.createdAt)],
    });
  }

  async handleUserMessage(threadId: string, content: string) {
    // Check if this message already exists in the database
    const recentMessages = await db.query.chatMessages.findMany({
      where: eq(chatMessages.threadId, threadId),
      orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      limit: 5, // Get the 5 most recent messages
    });
    
    // Check if there's already a user message with this content
    const duplicateMessage = recentMessages.find(msg => 
      msg.role === "user" && 
      msg.content === content
    );
    
    // Only add the message if it doesn't already exist
    if (!duplicateMessage) {
      console.log(`Adding new user message to thread ${threadId}: "${content.substring(0, 30)}..."`);
      await this.addMessage(threadId, content, true);
    } else {
      console.log(`Skipping duplicate user message in thread ${threadId}: "${content.substring(0, 30)}..."`);
    }

    // Get the active workflow for this thread
    let workflow = await this.workflowService.getWorkflowByThreadId(threadId);
    if (!workflow) {
      // If no workflow exists at all, something went wrong during thread creation
      // Create the base workflow as a fallback
      console.warn(`No workflow found for thread ${threadId}. Creating base workflow as fallback.`);
      const baseTemplate = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);
      if (!baseTemplate) throw new Error("Base workflow template not found");
      
      workflow = await this.workflowService.createWorkflow(threadId, baseTemplate.id);
    }

    // If we have an active workflow, process the current step
    const currentStepId = workflow.currentStepId;
    if (!currentStepId) {
      console.warn(`Workflow ${workflow.id} has no currentStepId. Attempting to get next prompt.`);
      return this.getNextPrompt(threadId, workflow.id);
    }

    // Get the current step before processing
    const currentStep = workflow.steps.find(step => step.id === currentStepId);
    
    // Special handling for pre-processing Launch Announcement workflow specific steps
    if (currentStep) {
      // Handle Asset Selection step - if user asks about available assets
      if (currentStep.name === "Asset Selection" && 
          (content.toLowerCase().includes("what") || 
           content.toLowerCase().includes("list") || 
           content.toLowerCase().includes("options") ||
           content.toLowerCase().includes("assets") ||
           content.toLowerCase().includes("available"))) {
        
        console.log("User is asking about available assets. Providing recommendations.");
        
        // Find the announcement type from the previous step
        const announcementTypeStep = workflow.steps.find(s => s.name === "Announcement Type Selection");
        if (announcementTypeStep) {
          const announcementType = announcementTypeStep.userInput || "Product Launch";
          
          // Generate asset recommendations for this announcement type
          const assetRecommendations = await this.generateAssetRecommendations(currentStep, announcementType);
          
          // Send the recommendations to the user
          await this.addMessage(threadId, assetRecommendations, false);
          
          // Don't process the step, just return the recommendations
          return assetRecommendations;
        }
      }
    }
    
    // Handle the step response using the current step ID
    const stepResponse = await this.workflowService.handleStepResponse(currentStepId, content);
    
    // Special handling for different step types
    if (currentStep) {
      // Special handling for Announcement Type Selection
      if (currentStep.name === "Announcement Type Selection") {
        // Add a plain message showing the selected announcement type
        const announcementTypeMsg = `Announcement type: ${content}`;
        await this.addWorkflowStatusMessage(threadId, announcementTypeMsg);
      }
      
      // Special handling for Asset Selection step - process assets and show them
      else if (currentStep.name === "Asset Selection" && stepResponse.nextStep?.name === "Asset Confirmation") {
        // If we're moving to Asset Confirmation, make sure the user sees the recommended assets
        const nextStep = workflow.steps.find(s => s.id === stepResponse.nextStep.id);
        if (nextStep && nextStep.aiSuggestion) {
          // Extract asset list from the aiSuggestion or create a default list
          const assetList = nextStep.aiSuggestion || "Press Release, Media Pitch, Social Post";
          const formattedAssets = "Recommended assets: " + assetList;
          
          // Add the asset list as a direct message
          await this.addMessage(threadId, formattedAssets, false);
        }
      }
      
      // Special handling for Asset Review - ensure user feedback triggers regeneration
      else if (currentStep.name === "Asset Review" && content.toLowerCase() !== "approved") {
        // User provided feedback on the asset - mark it for regeneration
        await this.workflowService.updateStep(currentStep.id, {
          metadata: { 
            ...currentStep.metadata,
            needsRegeneration: true,
            feedback: content
          }
        });
        
        // Add a message acknowledging the feedback
        await this.addSystemMessage(threadId, `Thank you for your feedback. I'll update the ${currentStep.metadata?.selectedAsset || "asset"} with your requested changes.`);
      }
    }
    
    // Add AI response to thread if provided by handleStepResponse
    if (stepResponse.response && stepResponse.response !== 'Workflow completed successfully.') { // Avoid duplicate completion message
      await this.addMessage(threadId, stepResponse.response, false);
    }

    // Check if the *workflow* completed as a result of this step
    if (stepResponse.isComplete) {
        // --- START: Workflow Transition Logic ---
        
        // Check if the completed workflow was the Base Workflow
        // Now we need the actual BASE_WORKFLOW_TEMPLATE *object* to compare its name/ID if needed,
        // OR we can just fetch the template by name without the constant here.
        // Let's fetch by name directly to avoid relying on the imported constant within this specific check.
        const baseTemplateFromDB = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name); // Use constant only for getting name initially if needed

        // Check if the completed workflow's template ID matches the base template ID from DB
        if (workflow.templateId === baseTemplateFromDB?.id) { // Compare IDs
            console.log('Base workflow completed. Checking for next workflow selection...');
            // Retrieve the completed Base Workflow details to find the selection
            const completedBaseWorkflow = await this.workflowService.getWorkflow(workflow.id); 
            const selectionStep = completedBaseWorkflow?.steps.find(s => s.name === "Workflow Selection");
            
            // First try to use aiSuggestion (the matched workflow option), then fall back to userInput
            // Also log this information for debugging purposes
            const selectedWorkflowName = selectionStep?.aiSuggestion || selectionStep?.userInput;
            console.log(`Workflow selection - aiSuggestion: "${selectionStep?.aiSuggestion}", userInput: "${selectionStep?.userInput}", final selection: "${selectedWorkflowName}"`);

            if (selectedWorkflowName) {
                console.log(`User selected: ${selectedWorkflowName}`);
                
                // Log available templates for debugging
                const availableTemplates = await this.getAvailableTemplateNames();
                console.log(`Available templates: ${JSON.stringify(availableTemplates)}`);
                
                // Try to find the template with a case-insensitive, trimmed comparison
                let nextTemplate = null;
                
                // First try exact match
                nextTemplate = await this.workflowService.getTemplateByName(selectedWorkflowName);
                
                // If not found, try case-insensitive match
                if (!nextTemplate) {
                    for (const templateName of availableTemplates) {
                        if (templateName.toLowerCase().trim() === selectedWorkflowName.toLowerCase().trim()) {
                            console.log(`Found case-insensitive match: "${templateName}" for "${selectedWorkflowName}"`);
                            nextTemplate = await this.workflowService.getTemplateByName(templateName);
                            break;
                        }
                    }
                }
                
                // If still not found, try substring match
                if (!nextTemplate) {
                    for (const templateName of availableTemplates) {
                        if (templateName.toLowerCase().includes(selectedWorkflowName.toLowerCase()) || 
                            selectedWorkflowName.toLowerCase().includes(templateName.toLowerCase())) {
                            console.log(`Found substring match: "${templateName}" for "${selectedWorkflowName}"`);
                            nextTemplate = await this.workflowService.getTemplateByName(templateName);
                            break;
                        }
                    }
                }
                
                if (nextTemplate) {
                    console.log(`Found template for "${selectedWorkflowName}". Creating next workflow...`);
                    try {
                        // Create the *new* selected workflow
                        const nextWorkflow = await this.workflowService.createWorkflow(threadId, nextTemplate.id);
                        console.log(`Created workflow ${nextWorkflow.id} for template ${nextTemplate.name}`);
                        
                        // Add a message to show which workflow was selected - use plain text
                        const selectionMsg = `Workflow selected: ${selectedWorkflowName}`;
                        await this.addWorkflowStatusMessage(threadId, selectionMsg);
                        
                        // Get the *first prompt* of the NEW workflow
                        return this.getNextPrompt(threadId, nextWorkflow.id);
                    } catch (creationError) {
                        console.error(`Error creating workflow for ${selectedWorkflowName}:`, creationError);
                        const errorMsg = `Sorry, I couldn't start the ${selectedWorkflowName} workflow.`;
                        await this.addSystemMessage(threadId, errorMsg);
                        return errorMsg;
                    }
                } else {
                    console.warn(`Template not found for selection: ${selectedWorkflowName}`);
                    const availableTemplates = await this.getAvailableTemplateNames();
                    const notFoundMsg = `Sorry, I couldn't find a workflow template named "${selectedWorkflowName}". Available templates are: ${availableTemplates.join(', ')}`;
                    await this.addSystemMessage(threadId, notFoundMsg);
                    return notFoundMsg;
                }
            } else {
                console.warn('Could not determine next workflow from Base Workflow selection step.');
                // Fall through to generic completion message if selection wasn't found
            }
        }
        
        // If it wasn't the base workflow, or if base completed without valid selection, just confirm completion.
        const completionMsg = `${workflow.templateId || 'Workflow'} completed successfully.`; // Use template name if possible
        // Ensure completion message wasn't already added by handleStepResponse if its response was used
         const lastMessage = await this.getLastMessage(threadId);
         if (lastMessage?.content !== completionMsg) {
             await this.addWorkflowStatusMessage(threadId, completionMsg);
         }
        return completionMsg;

        // --- END: Workflow Transition Logic ---

    } else if (stepResponse.nextStep) {
      // If the workflow is not complete, but there's a specific next step prompt from handleStepResponse
       const nextPrompt = stepResponse.nextStep.prompt || "Please provide the required information.";
       
       // Get the next step information to check if it's already been sent
       const nextStepInfo = workflow.steps.find(step => step.id === stepResponse.nextStep?.id);
       
       // Check if the initial prompt has already been sent or if this is a duplicate we should avoid
       const isInitialPromptAlreadySent = nextStepInfo?.metadata?.initialPromptSent === true;
       
       // Skip adding the message if it's a duplicate announcement type prompt
       // or if the initial prompt has already been marked as sent
       if (isInitialPromptAlreadySent) {
         console.log(`Skipping duplicate prompt message - initialPromptSent flag is true`);
         return nextPrompt;
       }
       
       // For all other cases - Add the prompt message if it's not the same as the stepResponse message already added
       if (stepResponse.response !== nextPrompt) {
         // Update the next step to mark that we've sent this prompt
         if (nextStepInfo) {
           await this.workflowService.updateStep(nextStepInfo.id, {
             metadata: { 
               ...nextStepInfo.metadata,
               initialPromptSent: true 
             }
           });
         }
         
         await this.addMessage(threadId, nextPrompt, false);
       }
       return nextPrompt; 
    } else {
       // If the step isn't complete and handleStepResponse didn't provide a specific next step/prompt,
       // rely on getNextPrompt to figure out what to do (e.g., re-prompt for current step if needed)
       console.warn(`Step ${currentStepId} processed, workflow not complete, but handleStepResponse provided no next step. Calling getNextPrompt.`);
       return this.getNextPrompt(threadId, workflow.id);
    }
  }

  // Update getNextPrompt to accept workflowId
  private async getNextPrompt(threadId: string, workflowId: string) {
    const workflow = await this.workflowService.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found for ID: ${workflowId}`);
    }

    let nextStep: any = null; // Use 'any' temporarily if WorkflowStep type is complex

    // Find the current step or the next pending step
    const currentStep = workflow.steps.find(step => step.id === workflow.currentStepId);

    if (currentStep && currentStep.status !== StepStatus.COMPLETE) {
        // If current step exists and is not complete, it's the next step.
        nextStep = currentStep;
    } else {
       // Find the first pending step whose dependencies are met
       const pendingSteps = workflow.steps
         .filter(step => step.status === StepStatus.PENDING)
         .sort((a, b) => a.order - b.order);

       for (const step of pendingSteps) {
         const dependenciesMet = step.dependencies.every(depName => {
           const depStep = workflow.steps.find(s => s.name === depName);
           return depStep?.status === StepStatus.COMPLETE;
         });
         if (dependenciesMet) {
           nextStep = step;
           break;
         }
       }
    }


      if (!nextStep) {
       // Check if all steps are complete
       const allStepsComplete = workflow.steps.every(step => step.status === StepStatus.COMPLETE);
       if(allStepsComplete && workflow.status !== WorkflowStatus.COMPLETED) {
           await this.workflowService.updateWorkflowStatus(workflow.id, WorkflowStatus.COMPLETED);
           const workflowCompleteMsg = `${workflow.templateId || 'Workflow'} completed.`;
            await this.addWorkflowStatusMessage(threadId, workflowCompleteMsg);
           return workflowCompleteMsg;
       } else {
          const noStepsMsg = "No further steps available or dependencies not met.";
          await this.addSystemMessage(threadId, noStepsMsg);
          return noStepsMsg;
       }
    }

    // If the next step is different from current or not yet IN_PROGRESS, update status
    if (nextStep.id !== workflow.currentStepId || nextStep.status !== StepStatus.IN_PROGRESS) {
      await this.workflowService.updateStep(nextStep.id, { status: StepStatus.IN_PROGRESS });
      await this.workflowService.updateWorkflowCurrentStep(workflow.id, nextStep.id);
    }


      const prompt = nextStep.prompt || "Please provide the required information.";
    // Avoid adding duplicate prompts if the step didn't change
    const lastMessage = await this.getLastMessage(threadId);
    if (lastMessage?.content !== prompt || lastMessage?.role !== 'assistant') {
      await this.addMessage(threadId, prompt, false);
    }
    return prompt;
  }

  // Helper to get the last message 
  private async getLastMessage(threadId: string) {
     const messages = await db.query.chatMessages.findMany({
        where: eq(chatMessages.threadId, threadId),
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        limit: 1,
     });
     return messages[0] || null;
  }
  
  // Helper to get all available template names
  private async getAvailableTemplateNames(): Promise<string[]> {
    // Using the BASE_WORKFLOW_TEMPLATE constant to get the list of options
    const baseTemplate = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);
    if (baseTemplate) {
      const workflowSelectionStep = baseTemplate.steps.find(s => s.name === "Workflow Selection");
      if (workflowSelectionStep && workflowSelectionStep.metadata?.options) {
        return workflowSelectionStep.metadata.options as string[];
      }
    }
    
    // Fallback - return hardcoded list (avoid empty array)
    return ["Launch Announcement", "Dummy Workflow"];
  }

  private async generateFinalResponse(workflow: any) {
    // Get steps in order
    const orderedSteps = workflow.steps.sort((a: any, b: any) => a.order - b.order);

    // Find the relevant steps and their responses
    const initialGoal = orderedSteps.find((s: any) => s.order === 0)?.aiSuggestion || '';
    const targetAudience = orderedSteps.find((s: any) => s.order === 1)?.userInput || '';
    const keyFeatures = orderedSteps.find((s: any) => s.order === 2)?.userInput || '';
    const valueProposition = orderedSteps.find((s: any) => s.order === 3)?.userInput || '';
    const callToAction = orderedSteps.find((s: any) => s.order === 4)?.userInput || '';

    const announcement = `We're excited to announce our new product launch!

Target Audience:
${targetAudience}

Key Features:
${keyFeatures}

Value Proposition:
${valueProposition}

${callToAction}

Join us on this exciting journey!`;

    await this.addMessage(workflow.threadId, announcement, false);
    return announcement;
  }

  /**
   * Generate asset recommendations for a specific announcement type
   */
  private async generateAssetRecommendations(step: any, announcementType: string): Promise<string> {
    try {
      // Default asset recommendations by announcement type
      const assetRecommendations: Record<string, string[]> = {
        "Product Launch": ["Press Release", "Media Pitch", "Social Post", "Blog Post", "FAQ Document"],
        "Funding Round": ["Press Release", "Media Pitch", "Social Post", "Talking Points"],
        "Partnership": ["Press Release", "Media Pitch", "Social Post", "Email Announcement"],
        "Company Milestone": ["Press Release", "Social Post", "Blog Post", "Email Announcement"],
        "Executive Hire": ["Press Release", "Media Pitch", "Social Post", "Talking Points"],
        "Industry Award": ["Press Release", "Social Post", "Blog Post"]
      };
      
      // Normalize the announcement type for matching
      const normalizedType = Object.keys(assetRecommendations).find(
        type => type.toLowerCase().includes(announcementType.toLowerCase()) ||
               announcementType.toLowerCase().includes(type.toLowerCase())
      ) || "Product Launch";
      
      // Get the appropriate asset list
      const assets = assetRecommendations[normalizedType] || assetRecommendations["Product Launch"];
      
      // Format the response
      let response = `For a ${normalizedType.toLowerCase()}, we recommend the following assets:\n\n`;
      assets.forEach(asset => {
        response += `- ${asset}\n`;
      });
      response += `\nWhich of these would you like to generate?`;
      
      return response;
    } catch (error) {
      console.error("Error generating asset recommendations:", error);
      return "For your announcement type, I recommend creating a Press Release, Media Pitch, and Social Posts. Which of these would you like to generate?";
    }
  }

  /**
   * Create a custom prompt for Information Collection based on selected assets
   */
  private createInformationCollectionPrompt(selectedAssets: string[]): string {
    // Default fields needed for all assets
    const defaultFields = [
      "Company Name",
      "Announcement Date"
    ];
    
    // Asset-specific fields
    const assetFields: Record<string, string[]> = {
      "Press Release": [
        "Product/Service Name",
        "Key Features (3-5)",
        "CEO or Executive Name (for quote)",
        "Unique Value Proposition",
        "Target Market/Audience",
        "Pricing Information (if applicable)",
        "Availability Date"
      ],
      "Media Pitch": [
        "Key Media Contacts/Publications",
        "Newsworthy Angle",
        "Industry Context/Trends",
        "Available Spokesperson",
        "PR Contact Information"
      ],
      "Social Post": [
        "Brand Voice/Tone",
        "Key Messaging Points",
        "Call to Action",
        "Relevant Hashtags",
        "Visual Assets Available"
      ],
      "Blog Post": [
        "Target Word Count",
        "Key Messages",
        "Technical Specifications",
        "Customer Pain Points",
        "Benefits/Solutions"
      ],
      "FAQ Document": [
        "Common Questions (list at least 5)",
        "Technical Specifications",
        "Pricing Details",
        "Competitor Comparisons"
      ],
      "Email Announcement": [
        "Email Subject Line",
        "Target Audience Segments",
        "Call to Action",
        "Special Offers (if applicable)"
      ],
      "Talking Points": [
        "Key Messages (3-5)",
        "Anticipated Questions",
        "Industry Statistics/Data",
        "Competitor Positioning"
      ]
    };
    
    // Normalize asset names to match our map keys
    const normalizedAssets = selectedAssets.map(asset => {
      const key = Object.keys(assetFields).find(k => 
        k.toLowerCase().includes(asset.toLowerCase()) || 
        asset.toLowerCase().includes(k.toLowerCase())
      );
      return key || asset;
    }).filter(asset => asset); // Filter out undefined
    
    // Build the list of required fields based on selected assets
    const requiredFields = new Set<string>(defaultFields);
    
    normalizedAssets.forEach(asset => {
      if (assetFields[asset]) {
        assetFields[asset].forEach(field => requiredFields.add(field));
      }
    });
    
    // Build the prompt
    let prompt = `To generate your ${normalizedAssets.join(', ')}, please provide the following information:\n\n`;
    
    Array.from(requiredFields).forEach(field => {
      prompt += `- ${field}\n`;
    });
    
    prompt += "\nFeel free to provide any additional details that might be helpful.";
    
    return prompt;
  }

  // Helper to add a system message (workflow status messages)
  private async addSystemMessage(threadId: string, content: string) {
    // System messages are specially tagged to help frontend filtering
    const formattedContent = `[System] ${content}`; // Add a prefix to make filtering easier
    return this.addMessage(threadId, formattedContent, false);
  }
  
  // Helper to add a workflow status message
  private async addWorkflowStatusMessage(threadId: string, content: string) {
    // Status messages are specially tagged for frontend filtering
    const formattedContent = `[Workflow Status] ${content}`; // Add a prefix to make filtering easier
    return this.addMessage(threadId, formattedContent, false);
  }

  // Handle user message when the message has already been created elsewhere
  async handleUserMessageNoCreate(threadId: string, content: string) {
    // This method skips message creation and just handles the workflow logic
    // It's used when the controller has already created the message

    // Get the active workflow for this thread
    let workflow = await this.workflowService.getWorkflowByThreadId(threadId);
    if (!workflow) {
      // If no workflow exists at all, something went wrong during thread creation
      // Create the base workflow as a fallback
      console.warn(`No workflow found for thread ${threadId}. Creating base workflow as fallback.`);
      const baseTemplate = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);
      if (!baseTemplate) throw new Error("Base workflow template not found");
      
      workflow = await this.workflowService.createWorkflow(threadId, baseTemplate.id);
    }

    // If we have an active workflow, process the current step
    const currentStepId = workflow.currentStepId;
    if (!currentStepId) {
      console.warn(`Workflow ${workflow.id} has no currentStepId. Attempting to get next prompt.`);
      return this.getNextPrompt(threadId, workflow.id);
    }

    // Get the current step before processing
    const currentStep = workflow.steps.find(step => step.id === currentStepId);
    
    // Special handling for pre-processing Launch Announcement workflow specific steps
    if (currentStep) {
      // Handle Asset Selection step - if user asks about available assets
      if (currentStep.name === "Asset Selection" && 
          (content.toLowerCase().includes("what") || 
           content.toLowerCase().includes("list") || 
           content.toLowerCase().includes("options") ||
           content.toLowerCase().includes("assets") ||
           content.toLowerCase().includes("available"))) {
        
        console.log("User is asking about available assets. Providing recommendations.");
        
        // Find the announcement type from the previous step
        const announcementTypeStep = workflow.steps.find(s => s.name === "Announcement Type Selection");
        if (announcementTypeStep) {
          const announcementType = announcementTypeStep.userInput || "Product Launch";
          
          // Generate asset recommendations for this announcement type
          const assetRecommendations = await this.generateAssetRecommendations(currentStep, announcementType);
          
          // Send the recommendations to the user
          await this.addMessage(threadId, assetRecommendations, false);
          
          // Don't process the step, just return the recommendations
          return assetRecommendations;
        }
      }
    }
    
    // Handle the step response using the current step ID
    const stepResponse = await this.workflowService.handleStepResponse(currentStepId, content);
    
    // Special handling for different step types
    if (currentStep) {
      // Special handling for Announcement Type Selection
      if (currentStep.name === "Announcement Type Selection") {
        // Add a plain message showing the selected announcement type
        const announcementTypeMsg = `Announcement type: ${content}`;
        await this.addWorkflowStatusMessage(threadId, announcementTypeMsg);
      }
      
      // Special handling for Asset Selection step - process assets and show them
      else if (currentStep.name === "Asset Selection" && stepResponse.nextStep?.name === "Asset Confirmation") {
        // If we're moving to Asset Confirmation, make sure the user sees the recommended assets
        const nextStep = workflow.steps.find(s => s.id === stepResponse.nextStep.id);
        if (nextStep && nextStep.aiSuggestion) {
          // Extract asset list from the aiSuggestion or create a default list
          const assetList = nextStep.aiSuggestion || "Press Release, Media Pitch, Social Post";
          const formattedAssets = "Recommended assets: " + assetList;
          
          // Add the asset list as a direct message
          await this.addMessage(threadId, formattedAssets, false);
        }
      }
      
      // Special handling for Asset Review - ensure user feedback triggers regeneration
      else if (currentStep.name === "Asset Review" && content.toLowerCase() !== "approved") {
        // User provided feedback on the asset - mark it for regeneration
        await this.workflowService.updateStep(currentStep.id, {
          metadata: { 
            ...currentStep.metadata,
            needsRegeneration: true,
            feedback: content
          }
        });
        
        // Add a message acknowledging the feedback
        await this.addSystemMessage(threadId, `Thank you for your feedback. I'll update the ${currentStep.metadata?.selectedAsset || "asset"} with your requested changes.`);
      }
    }
    
    // Add AI response to thread if provided by handleStepResponse
    if (stepResponse.response && stepResponse.response !== 'Workflow completed successfully.') { // Avoid duplicate completion message
      await this.addMessage(threadId, stepResponse.response, false);
    }

    // Rest of the method is identical to handleUserMessage
    if (stepResponse.isComplete) {
        // --- START: Workflow Transition Logic ---
        
        // Check if the completed workflow was the Base Workflow
        const baseTemplateFromDB = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);

        // Check if the completed workflow's template ID matches the base template ID from DB
        if (workflow.templateId === baseTemplateFromDB?.id) { // Compare IDs
            console.log('Base workflow completed. Checking for next workflow selection...');
            // Retrieve the completed Base Workflow details to find the selection
            const completedBaseWorkflow = await this.workflowService.getWorkflow(workflow.id); 
            const selectionStep = completedBaseWorkflow?.steps.find(s => s.name === "Workflow Selection");
            
            // First try to use aiSuggestion (the matched workflow option), then fall back to userInput
            const selectedWorkflowName = selectionStep?.aiSuggestion || selectionStep?.userInput;
            console.log(`Workflow selection - aiSuggestion: "${selectionStep?.aiSuggestion}", userInput: "${selectionStep?.userInput}", final selection: "${selectedWorkflowName}"`);

            if (selectedWorkflowName) {
                console.log(`User selected: ${selectedWorkflowName}`);
                
                // Log available templates for debugging
                const availableTemplates = await this.getAvailableTemplateNames();
                console.log(`Available templates: ${JSON.stringify(availableTemplates)}`);
                
                // Try to find the template with a case-insensitive, trimmed comparison
                let nextTemplate = null;
                
                // First try exact match
                nextTemplate = await this.workflowService.getTemplateByName(selectedWorkflowName);
                
                // If not found, try case-insensitive match
                if (!nextTemplate) {
                    for (const templateName of availableTemplates) {
                        if (templateName.toLowerCase().trim() === selectedWorkflowName.toLowerCase().trim()) {
                            console.log(`Found case-insensitive match: "${templateName}" for "${selectedWorkflowName}"`);
                            nextTemplate = await this.workflowService.getTemplateByName(templateName);
                            break;
                        }
                    }
                }
                
                // If still not found, try substring match
                if (!nextTemplate) {
                    for (const templateName of availableTemplates) {
                        if (templateName.toLowerCase().includes(selectedWorkflowName.toLowerCase()) || 
                            selectedWorkflowName.toLowerCase().includes(templateName.toLowerCase())) {
                            console.log(`Found substring match: "${templateName}" for "${selectedWorkflowName}"`);
                            nextTemplate = await this.workflowService.getTemplateByName(templateName);
                            break;
                        }
                    }
                }
                
                if (nextTemplate) {
                    console.log(`Found template for "${selectedWorkflowName}". Creating next workflow...`);
                    try {
                        // Create the *new* selected workflow
                        const nextWorkflow = await this.workflowService.createWorkflow(threadId, nextTemplate.id);
                        console.log(`Created workflow ${nextWorkflow.id} for template ${nextTemplate.name}`);
                        
                        // Add a message to show which workflow was selected - use plain text
                        const selectionMsg = `Workflow selected: ${selectedWorkflowName}`;
                        await this.addWorkflowStatusMessage(threadId, selectionMsg);
                        
                        // Get the *first prompt* of the NEW workflow
                        return this.getNextPrompt(threadId, nextWorkflow.id);
                    } catch (creationError) {
                        console.error(`Error creating workflow for ${selectedWorkflowName}:`, creationError);
                        const errorMsg = `Sorry, I couldn't start the ${selectedWorkflowName} workflow.`;
                        await this.addSystemMessage(threadId, errorMsg);
                        return errorMsg;
                    }
                } else {
                    console.warn(`Template not found for selection: ${selectedWorkflowName}`);
                    const availableTemplates = await this.getAvailableTemplateNames();
                    const notFoundMsg = `Sorry, I couldn't find a workflow template named "${selectedWorkflowName}". Available templates are: ${availableTemplates.join(', ')}`;
                    await this.addSystemMessage(threadId, notFoundMsg);
                    return notFoundMsg;
                }
            } else {
                console.warn('Could not determine next workflow from Base Workflow selection step.');
                // Fall through to generic completion message if selection wasn't found
            }
        }
        
        // If it wasn't the base workflow, or if base completed without valid selection, just confirm completion.
        const completionMsg = `${workflow.templateId || 'Workflow'} completed successfully.`; // Use template name if possible
        // Ensure completion message wasn't already added by handleStepResponse if its response was used
         const lastMessage = await this.getLastMessage(threadId);
         if (lastMessage?.content !== completionMsg) {
             await this.addWorkflowStatusMessage(threadId, completionMsg);
         }
        return completionMsg;

        // --- END: Workflow Transition Logic ---

    } else if (stepResponse.nextStep) {
      // If the workflow is not complete, but there's a specific next step prompt from handleStepResponse
       const nextPrompt = stepResponse.nextStep.prompt || "Please provide the required information.";
       
       // Get the next step information to check if it's already been sent
       const nextStepInfo = workflow.steps.find(step => step.id === stepResponse.nextStep?.id);
       
       // Check if the initial prompt has already been sent or if this is a duplicate we should avoid
       const isInitialPromptAlreadySent = nextStepInfo?.metadata?.initialPromptSent === true;
       
       // Skip adding the message if it's a duplicate announcement type prompt
       // or if the initial prompt has already been marked as sent
       if (isInitialPromptAlreadySent) {
         console.log(`Skipping duplicate prompt message - initialPromptSent flag is true`);
         return nextPrompt;
       }
       
       // For all other cases - Add the prompt message if it's not the same as the stepResponse message already added
       if (stepResponse.response !== nextPrompt) {
         // Update the next step to mark that we've sent this prompt
         if (nextStepInfo) {
           await this.workflowService.updateStep(nextStepInfo.id, {
             metadata: { 
               ...nextStepInfo.metadata,
               initialPromptSent: true 
             }
           });
         }
         
         await this.addMessage(threadId, nextPrompt, false);
       }
       return nextPrompt; 
    } else {
       // If the step isn't complete and handleStepResponse didn't provide a specific next step/prompt,
       // rely on getNextPrompt to figure out what to do (e.g., re-prompt for current step if needed)
       console.warn(`Step ${currentStepId} processed, workflow not complete, but handleStepResponse provided no next step. Calling getNextPrompt.`);
       return this.getNextPrompt(threadId, workflow.id);
    }
  }
} 