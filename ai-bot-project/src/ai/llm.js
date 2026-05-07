import { GoogleGenerativeAI } from '@google/generative-ai';

let client = null;
function getClient() {
  if (!client) client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client;
}

export async function genWithLLM(systemPrompt, userPrompt, maxTokens = 200) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.9 }
  });
  const result = await model.generateContent(userPrompt);
  return result.response.text().trim();
}
