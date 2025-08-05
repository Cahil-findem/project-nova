import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { z } from "zod"

export const maxDuration = 30

const compensationRequestSchema = z.object({
  role: z.string().optional(),
  location: z.string().optional(),
  experience: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
})

export async function POST(req: Request) {
  try {
    const json = await req.json()
    const { role, location, experience, skills } = compensationRequestSchema.parse(json)

    if (!role || !location) {
      return new Response("Role and location are required.", { status: 400 })
    }

    const prompt = `Estimate the market compensation for a '${role}' position in '${location}'. Consider the following factors if available: Experience requirements: ${
      experience?.join(", ") || "N/A"
    }. Required skills: ${
      skills?.join(", ") || "N/A"
    }. Provide the estimated annual salary as a single, concise value in thousands, like '250K'. Do not add any other text or explanation.`

    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt,
    })

    return new Response(JSON.stringify({ compensation: text }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response("Error processing request.", { status: 500 })
  }
}
