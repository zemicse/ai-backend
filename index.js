import express from "express";
import multer from "multer";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Multer setup för filuppladdning
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Initiera OpenAI-klienten med API-nyckel från Render miljövariabler
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* -------------------------------------------------------
 * HÄLSOKOLL
 * -----------------------------------------------------*/
app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

/* -------------------------------------------------------
 * KLASSIFICERING AV ANVÄNDARINMATNING
 * Bestämmer om vi ska hoppa direkt till progressbar
 * eller först be om förtydligande med förslag.
 *
 * Request:  { prompt: string }
 * Response: {
 *   direct: boolean,              // true = direkt till progressbaren
 *   category: string | null,      // grundkategori
 *   subservice: string | null,    // om specifikt hittas
 *   suggestions: string[]         // om direkt=false, visa dessa som knappar
 * }
 * -----------------------------------------------------*/
app.post("/classify", (req, res) => {
  const promptRaw = (req.body?.prompt || "").toString().trim();
  if (!promptRaw) {
    return res.status(400).json({ error: "prompt saknas" });
  }
  const prompt = promptRaw.toLowerCase();

  // Ordbok för kategorier + nyckelord
  const dict = {
    "städning": {
      general: [/^städ(ning)?$/, /städning\b/, /\bstäda\b/, /\bhemstäd\b/, /\bflyttstäd\b/],
      specific: {
        "Fönsterputs": [/fönsterputs(ning)?/, /putsa\s*fönster/],
        "Flyttstädning": [/flyttstäd(ning)?/],
        "Hemstädning": [/hemstäd(ning)?/, /veckostäd(ning)?/, /storstäd(ning)?/]
      },
      suggestions: ["Fönsterputs", "Hemstädning", "Flyttstädning"]
    },
    "trädgård": {
      general: [/^trädgård$/, /\bträdgårds?arbete\b/, /trädgård\b/],
      specific: {
        "Gräsklippning": [/gräsklipp(ning)?/, /klippa\s*gräs/],
        "Häckklippning": [/häckklipp(ning)?/, /klippa\s*häck/],
        "Lövblåsning": [/löv(blås|blåsning)/, /kratta\s*löv/]
      },
      suggestions: ["Gräsklippning", "Häckklippning", "Lövblåsning"]
    },
    "bygg": {
      general: [/^bygg$/, /bygg\b/, /renover(ing)?\b/],
      specific: {
        "Altanbygge": [/altan(bygge)?/, /bygga\s*altan/],
        "Målning inne": [/måla\b.*(vägg|tak|inomhus)/, /inomhusmålning/],
        "Tapetsering": [/tapet(sera|sering)/]
      },
      suggestions: ["Altanbygge", "Målning inne", "Tapetsering"]
    },
    "flytt": {
      general: [/^flytt$/, /flytt\b/, /flytta\b/],
      specific: {
        "Flyttfirma": [/flyttfirma/, /bärhjälp/, /transport( av)? möbler/],
        "Packhjälp": [/packhjälp/, /packa\b/]
      },
      suggestions: ["Flyttfirma", "Packhjälp", "Transport"]
    }
  };

  // Hjälpare: hitta kategori + specificitet
  const findCategory = (text) => {
    for (const [cat, cfg] of Object.entries(dict)) {
      const isGeneralMention = cfg.general.some(rx => rx.test(text));
      // Kolla specifika först – om något subservice matchar → specifik
      for (const [sub, arr] of Object.entries(cfg.specific)) {
        if (arr.some(rx => rx.test(text))) {
          return { category: cat, subservice: sub, direct: true, suggestions: [] };
        }
      }
      if (isGeneralMention) {
        return { category: cat, subservice: null, direct: false, suggestions: cfg.suggestions };
      }
    }
    // Ingen träff – gissa kategori via enkla nyckelord
    if (/fönster|puts/i.test(text)) {
      return { category: "städning", subservice: "Fönsterputs", direct: true, suggestions: [] };
    }
    // default: be om förtydligande (utan kategori)
    return { category: null, subservice: null, direct: false, suggestions: ["Städning", "Trädgård", "Bygg", "Flytt"] };
  };

  const out = findCategory(prompt);
  return res.json(out);
});

/* -------------------------------------------------------
 * BILDANALYS: returnerar en kort punktlista på svenska
 * (modell/serienr/mått/vikt/ev. osäkerhet)
 * -----------------------------------------------------*/
app.post("/analyze", upload.array("images"), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No images uploaded" });
  }

  const results = [];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const base64Image = file.buffer.toString("base64");
    const dataUrl = `data:${file.mimetype};base64,${base64Image}`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 45_000); // snävare timeout

    try {
      const completion = await openai.chat.completions.create(
        {
          model: "gpt-4o-mini",
          temperature: 0.2,
          max_tokens: 180,
          messages: [
            {
              role: "system",
              content: `
Du extraherar produktnamn/modell/serienummer från bilder och returnerar ENBART en kort punktlista (max 5).
Om känd produkt: ge mått i cm och vikt i kg. Annars ge rimlig uppskattning.
Format:
- Produkt/serie: <om säkert>
- Serienummer/modell: <om avläst>
- Mått (L×B×H): <cm>
- Vikt: <kg>
- Osäkerhet/antaganden: <kort>
`.trim()
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extrahera serienummer/namn och returnera endast punktlista enligt formatet." },
                { type: "image_url", image_url: { url: dataUrl } }
              ]
            }
          ]
        },
        { signal: ac.signal } // fetch-abort via SDK
      );

      let analysisText = completion.choices?.[0]?.message?.content || "No description provided";
      if (typeof analysisText !== "string") {
        analysisText = JSON.stringify(analysisText, null, 2);
      }

      results.push({ imageIndex: i + 1, analysis: analysisText });

    } catch (error) {
      const status = error?.status || error?.response?.status;
      const body = error?.response?.data || error?.message || String(error);
      console.error("OpenAI error:", status, body);

      const humanMsg =
        error?.name === "AbortError"
          ? "Timeout mot OpenAI (svaret tog för lång tid)."
          : (status === 429 ? "Kvot eller rate limit nådd hos OpenAI."
             : status ? `OpenAI-fel ${status}` : "Okänt OpenAI-fel");

      results.push({
        imageIndex: i + 1,
        analysis: `- Osäkerhet/antaganden: ${humanMsg}.`
      });
    } finally {
      clearTimeout(timer);
    }
  }

  res.json(results);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
