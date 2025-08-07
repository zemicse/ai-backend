const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Svarsmallar för olika ärendekategorier
const templates = {
  flytt: "Här är de bästa företagen som kan hjälpa dig med {{beskrivning}}.",
  städning: "Här är de bästa företagen som kan hjälpa dig med {{beskrivning}}.",
  pianoflytt: "Här kommer de bästa företagen för att {{beskrivning}}.",
  magasinering: "Här är rekommenderade företag som erbjuder {{beskrivning}}.",
  kontorsflytt: "Här är företag som är bra på att hjälpa till med {{beskrivning}}.",
  rörmokare: "Här är de bästa företagen som kan hjälpa dig med {{beskrivning}}.",
  default: "Här är de bästa företagen som kan hjälpa dig med {{beskrivning}}."
};

function renderTemplate(kategori, beskrivning) {
  const template = templates[kategori.toLowerCase()] || templates["default"];
  return template.replace("{{beskrivning}}", beskrivning);
}

app.post("/ask", async (req, res) => {
  const userInput = req.body.prompt;
  if (!userInput) {
    return res.status(400).json({ error: "Prompt saknas" });
  }

  const systemMessage = {
    role: "system",
    content: `Du är en svensk assistent. Du får en användarfråga som handlar om att få hjälp med något (t.ex. flytt, städning, rörmokare).
Svar endast med ett JSON-objekt i följande format:
{
  "kategori": "kort kategori för ärendet", 
  "beskrivning": "vad användaren behöver hjälp med, i naturligt språk"
}

Inga andra kommentarer. Endast JSON.`
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

    const rawAiReply = response.data.choices[0].message.content.trim();

    // Logga AI:s råsvar
    console.log("🔍 AI-svar (råtext):", rawAiReply);

    let parsed;
    try {
      parsed = JSON.parse(rawAiReply);
    } catch (err) {
      console.error("❌ Kunde inte tolka AI-svaret som JSON:", rawAiReply);
      return res.status(500).json({
        error: "Kunde inte tolka AI-svar som JSON",
        rawReply: rawAiReply
      });
    }

    const { kategori, beskrivning } = parsed;

    if (!kategori || !beskrivning) {
      return res.status(500).json({
        error: "Ofullständigt AI-svar",
        rawReply: rawAiReply
      });
    }

    const reply = renderTemplate(kategori, beskrivning);

    res.json({
      userPrompt: userInput,
      interpretedCategory: kategori,
      interpretedDescription: beskrivning,
      reply
    });

  } catch (error) {
    console.error("🚨 Fel vid AI-anrop:", error.response?.data || error.message);
    res.status(500).json({
      error: "Fel vid AI-anrop",
      details: error.response?.data || error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servern körs på http://localhost:${PORT}`);
});
