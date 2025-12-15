
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Scene, SceneStatus } from "../types";
import { IFMAN_CHARACTER_PROMPT, ART_STYLE_PROMPT, SAFETY_PROMPT } from "../constants";

// Helper to delay execution
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Smart Retry Wrapper with Exponential Backoff
 * Handles 429 (Too Many Requests), Quota Exceeded, and 503 errors.
 */
const callWithRetry = async <T>(
  operation: () => Promise<T>,
  retries = 5,
  baseDelay = 15000 // Increased base delay for quota errors
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    const errStr = error.toString().toLowerCase();
    
    // Check for Rate Limit (429), Quota Exceeded, or Overload
    const isRateLimit = 
      errStr.includes("429") || 
      errStr.includes("quota") || 
      errStr.includes("limit") ||
      errStr.includes("resource has been exhausted") || 
      errStr.includes("503") ||
      errStr.includes("overloaded");

    if (retries > 0 && isRateLimit) {
      console.warn(`API Quota/Limit hit. Waiting ${baseDelay/1000}s before retry... (${retries} left)`);
      await delay(baseDelay);
      // Exponential backoff: wait longer next time (15s -> 30s -> 60s)
      return callWithRetry(operation, retries - 1, baseDelay * 2);
    }
    throw error;
  }
};

/**
 * Analyzes the raw script and breaks it down into scenes with prompts.
 */
export const analyzeScript = async (apiKey: string, script: string): Promise<Scene[]> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `
    You are an expert storyboard artist obsessed with detailed shot breakdown. 
    Analyze the provided Korean script and split it into the MAXIMUM possible number of granular visual scenes.
    
    CRITICAL RULES FOR EXTREME GRANULARITY:
    1. **SPLIT EVERYTHING**: Do not group actions or sentences. 
       - If a sentence has two clauses, make two scenes.
       - If someone talks and then moves, make two scenes.
    2. **INSERT CUTS**: Add "Insert Shots" (Close-up of hands, eyes, objects) and "Reaction Shots" (Listener nodding, surprised face) between dialogues.
    3. **VISUAL PACING**: Treat this as a slow-motion cinematic sequence. We need MORE frames than the text suggests.
    4. **QUANTITY GOAL**: Aim for 1.5x to 2x the number of sentences in the script. If the script is long, **AIM FOR 150+ SCENES**.
    
    CONTEXTUAL CHARACTER LOGIC:
    - The main narrator is 'Ifman' (a stick figure with a Korean hat).
    - HOWEVER, do NOT include Ifman in every scene.
    - IF the script mentions a specific person (e.g., Steve Jobs, Elon Musk, a Doctor), describe THAT person in a cartoon style, and set 'mainCharacterVisible' to FALSE.
    - IF the script focuses on an object (e.g., a watch, a phone, a chart), describe ONLY the object, and set 'mainCharacterVisible' to FALSE.
    - ONLY set 'mainCharacterVisible' to TRUE if Ifman is the one acting, talking, or reacting in the scene.
    
    For each scene, provide:
    1. scriptSegment: The specific part of the text or implied action for this shot.
    2. englishPrompt: Detailed visual description of the action/setting (do not describe Ifman here, just the action).
    3. mainCharacterVisible: Boolean. True if Ifman is in the shot, False otherwise.
  `;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        scriptSegment: { type: Type.STRING, description: "The original Korean text" },
        englishPrompt: { type: Type.STRING, description: "Visual description of the scene action" },
        mainCharacterVisible: { type: Type.BOOLEAN, description: "True if Ifman is the subject, False if it's another person or object" },
      },
      required: ["scriptSegment", "englishPrompt", "mainCharacterVisible"],
    },
  };

  try {
    // Wrap analysis in retry as well, just in case
    const response = await callWithRetry(async () => {
      return await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: script,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
    });

    const text = response.text;
    if (!text) throw new Error("Gemini로부터 응답 텍스트가 없습니다.");

    const parsed = JSON.parse(text);
    
    // Map to internal Scene type
    return parsed.map((item: any, index: number) => ({
      id: index + 1,
      scriptSegment: item.scriptSegment,
      englishPrompt: item.englishPrompt,
      mainCharacterVisible: item.mainCharacterVisible ?? true, 
      status: SceneStatus.IDLE,
      retryCount: 0,
    }));

  } catch (error) {
    console.error("Script analysis failed:", error);
    throw error;
  }
};

/**
 * Internal helper to try Imagen 3
 */
const generateWithImagen3 = async (ai: GoogleGenAI, prompt: string): Promise<string> => {
  const response = await ai.models.generateImages({
    model: 'imagen-3.0-generate-001',
    prompt: prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: '16:9',
      outputMimeType: 'image/jpeg',
    },
  });
  const data = response.generatedImages?.[0]?.image?.imageBytes;
  if (!data) throw new Error("Imagen 3 응답에 이미지 데이터가 없습니다.");
  return `data:image/jpeg;base64,${data}`;
};

/**
 * Internal helper to try Gemini 2.5 Flash Image
 */
const generateWithGemini25Flash = async (ai: GoogleGenAI, prompt: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
      }
    },
  });
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Gemini 2.5 Flash 응답에 이미지 데이터가 없습니다.");
};

/**
 * Internal helper to try Gemini 2.0 Flash Exp (Fallback)
 */
const generateWithGemini20Exp = async (ai: GoogleGenAI, prompt: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
      }
    },
  });
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Gemini 2.0 Flash Exp 응답에 이미지 데이터가 없습니다.");
};

/**
 * Generates a single image for a scene with robust fallback strategy.
 */
export const generateSceneImage = async (
  apiKey: string, 
  scene: Scene, 
  isRetry: boolean = false
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });

  // 1. Construct the prompt based on whether Ifman is in the scene
  let characterDef = "";
  if (scene.mainCharacterVisible) {
    characterDef = `CHARACTER: ${IFMAN_CHARACTER_PROMPT}`;
  } else {
    characterDef = `
    CRITICAL INSTRUCTION:
    - Do NOT draw the 'Ifman' character.
    - Draw the subject with NORMAL CARTOON EYES.
    - ABSOLUTELY NO TEXT/LETTERS ON THE FACE.
    `;
  }

  // Enforce English Text if necessary, but prefer none.
  let textInstruction = "TEXT IN IMAGE: Avoid generating text if possible. If text is required for context, write it in ENGLISH.";

  let fullPrompt = `
  ${characterDef}
  SCENE ACTION: ${scene.englishPrompt}
  ORIGINAL CONTEXT: ${scene.scriptSegment}
  ${textInstruction}
  VISUAL STYLE: ${ART_STYLE_PROMPT}
  NEGATIVE CONSTRAINTS: ${SAFETY_PROMPT}
  `;
  
  if (isRetry) {
    fullPrompt += `, minimal, simplified`;
  }
  
  let lastError;

  try {
    // Primary: Gemini 2.5 Flash Image with RETRY logic
    return await callWithRetry(() => generateWithGemini25Flash(ai, fullPrompt));
  } catch (error: any) {
    lastError = error;
    
    try {
        // Fallback 1: Imagen 3 with RETRY logic
        return await callWithRetry(() => generateWithImagen3(ai, fullPrompt));
    } catch (error2: any) {
      lastError = error2;

      try {
        // Fallback 2: Gemini 2.0 Flash Exp with RETRY logic
        return await callWithRetry(() => generateWithGemini20Exp(ai, fullPrompt));
      } catch (error3: any) {
        lastError = error3;
        
        // Final error handling
        const errStr = lastError.toString().toLowerCase();
        if (errStr.includes("safety") || errStr.includes("400")) {
          throw new Error(`이미지 생성 실패 (안전/요청 오류): ${lastError.message}`);
        }
        if (errStr.includes("403") || errStr.includes("permission denied")) {
          throw new Error(`권한 오류 (403): API 키가 모델 접근 권한이 없습니다.`);
        }
        // If it's still quota after all retries
        if (errStr.includes("quota") || errStr.includes("exhausted") || errStr.includes("429")) {
             throw new Error("API 사용량 초과 (최대 재시도 실패). 잠시 후 다시 시도하거나 내일 이용하세요.");
        }
        throw new Error(`API 호출 실패: ${lastError.message}`);
      }
    }
  }
};
