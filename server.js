const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

// Exempeldata med företag per kategori
const företagPerKategori = {
  flytt: ["Pooya AB", "Flyttexperterna AB", "Snabba Flyttar"],
  trädgård: ["Gröna Fingrar AB", "Trädgårdsmästarna AB"],
  städning: ["Rent & Fint AB", "Städproffsen AB"],
  bygg: ["Bygg & Fix AB", "Hantverkarna AB"],
  // Lägg till fler kategorier och företag här
};

// Funktion för att matcha kategori baserat på input-text
function hittaKategori(text) {
  const textLower = text.toLowerCase();
  if (textLower.includes("flytt") || textLower.includes("piano")) return "flytt";
  if (textLower.includes("trädgård") || textLower.includes("gräsmatta")) return "trädgård";
  if (textLower.includes("städning") || textLower.includes("städa")) return "städning";
  if (textLower.includes("bygg") || textLower.includes("renovera")) return "bygg";
  // Lägg till fler regler här
  return null; // Kategori ej hittad
}

app.post("/ask", async (req, res) => {
  const userInput = req.body.prompt;
  if (!userInput) {
    return res.status(400).json({ error: "Prompt saknas" });
  }

  // Försök matcha kategori
  const kategori = hittaKategori(userInput);

  if (kategori && företagPerKategori[kategori]) {
    // Returnera företag från vår fasta lista för kategorin
    const företag = företagPerKategori[kategori][0]; // Väljer första företaget som "bäst"
    return res.json({ reply: företag });
  }

  // Om ingen kategori hittas, kan vi låta AI:n svara fritt (valfritt)
  // Eller returnera ett generellt svar:
  return res.json({ reply: "Tyvärr, jag kan inte hitta något företag som passar för din förfrågan just nu." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servern körs på port ${PORT}`);
});
