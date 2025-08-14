import express from "express";
import multer from "multer";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Multer setup för att ta emot bilder
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post("/analyze", upload.array("images"), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No images uploaded" });
  }

  const results = [];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];

    try {
      const response = await fetch("https://api.deepseek.ai/v1/analyze", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: file.buffer
      });

      const data = await response.json();

      results.push({
        imageIndex: i + 1,
        analysis: data
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
