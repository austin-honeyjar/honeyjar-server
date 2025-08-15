import {LAUNCH_ANNOUNCEMENT_TEMPLATE} from "./launch-announcement";
import { DUMMY_WORKFLOW_TEMPLATE } from "./dummy-workflow";
import { JSON_DIALOG_PR_WORKFLOW_TEMPLATE } from "./json-dialog-pr-workflow";

import { TEST_STEP_TRANSITIONS_TEMPLATE } from "./test-step-transitions";
import { MEDIA_LIST_TEMPLATE } from "./media-list";
import { MEDIA_MATCHING_TEMPLATE } from "./media-matching";
import { MEDIA_PITCH_TEMPLATE } from "./media-pitch";
import { SOCIAL_POST_TEMPLATE } from "./social-post";
import { BLOG_ARTICLE_TEMPLATE } from "./blog-article";
import { FAQ_TEMPLATE } from "./faq";

export const WORKFLOW_TEMPLATES = {
  "Launch Announcement": LAUNCH_ANNOUNCEMENT_TEMPLATE,
  "Dummy Workflow": DUMMY_WORKFLOW_TEMPLATE,
  "JSON Dialog PR Workflow": JSON_DIALOG_PR_WORKFLOW_TEMPLATE,

  "Test Step Transitions": TEST_STEP_TRANSITIONS_TEMPLATE,
  "Media Matching": MEDIA_MATCHING_TEMPLATE,
  "Media Pitch": MEDIA_PITCH_TEMPLATE,
  "Social Post": SOCIAL_POST_TEMPLATE,
  "Blog Article": BLOG_ARTICLE_TEMPLATE,
  "FAQ": FAQ_TEMPLATE,
  // Add more templates here as they are created
}; 