export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const { rawRequirements } = await req.json()

    // Simple normalization without AI
    const normalizedRequirements = {
      role: rawRequirements?.role ? capitalizeWords(rawRequirements.role) : null,
      location: rawRequirements?.location ? capitalizeWords(rawRequirements.location) : null,
      experience: rawRequirements?.experience ? rawRequirements.experience.map(capitalizeWords) : null,
      skills: rawRequirements?.skills ? rawRequirements.skills.map(capitalizeWords) : null,
      companies: rawRequirements?.companies ? rawRequirements.companies.map(capitalizeWords) : null,
      industry: rawRequirements?.industry ? rawRequirements.industry.map(capitalizeWords) : null,
      qualities: rawRequirements?.qualities
        ? rawRequirements.qualities
            .map((q: string) =>
              q
                .replace(/\*\*/g, "")
                .replace(/[•\-*]/g, "")
                .trim(),
            )
            .filter(Boolean)
        : null,
    }

    console.log("Normalized requirements:", normalizedRequirements)

    return new Response(JSON.stringify({ normalizedRequirements }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Error in normalize-requirements:", error)
    return new Response(JSON.stringify({ normalizedRequirements: {} }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  }
}

function capitalizeWords(str: string): string {
  if (!str) return ""
  return str
    .replace(/\*\*/g, "") // Remove markdown bold formatting
    .replace(/[•\-*]/g, "") // Remove bullet points
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}
