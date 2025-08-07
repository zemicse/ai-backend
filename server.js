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

Svara med ett färdigformulerat, vänligt och naturligt meddelande som alltid säger att vi gärna hjälper till och att vi kopplar ihop användaren med rätt företag.

Undvik formuleringar som "berätta mer". Använd istället formuleringar som:
- vi skulle behöva lite mer information
- vi behöver veta några detaljer
- vi behöver veta lite mer för att kunna hjälpa till

Variera svaret mellan dessa exempel (eller liknande):

Exempel 1:
Såklart ska du ha hjälp med att flytta pianot! För att koppla ihop dig med rätt företag behöver vi lite mer information.

Exempel 2:
Självklart hjälper vi dig med städningen! För att hitta rätt företag för dig skulle vi behöva veta några detaljer.

Exempel 3:
Absolut kan vi hjälpa till med det här. Vi behöver lite mer information för att koppla ihop dig med rätt företag.

Exempel 4:
Vi fixar det! Men först behöver vi lite mer information för att koppla ihop dig med rätt företag.

Exempel 5:
Det ska vi självklart lösa. Kan du beskriva lite mer vad du behöver hjälp med så kopplar vi ihop dig med rätt företag?

Exempel 6:
Vi hjälper dig gärna! För att kunna göra det behöver vi veta lite mer om vad du behöver.

Exempel 7:
Så fort vi har några fler detaljer från dig ser vi till att du får rätt hjälp.

Exempel 8:
Det ordnar vi! Vi skulle bara behöva några detaljer till för att matcha dig med rätt företag.

Anpassa svaret efter användarens behov (t.ex. flytt, VVS, städning osv) om det framgår. Max 2 meningar, inga emojis.`
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
