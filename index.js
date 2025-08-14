const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

app.post("/analyze-image", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Ingen bild uppladdad" });
  }

  const imageBuffer = req.file.buffer;

  // Här skickar du imageBuffer till Deepseek AI
  // Exempel: const result = await deepseekAnalyze(imageBuffer);

  // Tillfälligt svar för test
  const result = {
    message: "Bild mottagen och analyserad (simulerat svar)",
    size: "120x80 cm",
    weight: "15 kg"
  };

  res.json(result);
});

app.listen(port, () => {
  console.log(`Servern kör på port ${port}`);
});
