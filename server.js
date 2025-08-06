const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Fler företag per kategori
const företag = [
  { kategori: "flytt", namn: "Pooya AB" },
  { kategori: "flytt", namn: "Flyttexperten AB" },
  { kategori: "flytt", namn: "Säker Flytt AB" },

  { kategori: "städning", namn: "Rent & Snyggt AB" },
  { kategori: "städning", namn: "TopClean AB" },
  { kategori: "städning", namn: "Glansigt Städ AB" },

  { kategori: "målning", namn: "Färgproffsen AB" },
  { kategori: "målning", namn: "Målarteamet AB" },
  { kategori: "målning", namn: "Kulör & Stil AB" },
];

// Funktion för att hitta kategori
function hittaKategori(text) {
  text = text.toLowerCase();

  if (text.includes("flytta") || text.includes("flytt") || text.includes("transport")) {
    return "flytt";
  }
  if (text.includes("städa") || text.includes("städning")) {
    return "städning";
  }
  if (text.includes("måla") || text.includes("målning") || text.includes("färg")) {
    return "målning";
  }

  return null;
}

app.post("/ask", async (req, res) => {
  const userInput = req.body.prompt;
  if (!userInput) {
    return res.status(400).json({ error: "Prompt saknas" });
  }

  // Försök hitta kategori
  const kategori = hittaKategori(userInput);

  if (kategori) {
    const matchandeFöretag = företag
      .filter(f => f.kategori === kategori)
      .slice(0, 3)
      .map(f => f.namn);

    if (matchandeFöretag.length > 0) {
      return res.json({
        message: "Här är de bästa företagen för dig:",
        reply: matchandeFöretag
      });
    }
  }

  // Fallback till AI (om ingen kategori)
  const systemMessage = {
    role: "system",
    content: `Du är en assistent som hjälper användare att hitta företag i Sverige baserat på deras behov. Svara med max tre relevanta företagsnamn i punktlista. Inga emojis eller förklaringar.`
  };

  try {
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          systemMessage,
          { role: "user", content: userInput }
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    let reply = response.data.choices[0].message.content.trim();

    // Ta bort emojis
    reply = reply.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF])+/g, "");

    // Dela upp AI-svaret i flera rader
    let replyArray = reply.split(/\n|,|;/).map(s => s.trim()).filter(Boolean).slice(0, 3);

    res.json({
      message: "Här är de bästa företagen för dig:",
      reply: replyArray
    });
  } catch (error) {
    console.error("🛑 Fel vid AI-anrop:", error.response?.data || error.message);
    res.status(500).json({ error: "Fel vid AI-anrop" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servern körs på http://localhost:${PORT}`);
});
