import OpenAI from 'openai';
import { WorkflowStep } from '../types/workflow';
import logger from '../utils/logger';

export class OpenAIService {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = process.env.OPENAI_MODEL || 'gpt-4o';
  }

  /**
   * Generate a response based on the workflow step and user input
   * @param step The current workflow step
   * @param userInput The user's input for this step
   * @param previousResponses Array of previous step responses for context
   * @returns An object containing the response text and data for tracking
   */
  async generateStepResponse(
    step: WorkflowStep,
    userInput: string,
    previousResponses: { stepName: string; response: string }[] = []
  ): Promise<{ 
    responseText: string;
    promptData: string;
    rawResponse: string;
  }> {
    try {
      logger.info('Generating OpenAI response', {
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        userInputLength: userInput.length,
        previousResponsesCount: previousResponses.length
      });

      // Construct the system message based on step metadata and context
      const systemMessage = this.constructSystemMessage(step, previousResponses);
      logger.debug('System message constructed', {
        stepId: step.id,
        systemMessageLength: systemMessage.length
      });

      // Create the messages array for the chat completion
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemMessage }
      ];

      // Add previous responses as context if available
      if (previousResponses.length > 0) {
        logger.debug('Adding previous responses as context', {
          stepId: step.id,
          contextCount: previousResponses.length
        });
        const contextMessages = previousResponses.map(response => ({
          role: 'assistant' as const,
          content: `Previous step (${response.stepName}): ${response.response}`
        }));
        messages.push(...contextMessages);
      }

      // Add the current step's prompt and user input
      messages.push(
        { role: 'assistant', content: step.prompt || 'Please provide the required information.' },
        { role: 'user', content: userInput }
      );

      logger.debug('Sending request to OpenAI', {
        stepId: step.id,
        model: this.model,
        messageCount: messages.length
      });

      // Store the complete prompt for tracking
      const promptData = JSON.stringify({
        messages,
        model: this.model,
        settings: {
          userInput,
          stepId: step.id,
          stepName: step.name,
          stepType: step.stepType
        }
      }, null, 2);

      // Determine if we should limit the response length
      const isChatStep = step.stepType === 'user_input' || step.stepType === 'ai_suggestion';
      const isAssetGenerationStep = step.name === 'Asset Generation';
      const isJsonDialogStep = step.stepType === 'json_dialog';
      
      // Higher token limit for asset generation and JSON dialog, moderate for other non-chat steps, low for chat
      const maxTokens = isAssetGenerationStep ? 4000 : 
                     isJsonDialogStep ? 4000 : 
                     isChatStep ? 100 : 2000;
      const presencePenalty = isChatStep ? 0.5 : 0;
      const frequencyPenalty = isChatStep ? 0.5 : 0;

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
        presence_penalty: presencePenalty,
        frequency_penalty: frequencyPenalty,
      });

      // Store the raw OpenAI response for tracking
      const rawResponse = JSON.stringify(completion, null, 2);

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        logger.error('No response generated from OpenAI', {
          stepId: step.id,
          completion: completion
        });
        throw new Error('No response generated from OpenAI');
      }

      // Only limit response length for chat steps
      let finalResponse = response;
      if (isChatStep) {
        const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
        finalResponse = sentences.slice(0, 2).join('. ').trim() + '.';
      }
      // Don't truncate asset generation responses regardless of length
      else if (step.name === 'Asset Generation') {
        finalResponse = response;
      }

      logger.info('Generated OpenAI response', {
        stepId: step.id,
        stepName: step.name,
        model: this.model,
        responseLength: finalResponse.length,
        usage: completion.usage,
        isChatStep
      });

      return {
        responseText: finalResponse,
        promptData,
        rawResponse
      };
    } catch (error) {
      logger.error('Error generating OpenAI response:', {
        stepId: step.id,
        stepName: step.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Construct a system message based on the step's metadata and context
   */
  private constructSystemMessage(
    step: WorkflowStep,
    previousResponses: { stepName: string; response: string }[]
  ): string {
    logger.debug('Constructing system message', {
      stepId: step.id,
      stepName: step.name,
      hasMetadata: !!step.metadata,
      hasPrompt: !!step.prompt,
      previousResponsesCount: previousResponses.length
    });

    let systemMessage = `You are a PR assistant helping with ${step.name}.\n\n`;
    
    // Add step description
    if (step.description) {
      systemMessage += `Task: ${step.description}\n\n`;
    }

    // Add step prompt as context
    if (step.prompt) {
      systemMessage += `Current prompt: ${step.prompt}\n\n`;
    }

    // Add metadata as context
    if (step.metadata) {
      logger.debug('Adding metadata to system message', {
        stepId: step.id,
        metadataKeys: Object.keys(step.metadata)
      });
      systemMessage += 'Available options:\n';
      Object.entries(step.metadata).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          systemMessage += `${key}: ${value.join(', ')}\n`;
        } else {
          systemMessage += `${key}: ${value}\n`;
        }
      });
      systemMessage += '\n';
    }

    // Add previous responses as context
    if (previousResponses.length > 0) {
      logger.debug('Adding previous responses to system message', {
        stepId: step.id,
        responseCount: previousResponses.length
      });
      systemMessage += 'Previous context:\n';
      previousResponses.forEach(response => {
        systemMessage += `- ${response.stepName}: ${response.response}\n`;
      });
      systemMessage += '\n';
    }

    // Add response guidelines based on step type
    const isChatStep = step.stepType === 'user_input' || step.stepType === 'ai_suggestion';
    if (isChatStep) {
      systemMessage += `Guidelines for your response:
1. Be professional and concise
2. Limit your response to 1-2 sentences
3. Focus on the specific task at hand
4. If suggesting options, be brief and clear
5. If asking for clarification, be specific but concise`;
    } else {
      systemMessage += `Guidelines for your response:
1. Be professional and thorough
2. Provide detailed and comprehensive responses
3. Include all necessary information
4. Format the response appropriately for the task
5. Ensure the response is complete and actionable`;
    }

    logger.debug('System message constructed', {
      stepId: step.id,
      messageLength: systemMessage.length,
      isChatStep
    });

    return systemMessage;
  }

  /**
   * Generate an edited version of text based on instruction with enhanced context
   * Used specifically for asset text editing
   */
  async generateEditedText(
    originalText: string,
    instruction: string,
    context?: {
      fullContent?: string;
      assetType?: string;
      assetTitle?: string;
      surroundingContext?: string;
    }
  ): Promise<string> {
    try {
      logger.info('Generating edited text with OpenAI', {
        originalTextLength: originalText.length,
        instructionLength: instruction.length,
        hasFullContent: !!context?.fullContent,
        hasAssetType: !!context?.assetType
      });

      // Build enhanced prompt with context
      let prompt = `You are an expert editor working on ${context?.assetType || 'a document'}${context?.assetTitle ? ` titled "${context.assetTitle}"` : ''}.

Below is a portion of text that needs to be edited:

SELECTED TEXT TO EDIT:
"""
${originalText}
"""`;

      // Add surrounding context if available
      if (context?.surroundingContext) {
        prompt += `

SURROUNDING CONTEXT (for reference only - do not edit this):
"""
${context.surroundingContext}
"""`;
      }

      // Add asset type specific guidance
      if (context?.assetType) {
        const assetType = context.assetType.toLowerCase();
        if (assetType.includes('press release')) {
          prompt += `

This is a press release. Ensure the edited text maintains professional tone, clear messaging, and follows press release conventions.`;
        } else if (assetType.includes('media pitch')) {
          prompt += `

This is a media pitch. Ensure the edited text is compelling, newsworthy, and maintains a persuasive tone appropriate for journalists.`;
        } else if (assetType.includes('social')) {
          prompt += `

This is social media content. Ensure the edited text is engaging, concise, and appropriate for social media platforms.`;
        } else if (assetType.includes('blog')) {
          prompt += `

This is blog content. Ensure the edited text maintains an engaging, informative tone appropriate for blog readers.`;
        }
      }

      prompt += `

EDITING INSTRUCTIONS:
${instruction}

IMPORTANT GUIDELINES:
- Only edit the SELECTED TEXT portion above
- Maintain the original meaning and intent unless specifically instructed otherwise
- Ensure the edited text flows naturally with the surrounding context
- Preserve any important formatting, names, dates, or specific details unless instructed to change them
- If the instruction is unclear or would result in poor quality, make minimal conservative improvements
- Return ONLY the edited version of the selected text, with no additional comments or explanations

EDITED TEXT:`;

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { 
          role: 'system', 
          content: 'You are an expert editor who follows instructions precisely while maintaining quality and context. You understand different content types and their requirements. Provide only the edited version of the specified text.' 
        },
        { role: 'user', content: prompt }
      ];

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.3, // Lower temperature for more precise edits
        max_tokens: 4000, // Increased token limit for better handling of longer content
        presence_penalty: 0,
        frequency_penalty: 0,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        logger.error('No response generated from OpenAI for text edit');
        throw new Error('No response generated from OpenAI');
      }

      // Clean up the response - remove any potential wrapper text
      let cleanedResponse = response.trim();
      
      // Remove common wrapper patterns that might appear despite instructions
      const wrapperPatterns = [
        /^Here's the edited text:\s*/i,
        /^Edited text:\s*/i,
        /^The edited version is:\s*/i,
        /^Here is the edited version:\s*/i,
        /^"(.+)"$/s, // Remove quotes if the entire response is wrapped in quotes
      ];
      
      for (const pattern of wrapperPatterns) {
        cleanedResponse = cleanedResponse.replace(pattern, '$1').trim();
      }

      logger.info('Generated edited text', {
        responseLength: cleanedResponse.length,
        originalLength: originalText.length,
        usage: completion.usage
      });

      return cleanedResponse;
    } catch (error) {
      logger.error('Error generating edited text:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Sanitize context data to remove sensitive Metabase information before sending to OpenAI
   * CRITICAL SECURITY: No news article content, summaries, URLs, or database results should reach OpenAI
   */
  private sanitizeContextForOpenAI(context: Record<string, any>): Record<string, any> {
    // Create a deep copy to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(context));
    
    // Remove all Metabase search results and article data
    if (sanitized.searchResults) {
      logger.warn('🚨 SECURITY: Removing Metabase search results from OpenAI context in generateContextualPrompt', {
        removedFields: Object.keys(sanitized.searchResults)
      });
      delete sanitized.searchResults;
    }
    
    // Remove author results with article data
    if (sanitized.authorResults) {
      logger.warn('🚨 SECURITY: Removing author results with article data from OpenAI context in generateContextualPrompt');
      delete sanitized.authorResults;
    }
    
    // Remove any field containing article data
    const dangerousFields = ['articles', 'articleData', 'metabaseResults', 'databaseResults', 'newsData'];
    dangerousFields.forEach(field => {
      if (sanitized[field]) {
        logger.warn(`🚨 SECURITY: Removing ${field} from OpenAI context in generateContextualPrompt`);
        delete sanitized[field];
      }
    });
    
    // Recursively sanitize nested objects
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeContextForOpenAI(sanitized[key]);
      }
    });
    
    return sanitized;
  }

  /**
   * Generate a streaming response based on the workflow step and user input
   * @param step The current workflow step
   * @param userInput The user's input for this step
   * @param previousResponses Array of previous step responses for context
   * @returns An async iterator that yields streaming response chunks
   */
  async* generateStepResponseStream(
    step: WorkflowStep,
    userInput: string,
    previousResponses: { stepName: string; response: string }[] = []
  ): AsyncGenerator<{
    type: 'content' | 'metadata' | 'error' | 'done';
    data: any;
  }> {
    try {
      logger.info('Generating streaming OpenAI response', {
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        userInputLength: userInput.length,
        previousResponsesCount: previousResponses.length
      });

      // Construct the system message based on step metadata and context
      const systemMessage = this.constructSystemMessage(step, previousResponses);
      
      // Create the messages array for the chat completion
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemMessage }
      ];

      // Add previous responses as context if available
      if (previousResponses.length > 0) {
        const contextMessages = previousResponses.map(response => ({
          role: 'assistant' as const,
          content: `Previous step (${response.stepName}): ${response.response}`
        }));
        messages.push(...contextMessages);
      }

      // Add the current step's prompt and user input
      messages.push(
        { role: 'assistant', content: step.prompt || 'Please provide the required information.' },
        { role: 'user', content: userInput }
      );

      // Store the complete prompt for tracking
      const promptData = JSON.stringify({
        messages,
        model: this.model,
        settings: {
          userInput,
          stepId: step.id,
          stepName: step.name,
          stepType: step.stepType
        }
      }, null, 2);

      // Yield metadata first
      yield {
        type: 'metadata',
        data: {
          stepId: step.id,
          stepName: step.name,
          stepType: step.stepType,
          promptData
        }
      };

      // Determine response settings
      const isChatStep = step.stepType === 'user_input' || step.stepType === 'ai_suggestion';
      const isAssetGenerationStep = step.name === 'Asset Generation';
      const isJsonDialogStep = step.stepType === 'json_dialog';
      
      const maxTokens = isAssetGenerationStep ? 4000 : 
                     isJsonDialogStep ? 4000 : 
                     isChatStep ? 100 : 2000;
      const presencePenalty = isChatStep ? 0.5 : 0;
      const frequencyPenalty = isChatStep ? 0.5 : 0;

      // Create streaming completion
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
        presence_penalty: presencePenalty,
        frequency_penalty: frequencyPenalty,
        stream: true,
      });

      let fullResponse = '';
      let sentenceBuffer = '';
      let sentenceCount = 0;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        
        if (content) {
          fullResponse += content;
          sentenceBuffer += content;
          
          // For chat steps, limit to 2 sentences by detecting sentence endings
          if (isChatStep) {
            const sentenceEndings = sentenceBuffer.match(/[.!?]+/g);
            if (sentenceEndings) {
              sentenceCount += sentenceEndings.length;
              
              // If we've reached 2 sentences, send the content and stop
              if (sentenceCount >= 2) {
                const sentences = fullResponse.split(/[.!?]+/).filter(s => s.trim().length > 0);
                const limitedResponse = sentences.slice(0, 2).join('. ').trim() + '.';
                
                yield {
                  type: 'content',
                  data: { content: limitedResponse, isComplete: true }
                };
                break;
              }
            }
          }
          
          // Yield content chunk
          yield {
            type: 'content',
            data: { content, isComplete: false }
          };
        }
        
        // Check if stream is done
        if (chunk.choices[0]?.finish_reason) {
          break;
        }
      }

      // Yield completion
      yield {
        type: 'done',
        data: {
          fullResponse,
          stepId: step.id,
          stepName: step.name,
          isChatStep,
          responseLength: fullResponse.length
        }
      };

      logger.info('Completed streaming OpenAI response', {
        stepId: step.id,
        stepName: step.name,
        responseLength: fullResponse.length,
        isChatStep
      });

    } catch (error) {
      logger.error('Error in streaming OpenAI response:', {
        stepId: step.id,
        stepName: step.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      yield {
        type: 'error',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
          stepId: step.id
        }
      };
    }
  }

  /**
   * Generate contextual prompts for workflow steps with dynamic context
   * @param step The workflow step
   * @param context Previous step context
   * @returns Generated prompt
   */
  async generateContextualPrompt(
    step: WorkflowStep, 
    context: Record<string, any>
  ): Promise<string> {
    // 🚨 CRITICAL SECURITY: Block AI calls for Contact Enrichment to prevent Metabase data leakage
    if (step.name === "Contact Enrichment") {
      logger.warn('🚨 SECURITY BLOCK: Preventing OpenAI call for Contact Enrichment step', {
        stepName: step.name,
        stepId: step.id || 'unknown',
        reason: 'Contact Enrichment must be pure data lookup - no AI allowed'
      });
      return step.prompt || ''; // Return original prompt or empty string if undefined
    }
    
    try {
      logger.info('Generating contextual prompt', {
        stepName: step.name,
        contextKeys: Object.keys(context),
        originalPromptLength: step.prompt?.length || 0,
        contextValues: {
          announcementType: context.announcementType,
          assetType: context.assetType || context.selectedAssetType,
          selectedAssetType: context.selectedAssetType
        }
      });

      // If there's no context, use the original prompt
      if (!context || Object.keys(context).length === 0) {
        return step.prompt || "";
      }

      // CRITICAL SECURITY: Sanitize context before sending to OpenAI
      const sanitizedContext = this.sanitizeContextForOpenAI(context);

      // Create a system prompt for generating contextual step prompts
      const systemPrompt = `You are a workflow prompt generator. Your task is to create a personalized, contextual prompt for a workflow step based on information from previous steps.

STEP INFORMATION:
- Step Name: ${step.name}
- Step Description: ${step.description}
- Original Prompt: ${step.prompt}

CONTEXT FROM PREVIOUS STEPS (SANITIZED JSON):
\`\`\`json
${JSON.stringify(sanitizedContext, null, 2)}
\`\`\`

TASK:
Generate a new prompt for this step that:
1. Uses the EXACT values from the context JSON above
2. Replaces any placeholder text with actual values from the context
3. Is specific and personalized based on the context
4. Maintains a conversational, helpful tone
5. Avoids asking for information that's already been provided

CONTEXT INTERPRETATION RULES:
- If context contains "announcementType": use that exact value (e.g., "Product Launch", "Funding Round")
- If context contains "selectedAssetType" or "assetType": use that exact value
- Replace placeholders like [announcement type], [asset type], etc. with actual values
- If original prompt has placeholder text in brackets, replace it with context values

EXAMPLES:

Original: "Based on your announcement type of [Announcement Type Selection], I recommend..."
Context: {"announcementType": "Product Launch"}
Generated: "Based on your Product Launch announcement, I recommend..."

Original: "Now I'll collect information for your [asset type selected in previous step]"
Context: {"selectedAssetType": "Press Release", "announcementType": "Product Launch"}
Generated: "Now I'll collect the specific information needed for your Product Launch press release"

RESPONSE FORMAT:
Return ONLY the new prompt text. Do not include any explanations, metadata, or formatting - just the prompt that should be shown to the user.`;

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a contextual prompt for the "${step.name}" step.` }
      ];

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 500, // Prompts should be concise
        presence_penalty: 0,
        frequency_penalty: 0,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        logger.error('No contextual prompt generated from OpenAI', {
          stepName: step.name
        });
        // Fallback to original prompt
        return step.prompt || "";
      }

      logger.info('Generated contextual prompt', {
        stepName: step.name,
        originalPromptLength: step.prompt?.length || 0,
        newPromptLength: response.length,
        usage: completion.usage
      });

      return response.trim();
    } catch (error) {
      logger.error('Error generating contextual prompt:', {
        stepName: step.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Fallback to original prompt if AI generation fails
      return step.prompt || "";
    }
  }
} 