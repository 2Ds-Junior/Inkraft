export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { title, subtitle, author, topic, chapters, language, style } = req.body;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

    const lm = { fr: 'français', en: 'English', es: 'español', de: 'Deutsch', it: 'italiano', pt: 'português', ar: 'arabe' };
    const sm = {
      educational: 'pédagogique, clair, avec exemples concrets',
      business: 'professionnel, axé résultats et ROI',
      narrative: 'narratif, storytelling, engageant',
      technical: 'technique, rigoureux, très détaillé',
      motivational: 'inspirant, énergique, avec appels à l\'action',
      practical: 'pratique, actionnable, step-by-step'
    };

    const prompt = `Tu es un auteur expert. Génère un ebook complet et détaillé.
Titre : "${title}"
${subtitle ? `Sous-titre : "${subtitle}"` : ''}
Auteur : "${author}"
Sujet : "${topic}"
Chapitres : ${chapters}
Langue : ${lm[language] || 'français'}
Style : ${sm[style] || 'professionnel'}

Retourne UNIQUEMENT ce JSON valide (aucun texte avant ou après) :
{
  "title": "${title}",
  "subtitle": "${subtitle || 'sous-titre accrocheur'}",
  "author": "${author}",
  "imageQuery": "mot-clé en anglais pour illustrer le sujet (ex: marketing, technology, nature)",
  "description": "introduction en 3-4 paragraphes séparés par \\n\\n",
  "chapters": [
    {
      "number": 1,
      "title": "Titre du chapitre",
      "imageQuery": "mot-clé anglais pour illustrer ce chapitre",
      "introduction": "4-5 phrases d'intro",
      "sections": [
        {"title": "Titre section", "paragraphs": ["para 1 (5+ phrases)", "para 2"]}
      ],
      "keyPoints": ["Point 1", "Point 2", "Point 3"]
    }
  ],
  "conclusion": "3-4 paragraphes séparés par \\n\\n"
}
Génère exactement ${chapters} chapitres avec 2-3 sections chacun.`;

    // Call Gemini
    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8000 }
        })
      }
    );
    const gemData = await gemRes.json();
    let raw = gemData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    raw = raw.replace(/^```json\s*/,'').replace(/\s*```$/,'').trim();
    const ebook = JSON.parse(raw);

    // Fetch images from Unsplash
    const fetchImg = async (query) => {
      try {
        const r = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
          { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
        );
        const d = await r.json();
        return d.results?.[0]?.urls?.regular || null;
      } catch { return null; }
    };

    // AI generated image via Pollinations
    const aiImg = (query) =>
      `https://image.pollinations.ai/prompt/${encodeURIComponent(query + ' professional illustration')}?width=800&height=400&nologo=true`;

    // Add cover image
    ebook.coverImage = await fetchImg(ebook.imageQuery || title);
    ebook.coverImageAI = aiImg(ebook.imageQuery || title);

    // Add image to each chapter
    for (const ch of ebook.chapters) {
      ch.image = await fetchImg(ch.imageQuery || ch.title);
      ch.imageAI = aiImg(ch.imageQuery || ch.title);
    }

    res.status(200).json(ebook);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}