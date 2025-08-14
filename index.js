import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Initiera OpenAI med din nyckel från https://platform.openai.com
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
    const imageUrl = `data:${file.mimetype};base64,${base64Image}`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // eller "gpt-4o" om du vill ha max kvalitet
        messages: [
          { role: "system", content: "Du är en expert på bildanalys. Beskriv bilden kortfattat på svenska." },
          { role: "user", content: [
              { type: "text", text: "Vad ser du på den här bilden?" },
              { type: "image_url", image_url: imageUrl }
            ]
          }
        ]
      });

      const analysis = completion.choices[0].message.content;
      results.push({
        imageIndex: i + 1,
        analysis
      });

    } catch (error) {
      results.push({
        imageIndex: i + 1,
        analysis: { error_msg: error.message }
      });
    }
  }

  res.json(results);
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
