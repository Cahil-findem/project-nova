import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import type { Requirements } from "@/lib/schemas"

export const maxDuration = 30

// Simple in-memory cache to avoid redundant API calls
const extractionCache = new Map<string, { result: Partial<Requirements>; timestamp: number }>()
const CACHE_DURATION = 30000 // 30 seconds

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Implements exponential backoff retry logic for API calls
 */
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  let lastError: Error

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      console.log(`Attempt ${attempt + 1} failed:`, error.message)

      // If it's a rate limit error, wait longer
      if (error.message && error.message.includes("Rate limit")) {
        const waitTime = error.message.match(/try again in (\d+)ms/)
        if (waitTime) {
          const delay = Number.parseInt(waitTime[1]) + 100 // Add 100ms buffer
          console.log(`Rate limit hit, waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }
      }

      // For other errors, use exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

/**
 * Safely parses JSON with error handling
 */
function safeJsonParse(text: string): any {
  try {
    // Try to parse as-is first
    return JSON.parse(text)
  } catch (e) {
    try {
      // Try to extract JSON if it's embedded in other text
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (e2) {
      // If that fails too, try line by line
      const lines = text.split("\n")
      let jsonStr = ""
      let inJson = false

      for (const line of lines) {
        if (line.trim().startsWith("{")) {
          inJson = true
          jsonStr = line
        } else if (inJson) {
          jsonStr += line
          if (line.trim().endsWith("}")) {
            try {
              return JSON.parse(jsonStr)
            } catch (e3) {
              // Keep trying with more lines
            }
          }
        }
      }
    }
  }

  // If all parsing attempts fail, throw an error
  throw new Error(`Failed to parse JSON: ${text}`)
}

async function getAiExtraction(
  conversationText: string,
  existingQualities: string[] = [],
): Promise<Partial<Requirements>> {
  // Check cache first
  const cacheKey = `extraction_${conversationText.slice(0, 100)}_${existingQualities.join(",")}`
  const cached = extractionCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log("Using cached extraction result")
    return cached.result
  }

  try {
    const existingQualitiesText =
      existingQualities.length > 0
        ? `\n\nExisting qualities already identified:\n${existingQualities.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
        : ""

    const prompt = `Extract job requirements from this conversation and return a JSON object with these keys:
{
  "role": "job title or null",
  "location": "location or null",
  "experience": ["experience requirement 1", "experience requirement 2"] or [],
  "skills": ["skill 1", "skill 2", "skill 3"] or [],
  "companies": ["company 1", "company 2"] or [],
  "industry": ["industry 1", "industry 2"] or [],
  "qualities": ["quality 1", "quality 2", "quality 3"] or []
}

For qualities, extract soft skills, personality traits, work style preferences, and cultural fit requirements. Write each quality as a complete sentence.

${existingQualitiesText}

Conversation: "${conversationText}"

Return ONLY valid JSON with no additional text.`

    console.log("Making AI extraction request...")

    const result = await retryWithBackoff(async () => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at extracting job requirements from hiring conversations. Always return valid JSON with the exact structure requested.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }, // Force JSON response
      })

      console.log("AI SDK response received successfully")

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error("No content received from OpenAI")
      }

      console.log("Raw AI response:", content)

      let parsedRequirements
      try {
        parsedRequirements = safeJsonParse(content)

        // Ensure all arrays are initialized
        parsedRequirements.experience = parsedRequirements.experience || []
        parsedRequirements.skills = parsedRequirements.skills || []
        parsedRequirements.companies = parsedRequirements.companies || []
        parsedRequirements.industry = parsedRequirements.industry || []
        parsedRequirements.qualities = parsedRequirements.qualities || []
      } catch (parseError) {
        console.error("Failed to parse OpenAI response:", content)
        console.error("Parse error:", parseError)

        // Return a safe default object
        return {
          role: null,
          location: null,
          experience: [],
          skills: [],
          companies: [],
          industry: [],
          qualities: [],
        }
      }

      console.log("Parsed requirements:", parsedRequirements)
      return parsedRequirements
    })

    // Cache the result
    extractionCache.set(cacheKey, { result: result, timestamp: Date.now() })

    return result
  } catch (error) {
    console.error("AI extraction process failed after retries:", error)
    console.error("Error stack:", error.stack)

    // Return a safe default object
    return {
      role: null,
      location: null,
      experience: [],
      skills: [],
      companies: [],
      industry: [],
      qualities: [],
    }
  }
}

/**
 * Intelligently merges new qualities with existing ones with rate limiting protection
 */
async function mergeQualities(existingQualities: string[], newQualities: string[]): Promise<string[]> {
  // Ensure we're working with arrays
  const safeExistingQualities = Array.isArray(existingQualities) ? existingQualities : []
  const safeNewQualities = Array.isArray(newQualities) ? newQualities : []

  if (!safeNewQualities.length) {
    return safeExistingQualities
  }

  if (!safeExistingQualities.length) {
    return safeNewQualities
  }

  // Check if we need to merge (avoid API call if qualities are identical)
  const existingSet = new Set(safeExistingQualities.map((q) => q.toLowerCase().trim()))
  const newSet = new Set(safeNewQualities.map((q) => q.toLowerCase().trim()))
  const hasNewQualities = safeNewQualities.some((q) => !existingSet.has(q.toLowerCase().trim()))

  if (!hasNewQualities) {
    console.log("No new qualities to merge, returning existing")
    return safeExistingQualities
  }

  // Check cache for quality merging
  const cacheKey = `merge_${safeExistingQualities.join("|")}_${safeNewQualities.join("|")}`
  const cached = extractionCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log("Using cached quality merge result")
    return cached.result.qualities || safeExistingQualities
  }

  try {
    const prompt = `Merge these two lists of candidate qualities into one comprehensive list:

EXISTING QUALITIES:
${safeExistingQualities.map((q, i) => `${i + 1}. ${q}`).join("\n")}

NEW QUALITIES TO CONSIDER:
${safeNewQualities.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Return a JSON object with this format:
{
  "qualities": ["quality 1", "quality 2", "quality 3"]
}

Each quality should be a complete, professional sentence.`

    console.log("Making quality merge request...")

    const result = await retryWithBackoff(async () => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert at managing candidate qualities for job postings. Always return valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }, // Force JSON response
      })

      console.log("Quality merge AI SDK response received successfully")

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error("No content received from OpenAI")
      }

      console.log("Raw quality merge response:", content)

      let parsedQualities
      try {
        parsedQualities = safeJsonParse(content)
      } catch (parseError) {
        console.error("Failed to parse OpenAI response:", content)
        console.error("Parse error:", parseError)

        // Return a safe default
        return { qualities: safeExistingQualities }
      }

      return parsedQualities
    })

    console.log("Quality merge result:", result)

    // Parse the response into an array
    const mergedQualities = result.qualities || []

    const finalQualities = mergedQualities.length > 0 ? mergedQualities : safeExistingQualities

    // Cache the result
    extractionCache.set(cacheKey, {
      result: { qualities: finalQualities },
      timestamp: Date.now(),
    })

    return finalQualities
  } catch (error) {
    console.error("Error merging qualities after retries:", error)
    console.error("Quality merge error stack:", error.stack)

    // Fallback: intelligent simple merge
    const combined = [...safeExistingQualities, ...safeNewQualities]
    const unique = [...new Set(combined.map((q) => q.trim()).filter(Boolean))]
    return unique
  }
}

/**
 * Determines if we should skip AI extraction based on conversation changes
 */
function shouldSkipAiExtraction(userMessages: string[], existingRequirements: Requirements): boolean {
  // Always run AI for the first few messages
  if (userMessages.length <= 2) return false

  // Skip if the last message is very short (likely just acknowledgment)
  const lastMessage = userMessages[userMessages.length - 1]
  if (lastMessage && lastMessage.trim().length < 10) {
    console.log("Skipping AI extraction for very short message")
    return true
  }

  // Skip if we already have comprehensive requirements and the new message doesn't add much
  const hasComprehensiveData =
    existingRequirements.role &&
    existingRequirements.location &&
    (existingRequirements.skills?.length || 0) > 2 &&
    (existingRequirements.qualities?.length || 0) > 2

  if (hasComprehensiveData && lastMessage && lastMessage.trim().length < 50) {
    console.log("Skipping AI extraction - comprehensive data exists and message is short")
    return true
  }

  return false
}

export async function POST(request: NextRequest) {
  try {
    console.log("=== Extract Requirements API Called ===")

    const { userMessages, existingRequirements } = await request.json()
    console.log("Request body received:", {
      userMessagesLength: userMessages?.length || 0,
      hasExistingRequirements: !!existingRequirements,
    })

    if (!userMessages || !Array.isArray(userMessages)) {
      return NextResponse.json({ error: "Invalid user messages" }, { status: 400 })
    }

    const conversationText = userMessages.join("\n")
    console.log("Conversation text length:", conversationText.length)
    console.log("--- Starting Intelligent Extraction ---")

    // Get existing qualities to inform the extraction
    const existingQualities = existingRequirements?.qualities || []
    console.log("Existing qualities count:", existingQualities.length)

    // Always run regex extraction as it's reliable and doesn't use API calls
    const regexExtraction = extractWithRegex(conversationText)
    console.log("Regex Extraction Result:", regexExtraction)

    // Determine if we should run AI extraction
    const skipAi = shouldSkipAiExtraction(userMessages, existingRequirements || {})
    console.log("Skip AI extraction:", skipAi)

    let aiExtraction: Partial<Requirements> = {}
    let mergedQualities: string[] = existingQualities

    if (!skipAi) {
      try {
        // Add a small staggered delay based on request timing to spread out API calls
        const delay = Math.random() * 500 + 200 // 200-700ms random delay
        console.log(`Adding delay of ${Math.round(delay)}ms before AI extraction`)
        await new Promise((resolve) => setTimeout(resolve, delay))

        aiExtraction = await getAiExtraction(conversationText, existingQualities)
        console.log("AI Extraction Result:", aiExtraction)

        // Only try to merge qualities if AI extraction succeeded and we got some qualities
        if (aiExtraction.qualities && aiExtraction.qualities.length > 0) {
          console.log("Merging qualities...")
          mergedQualities = await mergeQualities(existingQualities, aiExtraction.qualities)
          console.log("Merged qualities result:", mergedQualities)
        }
      } catch (error) {
        console.log("AI extraction failed, using regex-only approach:", error.message)
        console.error("Full AI extraction error:", error)
        // Continue with regex-only extraction
      }
    } else {
      console.log("Skipped AI extraction to avoid rate limits")
    }

    // Merge results: AI takes precedence when available, regex fills the gaps.
    const finalRequirements: Requirements = {
      role: aiExtraction.role || regexExtraction.role || existingRequirements?.role || null,
      location: aiExtraction.location || regexExtraction.location || existingRequirements?.location || null,
      experience: mergeAndDeduplicate(
        aiExtraction.experience,
        regexExtraction.experience,
        existingRequirements?.experience,
      ),
      skills: mergeAndDeduplicate(aiExtraction.skills, regexExtraction.skills, existingRequirements?.skills),
      companies: mergeAndDeduplicate(
        aiExtraction.companies,
        regexExtraction.companies,
        existingRequirements?.companies,
      ),
      industry: mergeAndDeduplicate(aiExtraction.industry, regexExtraction.industry, existingRequirements?.industry),
      qualities: mergedQualities.length > 0 ? mergedQualities : existingRequirements?.qualities || null,
    }

    console.log("Final Merged Requirements:", finalRequirements)
    console.log("--- Extraction Complete ---")

    // Clean up old cache entries periodically
    if (Math.random() < 0.1) {
      // 10% chance
      const now = Date.now()
      for (const [key, value] of extractionCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION * 2) {
          extractionCache.delete(key)
        }
      }
    }

    const response = { extractedRequirements: finalRequirements }
    console.log("Sending response:", response)

    return NextResponse.json(response, {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    console.error("Critical error in /api/extract-requirements:", error)
    console.error("Error type:", typeof error)
    console.error("Error stack:", error.stack)

    // Final safety net: always return a valid, empty response to the client.
    return NextResponse.json(
      { extractedRequirements: {} },
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    )
  }
}

/**
 * Merges multiple arrays of strings, removes duplicates, and cleans up the data.
 */
function mergeAndDeduplicate(...arrays: (string[] | null | undefined)[]): string[] | null {
  // Filter out null/undefined and ensure we're working with arrays
  const validArrays = arrays.filter((arr) => Array.isArray(arr)) as string[][]

  // Flatten all arrays
  const combined = validArrays.flat()

  if (combined.length === 0) return null

  const unique = [...new Set(combined.map((item) => item.trim()).filter(Boolean))]
  return unique.length > 0 ? unique : null
}

/**
 * Extracts requirements using a comprehensive set of regex patterns.
 * This serves as a reliable fallback if the AI fails.
 */
function extractWithRegex(text: string): Partial<Requirements> {
  const lowerText = text.toLowerCase()
  const result: Partial<Requirements> = {}

  // Enhanced keywords for different categories
  const keywords = {
    role: [
      "software engineer",
      "developer",
      "designer",
      "product manager",
      "data scientist",
      "frontend developer",
      "backend developer",
      "full stack",
      "devops",
      "qa engineer",
      "engineering manager",
      "tech lead",
      "senior developer",
      "junior developer",
    ],
    location: [
      "san francisco",
      "new york",
      "remote",
      "california",
      "ca",
      "ny",
      "seattle",
      "austin",
      "boston",
      "chicago",
      "denver",
      "portland",
      "los angeles",
      "miami",
    ],
    skills: [
      "javascript",
      "python",
      "react",
      "node.js",
      "aws",
      "figma",
      "sql",
      "typescript",
      "java",
      "go",
      "rust",
      "docker",
      "kubernetes",
      "mongodb",
      "postgresql",
      "redis",
      "graphql",
      "rest api",
      "microservices",
      "machine learning",
      "ai",
    ],
    companies: [
      "google",
      "meta",
      "startup",
      "amazon",
      "microsoft",
      "apple",
      "netflix",
      "uber",
      "airbnb",
      "stripe",
      "spotify",
      "twitter",
      "linkedin",
      "salesforce",
    ],
    industry: [
      "fintech",
      "healthcare",
      "saas",
      "e-commerce",
      "social media",
      "gaming",
      "education",
      "travel",
      "food tech",
      "real estate",
      "logistics",
    ],
    experience: [/(\d+)\+?\s*years?/i, /senior/i, /junior/i, /lead/i, /staff/i, /principal/i],
  }

  // Find best match for single-value fields
  result.role = keywords.role.find((kw) => lowerText.includes(kw))
  result.location = keywords.location.find((kw) => lowerText.includes(kw))

  // Find all matches for multi-value fields
  result.skills = keywords.skills.filter((kw) => lowerText.includes(kw))
  result.companies = keywords.companies.filter((kw) => lowerText.includes(kw))
  result.industry = keywords.industry.filter((kw) => lowerText.includes(kw))

  // Find experience pattern
  for (const pattern of keywords.experience) {
    const match = text.match(pattern)
    if (match) {
      result.experience = [match[0]]
      break
    }
  }

  // Clean up empty arrays
  if (result.skills?.length === 0) delete result.skills
  if (result.companies?.length === 0) delete result.companies
  if (result.industry?.length === 0) delete result.industry

  return result
}
