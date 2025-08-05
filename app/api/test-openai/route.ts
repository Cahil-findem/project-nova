import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"

export const maxDuration = 10

export async function GET() {
  try {
    console.log("Testing OpenAI API connection...")

    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "OPENAI_API_KEY environment variable is not set",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    // Test with a simple API call
    const { text } = await generateText({
      model: openai("gpt-4o-mini"), // Use mini for testing to avoid rate limits
      prompt: "Say 'Hello, the OpenAI API is working!' in exactly those words.",
      maxTokens: 50,
      temperature: 0,
    })

    console.log("OpenAI API test response:", text)

    return new Response(
      JSON.stringify({
        status: "success",
        message: "OpenAI API is working correctly",
        response: text,
        keyConfigured: true,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    console.error("OpenAI API test failed:", error)

    let errorMessage = "Unknown error"
    let errorType = "unknown"

    if (error.message) {
      errorMessage = error.message

      if (error.message.includes("Rate limit")) {
        errorType = "rate_limit"
      } else if (error.message.includes("API key")) {
        errorType = "invalid_key"
      } else if (error.message.includes("quota")) {
        errorType = "quota_exceeded"
      } else if (error.message.includes("billing")) {
        errorType = "billing_issue"
      }
    }

    return new Response(
      JSON.stringify({
        status: "error",
        message: errorMessage,
        errorType,
        keyConfigured: !!process.env.OPENAI_API_KEY,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
}
