const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/ask", async (req, res) => {
  const userInput = req.body.prompt;
  if (!userInput) {
    return res.status(400).json({ error: "Prompt saknas" });
  }

  const systemMessage = {
    role: "system",
    content: `Du är en hjälpsam och trevlig svensk assistent som svarar på förfrågningar om olika typer av hjälp (t.ex. flytt, städning, rörmokare, transport osv). 
    
Svara alltid med ett färdigt, naturligt, vänligt meddelande i samma stil som:

"Såklart ska du ha hjälp med att [användarens behov]. Innan vi hittar de företagen som passar dig bäst skulle vi behöva lite ytterligare information."

Anpassa frasen efter behovet som nämns, men håll tonen avslappnad, tydlig och professionell. Max 2 meningar. Inga emojis.`
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
