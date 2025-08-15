import express from "express";
import multer from "multer";
import cors from "cors";
import OpenAI from "openai";
import http from "http";

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Tydliga CORS-headers + OPTIONS (preflight)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Per-request timeout så klienten får 504 istället för att hänga
app.use((req, res, next) => {
  res.setTimeout(110_000, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: "Timeout: servern tog för lång tid på sig." });
    }
  });
  next();
});

// Multer: lagra filer i minnet
const storage = multer.memoryStorage();
const upload = multer({ storage });

// OpenAI-klient
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Hjälp: konvertera buffer -> data-URL
function bufferToDataUrl(buffer, mimetype) {
  const b64 = buffer.toString("base64");
  return `data:${mimetype};base64,${b64}`;
}

// Healthcheck för att verifiera API-åtkomst/nyckel/org
app.get("/health/openai", async (_req, res) => {
  try {
    const models = await openai.models.list();
    res.json({ ok: true, modelCount: models.data?.length ?? 0 });
  } catch (e) {
    const status = e?.status || e?.response?.status;
    const body = e?.response?.data || e?.message;
    res.status(status || 500).json({ ok: false, status, error: body });
  }
});

// Enkel root
app.get("/", (_req, res) => {
  res.send("Image analysis backend is running.");
});

// Huvudroute: analysera bilder
app.post("/analyze", upload.array("images"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json([{ imageIndex: 1, analysis: "No images uploaded" }]);
    }

    const results = [];

    // Kör sekventiellt (stabilare på gratis hosting)
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const dataUrl = bufferToDataUrl(file.buffer, file.mimetype);

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 60_000); // avbryt OpenAI-kallet efter 60s

      try {
        const completion = await openai.chat.completions.create(
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `
Du är en expert på visuell objektidentifiering, förpackningsanalys och produktuppslag.
När du får en bild ska du:
- Identifiera objektet, särskilt om det är en låda, kartong, container eller produkt.
- Om text såsom produktnamn, modellnummer eller serienummer syns: använd det för att avgöra storlek och vikt från kända referenser.
- Om ingen exakt match hittas: uppskatta mått (i cm) och vikt (i kg) baserat på proportioner och vanliga förpackningsstandarder.
- Svara alltid kortfattat på svenska, i punktform.
- Skriv högst 5 punkter och inga långa stycken.
`
              },
              {
                role: "user",
                content: [
                  { type: "text", text: "Analysera bilden och ge vikt, storlek och beskrivning enligt instruktionerna." },
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
          analysis: `Error: ${humanMsg}\nDetaljer: ${
            typeof body === "string" ? body : JSON.stringify(body)
          }`
        });
      } finally {
        clearTimeout(timer);
      }
    }

    res.json(results);
  } catch (outerErr) {
    const msg =
      (outerErr?.response?.data && JSON.stringify(outerErr.response.data)) ||
      outerErr?.message ||
      "Unknown server error";
    res.status(500).send(msg);
  }
});

// Starta via http.Server för att kunna justera timeouts
const server = http.createServer(app);
server.headersTimeout = 120_000;  // tillåt långsammare headers
server.requestTimeout = 120_000;  // total tid per request

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
