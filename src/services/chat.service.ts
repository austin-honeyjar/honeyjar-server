import { db } from "../db";
import { chatThreads, chatMessages } from "../db/schema";
import { WorkflowService } from "./workflow.service";
import { WorkflowStatus, StepStatus } from "../types/workflow";
import { eq } from "drizzle-orm";

export class ChatService {
  private workflowService: WorkflowService;

  constructor() {
    this.workflowService = new WorkflowService();
  }

  async createThread(userId: string, title: string) {
    const [thread] = await db
      .insert(chatThreads)
      .values({
        userId,
        title,
      })
      .returning();
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
    // Add user message to thread
    await this.addMessage(threadId, content, true);

    // Get active workflow for thread
    const workflow = await this.workflowService.getWorkflowByThreadId(threadId);
    if (!workflow) {
      // If no workflow, start a new one
      const template = await this.workflowService.getTemplateByName("Launch Announcement");
      if (!template) {
        throw new Error("Template not found");
      }
      await this.workflowService.createWorkflow(threadId, template.id);
      return this.getNextPrompt(threadId);
    }

    // If workflow exists, update current step
    const currentStep = await this.workflowService.getNextStep(workflow.id);
    if (currentStep) {
      await this.workflowService.updateStep(currentStep.id, {
        status: StepStatus.COMPLETE,
        userInput: content,
      });
    }

    // Check if workflow is complete
    const updatedWorkflow = await this.workflowService.getWorkflow(workflow.id);
    if (updatedWorkflow?.status === WorkflowStatus.COMPLETED) {
      return this.generateFinalResponse(updatedWorkflow);
    }

    return this.getNextPrompt(threadId);
  }

  private async getNextPrompt(threadId: string) {
    const workflow = await this.workflowService.getWorkflowByThreadId(threadId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    const nextStep = await this.workflowService.getNextStep(workflow.id);
    if (!nextStep) {
      throw new Error("No next step found");
    }

    const prompt = nextStep.prompt || "Please provide the required information.";
    await this.addMessage(threadId, prompt, false);
    return prompt;
  }

  private async generateFinalResponse(workflow: any) {
    const announcement = `We're excited to announce our new product launch!

${workflow.steps.find((s: any) => s.name.includes("Target Audience"))?.userInput}

Key Features:
${workflow.steps.find((s: any) => s.name.includes("Key Features"))?.userInput}

${workflow.steps.find((s: any) => s.name.includes("Value Proposition"))?.userInput}

${workflow.steps.find((s: any) => s.name.includes("Call to Action"))?.userInput}

Join us on this exciting journey!`;

    await this.addMessage(workflow.threadId, announcement, false);
    return announcement;
  }
} 