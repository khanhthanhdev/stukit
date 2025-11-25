import { z } from "zod"

export const submitToolSchema = z.object({
  name: z.string().min(1, "Name is required"),
  websiteUrl: z.string().min(1, "Website is required").url("Invalid URL"),
  submitterName: z.string().min(1, "Your name is required"),
  submitterEmail: z.string().min(1, "Your email is required").email(),
})
