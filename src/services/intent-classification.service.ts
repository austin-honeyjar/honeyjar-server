import { OpenAIService } from './openai.service';
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

🎯 CRITICAL CONTEXT RULE:
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
}