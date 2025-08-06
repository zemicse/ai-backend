const express = require("express");
const axios = require("axios");
const cors = require("cors");  // <-- importera cors

const app = express();

app.use(cors());              // <-- aktivera cors
app.use(express.json());

// Enkel "databas" över företag och deras kategorier
const företag = [
  { kategori: "flytt", namn: "Pooya AB" },
  { kategori: "städning", namn: "Rent & Snyggt AB" },
  { kategori: "målning", namn: "Färgproffsen AB" },
  // Lägg till fler företag/kategorier efter behov
];

// Enkel funktion för att hitta kategori i text (kan förbättras med NLP)
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

  // Försök hitta en kategori i prompten
  const kategori = hittaKategori(userInput);

  if (kategori) {
    // Hitta företag i denna kategori
    const matchandeFöretag = företag.find(f => f.kategori === kategori);
    if (matchandeFöretag) {
      // Returnera företagsnamnet direkt
      return res.json({ reply: matchandeFöretag.namn });
    }
  }

  // Om ingen kategori hittades, fråga AI som fallback
  const systemMessage = {
    role: "system",
    content: `Du är en assistent som endast svarar med företagsnamnet som passar bäst för användarens fråga. Svara endast med företagsnamnet på svenska. Inga emojis, inga andra ord.`
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

    // Ta bort emojis (om AI trots allt skickar dem)
    reply = reply.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF])+/, "");

    // Returnera bara första raden eller ordet för säkerhet
    reply = reply.split("\n")[0].split(".")[0];

    res.json({ reply });
  } catch (error) {
    console.error("🛑 Fel vid AI-anrop:", error.response?.data || error.message);
    res.status(500).json({ error: "Fel vid AI-anrop" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servern körs på http://localhost:${PORT}`);
});
