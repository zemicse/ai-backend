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

// Multer setup för filuppladdning
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Initiera OpenAI-klienten
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

      results.push({
        imageIndex: i + 1,
        analysis: response.choices[0].message.content
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
  console.log(`Server running on port ${port}`);
});
