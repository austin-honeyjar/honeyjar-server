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
    } catch (error) {
      console.error(`Error initializing base workflow for thread ${thread.id}:`, error);
      // Don't throw the error as we still want to return the thread
    }

    return thread;
  }

  async addMessage(threadId: string, content: string, isUser: boolean) {
    const [message] = await db
      .insert(chatMessages)
      .values({
        threadId,
        content,
        role: isUser ? "user" : "assistant",
        userId: "system", // This should be replaced with actual user ID in production
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
    await this.addMessage(threadId, content, true);

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
        await this.addMessage(threadId, announcementTypeMsg, false);
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
        await this.addMessage(threadId, `Thank you for your feedback. I'll update the ${currentStep.metadata?.selectedAsset || "asset"} with your requested changes.`, false);
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
                        await this.addMessage(threadId, selectionMsg, false);
                        
                        // Get the *first prompt* of the NEW workflow
                        return this.getNextPrompt(threadId, nextWorkflow.id);
                    } catch (creationError) {
                        console.error(`Error creating workflow for ${selectedWorkflowName}:`, creationError);
                        const errorMsg = `Sorry, I couldn't start the ${selectedWorkflowName} workflow.`;
                        await this.addMessage(threadId, errorMsg, false);
                        return errorMsg;
                    }
                } else {
                    console.warn(`Template not found for selection: ${selectedWorkflowName}`);
                    const availableTemplates = await this.getAvailableTemplateNames();
                    const notFoundMsg = `Sorry, I couldn't find a workflow template named "${selectedWorkflowName}". Available templates are: ${availableTemplates.join(', ')}`;
                    await this.addMessage(threadId, notFoundMsg, false);
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
             await this.addMessage(threadId, completionMsg, false);
         }
        return completionMsg;

        // --- END: Workflow Transition Logic ---

    } else if (stepResponse.nextStep) {
      // If the workflow is not complete, but there's a specific next step prompt from handleStepResponse
       const nextPrompt = stepResponse.nextStep.prompt || "Please provide the required information.";
       // Add the prompt message if it's not the same as the stepResponse message already added
        if (stepResponse.response !== nextPrompt) {
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
            await this.addMessage(threadId, workflowCompleteMsg, false);
           return workflowCompleteMsg;
       } else {
          const noStepsMsg = "No further steps available or dependencies not met.";
          await this.addMessage(threadId, noStepsMsg, false);
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
} 