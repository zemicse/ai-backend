import express from "express";
import multer from "multer";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* -------------------------------------------------------
 * HÄLSOKOLL
 * -----------------------------------------------------*/
app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

/* =======================================================
 * BILDANALYS – alltid försök ge MÅTT & VIKT
 * 1) Försök OCR + igenkänning + specifikationer
 * 2) Om mått/vikt saknas → gör ett kort "enrichment"-anrop
 * =====================================================*/
app.post("/analyze", upload.array("images"), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No images uploaded" });
  }

  const SYSTEM_PROMPT = `
Du är en svensk produktigenkännare och specifikationsassistent.
Ditt mål är att returnera ENDAST en kort punktlista (max 5 punkter) med dessa fem rader i denna ordning:

- Produkt/serie: <text>
- Serienummer/modell: <text>
- Mått (L×B×H): <cm>
- Vikt: <kg>
- Osäkerhet/antaganden: <text>

Regler:
- Läs av all synlig text (etiketter, serienr, modell, varumärke) i bilden.
- Om produkten är en känd serie/produkt (t.ex. IKEA GALANT, iPhone, Bosch etc.):
  • Ange standardmått och vikt för den vanligaste varianten ur din inlärda kunskap.
  • Om det finns flera varianter: välj den mest sannolika och nämn kort andra vanliga storlekar i "Osäkerhet/antaganden".
- Om produkt ej känns igen: ge en rimlig uppskattning (intervall) i cm/kg baserat på proportioner och kontext.
- Alltid centimeter för mått och kilogram för vikt.
- Skriv kort och utan extra brödtext.
`.trim();

  // Litet hjälpbeteende för att fylla i saknade specs när vi ändå identifierat serienamnet
  async function enrichSpecs({ product, model }) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content: `
Du är en svensk produktkatalogsassistent. Om du känner till en kommersiell produkt/serie från din inlärda kunskap:
- Ge typiska standardmått (L×B×H i cm) och vikt (kg) för den vanligaste varianten.
- Om flera varianter finns: välj den mest vanliga men nämn alternativ kort.
Returnera exakt JSON:
{"maat":"L×B×H i cm","vikt":"kg","notis":"kort valfri kommentar"}`
            .trim()
        },
        {
          role: "user",
          content: `
Produkt/serie: ${product || "okänd"}
Modell: ${model || "okänd"}

Ge JSON enligt instruktionen.`.trim()
        }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";
    // Försök att hitta JSON i svaret
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }

  function pick(line, key) {
    const rx = new RegExp(`${key}\\s*:\\s*(.*)`, "i");
    const m = line.match(rx);
    return m ? m[1].trim() : null;
  }

  const results = [];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const base64Image = file.buffer.toString("base64");
    const dataUrl = `data:${file.mimetype};base64,${base64Image}`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 45_000);

    try {
      // --- Första passet: OCR + igenkänning + specs
      const completion = await openai.chat.completions.create(
        {
          model: "gpt-4o-mini",
          temperature: 0.15,
          max_tokens: 280,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Analysera bilden och returnera en punktlista enligt formatet." },
                { type: "image_url", image_url: { url: dataUrl } }
              ]
            }
          ]
        },
        { signal: ac.signal }
      );

      let analysisText = completion.choices?.[0]?.message?.content || "";
      if (typeof analysisText !== "string") {
        analysisText = JSON.stringify(analysisText, null, 2);
      }

      // --- Plocka ut fält
      const lines = analysisText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const productLine = lines.find(l => /^-\s*Produkt\/serie:/i.test(l)) || "";
      const modelLine   = lines.find(l => /^-\s*Serienummer\/modell:/i.test(l)) || "";
      let maatLine      = lines.find(l => /^-\s*Mått\s*\(.*\):/i.test(l)) || "";
      let viktLine      = lines.find(l => /^-\s*Vikt:/i.test(l)) || "";
      const osakLineIdx = lines.findIndex(l => /^-\s*Osäkerhet\/antaganden:/i.test(l));

      const product = pick(productLine, "Produkt/serie");
      const model   = pick(modelLine, "Serienummer\\/modell");
      let maatVal   = pick(maatLine, "Mått\\s*\\(.*\\)");
      let viktVal   = pick(viktLine, "Vikt");
      let osakerhet = osakLineIdx >= 0 ? lines[osakLineIdx].replace(/^-+\s*Osäkerhet\/antaganden:\s*/i, "") : "";

      const needMaat = !maatVal || /osäker|okänd|n\/a|ingen/i.test(maatVal);
      const needVikt = !viktVal || /osäker|okänd|n\/a|ingen/i.test(viktVal);

      // --- Om vi saknar mått/vikt men har ett produktnamn → enrichment
      if ((needMaat || needVikt) && product) {
        const enrich = await enrichSpecs({ product, model });
        if (enrich) {
          if (needMaat && enrich.maat) maatVal = enrich.maat;
          if (needVikt && enrich.vikt) viktVal = enrich.vikt;
          if (enrich.notis) {
            osakerhet = osakerhet
              ? `${osakerhet} ${enrich.notis}`
              : enrich.notis;
          }
          // Sätt tillbaka in i sina rader
          maatLine = `- Mått (L×B×H): ${maatVal || "Osäker"}`;
          viktLine = `- Vikt: ${viktVal || "Osäker"}`;
          const osakLine = `- Osäkerhet/antaganden: ${osakerhet || "—"}`;

          // Bygg en ren femradslista (även om originalet saknade någon rad)
          const cleanOut = [
            product ? `- Produkt/serie: ${product}` : "- Produkt/serie: —",
            model ? `- Serienummer/modell: ${model}` : "- Serienummer/modell: —",
            maatLine,
            viktLine,
            osakLine
          ].join("\n");

          analysisText = cleanOut;
        }
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
        analysis: `- Produkt/serie: —
- Serienummer/modell: —
- Mått (L×B×H): Osäker
- Vikt: Osäker
- Osäkerhet/antaganden: ${humanMsg}.`
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