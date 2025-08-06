const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Databas med företag och deras kategorier (minst 3 per kategori)
const företag = [
  // Flyttföretag
  { kategori: "flytt", namn: "Pooya AB" },
  { kategori: "flytt", namn: "Snabba Flyttarna AB" },
  { kategori: "flytt", namn: "Trygga Flyttservice" },

  // Städning
  { kategori: "städning", namn: "Rent & Snyggt AB" },
  { kategori: "städning", namn: "Glans & Fix AB" },
  { kategori: "städning", namn: "Rent Hem AB" },

  // Målning
  { kategori: "målning", namn: "Färgproffsen AB" },
  { kategori: "målning", namn: "Färghuset AB" },
  { kategori: "målning", namn: "Målarteamet AB" },

  // Trädgård (exempel på kategori du nämnde)
  { kategori: "trädgård", namn: "Gröna Fingrar AB" },
  { kategori: "trädgård", namn: "Trädgårdsfixarna" },
  { kategori: "trädgård", namn: "Blomsterproffsen" },
];

// Funktion för att hitta kategori baserat på texten
function hittaKategori(text) {
  text = text.toLowerCase();

  if (text.includes("flytta") || text.includes("flytt") || text.includes("transport")) {
    return "flytt";
  }
  if (text.includes("städa") || text.includes("städning") || text.includes("rengöring")) {
    return "städning";
  }
  if (text.includes("måla") || text.includes("målning") || text.includes("färg")) {
    return "målning";
  }
  if (text.includes("trädgård") || text.includes("plantera") || text.includes("gräsmatta")) {
    return "trädgård";
  }

  return null;
}

app.post("/ask", async (req, res) => {
  const userInput = req.body.prompt;
  if (!userInput) {
    return res.status(400).json({ error: "Prompt saknas" });
  }

  // Hitta kategori i prompten
  const kategori = hittaKategori(userInput);

  if (kategori) {
    // Hämta upp till 3 företag i kategorin
    const matchandeFöretag = företag
      .filter(f => f.kategori === kategori)
      .slice(0, 3);

    if (matchandeFöretag.length > 0) {
      // Returnera som kommaseparerad sträng
      const namnLista = matchandeFöretag.map(f => f.namn);
      return res.json({ reply: namnLista.join(", ") });
    }
  }

  // Fallback till AI om kategori inte hittas
  const systemMessage = {
    role: "system",
    content: `Du är en assistent som endast svarar med företagsnamnet som passar bäst för användarens fråga. Svara endast med företagsnamnet på svenska. Inga emojis, inga andra ord.`,
  };

  try {
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          systemMessage,
          { role: "user", content: userInput },
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

    // Ta bort emojis om AI skickar det
    reply = reply.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF])+/, "");

    // Returnera första raden
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
