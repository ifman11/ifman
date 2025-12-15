
export const IFMAN_CHARACTER_PROMPT = `
SUBJECT: 'Ifman' (A stylized mascot character).
STYLE: 2D Vector Line Art, Stylized Mascot.

HEAD & FACE (CRITICAL):
- HEAD SHAPE: A simple, perfectly round WHITE sphere.
- HAT: Traditional Korean 'Gat' (SOLID OPAQUE BLACK hat, NOT transparent).
- HAT STRAP: A single black string tied in a simple bow knot under the chin.
- FACE FEATURES:
  1. LEFT EYE POSITION: The letter 'I' (Capital 'I', Black Color).
  2. RIGHT EYE POSITION: The letter 'F' (Capital 'F', Black Color).
  3. MOUTH: A small RED INVERTED TRIANGLE (▼) located in the center below the letters.
- TEXT CONSISTENCY: The letters 'I' and 'F' must have CONSISTENT THICKNESS.

BODY: Minimalist white stick-figure body.
`;

export const ART_STYLE_PROMPT = `
ART STYLE: A polished 2D vector illustration, modern animated series style.
LINES: Clean, smooth outlines.
COLORS: Vibrant saturated colors.
COPYRIGHT SAFETY:
- Use GENERIC devices (phones, cars) without brand logos.
- Do NOT depict famous real-world copyrighted characters.
TEXT RENDERING RULES:
- AVOID text in the background whenever possible (Clean visual).
- If text is absolutely necessary (signs, screens), use ENGLISH.
`;

export const SAFETY_PROMPT = `
Negative Constraints:
- NO photorealism, NO 3D render.
- NO copyrighted logos (Apple, Nike, etc).
- NO text on faces (EXCEPT for Ifman).
- NO Korean text (Use English if text is required).
- NO semi-transparent hat (Hat must be solid black).
`;

export const RETRY_MODIFIER = ", simplified, vector icon, minimal";

// Tier 1 User strategy: Increased to 25 seconds (approx 2 RPM) to be extremely safe for Free Tier image generation
export const RATE_LIMIT_DELAY_MS = 25000;
export const MAX_SCENES = 300;
export const MAX_RETRIES = 5;
