import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type GraphScanMode = 'gemini-3.1-pro-high' | 'gemini-3-flash-low';

export async function extractFunctionsFromImage(
  base64Image: string, 
  mimeType: string = "image/jpeg",
  mode: GraphScanMode = 'gemini-3-flash-low'
): Promise<string[]> {
  const model = mode === 'gemini-3.1-pro-high' ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";
  const thinkingLevel = mode === 'gemini-3.1-pro-high' ? ThinkingLevel.HIGH : ThinkingLevel.LOW;
  
  const response = await ai.models.generateContent({
    model: model,
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image,
            },
          },
          {
            text: "Extract all mathematical function expressions from this image. Return them as a JSON array of strings. \nRules:\n1. Use standard computer notation compatible with mathjs (e.g., x^2, sqrt(x), log(x, 10), log(x, 2)).\n2. AVOID LaTeX formatting (no \\frac, no \\sqrt, no \\cdot).\n3. Keep it simple: 'y = x + 1' or 'f(x) = sin(x)'.\n4. If there are multiple functions, list them all.\n5. For base-2 logs, use log(x, 2). For base-10 logs, use log(x, 10).\n6. Be extremely careful with exponents and roots. Ensure they are correctly transcribed.",
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: thinkingLevel },
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
        },
      },
    },
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}
