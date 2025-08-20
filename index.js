// index.js
import express from "express";
import multer from "multer";
import cors from "cors";
import OpenAI from "openai";

// ====== BAS ======
const app = express();
const port = process.env.PORT || 3000;
app.set("trust proxy", 1);

// ====== CORS ======
const corsConfig = {
  origin: (origin, cb) => cb(null, true), // tillåt alla (lättast). Sätt annars ["https://din-domän.se"]
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: false,
  maxAge: 86400,
};
app.use(cors(corsConfig));
app.options(["/analyze","/api/analyze","/health"], cors(corsConfig));

// ====== BODY/MULTER ======
app.use(express.json({ limit: "1mb" })); // multipart hanteras av multer
const upload = multer({ storage: multer.memoryStorage() });

// ====== OPENAI CLIENT ======
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ====== HEALTH ======
app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ====== GEMENSAM ANALYS-HANDLER ======
async function analyzeHandler(req, res) {
  if (!req.files || !req.files.length) {
    return res.status(400).json({ error: "No images uploaded" });
  }

  const SYSTEM_PROMPT = `
Du är en svensk produktigenkännare och specifikationsassistent.
Returnera ENDAST en kort punktlista (max 7 punkter) med raderna i exakt denna ordning:

- Produkt/serie: <text>
- Serienummer/modell: <text>
- Längd: <cm>
- Bredd: <cm>
- Höjd: <cm>
- Vikt: <kg>
- Osäkerhet/antaganden: <text>

Regler:
- Läs etiketter/varunummer/serienummer om de syns.
- Om produkten är en känd serie (t.ex. IKEA, Bosch, Apple m.fl.), ange standardmått och vikt för den vanligaste varianten utifrån din inlärda kunskap.
- Om flera varianter finns: välj den mest sannolika och nämn alternativ kort i sista raden.
- Om okänd: ge rimlig uppskattning i cm/kg (skriv "uppskattat" när det är en uppskattning).
- Enheter: alltid centimeter (cm) för mått och kilogram (kg) för vikt.
- Skriv kort och utan extra brödtext.
`.trim();

  async function enrichSpecs({ product, model }) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `
Du är en svensk produktkatalogsassistent. Om du känner till en kommersiell produkt/serie från din inlärda kunskap:
- Ge typiska standardmått (cm) för L/B/H och vikt (kg) för vanligaste varianten.
- Om flera varianter finns: välj den mest vanliga men nämn alternativ kort.
Returnera EXAKT JSON:
{"langd_cm":"", "bredd_cm":"", "hojd_cm":"", "vikt_kg":"", "notis":""}`.trim()
        },
        {
          role: "user",
          content: `Produkt/serie: ${product || "okänd"}\nModell: ${model || "okänd"}\n\nGe JSON enligt instruktionen.`
        }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }

  function valFrom(line, key) {
    const rx = new RegExp(`${key}\\s*:\\s*(.*)`, "i");
    const m = line.match(rx);
    return m ? m[1].trim() : null;
  }

  const results = [];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const base64 = file.buffer.toString("base64");
    const dataUrl = `data:${file.mimetype};base64,${base64}`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 45_000);

    try {
      // 1) OCR/igenkänning + specs
      const completion = await openai.chat.completions.create(
        {
          model: "gpt-4o-mini",
          temperature: 0.15,
          max_tokens: 320,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Analysera bilden och returnera punktlista exakt enligt formatet." },
                { type: "image_url", image_url: { url: dataUrl } }
              ]
            }
          ]
        },
        { signal: ac.signal }
      );

      let analysisText = completion.choices?.[0]?.message?.content || "";
      if (typeof analysisText !== "string") analysisText = String(analysisText);

      // 2) Extrahera fält
      const lines = analysisText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const productLine = lines.find(l => /^-\s*Produkt\/serie:/i.test(l)) || "";
      const modelLine   = lines.find(l => /^-\s*Serienummer\/modell:/i.test(l)) || "";
      let langdLine     = lines.find(l => /^-\s*Längd:/i.test(l)) || "";
      let breddLine     = lines.find(l => /^-\s*Bredd:/i.test(l)) || "";
      let hojdLine      = lines.find(l => /^-\s*Höjd:/i.test(l))  || "";
      let viktLine      = lines.find(l => /^-\s*Vikt:/i.test(l))  || "";
      const osakIdx     = lines.findIndex(l => /^-\s*Osäkerhet\/antaganden:/i.test(l));

      const product = valFrom(productLine, "Produkt\\/serie");
      const model   = valFrom(modelLine,   "Serienummer\\/modell");
      let langd     = valFrom(langdLine,   "Längd");
      let bredd     = valFrom(breddLine,   "Bredd");
      let hojd      = valFrom(hojdLine,    "Höjd");
      let vikt      = valFrom(viktLine,    "Vikt");
      let osak      = osakIdx >= 0 ? lines[osakIdx].replace(/^-+\s*Osäkerhet\/antaganden:\s*/i, "") : "";

      const missingSize =
        !langd || /osäker|okänd|n\/a|ingen/i.test(langd) ||
        !bredd || /osäker|okänd|n\/a|ingen/i.test(bredd) ||
        !hojd  || /osäker|okänd|n\/a|ingen/i.test(hojd);
      const missingWeight = !vikt || /osäker|okänd|n\/a|ingen/i.test(vikt);

      // 3) Enrichment om möjligt
      if ((missingSize || missingWeight) && product) {
        const enrich = await enrichSpecs({ product, model });
        if (enrich) {
          if (missingSize) {
            if (enrich.langd_cm) langd = `${enrich.langd_cm} cm`;
            if (enrich.bredd_cm) bredd = `${enrich.bredd_cm} cm`;
            if (enrich.hojd_cm)  hojd  = `${enrich.hojd_cm} cm`;
          }
          if (missingWeight && enrich.vikt_kg) {
            vikt = `${enrich.vikt_kg} kg`;
          }
          if (enrich.notis) {
            osak = osak ? `${osak} ${enrich.notis}` : enrich.notis;
          }

          analysisText = [
            product ? `- Produkt/serie: ${product}` : "- Produkt/serie: —",
            model   ? `- Serienummer/modell: ${model}` : "- Serienummer/modell: —",
            `- Längd: ${langd || "Osäker"}`,
            `- Bredd: ${bredd || "Osäker"}`,
            `- Höjd: ${hojd  || "Osäker"}`,
            `- Vikt: ${vikt  || "Osäker"}`,
            `- Osäkerhet/antaganden: ${osak || "—"}`
          ].join("\n");
        }
      }

      results.push({ imageIndex: i + 1, analysis: analysisText });

    } catch (err) {
      const status = err?.status || err?.response?.status;
      const humanMsg =
        err?.name === "AbortError" ? "Timeout mot OpenAI."
        : status === 429 ? "Rate limit hos OpenAI."
        : status ? `OpenAI-fel ${status}`
        : "Okänt OpenAI-fel";
      results.push({
        imageIndex: i + 1,
        analysis:
`- Produkt/serie: —
- Serienummer/modell: —
- Längd: Osäker
- Bredd: Osäker
- Höjd: Osäker
- Vikt: Osäker
- Osäkerhet/antaganden: ${humanMsg}.`
      });
    } finally {
      clearTimeout(timer);
    }
  }

  res.json(results);
}

// ====== ROUTER ======
// alias så att både /analyze och /api/analyze fungerar
app.post("/analyze", upload.array("images"), (req, res) => analyzeHandler(req, res));
app.post("/api/analyze", upload.array("images"), (req, res) => analyzeHandler(req, res));

// ====== START ======
app.listen(port, () => {
  console.log(`Server running on :${port}`);
});
