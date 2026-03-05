const express = require('express');
const app = express();

app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    message: '✨ JALI plateforme est active et prête!'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'JALI API working!' });
});

// Videos endpoint (placeholder)
app.get('/api/videos', (req, res) => {
  res.json([
    { id: 1, title: 'Video 1', views: 100 },
    { id: 2, title: 'Video 2', views: 250 }
  ]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
