const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // stora bilder

app.post('/ask', (req, res) => {
    const images = req.body.images || [];

    // Demo-analys: beräkna "storlek" = antal bytes i varje bild
    const analysis = images.map((img, i) => ({
        imageIndex: i + 1,
        sizeBytes: Buffer.from(img, 'base64').length
    }));

    res.json({
        message: `Analys färdig! Mottagit ${images.length} bild(er).`,
        analysis
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server startad på port ${PORT}`));
