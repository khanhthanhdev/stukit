/**
 * List of categories for tools
 * Categories help organize and group related study tools
 */

export type CategoryData = {
  name: string
  slug: string
  label?: string
  description?: string
}

export const categories: CategoryData[] = [
  {
    name: "Productivity",
    slug: "productivity",
    label: "Productivity",
    description: "Tools for time management, organization, and productivity",
  },
  {
    name: "Learning & Education",
    slug: "learning-education",
    label: "Learning & Education",
    description: "AI tools to support personalized learning, tutoring, and educational content",
  },
  {
    name: "Coding & Development",
    slug: "coding-development",
    label: "Coding & Development",
    description: "AI tools that assist with coding, debugging, and software development",
  },
  {
    name: "Content Creation & Media",
    slug: "content-creation-media",
    label: "Content Creation & Media",
    description: "AI tools for creating text, images, videos, and audio content",
  },
  {
    name: "Marketing & SEO",
    slug: "marketing-seo",
    label: "Marketing & SEO",
    description: "AI tools for automating and optimizing marketing campaigns and SEO strategies",
  },
  {
    name: "Data Analysis & Visualization",
    slug: "data-analysis-visualization",
    label: "Data Analysis & Visualization",
    description: "AI tools for analyzing data, generating insights, and creating visualizations",
  },
  {
    name: "Customer Support & Service",
    slug: "customer-support-service",
    label: "Customer Support & Service",
    description: "AI-driven tools to enhance customer service, support, and interactions",
  },
  {
    name: "Creative Design",
    slug: "creative-design",
    label: "Creative Design",
    description: "AI tools for assisting in digital design, branding, and creative projects",
  },
  {
    name: "Health & Wellness",
    slug: "health-wellness",
    label: "Health & Wellness",
    description: "AI tools for fitness tracking, wellness, mental health, and personal well-being",
  },
  {
    name: "Language & Translation",
    slug: "language-translation",
    label: "Language & Translation",
    description: "AI tools for real-time language translation, text-to-speech, and language learning",
  },
]
