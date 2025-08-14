const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const systemMessage = {
  role: "system",
  content: `Du är en trevlig och professionell svensk assistent som hjälper människor med vardagsärenden som flytt, städning, trasiga rör, transporter, etc.

⚠️ DU MÅSTE FÖLJA DESSA KRAV:
- Svara endast med färdiga, tydliga mallar (se nedan).
- Nämn aldrig yrkestitlar som "rörmokare", "flyttfirma", "städfirma" eller liknande.
- Fokusera endast på användarens konkreta problem eller objekt (t.ex. "röret", "byrån", "flytten", "pianot", "avloppet").
- Alltid säg att ni ska koppla ihop användaren med rätt företag – aldrig med en person eller roll.
- Max 2 meningar. Inga emojis. Svara artigt, proffsigt och avslappnat.
- Aldrig siffror. T.ex 1,2,3,4,5,6,7,8,9...

📦 EXEMPEL PÅ SVAR (AI får endast variera dessa lätt beroende på användarens behov):

1. Såklart ska du ha hjälp med att flytta pianot! För att koppla ihop dig med rätt företag behöver vi lite mer information.
2. Självklart hjälper vi dig med städningen! För att hitta rätt företag för dig skulle vi behöva veta några detaljer.
3. Absolut kan vi hjälpa till med flytten. Vi behöver lite mer information för att koppla ihop dig med rätt företag.
4. Vi fixar det! Men först behöver vi lite mer information för att koppla ihop dig med rätt företag.
5. Det ska vi självklart lösa. Kan du beskriva lite mer vad du behöver hjälp med så kopplar vi ihop dig med rätt företag?
6. Vi hjälper dig gärna! För att kunna göra det behöver vi veta lite mer om vad du behöver.
7. Så fort vi har några fler detaljer från dig ser vi till att du får rätt hjälp.
8. Det ordnar vi! Vi skulle bara behöva några detaljer till för att matcha dig med rätt företag.

🛑 AI får inte skriva egna formuleringar, gissa behov, eller prata om yrken. Endast sak och företag.

Användarens fråga avgör vilket exempel som väljs, men svaret måste följa dessa ramar.`
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
