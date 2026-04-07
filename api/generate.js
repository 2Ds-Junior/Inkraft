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
      motivational: "inspirant, énergique, avec appels à l'action",
      practical: 'pratique, actionnable, step-by-step'
    };

    const prompt = `Tu es un auteur expert. Génère un ebook complet.
Titre : "${title}"
${subtitle ? `Sous-titre : "${subtitle}"` : ''}
Auteur : "${author}"
Sujet : "${topic}"
Chapitres : ${chapters}
Langue : ${lm[language] || 'français'}
Style : ${sm[style] || 'professionnel'}

Retourne UNIQUEMENT un JSON valide, sans texte avant ou après, sans backticks.
Structure exacte :
{
  "title": "${title}",
  "subtitle": "${subtitle || 'sous-titre accrocheur'}",
  "author": "${author}",
  "imageQuery": "keyword in english for cover image",
  "description": "2-3 paragraphes intro séparés par \\n\\n",
  "chapters": [
    {
      "number": 1,
      "title": "Titre chapitre",
      "imageQuery": "keyword in english",
      "introduction": "2-3 phrases intro",
      "sections": [
        {"title": "Titre section", "paragraphs": ["paragraphe de 3 phrases minimum"]}
      ],
      "keyPoints": ["Point 1", "Point 2", "Point 3"]
    }
  ],
  "conclusion": "2-3 paragraphes séparés par \\n\\n"
}
Génère exactement ${chapters} chapitres avec 2 sections chacun. Sois concis.`;
const gemRes = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 16000
        })
      }
    );

    const gemData = await gemRes.json();

    if (!gemRes.ok) throw new Error(gemData.error?.message || 'Erreur Groq');

    let raw = gemData.choices?.[0]?.message?.content || '';
  
    raw = raw.replace(/^```json\s*/,'').replace(/\s*```$/,'').trim();

    let ebook;
    try {
      ebook = JSON.parse(raw);
    } catch(e) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { ebook = JSON.parse(m[0]); }
        catch(e2) { throw new Error('JSON invalide - réessayez'); }
      } else {
        throw new Error('Réponse invalide - réessayez');
      }
    }

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

    const aiImg = (query) =>
      `https://image.pollinations.ai/prompt/${encodeURIComponent(query + ' professional illustration')}?width=800&height=400&nologo=true`;

    ebook.coverImage = await fetchImg(ebook.imageQuery || title);
    ebook.coverImageAI = aiImg(ebook.imageQuery || title);

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