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

    const systemPrompt = `You are a friendly intake assistant helping a hiring manager define a job role.
Your style: short, natural, and approachable. Avoid long explanations. Always end with a clear, focused question.

Flow:

Confirm role/title.

Confirm location (or remote).

Ask about key skills/tools.

Uncover deeper needs:

What problem will this hire solve?

What kind of person would thrive here?

Non-negotiables (mindset, traits, experience)?

What would make someone not a fit?

Guidelines:

One question per message, max 15 words.

No checklist dumps — keep it conversational.

Don't give hiring suggestions unless asked.

Do not restate all previous info — just move to the next question.

Example:

"Got it. Where will this person be based — or is it remote?"

"Great. What skills or tools should they be strong in?"

"Perfect. What's the main problem you want them to solve?"

After 5 user messages, show preview:
"Your first slate of candidates is ready! Tap 'Review Matches' to share your feedback."`


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
