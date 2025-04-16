import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = 'http://localhost:3000/api/v1';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWorkflowFlow() {
  try {
    console.log('Starting workflow flow test...\n');

    // Step 1: Create a new thread
    console.log('1. Creating a new thread...');
    const createThreadResponse = await axios.post(`${API_BASE_URL}/chat/threads`, {
      title: 'Test Launch Announcement'
    });
    const threadId = createThreadResponse.data.thread.id;
    console.log('Thread created:', {
      threadId,
      workflowId: createThreadResponse.data.workflow.id,
      initialPrompt: createThreadResponse.data.nextPrompt
    });
    console.log('----------------------------------------\n');

    // Step 2: Send initial message
    console.log('2. Sending initial message...');
    const initialMessage = "I want to create a launch announcement for our new AI-powered productivity tool";
    const messageResponse = await axios.post(`${API_BASE_URL}/chat/messages`, {
      threadId,
      content: initialMessage,
      role: 'user'
    });
    console.log('Message sent:', {
      messageId: messageResponse.data.message.id,
      response: messageResponse.data.response
    });
    console.log('----------------------------------------\n');

    // Step 3: Get thread state
    console.log('3. Getting thread state...');
    const threadState = await axios.get(`${API_BASE_URL}/chat/threads/${threadId}`);
    console.log('Thread state:', {
      messageCount: threadState.data.messages.length,
      workflowState: {
        currentStep: threadState.data.workflow.currentStepId,
        totalSteps: threadState.data.workflow.steps.length,
        completedSteps: threadState.data.workflow.steps.filter((s: any) => s.status === 'complete').length
      }
    });
    console.log('----------------------------------------\n');

    // Step 4: Continue the conversation
    console.log('4. Continuing the conversation...');
    const followUpMessage = "Our target audience is small business owners and entrepreneurs";
    const followUpResponse = await axios.post(`${API_BASE_URL}/chat/messages`, {
      threadId,
      content: followUpMessage,
      role: 'user'
    });
    console.log('Follow-up message sent:', {
      messageId: followUpResponse.data.message.id,
      response: followUpResponse.data.response
    });
    console.log('----------------------------------------\n');

    // Step 5: Get final thread state
    console.log('5. Getting final thread state...');
    const finalState = await axios.get(`${API_BASE_URL}/chat/threads/${threadId}`);
    console.log('Final thread state:', {
      messageCount: finalState.data.messages.length,
      workflowState: {
        currentStep: finalState.data.workflow.currentStepId,
        totalSteps: finalState.data.workflow.steps.length,
        completedSteps: finalState.data.workflow.steps.filter((s: any) => s.status === 'complete').length
      }
    });
    console.log('----------------------------------------\n');

    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testWorkflowFlow(); 