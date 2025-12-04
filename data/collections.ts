/**
 * List of collections for organizing tools
 * Collections help curate and group related study tools by topic or use case
 */

export type CollectionData = {
  name: string
  slug: string
  description?: string
}

export const collections: CollectionData[] = [
  {
    name: "Free Tools",
    slug: "free-tools",
    description: "A collection of AI tools that are completely free to use, with no payment required."
  },
  {
    name: "Freemium Tools",
    slug: "freemium-tools",
    description: "AI tools that offer both free and premium versions, with basic features available for free and advanced features behind a paywall."
  },
  {
    name: "Premium Tools",
    slug: "premium-tools",
    description: "A collection of AI tools that are exclusively paid, offering advanced features and capabilities."
  },
  {
    name: "Presentation Tools",
    slug: "presentation-tools",
    description: "AI-powered tools designed to help users create, design, and automate presentations."
  },
  {
    name: "Coding Tools",
    slug: "coding-tools",
    description: "AI tools that assist with software development, coding, debugging, and code optimization."
  },
  {
    name: "AI-Powered Tools",
    slug: "ai-powered-tools",
    description: "A collection of tools that leverage artificial intelligence for tasks such as automation, data analysis, and content generation."
  },
  {
    name: "Collaboration Tools",
    slug: "collaboration-tools",
    description: "AI tools that enable team collaboration, project management, and communication."
  },
  {
    name: "Design Tools",
    slug: "design-tools",
    description: "AI tools that assist with graphic design, UI/UX design, and visual content creation."
  },
  {
    name: "Marketing Tools",
    slug: "marketing-tools",
    description: "AI tools to optimize marketing campaigns, automate social media management, and analyze consumer data."
  },
  {
    name: "Language Learning Tools",
    slug: "language-learning-tools",
    description: "AI tools designed to assist with language learning, translation, and pronunciation improvement."
  }
]

