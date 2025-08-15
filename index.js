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
        { signal: ac.signal }
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
