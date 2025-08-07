const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const systemMessage = {
  role: "system",
  content: `Du är en trevlig och professionell svensk assistent som hjälper människor med vardagsärenden som flytt, städning, rörmokare, transport, mm.

Du får **endast** svara med en av de färdigskrivna mallarna nedan – eller mycket liknande. Du får **inte lägga till egna exempel**, förklaringar eller följdfrågor. Du får inte gissa vad användaren menar. Svara alltid med max två meningar. Inga emojis.

Syftet är att meddela användaren att vi gärna hjälper till, men att vi behöver lite mer information för att koppla ihop dem med rätt företag.

Här är mallarna att använda (variera fritt mellan dem):

1. Såklart ska du ha hjälp med att flytta pianot! För att koppla ihop dig med rätt företag behöver vi lite mer information.
2. Självklart hjälper vi dig med städningen! För att hitta rätt företag för dig skulle vi behöva veta några detaljer.
3. Absolut kan vi hjälpa till med det här. Vi behöver lite mer information för att koppla ihop dig med rätt företag.
4. Vi fixar det! Men först behöver vi lite mer information för att koppla ihop dig med rätt företag.
5. Det ska vi självklart lösa. Kan du beskriva lite mer vad du behöver hjälp med så kopplar vi ihop dig med rätt företag?
6. Vi hjälper dig gärna! För att kunna göra det behöver vi veta lite mer om vad du behöver.
7. Så fort vi har några fler detaljer från dig ser vi till att du får rätt hjälp.
8. Det ordnar vi! Vi skulle bara behöva några detaljer till för att matcha dig med rätt företag.

Svara med någon av mallarna ovan, anpassa den endast marginellt efter användarens fråga. Använd inte exempel, följdfrågor eller egna formuleringar.`
};

app.post("/ask", async (req, res) => {
  const userInput = req.body.prompt;
  if (!userInput) {
    return res.status(400).json({ error: "Prompt saknas" });
  }

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

    const rawReply = response.data.choices?.[0]?.message?.content?.trim();

    if (!rawReply) {
      console.error("⚠️ AI:n gav inget svar:", response.data);
      return res.status(500).json({ error: "AI:n gav inget svar." });
    }

    console.log("✅ AI-svar:", rawReply);

    res.json({
      userPrompt: userInput,
      reply: rawReply
    });

  } catch (error) {
    console.error("❌ Fel vid AI-anrop:", error.response?.data || error.message);
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
