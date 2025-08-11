import { OpenAIService } from './openai.service';
import { MessageContentHelper } from '../types/chat-message';
import { db } from '../db';
import { chatMessages } from '../db/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';

export interface UserIntent {
  category: 'conversational' | 'workflow_action' | 'workflow_management';
  action: 'answer_question' | 'start_workflow' | 'cancel_workflow' | 'continue_workflow' | 'general_conversation';
  workflowName?: string;
  confidence: number;
  reasoning: string;
  shouldExit?: boolean; // For canceling current workflow
}

export interface IntentContext {
  userMessage: string;
  conversationHistory: string[];
  currentWorkflow?: {
    name: string;
    currentStep: string;
    status: string;
  };
  userProfile?: {
    companyName?: string;
    industry?: string;
    role?: string;
  };
  availableWorkflows: string[];
}

export class IntentClassificationService {
  private openAIService: OpenAIService;
  private cache: Map<string, { intent: UserIntent; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 60 seconds cache for better performance
  private readonly SIMPLE_PATTERNS = new Map([
    // Exact workflow names (common for button clicks)
    ['press release', { category: 'workflow_action', action: 'start_workflow', workflowName: 'Press Release', confidence: 0.95 }],
    ['social post', { category: 'workflow_action', action: 'start_workflow', workflowName: 'Social Post', confidence: 0.95 }],
    ['blog article', { category: 'workflow_action', action: 'start_workflow', workflowName: 'Blog Article', confidence: 0.95 }],
    ['media pitch', { category: 'workflow_action', action: 'start_workflow', workflowName: 'Media Pitch', confidence: 0.95 }],
    ['media matching', { category: 'workflow_action', action: 'start_workflow', workflowName: 'Media Matching', confidence: 0.95 }],
    ['launch announcement', { category: 'workflow_action', action: 'start_workflow', workflowName: 'Launch Announcement', confidence: 0.95 }],
    ['faq', { category: 'workflow_action', action: 'start_workflow', workflowName: 'FAQ', confidence: 0.95 }],
    // Action phrases
    ['make a press release', { category: 'workflow_action', action: 'start_workflow', workflowName: 'Press Release', confidence: 0.95 }],
    ['create a press release', { category: 'workflow_action', action: 'start_workflow', workflowName: 'Press Release', confidence: 0.95 }],
    ['do a press release', { category: 'workflow_action', action: 'start_workflow', workflowName: 'Press Release', confidence: 0.95 }],
    ['make a social post', { category: 'workflow_action', action: 'start_workflow', workflowName: 'Social Post', confidence: 0.95 }],
    // Workflow management
    ['cancel', { category: 'workflow_management', action: 'cancel_workflow', workflowName: null, confidence: 0.9 }],
    ['exit', { category: 'workflow_management', action: 'cancel_workflow', workflowName: null, confidence: 0.9 }],
    ['stop', { category: 'workflow_management', action: 'cancel_workflow', workflowName: null, confidence: 0.9 }],
  ]);

  constructor() {
    this.openAIService = new OpenAIService();
  }

  /**
   * Classify user intent using AI instead of hardcoded rules
   */
  async classifyIntent(context: IntentContext): Promise<UserIntent> {
    // Create a more robust cache key to prevent collisions
    const sanitizedMessage = context.userMessage.replace(/[^a-zA-Z0-9\s]/g, ''); // Remove special chars that might cause issues
    const workflowContext = context.currentWorkflow ? `${context.currentWorkflow.name}_${context.currentWorkflow.currentStep}` : 'none';
    const historyDigest = context.conversationHistory.slice(-3).map(h => h.substring(0, 10)).join('|'); // Last 3 messages digest
    const cacheKey = `${sanitizedMessage}_${workflowContext}_${context.conversationHistory.length}_${historyDigest}`;
    
    // Debug logging for cache investigation
    logger.info('🔍 Intent classification cache check', {
      userMessage: `"${context.userMessage}"`,
      cacheKey: cacheKey.substring(0, 100),
      currentWorkflow: context.currentWorkflow?.name,
      historyLength: context.conversationHistory.length,
      cacheSize: this.cache.size
    });
    
    // TEMPORARILY DISABLE CACHE TO DEBUG THE ISSUE
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (false && cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.info('💾 Using cached intent classification', {
        userMessage: context.userMessage.substring(0, 50),
        cachedCategory: cached.intent.category,
        cachedReasoning: cached.intent.reasoning,
        cacheAge: `${Date.now() - cached.timestamp}ms`
      });
      return cached.intent;
    }

    // Check simple patterns first for instant response
    const lowerMessage = context.userMessage.toLowerCase().trim();
    
    // First check exact matches (even faster)
    if (this.SIMPLE_PATTERNS.has(lowerMessage)) {
      const intentTemplate = this.SIMPLE_PATTERNS.get(lowerMessage)!;
      const intent: UserIntent = {
        ...intentTemplate as any,
        reasoning: `Exact pattern match for "${lowerMessage}"`
      };
      
      // Cache disabled - context is too important for intent classification  
      // this.cache.set(cacheKey, { intent, timestamp: Date.now() });
      
      logger.info('⚡ INSTANT exact match for intent classification', {
        pattern: lowerMessage,
        category: intent.category,
        confidence: intent.confidence,
        duration: '<5ms'
      });
      
      return intent;
    }
    
    // Then check partial matches
    for (const [pattern, intentTemplate] of this.SIMPLE_PATTERNS) {
      if (lowerMessage.includes(pattern)) {
        const intent: UserIntent = {
          ...intentTemplate as any,
          reasoning: `Simple pattern match for "${pattern}"`
        };
        
              // Cache disabled - context is too important for intent classification
      // this.cache.set(cacheKey, { intent, timestamp: Date.now() });
        
        logger.info('⚡ Fast pattern match for intent classification', {
          pattern,
          category: intent.category,
          confidence: intent.confidence,
          duration: '<10ms'
        });
        
        return intent;
      }
    }
    
    try {
      const startTime = Date.now();
      logger.info('🧠 Classifying user intent with AI', {
        userMessage: context.userMessage.substring(0, 100),
        hasCurrentWorkflow: !!context.currentWorkflow,
        historyLength: context.conversationHistory.length
      });

      const systemPrompt = this.buildIntentClassificationPrompt(context);
      
      const response = await this.openAIService.generateResponse(
        systemPrompt,
        context.userMessage,
        {
          model: 'gpt-4o-mini', // Fastest model for classification
          temperature: 0.0, // Zero temperature for deterministic JSON output
          max_tokens: 150, // Reduced - we only need small JSON response
          frequency_penalty: 0, // No penalties for faster response
          presence_penalty: 0
        }
      );

      const intent = this.parseIntentResponse(response);
      const duration = Date.now() - startTime;
      
      // Cache disabled - context is too important for intent classification
      // this.cache.set(cacheKey, {
      //   intent,
      //   timestamp: Date.now()
      // });
      
      // Clean old cache entries periodically
      if (this.cache.size > 100) {
        const cutoff = Date.now() - this.CACHE_TTL;
        for (const [key, value] of this.cache.entries()) {
          if (value.timestamp < cutoff) {
            this.cache.delete(key);
          }
        }
      }
      
      logger.info('✅ Intent classified', {
        category: intent.category,
        action: intent.action,
        workflowName: intent.workflowName,
        confidence: intent.confidence,
        duration: `${duration}ms`,
        cached: false
      });

      return intent;

    } catch (error) {
      logger.error('❌ Intent classification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userMessage: context.userMessage.substring(0, 50)
      });

      // Fallback to conversational intent on error
      return {
        category: 'conversational',
        action: 'general_conversation',
        confidence: 0.5,
        reasoning: 'Fallback due to classification error'
      };
    }
  }

  private buildIntentClassificationPrompt(context: IntentContext): string {
    const currentWorkflowContext = context.currentWorkflow 
      ? `Current workflow: ${context.currentWorkflow.name}
   Step: ${context.currentWorkflow.currentStep}
   Status: ${context.currentWorkflow.status}`
      : 'No active workflow';

    const recentHistory = context.conversationHistory
      .slice(-3)
      .map((msg, i) => `${i + 1}. ${msg}`)
      .join('\n');

    return `You are an intent classification system for a PR workflow platform. 

CRITICAL CONTEXT RULE:
${context.currentWorkflow?.name ? 
  `User is CURRENTLY IN "${context.currentWorkflow.name}" workflow. 
  If they say "make [something]" related to the SAME workflow type, classify as continue_workflow.
  Only classify as start_workflow if they want a DIFFERENT workflow type.` 
  : 
  'User is NOT in any workflow. Action requests should be start_workflow.'
}

CURRENT STATE:
${currentWorkflowContext}
User: ${context.userProfile?.companyName || 'Unknown'} (${context.userProfile?.industry || 'Unknown industry'})

RECENT CONVERSATION:
${recentHistory || 'No recent conversation'}

AVAILABLE WORKFLOWS:
${context.availableWorkflows.map(w => `• ${w}`).join('\n')}

CLASSIFICATION RULES:

1. CONVERSATIONAL INTENT:
   - Questions about what the system can do
   - Requests for explanations or descriptions
   - General questions about PR, workflows, or features
   - Casual conversation (greetings, "how are you", etc.)
   - Users saying they don't know something

2. WORKFLOW_ACTION INTENT:
   **ONLY when NO active workflow or user explicitly requests a DIFFERENT workflow:**
   - Clear requests to create/start a NEW workflow when not in any workflow
   - Examples when NOT in a workflow: "make a press release", "create a blog post"
   - Examples when switching: "actually, I want to do a social post instead"

3. WORKFLOW_MANAGEMENT INTENT:
   **CRITICAL: When user is ALREADY in a workflow, prioritize continue_workflow:**
   - Continue current workflow: "make one on my company", "create it", "generate it", "do it"
     → If user says "make a blog article" while IN Blog Article workflow = continue_workflow
     → If user says "make a press release" while IN Blog Article workflow = start_workflow (different)
   - Cancel/exit current workflow: "cancel", "stop", "exit", "start over"
   - Switch workflows: "actually, I want to do X instead" (where X ≠ current workflow)
   - Navigate workflow steps: "go back", "next step"  
   - Workflow information requests: "what are the steps?", "how does this workflow work?"
   - Interface/visibility questions: "i don't see it", "where is X?", "can you show me?"

IMPORTANT:
1. Consider the current step's goal when classifying user input
2. Always check conversation history for previous workflow requests
3. When user says "not X" after previously requesting Y, they want Y, not X
4. Track user's actual intent across multiple messages
5. CRITICAL: Words like "instead", "actually", "rather", or "change to" indicate workflow switching (cancel_workflow)
6. If user is in Workflow A but mentions creating Workflow B, that's always workflow_management with cancel_workflow
7. CRITICAL: If user asks about "steps", "workflow", "process" while in an active workflow, use workflow_management with continue_workflow
8. Use conversation history to understand context - if user previously asked about X and now says "no, Y", they want Y

RESPONSE FORMAT:
YOU MUST RESPOND WITH VALID JSON ONLY. NO TEXT BEFORE OR AFTER JSON.

REQUIRED JSON STRUCTURE (all fields must be present):
{
  "category": "conversational|workflow_action|workflow_management",
  "action": "answer_question|start_workflow|cancel_workflow|continue_workflow|general_conversation",
  "workflowName": "exact workflow name OR null if not applicable",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of classification",
  "shouldExit": false
}

FIELD REQUIREMENTS:
- category: REQUIRED - must be one of the three values
- action: REQUIRED - must match the category
- workflowName: REQUIRED - use exact name from available workflows OR null
- confidence: REQUIRED - number between 0.0 and 1.0
- reasoning: REQUIRED - explain your decision
- shouldExit: REQUIRED - boolean, default false

EXAMPLES:

Input: "can you describe a social post"
Output: {"category": "conversational", "action": "answer_question", "workflowName": null, "confidence": 0.9, "reasoning": "User asking for information, not requesting creation", "shouldExit": false}

Input: "make a press release" (when NOT in any workflow)
Output: {"category": "workflow_action", "action": "start_workflow", "workflowName": "Press Release", "confidence": 0.95, "reasoning": "Clear creation request with action verb", "shouldExit": false}

Input: "make one on my company" (when IN Blog Article workflow)
Output: {"category": "workflow_management", "action": "continue_workflow", "workflowName": "Blog Article", "confidence": 0.95, "reasoning": "User wants to continue current Blog Article workflow with company context", "shouldExit": false}

Input: "actually do a social post" (when already in a workflow)
Output: {"category": "workflow_management", "action": "cancel_workflow", "workflowName": "Social Post", "confidence": 0.9, "reasoning": "User changing their mind, wants different workflow", "shouldExit": false}

Input: "do a social post instead" (when already in a workflow)
Output: {"category": "workflow_management", "action": "cancel_workflow", "workflowName": "Social Post", "confidence": 0.95, "reasoning": "User explicitly wants to switch workflows using 'instead'", "shouldExit": false}

Input: "i mean not a launch" (after conversation including "actually do a social post" and "no a launch, a social post")
Output: {"category": "workflow_management", "action": "cancel_workflow", "workflowName": "Social Post", "confidence": 0.85, "reasoning": "User clarifying they don't want launch - referencing previous social post requests in conversation history", "shouldExit": false}

Input: "cancel this and do a blog post instead"
Output: {"category": "workflow_management", "action": "cancel_workflow", "workflowName": "Blog Article", "confidence": 0.9, "reasoning": "User wants to cancel current and start new workflow", "shouldExit": true}

Input: "cancel this workflow" (when user wants to exit without specifying new workflow)
Output: {"category": "workflow_management", "action": "cancel_workflow", "workflowName": null, "confidence": 0.95, "reasoning": "User wants to cancel current workflow without specifying a replacement", "shouldExit": true}

Input: "exit workflow" (when user wants to exit current workflow)
Output: {"category": "workflow_management", "action": "cancel_workflow", "workflowName": null, "confidence": 0.95, "reasoning": "User wants to exit the current workflow", "shouldExit": true}

Input: "what are the steps of the workflow?" (when in a workflow)
Output: {"category": "workflow_management", "action": "continue_workflow", "workflowName": null, "confidence": 0.9, "reasoning": "User asking about current workflow process", "shouldExit": false}

Input: "what were the steps to the press release workflow?"
Output: {"category": "workflow_management", "action": "continue_workflow", "workflowName": null, "confidence": 0.9, "reasoning": "User asking about workflow steps information", "shouldExit": false}

Input: "give a paragraph version of what i can do?" (in Workflow Selection step)
Output: {"category": "workflow_management", "action": "continue_workflow", "workflowName": null, "confidence": 0.85, "reasoning": "User asking for clarification on available options in current step", "shouldExit": false}

Input: "i dont see it" (after system showed options)
Output: {"category": "conversational", "action": "answer_question", "workflowName": null, "confidence": 0.8, "reasoning": "User needs clarification on interface or visibility", "shouldExit": false}

Input: "no the steps to a social post?" (after being asked about social posts)
Output: {"category": "workflow_management", "action": "continue_workflow", "workflowName": null, "confidence": 0.95, "reasoning": "User clarifying they want workflow steps, referencing conversation history", "shouldExit": false}

CRITICAL: Before responding, review the conversation history above for any previous workflow requests. If user says "not X" or "cancel this", check what they asked for earlier and use that as the workflowName.

REMEMBER: Your response must be ONLY the JSON object. No explanations, no markdown, no extra text.

Classify the user's message:`;
  }

  private parseIntentResponse(response: string): UserIntent {
    try {
      // Clean response of markdown or extra text
      let cleaned = response.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleaned);

      // Validate ALL required fields strictly
      const requiredFields = ['category', 'action', 'confidence', 'reasoning'];
      const missingFields = requiredFields.filter(field => !parsed.hasOwnProperty(field) || parsed[field] === undefined);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Validate field types and values
      if (typeof parsed.category !== 'string' || !['conversational', 'workflow_action', 'workflow_management'].includes(parsed.category)) {
        throw new Error(`Invalid category: ${parsed.category}`);
      }

      if (typeof parsed.action !== 'string') {
        throw new Error(`Invalid action type: ${typeof parsed.action}`);
      }

      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
        throw new Error(`Invalid confidence: ${parsed.confidence} (must be number 0.0-1.0)`);
      }

      if (typeof parsed.reasoning !== 'string' || parsed.reasoning.length === 0) {
        throw new Error(`Invalid reasoning: must be non-empty string`);
      }

      // workflowName can be null or string
      if (parsed.workflowName !== null && typeof parsed.workflowName !== 'string') {
        throw new Error(`Invalid workflowName: must be string or null`);
      }

      // shouldExit defaults to false if not provided
      const shouldExit = typeof parsed.shouldExit === 'boolean' ? parsed.shouldExit : false;

      return {
        category: parsed.category,
        action: parsed.action,
        workflowName: parsed.workflowName,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        shouldExit
      };

    } catch (error) {
      logger.error('❌ Intent classification JSON parsing failed', {
        rawResponse: response,
        responseLength: response.length,
        responsePreview: response.substring(0, 300),
        parseError: error instanceof Error ? error.message : 'Unknown error',
        isValidJSON: (() => {
          try { JSON.parse(response.trim()); return true; } catch { return false; }
        })()
      });

      // Return safe fallback
      return {
        category: 'conversational',
        action: 'general_conversation',
        confidence: 0.3,
        reasoning: 'Failed to parse AI response, defaulting to conversational'
      };
    }
  }

  /**
   * Get available workflows for context
   */
  getAvailableWorkflows(): string[] {
    return [
      'Press Release',
      'Blog Article',
      'Social Post',
      'Media Pitch',
      'Media List Generator',
      'Launch Announcement',
      'FAQ'
    ];
  }

  /**
   * Generate intelligent conversational response for conversational intents
   */
  async generateConversationalResponse(
    context: IntentContext,
    userMessage: string
  ): Promise<string> {
    try {
      logger.info('INTENT SERVICE: Generating conversational response', {
        userMessage: userMessage.substring(0, 50) + '...',
        hasHistory: context.conversationHistory.length > 0,
        hasCurrentWorkflow: !!context.currentWorkflow
      });

      const systemPrompt = this.buildConversationalPrompt(context);

      const response = await this.openAIService.generateResponse(
        systemPrompt,
        userMessage,
        {
          temperature: 0.7,
          max_tokens: 500,
          model: 'gpt-4o-mini'
        }
      );

      logger.info('INTENT SERVICE: Conversational response generated', {
        responseLength: response.length,
        userMessage: userMessage.substring(0, 30) + '...'
      });

      return response;
    } catch (error) {
      logger.error('INTENT SERVICE: Failed to generate conversational response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userMessage: userMessage.substring(0, 50) + '...'
      });
      
      // Fallback response
      return `I'd be happy to help! I can assist you with creating PR and communications content. Would you like me to help you create a specific type of content like a press release, media pitch, or social post?`;
    }
  }

  /**
   * Build conversational prompt with context
   */
  private buildConversationalPrompt(context: IntentContext): string {
    const availableWorkflows = this.getAvailableWorkflows();
    
    let prompt = `You are a helpful AI assistant for a PR and communications platform. The user is asking a question in conversational mode (no active workflow).

Your goals:
1. Answer their specific question helpfully and accurately
2. Provide context-aware responses based on recent conversation
3. Suggest relevant workflows when appropriate
4. Be friendly and professional

Available workflows you can suggest:
${availableWorkflows.map(workflow => `- **${workflow}** - ${this.getWorkflowDescription(workflow)}`).join('\n')}
`;

    // Add conversation history if available
    if (context.conversationHistory.length > 0) {
      prompt += `\nRecent conversation context:\n${context.conversationHistory.slice(-5).join('\n')}\n`;
    }

    // Add user profile context if available
    if (context.userProfile) {
      prompt += `\nUser context:\n`;
      if (context.userProfile.companyName) prompt += `Company: ${context.userProfile.companyName}\n`;
      if (context.userProfile.industry) prompt += `Industry: ${context.userProfile.industry}\n`;
      if (context.userProfile.role) prompt += `Role: ${context.userProfile.role}\n`;
    }

    prompt += `\nCurrent user question: ${context.userMessage}

Provide a helpful, contextual response. If the user is asking about a specific type of content, explain what it is and offer to help them create one.`;

    return prompt;
  }

  /**
   * Get description for a workflow type
   */
  private getWorkflowDescription(workflowName: string): string {
    const descriptions = {
      'Media Matching': 'Prioritized media contact lists based on topic relevance',
      'Press Release': 'Professional press releases for announcements',
      'Media Pitch': 'Compelling pitches to journalists and media outlets',
      'Social Post': 'Engaging social media content',
      'Blog Article': 'Thought leadership and informational articles',
      'FAQ': 'Comprehensive frequently asked questions',
      'Launch Announcement': 'Product or service launch communications',
      'Media List Generator': 'Targeted media contact lists'
    };
    
    return descriptions[workflowName as keyof typeof descriptions] || 'Custom workflow content';
  }

  /**
   * Handle workflow action intent by creating and starting a workflow
   */
  async handleWorkflowActionIntent(
    intent: UserIntent,
    threadId: string,
    userInput: string,
    workflowService: any, // EnhancedWorkflowService
    userId?: string,
    orgId?: string
  ): Promise<AsyncGenerator<{
    type: 'ai_response' | 'done';
    data: any;
  }>> {
    
    async function* workflowActionGenerator() {
      try {
        logger.info('INTENT SERVICE: Handling workflow action intent', {
          workflowName: intent.workflowName,
          threadId: threadId.substring(0, 8),
          userInput: userInput.substring(0, 50)
        });

        if (!intent.workflowName) {
          yield {
            type: 'ai_response',
            data: {
              content: "I'd be happy to help you create content! Could you specify what type of content you'd like to create?",
              isComplete: true
            }
          };
          yield { type: 'done', data: { completed: true } };
          return;
        }

        // Get template ID for the workflow
        const templateId = workflowService.getTemplateIdForWorkflow(intent.workflowName);
        if (!templateId) {
          yield {
            type: 'ai_response',
            data: {
              content: `I'm sorry, I couldn't find the ${intent.workflowName} workflow. Please try a different workflow type.`,
              isComplete: true
            }
          };
          yield { type: 'done', data: { completed: true } };
          return;
        }

        // Create the workflow
        const newWorkflow = await workflowService.createWorkflow(threadId, templateId, false);
        
        // Get the first step
        const firstStep = await workflowService.getCurrentStepSafely(newWorkflow);
        
        if (firstStep) {
          logger.info('INTENT SERVICE: Created workflow and starting first step', {
            workflowId: newWorkflow.id.substring(0, 8),
            firstStepId: firstStep.id.substring(0, 8),
            stepName: firstStep.name
          });

          // Process the first step with the user input
          let accumulatedContent = '';
          for await (const event of workflowService.handleStepResponseStreamWithContext(
            firstStep.id, 
            userInput, 
            userId || 'system', 
            orgId || '',
            { intent }
          )) {
            if (event.type === 'content') {
              yield {
                type: 'ai_response',
                data: {
                  content: event.data.content,
                  isComplete: event.data.isComplete || false,
                  accumulated: accumulatedContent + (event.data.content || '')
                }
              };
              if (event.data.content) {
                accumulatedContent += event.data.content;
              }
            }
          }
        } else {
          yield {
            type: 'ai_response',
            data: {
              content: `I've created the ${intent.workflowName} workflow, but there was an issue getting started. Please try again.`,
              isComplete: true
            }
          };
        }

        yield { type: 'done', data: { completed: true } };

      } catch (error) {
        logger.error('INTENT SERVICE: Failed to handle workflow action', {
          error: error instanceof Error ? error.message : 'Unknown error',
          workflowName: intent.workflowName,
          threadId: threadId.substring(0, 8)
        });
        
        yield {
          type: 'ai_response',
          data: {
            content: `I encountered an error creating the ${intent.workflowName}. Please try again.`,
            isComplete: true
          }
        };
        yield { type: 'done', data: { completed: true } };
      }
    }

    return workflowActionGenerator();
  }

  /**
   * Handle workflow management intent (cancel, continue, etc.)
   */
  async handleWorkflowManagementIntent(
    intent: UserIntent,
    threadId: string,
    userInput: string,
    workflowService: any, // EnhancedWorkflowService
    userId?: string,
    orgId?: string
  ): Promise<AsyncGenerator<{
    type: 'ai_response' | 'done';
    data: any;
  }>> {

    async function* workflowManagementGenerator() {
      try {
        logger.info('INTENT SERVICE: Handling workflow management intent', {
          action: intent.action,
          workflowName: intent.workflowName,
          shouldExit: intent.shouldExit,
          threadId: threadId.substring(0, 8)
        });

        if (intent.action === 'cancel_workflow') {
          // Get current workflow to provide context
          const currentWorkflow = await workflowService.getWorkflowByThreadId(threadId);
          const currentWorkflowName = currentWorkflow ? 
            workflowService.getWorkflowDisplayName(currentWorkflow.templateId) : 'workflow';

          if (intent.shouldExit || !intent.workflowName) {
            // Complete exit from workflow
            if (currentWorkflow) {
              await workflowService.updateWorkflowStatus(currentWorkflow.id, 'completed');
            }

            yield {
              type: 'ai_response',
              data: {
                content: `I've exited the ${currentWorkflowName}. What would you like to do next?`,
                isComplete: true
              }
            };
          } else if (intent.workflowName) {
            // Switch to different workflow
            if (currentWorkflow) {
              await workflowService.updateWorkflowStatus(currentWorkflow.id, 'completed');
            }

            yield {
              type: 'ai_response',
              data: {
                content: `I've exited the ${currentWorkflowName}. Let me start the ${intent.workflowName} for you.`,
                isComplete: true
              }
            };

            // Create the new workflow
            const workflowActionGenerator = await this.handleWorkflowActionIntent(
              {
                ...intent,
                category: 'workflow_action',
                action: 'start_workflow'
              },
              threadId,
              userInput,
              workflowService,
              userId,
              orgId
            );

            for await (const event of workflowActionGenerator) {
              yield event;
            }
            return;
          }
        } else if (intent.action === 'continue_workflow') {
          // This should be handled by the workflow service itself
          yield {
            type: 'ai_response',
            data: {
              content: "I'll help you continue with your current workflow...",
              isComplete: true
            }
          };
        }

        yield { type: 'done', data: { completed: true } };

      } catch (error) {
        logger.error('INTENT SERVICE: Failed to handle workflow management', {
          error: error instanceof Error ? error.message : 'Unknown error',
          action: intent.action,
          threadId: threadId.substring(0, 8)
        });

        yield {
          type: 'ai_response',
          data: {
            content: "I encountered an issue with the workflow management. Please try again.",
            isComplete: true
          }
        };
        yield { type: 'done', data: { completed: true } };
      }
    }

    return workflowManagementGenerator();
  }

  /**
   * Main intent handler - routes to appropriate intent handler based on category
   */
  async handleIntent(
    intent: UserIntent,
    threadId: string,
    userInput: string,
    workflowService: any, // EnhancedWorkflowService
    userId?: string,
    orgId?: string
  ): Promise<AsyncGenerator<{
    type: 'ai_response' | 'done';
    data: any;
  }>> {

    logger.info('INTENT SERVICE: Routing intent to appropriate handler', {
      category: intent.category,
      action: intent.action,
      workflowName: intent.workflowName,
      threadId: threadId.substring(0, 8)
    });

    switch (intent.category) {
      case 'workflow_action':
        return await this.handleWorkflowActionIntent(
          intent, threadId, userInput, workflowService, userId, orgId
        );
      
      case 'workflow_management':
        return await this.handleWorkflowManagementIntent(
          intent, threadId, userInput, workflowService, userId, orgId
        );
      
      case 'conversational':
        return await this.handleConversationalIntent(
          intent, threadId, userInput, workflowService, userId, orgId
        );
      
      default:
        // Fallback to conversational
        return await this.handleConversationalIntent(
          intent, threadId, userInput, workflowService, userId, orgId
        );
    }
  }

  /**
   * Handle conversational intent 
   */
  async handleConversationalIntent(
    intent: UserIntent,
    threadId: string,
    userInput: string,
    workflowService: any, // EnhancedWorkflowService
    userId?: string,
    orgId?: string
  ): Promise<AsyncGenerator<{
    type: 'ai_response' | 'done';
    data: any;
  }>> {

    const self = this; // Capture 'this' context for inner function
    async function* conversationalGenerator() {
      try {
        logger.info('INTENT SERVICE: Handling conversational intent', {
          action: intent.action,
          threadId: threadId.substring(0, 8),
          userInput: userInput.substring(0, 50)
        });

        // Get recent conversation context for intelligent responses
        const recentMessages = await db.query.chatMessages.findMany({
          where: eq(chatMessages.threadId, threadId),
          orderBy: (messages, { desc }) => [desc(messages.createdAt)],
          limit: 10
        });

        // Build conversation context for intent service
        const conversationHistory = recentMessages
          .reverse()
          .map(msg => {
            let text: string;
            if (typeof msg.content === 'string') {
              text = msg.content;
            } else if (msg.content && typeof msg.content === 'object') {
              text = MessageContentHelper.getText(msg.content as any);
            } else {
              text = String(msg.content);
            }
            return `${msg.role}: ${text}`;
          })
          .slice(-5); // Keep only last 5 messages

        // Create intent context
        const intentContext = {
          userMessage: userInput,
          conversationHistory,
          availableWorkflows: self.getAvailableWorkflows()
        };

        // Generate intelligent response using streaming chunks
        const systemPrompt = self.buildConversationalPrompt(intentContext);
        let accumulatedResponse = '';
        
        // Stream the AI response in word chunks (more efficient than character-by-character)
        for await (const chunk of self.openAIService.generateStreamingResponse(
          systemPrompt,
          userInput,
          {
            temperature: 0.7,
            max_tokens: 500,
            model: 'gpt-4o-mini'
          }
        )) {
          accumulatedResponse += chunk;
          
          // Send chunks (words/phrases) to frontend for progressive display
          yield {
            type: 'ai_response' as const,
            data: {
              content: chunk,
              isComplete: false,
              accumulated: accumulatedResponse
            }
          };
        }
        
        // Final chunk to mark completion
        yield {
          type: 'ai_response' as const,
          data: {
            content: '',
            isComplete: true,
            accumulated: accumulatedResponse
          }
        };

        // Save the response to the database using unified structured messaging
        await workflowService.addTextMessage(threadId, accumulatedResponse);

        logger.info('INTENT SERVICE: Conversational response completed', {
          threadId: threadId.substring(0, 8),
          responseLength: accumulatedResponse.length,
          hasContext: conversationHistory.length > 0
        });
        
        yield {
          type: 'done' as const,
          data: { completed: true }
        };

      } catch (error) {
        logger.error('INTENT SERVICE: Failed to handle conversational intent', {
          error: error instanceof Error ? error.message : 'Unknown error',
          threadId: threadId.substring(0, 8)
        });
        
        yield {
          type: 'ai_response' as const,
          data: {
            content: "I'd be happy to help! I can assist you with creating PR and communications content. Would you like me to help you create a specific type of content like a press release, media pitch, or social post?",
            isComplete: true
          }
        };
        yield { type: 'done' as const, data: { completed: true } };
      }
    }

    return conversationalGenerator();
  }
}