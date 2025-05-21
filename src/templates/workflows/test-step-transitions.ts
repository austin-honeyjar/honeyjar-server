import { WorkflowTemplate, StepType } from '../../types/workflow';

export const TEST_STEP_TRANSITIONS_TEMPLATE: WorkflowTemplate = {
  id: "test-step-transitions-template",
  name: "Test Step Transitions",
  description: "A test workflow to verify proper step transitions for JSON dialog steps",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Step 1",
      description: "The first step",
      prompt: "This is STEP 1. Please enter the number '1' to continue.",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Verify user can enter the current step number (1) to proceed",
        baseInstructions: `You are a step transition tester. This is STEP 1 of 4 in the workflow.

GOAL:
Verify the user correctly inputs the step number to proceed.

TASK:
1. Ask the user to enter the number '1' (to match the current step number)
2. Only mark as complete if the user enters exactly '1'
3. Keep track of their numeric input in collectedInformation
4. When complete, suggest proceeding to Step 2

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

If the user enters '1':
{
  "isComplete": true,
  "collectedInformation": {
    "step1Input": 1,
    "stepInputs": [1],
    "inputSum": 1
  },
  "nextQuestion": "Great! You've completed Step 1. Moving to Step 2...",
  "suggestedNextStep": "Step 2"
}

If the user enters anything else:
{
  "isComplete": false,
  "collectedInformation": {
    "lastInput": "whatever the user entered"
  },
  "nextQuestion": "This is STEP 1. You need to enter exactly '1' to proceed to the next step."
}`
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Step 2",
      description: "The second step",
      prompt: "This is STEP 2. Previous inputs sum: 1. Please enter the number '2' to continue.",
      order: 1,
      dependencies: ["Step 1"],
      metadata: {
        goal: "Verify user can enter the current step number (2) to proceed",
        baseInstructions: `You are a step transition tester. This is STEP 2 of 4 in the workflow.

GOAL:
Verify the user correctly inputs the step number to proceed.

TASK:
1. Show the user the sum of previous numeric inputs (from Step 1)
2. Ask the user to enter the number '2' (to match the current step number)
3. Only mark as complete if the user enters exactly '2'
4. Add their numeric input to the sum in collectedInformation
5. When complete, suggest proceeding to Step 3

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

If the user enters '2':
{
  "isComplete": true,
  "collectedInformation": {
    "step2Input": 2,
    "stepInputs": [1, 2],
    "inputSum": 3
  },
  "nextQuestion": "Great! You've completed Step 2. Sum of inputs so far: 3. Moving to Step 3...",
  "suggestedNextStep": "Step 3"
}

If the user enters anything else:
{
  "isComplete": false,
  "collectedInformation": {
    "lastInput": "whatever the user entered"
  },
  "nextQuestion": "This is STEP 2. Previous inputs sum: 1. You need to enter exactly '2' to proceed to the next step."
}`
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Step 3",
      description: "The third step",
      prompt: "This is STEP 3. Previous inputs sum: 3. Please enter the number '3' to continue.",
      order: 2,
      dependencies: ["Step 2"],
      metadata: {
        goal: "Verify user can enter the current step number (3) to proceed",
        baseInstructions: `You are a step transition tester. This is STEP 3 of 4 in the workflow.

GOAL:
Verify the user correctly inputs the step number to proceed.

TASK:
1. Show the user the sum of previous numeric inputs (from Steps 1 and 2)
2. Ask the user to enter the number '3' (to match the current step number)
3. Only mark as complete if the user enters exactly '3'
4. Add their numeric input to the sum in collectedInformation
5. When complete, suggest proceeding to Step 4

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

If the user enters '3':
{
  "isComplete": true,
  "collectedInformation": {
    "step3Input": 3,
    "stepInputs": [1, 2, 3],
    "inputSum": 6
  },
  "nextQuestion": "Great! You've completed Step 3. Sum of inputs so far: 6. Moving to Step 4...",
  "suggestedNextStep": "Step 4"
}

If the user enters anything else:
{
  "isComplete": false,
  "collectedInformation": {
    "lastInput": "whatever the user entered"
  },
  "nextQuestion": "This is STEP 3. Previous inputs sum: 3. You need to enter exactly '3' to proceed to the next step."
}`
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Step 4",
      description: "The fourth and final step",
      prompt: "This is STEP 4. Previous inputs sum: 6. Please enter the number '4' to complete the workflow.",
      order: 3,
      dependencies: ["Step 3"],
      metadata: {
        goal: "Verify user can enter the current step number (4) to complete the workflow",
        baseInstructions: `You are a step transition tester. This is STEP 4 of 4 in the workflow.

GOAL:
Verify the user correctly inputs the step number to complete the workflow.

TASK:
1. Show the user the sum of previous numeric inputs (from Steps 1, 2, and 3)
2. Ask the user to enter the number '4' (to match the current step number)
3. Only mark as complete if the user enters exactly '4'
4. Add their numeric input to the sum in collectedInformation
5. When complete, display a workflow completion message

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

If the user enters '4':
{
  "isComplete": true,
  "collectedInformation": {
    "step4Input": 4,
    "stepInputs": [1, 2, 3, 4],
    "inputSum": 10
  },
  "nextQuestion": "Congratulations! You've successfully completed all 4 steps. Final sum: 10. The workflow is now complete.",
  "suggestedNextStep": null
}

If the user enters anything else:
{
  "isComplete": false,
  "collectedInformation": {
    "lastInput": "whatever the user entered"
  },
  "nextQuestion": "This is STEP 4. Previous inputs sum: 6. You need to enter exactly '4' to complete the workflow."
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 