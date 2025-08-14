import express from "express";
import multer from "multer";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import FormData from "form-data";

dotenv.config();

// ...

for (let i = 0; i < req.files.length; i++) {
  const file = req.files[i];

  try {
    const formData = new FormData();
    formData.append("file", file.buffer, file.originalname);

    const response = await fetch("https://api.deepseek.com/v1/analyze", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    const data = await response.json();

    results.push({
      imageIndex: i + 1,
      analysis: data
    });
  } catch (error) {
    results.push({
      imageIndex: i + 1,
      analysis: { error_msg: error.message }
    });
  }
}
