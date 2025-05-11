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
    this.model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
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
      
      // Higher token limit for asset generation, moderate for other non-chat steps, low for chat
      const maxTokens = isAssetGenerationStep ? 4000 : (isChatStep ? 100 : 2000);
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
   * Generate an edited version of text based on instruction
   * Used specifically for asset text editing
   */
  async generateEditedText(
    originalText: string,
    instruction: string
  ): Promise<string> {
    try {
      logger.info('Generating edited text with OpenAI', {
        originalTextLength: originalText.length,
        instructionLength: instruction.length
      });

      const prompt = `Below is a portion of text that needs to be edited:
      
ORIGINAL TEXT:
"""
${originalText}
"""

INSTRUCTIONS:
${instruction}

Please provide ONLY the edited version of the text, with no additional comments or explanations.`;

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { 
          role: 'system', 
          content: 'You are an expert editor who follows instructions precisely. Provide only the edited version of the text.' 
        },
        { role: 'user', content: prompt }
      ];

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.3, // Lower temperature for more precise edits
        max_tokens: 2000,
        presence_penalty: 0,
        frequency_penalty: 0,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        logger.error('No response generated from OpenAI for text edit');
        throw new Error('No response generated from OpenAI');
      }

      logger.info('Generated edited text', {
        responseLength: response.length,
        usage: completion.usage
      });

      return response;
    } catch (error) {
      logger.error('Error generating edited text:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
} 