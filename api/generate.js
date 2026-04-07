export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { title, subtitle, author, topic, chapters, language, style } = req.body;
    const GROQ_KEY = process.env.GROQ_API_KEY;
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

    const lang = lm[language] || 'français';
    const sty = sm[style] || 'professionnel';

    const groq = async (prompt, max_tokens = 4000) => {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Erreur Groq');
      return data.choices?.[0]?.message?.content || '';
    };

    const parseJSON = (raw) => {
      raw = raw.replace(/^```json\s*/,'').replace(/\s*```$/,'').trim();
      try { return JSON.parse(raw); }
      catch {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) return JSON.parse(m[0]);
        throw new Error('JSON invalide');
      }
    };

    // ── ÉTAPE 1 : Structure générale ──
    const structPrompt = `Tu es un auteur expert. Génère la structure d'un ebook.
Titre : "${title}"
${subtitle ? `Sous-titre : "${subtitle}"` : ''}
Auteur : "${author}"
Sujet : "${topic}"
Langue : ${lang}
Style : ${sty}

Retourne UNIQUEMENT ce JSON (sans texte avant/après, sans backticks) :
{
  "title": "${title}",
  "subtitle": "${subtitle || 'sous-titre accrocheur'}",
  "author": "${author}",
  "imageQuery": "keyword in english for cover",
  "description": "introduction en 2 paragraphes séparés par \\n\\n",
  "chapterTitles": ["Titre chapitre 1", "Titre chapitre 2", "Titre chapitre 3"],
  "conclusion": "conclusion en 2 paragraphes séparés par \\n\\n"
}
Génère exactement ${chapters} titres de chapitres.`;

    const structure = parseJSON(await groq(structPrompt, 2000));

    // ── ÉTAPE 2 : Générer chaque chapitre ──
    const chapterList = [];
    for (let i = 0; i < structure.chapterTitles.length; i++) {
      const chTitle = structure.chapterTitles[i];
      const chPrompt = `Tu es un auteur expert. Rédige le chapitre ${i+1} d'un ebook.
Titre de l'ebook : "${title}"
Sujet : "${topic}"
Langue : ${lang}
Style : ${sty}
Titre du chapitre : "${chTitle}"

Retourne UNIQUEMENT ce JSON (sans texte avant/après, sans backticks) :
{
  "number": ${i+1},
  "title": "${chTitle}",
  "imageQuery": "keyword in english for this chapter",
  "introduction": "3-4 phrases d'introduction du chapitre",
  "sections": [
    {
      "title": "Titre section 1",
      "paragraphs": ["paragraphe de 4 phrases minimum", "paragraphe de 4 phrases minimum"]
    },
    {
      "title": "Titre section 2",
      "paragraphs": ["paragraphe de 4 phrases minimum", "paragraphe de 4 phrases minimum"]
    }
  ],
  "keyPoints": ["Point clé 1", "Point clé 2", "Point clé 3", "Point clé 4"]
}`;

      const chapter = parseJSON(await groq(chPrompt, 3000));
      chapterList.push(chapter);

      // Pause pour éviter le rate limit
      if (i < structure.chapterTitles.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // ── ÉTAPE 3 : Images ──
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

    const ebook = {
      title: structure.title,
      subtitle: structure.subtitle,
      author: structure.author,
      imageQuery: structure.imageQuery,
      description: structure.description,
      chapters: chapterList,
      conclusion: structure.conclusion
    };

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