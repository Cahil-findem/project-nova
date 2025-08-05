import { openai } from "@ai-sdk/openai"
import { streamText } from "ai"

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    console.log("Chat API called with messages:", messages?.length || 0)

    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not set")
      return new Response("OpenAI API key is not configured", { status: 500 })
    }

    const systemPrompt = `You are an expert intake agent helping a hiring manager define a job role.


Your primary goal is to guide a natural, friendly conversation that captures both core job details and the underlying intent behind the hire — the kind of person they're looking for, and why.


Prioritize gathering:
Role/title (e.g., "Product Designer")O
Location or remote (e.g., "New York", "Remote")
Then gently uncover what matters most:


What problem will this hire solve?
What kind of person would thrive in this role or on this team?
What are the non-negotiables (e.g., mindset, traits, experience)?
What would make someone "not a fit"?
Avoid checklist-style questions. Focus on one thoughtful, conversational prompt at a time.


Examples:
"What's the most important thing this person needs to be great at?"
"What kind of background or experience would feel like a strong fit?"
"What would success look like in their first 3 months?"
"What kind of person or energy that works best with your team?"
Always ask one question per message. Keep your responses short, human, and helpful.


After 5 user messages, offer a preview:


"Your first slate of candidates is ready!
Tap "Review Matches" to share your feedback on the profiles I’ve surfaced.."


Never end a message without a focused question or next step.`


    const result = streamText({
      model: openai("gpt-4o"),
      system: systemPrompt,
      messages,
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error("Error in chat API:", error)
    return new Response("Error processing chat request", { status: 500 })
  }
}
