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

    try {
      const response = await openai.chat.completions.create({
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
              {
                type: "image_url",
                image_url: `data:${file.mimetype};base64,${base64Image}`
              }
            ]
          }
        ]
      });

      // Säkerställ att analys alltid är text
      let analysisText = response.choices[0]?.message?.content;
      if (typeof analysisText === "object") {
        analysisText = JSON.stringify(analysisText, null, 2);
      }

      results.push({
        imageIndex: i + 1,
        analysis: analysisText || "No description provided"
      });

    } catch (error) {
      results.push({
        imageIndex: i + 1,
        analysis: error.message || "Unknown error"
      });
    }
  }

  res.json(results);
});
