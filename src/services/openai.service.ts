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
   */
  async generateStepResponse(
    step: WorkflowStep,
    userInput: string,
    previousResponses: { stepName: string; response: string }[] = []
  ): Promise<string> {
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
        { role: 'system', content: systemMessage },
        { role: 'user', content: userInput }
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
        messages.splice(1, 0, ...contextMessages);
      }

      logger.debug('Sending request to OpenAI', {
        stepId: step.id,
        model: this.model,
        messageCount: messages.length
      });

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        logger.error('No response generated from OpenAI', {
          stepId: step.id,
          completion: completion
        });
        throw new Error('No response generated from OpenAI');
      }

      logger.info('Generated OpenAI response', {
        stepId: step.id,
        stepName: step.name,
        model: this.model,
        responseLength: response.length,
        usage: completion.usage
      });

      return response;
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

    // Add response guidelines
    systemMessage += `Guidelines for your response:
1. Be professional and concise
2. Focus on the specific task at hand
3. Consider the available options and metadata
4. If suggesting options, explain the benefits of each
5. If asking for clarification, be specific about what information is needed`;

    logger.debug('System message constructed', {
      stepId: step.id,
      messageLength: systemMessage.length
    });

    return systemMessage;
  }
} 