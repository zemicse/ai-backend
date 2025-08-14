import express from "express";
import multer from "multer";
import cors from "cors";
import fetch from "node-fetch"; // npm i node-fetch

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());

app.post("/analyze", upload.array("images"), async (req, res) => {
  try {
    const results = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];

      // Här skickar vi filen till DeepSeek API
      const response = await fetch("https://api.deepseek.com/analyze", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: file.buffer
      });

      const analysis = await response.json();
      results.push({ imageIndex: i + 1, analysis });
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Något gick fel vid analysen." });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server igång på port", process.env.PORT || 3000);
});
