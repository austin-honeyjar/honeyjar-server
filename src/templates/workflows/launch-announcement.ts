import {StepType} from "../../types/workflow";

export const LAUNCH_ANNOUNCEMENT_TEMPLATE = {
  name: "Launch Announcement",
  description: "Create and distribute launch announcement assets including press release, media pitch, and social media posts",
  steps: [
    {
      type: StepType.AI_SUGGESTION,
      name: "Initial Goal Assessment",
      description: "Assess user's PR goals and suggest appropriate announcement types",
      prompt: "Hi, what are you looking to achieve for your PR goals today?",
      dependencies: [],
      metadata: {
        announcementTypes: [
          "Product Launch",
          "Funding Round",
          "Partnership",
          "Company Milestone",
          "Executive Hire",
          "Industry Award"
        ]
      }
    },
    {
      type: StepType.USER_INPUT,
      name: "Announcement Type Selection",
      description: "User selects or confirms announcement type",
      prompt: "We promote 6 different announcement types. They are: Product Launch, Funding Round, Partnership, Company Milestone, Executive Hire, and Industry Award. Would you like help creating one of these or did you have another in mind?",
      dependencies: ["Initial Goal Assessment"],
      metadata: {
        requiredAssets: ["Press Release", "Media Pitch", "Media List", "Social Post", "Blog Post"]
      }
    },
    {
      type: StepType.AI_SUGGESTION,
      name: "Asset Selection",
      description: "Suggest appropriate assets based on announcement type",
      prompt: "Based on your announcement type, we suggest the following assets. Which would you like to generate?",
      dependencies: ["Announcement Type Selection"],
      metadata: {
        defaultAssets: ["Press Release", "Media Pitch", "Social Post"]
      }
    },
    {
      type: StepType.USER_INPUT,
      name: "Asset Confirmation",
      description: "User confirms which assets to generate",
      prompt: "Please confirm which assets you'd like to generate",
      dependencies: ["Asset Selection"],
      metadata: {}
    },
    {
      type: StepType.USER_INPUT,
      name: "Information Collection",
      description: "Collect required information for asset generation",
      prompt: "To generate these assets, we need some information. Would you like to: 1) Fill out our complete onboarding form, 2) Upload existing bios or pitch transcripts, or 3) Provide information directly in chat?",
      dependencies: ["Asset Confirmation"],
      metadata: {
        requiredFields: [
          "Company Name",
          "Product Name",
          "Product Type",
          "Target Audience",
          "Unique Value Proposition",
          "CEO Name",
          "Key Partnerships",
          "Environmental Benefits",
          "Embargo Date",
          "Call to Action",
          "PR Contact Name"
        ]
      }
    },
    {
      type: StepType.API_CALL,
      name: "Asset Generation",
      description: "Generate selected assets using templates and collected information",
      prompt: "Generating assets based on provided information...",
      dependencies: ["Information Collection"],
      metadata: {
        templates: {
          pressRelease: "I need a press release announcing that [Company Name] has launched a new product, [Product Name], a sustainable [product type] aimed at [target audience]. The product is significant because [reason why it's unique or important]. The CEO of the company, [CEO Name], can provide a quote about the product's impact. The release should mention any key industry partnerships and highlight the product's environmental benefits. The embargo lifts on [date], and the press release will be distributed to media outlets starting then. The call to action is to [desired outcome, e.g., visit the website, sign up for a demo]. Add a boilerplate about [Company Name] at the end, and include media contact information for [PR Contact Name].",
          mediaPitch: "I need a media pitch for [Client Name], who is announcing [specific news or event, e.g., a new product launch, partnership, funding round, or milestone]. The main focus of the story is [key highlights of the announcement]. The product/service is significant because [why it's important or innovative, and why it matters to the reporter's audience]. We believe this story would resonate with [target audience, e.g., tech journalists, sustainability-focused readers, etc.]. We'd love for [Reporter's Name] at [Media Outlet] to cover the news, and we think it aligns perfectly with their editorial focus on [topics related to the reporter's beat]. The embargo lifts on [date], and we're offering an exclusive [interview, product demo, or other opportunities] to [Reporter Name] if they're interested in covering the story. Please include key details about the announcement, a quote from the CEO or a relevant stakeholder, and any stats or facts that support the importance of this news. The CTA should encourage the reporter to reach out for more information or to schedule an interview. Please craft this in a personalized and engaging way that will appeal to the reporter's beat, audience, and interests."
        }
      }
    },
    {
      type: StepType.USER_INPUT,
      name: "Asset Review",
      description: "User reviews and provides feedback on generated assets",
      prompt: "Here are the generated assets. Please review and let me know if you'd like any changes.",
      dependencies: ["Asset Generation"],
      metadata: {}
    },
    {
      type: StepType.AI_SUGGESTION,
      name: "Post-Asset Tasks",
      description: "Suggest next steps for asset distribution and publishing",
      prompt: "Now that we have your assets ready, would you like help with: 1) Creating a media list, 2) Planning a publishing strategy, 3) Scheduling distribution, or 4) Something else?",
      dependencies: ["Asset Review"],
      metadata: {}
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 