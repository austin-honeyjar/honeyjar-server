import { BASE_WORKFLOW_TEMPLATE } from "./base-workflow";
import {LAUNCH_ANNOUNCEMENT_TEMPLATE} from "./launch-announcement";
import { DUMMY_WORKFLOW_TEMPLATE } from "./dummy-workflow";
import { JSON_DIALOG_PR_WORKFLOW_TEMPLATE } from "./json-dialog-pr-workflow";

export const WORKFLOW_TEMPLATES = {
  "Launch Announcement": LAUNCH_ANNOUNCEMENT_TEMPLATE,
  "Base Workflow": BASE_WORKFLOW_TEMPLATE,
  "Dummy Workflow": DUMMY_WORKFLOW_TEMPLATE,
  "JSON Dialog PR Workflow": JSON_DIALOG_PR_WORKFLOW_TEMPLATE,
  // Add more templates here as they are created
}; 