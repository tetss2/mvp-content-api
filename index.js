const express = require("express");
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("MVP WORKING");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/generate-post", (req, res) => {
  const { topic } = req.body;

  res.json({
    success: true,
    topic: topic,
    text: `Пост на тему: ${topic}`
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
