const express = require("express");
const axios = require("axios");
const cors = require("cors");

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
    content: `Du är en vänlig svensk assistent som direkt säger att vi gärna hjälper till med flytten, städningen eller vad det nu är. Inga andra ämnen eller diskussioner. Var kort, professionell och avslappnad, utan emojis.`
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

    const reply = response.data.choices[0].message.content.trim();

    res.json({
      userPrompt: userInput,
      reply
    });

  } catch (error) {
    console.error("Fel vid AI-anrop:", error.response?.data || error.message);
    res.status(500).json({ error: "Fel vid AI-anrop" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servern körs på http://localhost:${PORT}`);
});
