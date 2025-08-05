import { z } from "zod"

export const requirementsSchema = z.object({
  role: z.string().optional().describe("The job title, e.g., 'Software Engineer'"),
  location: z.string().optional().describe("The job location, e.g., 'San Francisco, CA' or 'Remote'"),
  experience: z
    .array(z.string())
    .optional()
    .describe("List of experience requirements, e.g., ['4+ years overall', 'SaaS']"),
  skills: z.array(z.string()).optional().describe("List of required skills, e.g., ['React.JS', 'AWS Cloud']"),
  companies: z
    .array(z.string())
    .optional()
    .describe("List of preferred companies, e.g., ['Google', 'Meta', 'Startup']"),
  industry: z
    .array(z.string())
    .optional()
    .describe("List of preferred industries, e.g., ['Fintech', 'Healthcare', 'SaaS']"),
  qualities: z
    .array(z.string())
    .optional()
    .describe(
      "List of natural language qualities and soft requirements, e.g., ['Strong leadership and mentorship capabilities', 'Experience with distributed systems']",
    ),
})

export type Requirements = z.infer<typeof requirementsSchema>
