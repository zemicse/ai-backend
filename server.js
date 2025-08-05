const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// DEBUG: kontrollera att API-nyckeln laddas
console.log("✅ DEEPSEEK_API_KEY laddad:", !!process.env.DEEPSEEK_API_KEY);

app.post("/ask", async (req, res) => {
  console.log("Incoming body:", req.body);
  const userInput = req.body.prompt;
  console.log("userInput:", userInput);

  if (!userInput) {
    return res.status(400).json({ error: "Prompt saknas i request body" });
  }

  try {
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [{ role: "user", content: userInput }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("🛑 API-fel:", error.response?.data || error.message);
    res.status(500).json({ error: "Något gick fel vid API-anropet" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servern körs på http://localhost:${PORT}`);
});
