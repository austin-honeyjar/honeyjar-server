import { BASE_WORKFLOW_TEMPLATE } from "./base-workflow";
import {LAUNCH_ANNOUNCEMENT_TEMPLATE} from "./launch-announcement";
import { DUMMY_WORKFLOW_TEMPLATE } from "./dummy-workflow";
import { JSON_DIALOG_PR_WORKFLOW_TEMPLATE } from "./json-dialog-pr-workflow";
import { QUICK_PRESS_RELEASE_TEMPLATE } from "./quick-press-release";
import { TEST_STEP_TRANSITIONS_TEMPLATE } from "./test-step-transitions";
import { MEDIA_LIST_TEMPLATE } from "./media-list";

export const WORKFLOW_TEMPLATES = {
  "Launch Announcement": LAUNCH_ANNOUNCEMENT_TEMPLATE,
  "Base Workflow": BASE_WORKFLOW_TEMPLATE,
  "Dummy Workflow": DUMMY_WORKFLOW_TEMPLATE,
  "JSON Dialog PR Workflow": JSON_DIALOG_PR_WORKFLOW_TEMPLATE,
  "Quick Press Release": QUICK_PRESS_RELEASE_TEMPLATE,
  "Test Step Transitions": TEST_STEP_TRANSITIONS_TEMPLATE,
  "Media List Generator": MEDIA_LIST_TEMPLATE,
  "Media Matching": MEDIA_LIST_TEMPLATE,
  // Add more templates here as they are created
}; 