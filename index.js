import express from "express";
import multer from "multer";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Multer setup för filuppladdning (buffer i minnet)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Initiera OpenAI-klienten (API-nyckel finns i miljövariabel)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Hjälpfunktion: gör base64 data-URL av buffert
function bufferToDataUrl(buffer, mimetype) {
  const b64 = buffer.toString("base64");
  return `data:${mimetype};base64,${b64}`;
}

app.post("/analyze", upload.array("images"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    const results = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const dataUrl = bufferToDataUrl(file.buffer, file.mimetype);

      try {
        // Viktigt: image i Chat Completions ska ligga i image_url: { url: ... }
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an expert image analyst. Describe the content of the image in detail."
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Analyze this image and describe it in detail." },
                { type: "image_url", image_url: { url: dataUrl } }
              ]
            }
          ]
        });

        let analysisText = completion.choices?.[0]?.message?.content;
        if (analysisText == null) {
          analysisText = "No description provided";
        } else if (typeof analysisText !== "string") {
          analysisText = JSON.stringify(analysisText, null, 2);
        }

        results.push({
          imageIndex: i + 1,
          analysis: analysisText
        });
      } catch (error) {
        // Gör felmeddelandet alltid till sträng
        const msg =
          (error?.response?.data && JSON.stringify(error.response.data)) ||
          error?.message ||
          "Unknown error";
        results.push({
          imageIndex: i + 1,
          analysis: `Error: ${msg}`
        });
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

app.get("/", (_req, res) => {
  res.send("Image analysis backend is running.");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
