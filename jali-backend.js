// JALI Streaming Platform - Backend API
// npm install express cors dotenv bcryptjs jsonwebtoken multer cloudinary stripe axios

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ============== DATA STORAGE (In-memory pour MVP) ==============
const users = new Map();
const videos = new Map();
const payments = [];
const revenues = new Map(); // { creatorId: { totalRevenue, shares: { contributorId: amount } } }

// ============== MIDDLEWARE ==============

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requis' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'jali_secret_key_2024');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token invalide' });
  }
};

// ============== AUTHENTIFICATION ==============

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (users.has(email)) {
      return res.status(400).json({ error: 'Email déjà enregistré' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = `user_${Date.now()}`;

    users.set(email, {
      id: userId,
      email,
      password: hashedPassword,
      name,
      role, // 'creator' ou 'viewer'
      balance: 0,
      createdAt: new Date(),
      mobileMoneyNumber: null,
      bankDetails: null,
      profile: {
        bio: '',
        avatar: '👤',
        categories: []
      }
    });

    const token = jwt.sign({ userId, email }, process.env.JWT_SECRET || 'jali_secret_key_2024');
    res.status(201).json({ token, user: { id: userId, email, name, role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.get(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const token = jwt.sign({ userId: user.id, email }, process.env.JWT_SECRET || 'jali_secret_key_2024');
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        balance: user.balance
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/profile', authenticate, (req, res) => {
  const userEmail = req.user.email;
  const user = Array.from(users.values()).find(u => u.id === req.user.userId);

  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    balance: user.balance,
    profile: user.profile
  });
});

// ============== VIDÉOS ==============

app.post('/api/videos/upload', authenticate, (req, res) => {
  try {
    const { title, description, category, videoUrl } = req.body;

    const videoId = `video_${Date.now()}`;
    videos.set(videoId, {
      id: videoId,
      creatorId: req.user.userId,
      title,
      description,
      category,
      videoUrl: videoUrl || 'https://example.com/video.mp4',
      views: 0,
      likes: 0,
      comments: [],
      contributors: [
        {
          id: req.user.userId,
          role: 'creator',
          sharePercent: 100 // Will be split among all contributors
        }
      ],
      createdAt: new Date(),
      thumbnail: '📹',
      status: 'published'
    });

    revenues.set(videoId, {
      totalRevenue: 0,
      shares: {}
    });

    res.status(201).json({
      id: videoId,
      message: 'Vidéo téléchargée avec succès'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/videos', (req, res) => {
  try {
    const videoList = Array.from(videos.values()).map(video => ({
      id: video.id,
      title: video.title,
      description: video.description,
      category: video.category,
      views: video.views,
      likes: video.likes,
      thumbnail: video.thumbnail,
      creatorId: video.creatorId,
      createdAt: video.createdAt
    }));

    res.json(videoList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/videos/:id', (req, res) => {
  try {
    const video = videos.get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Vidéo non trouvée' });

    // Increment views
    video.views += 1;

    res.json(video);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/videos/:id/like', authenticate, (req, res) => {
  try {
    const video = videos.get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Vidéo non trouvée' });

    video.likes += 1;
    res.json({ likes: video.likes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== PAIEMENTS & REVENUS ==============

app.post('/api/payments/mobile-money', authenticate, (req, res) => {
  try {
    const { amount, phoneNumber, provider } = req.body; // provider: 'MTN', 'Vodafone', 'Airtel', etc.

    const payment = {
      id: `payment_${Date.now()}`,
      userId: req.user.userId,
      type: 'subscription',
      amount,
      method: 'mobile_money',
      provider,
      phoneNumber,
      status: 'pending',
      createdAt: new Date(),
      processedAt: null
    };

    payments.push(payment);

    // Simulate payment processing
    setTimeout(() => {
      payment.status = 'completed';
      payment.processedAt = new Date();
      // Add to user's subscription
    }, 2000);

    res.status(201).json({
      paymentId: payment.id,
      status: 'pending',
      message: 'Paiement en cours de traitement'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payments/card', authenticate, (req, res) => {
  try {
    const { amount, cardToken } = req.body;

    // Integration avec Stripe/PayPal
    const payment = {
      id: `payment_${Date.now()}`,
      userId: req.user.userId,
      type: 'subscription',
      amount,
      method: 'card',
      status: 'processing',
      createdAt: new Date()
    };

    payments.push(payment);

    // Simulate Stripe charge
    setTimeout(() => {
      payment.status = 'completed';
    }, 1500);

    res.status(201).json({
      paymentId: payment.id,
      status: 'processing'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== RÉPARTITION DES REVENUS ==============

app.post('/api/revenues/distribute', authenticate, (req, res) => {
  try {
    const { videoId, totalAmount, shares } = req.body;
    // shares: { userId: percentageShare }

    const revenue = revenues.get(videoId);
    if (!revenue) return res.status(404).json({ error: 'Vidéo non trouvée' });

    revenue.totalRevenue += totalAmount;

    // Distribute revenue
    let distribution = [];
    Object.entries(shares).forEach(([userId, percent]) => {
      const amount = (totalAmount * percent) / 100;
      revenue.shares[userId] = (revenue.shares[userId] || 0) + amount;

      // Update user balance
      const user = Array.from(users.values()).find(u => u.id === userId);
      if (user) {
        user.balance += amount;
      }

      distribution.push({
        userId,
        percent,
        amount: amount.toFixed(2)
      });
    });

    res.json({
      videoId,
      totalDistributed: totalAmount,
      distribution
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/revenues/:userId', authenticate, (req, res) => {
  try {
    const userRevenues = [];
    let totalBalance = 0;

    revenues.forEach((revenue, videoId) => {
      if (revenue.shares[req.params.userId]) {
        userRevenues.push({
          videoId,
          earned: revenue.shares[req.params.userId],
          totalVideoRevenue: revenue.totalRevenue
        });
        totalBalance += revenue.shares[req.params.userId];
      }
    });

    res.json({
      userId: req.params.userId,
      totalBalance: totalBalance.toFixed(2),
      revenues: userRevenues
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== CRÉATEURS ==============

app.get('/api/creators', (req, res) => {
  try {
    const creators = Array.from(users.values())
      .filter(u => u.role === 'creator')
      .map(u => ({
        id: u.id,
        name: u.name,
        profile: u.profile,
        videos: Array.from(videos.values()).filter(v => v.creatorId === u.id).length
      }));

    res.json(creators);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/creators/:id/content', (req, res) => {
  try {
    const creatorVideos = Array.from(videos.values())
      .filter(v => v.creatorId === req.params.id)
      .map(v => ({
        id: v.id,
        title: v.title,
        views: v.views,
        likes: v.likes,
        revenue: Array.from(revenues.values()).find(r => r.id === v.id)?.totalRevenue || 0
      }));

    res.json(creatorVideos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== DASHBOARD STATS ==============

app.get('/api/dashboard/stats', authenticate, (req, res) => {
  try {
    const user = Array.from(users.values()).find(u => u.id === req.user.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    const userVideos = Array.from(videos.values()).filter(v => v.creatorId === user.id);
    const totalViews = userVideos.reduce((acc, v) => acc + v.views, 0);
    const totalLikes = userVideos.reduce((acc, v) => acc + v.likes, 0);

    res.json({
      balance: user.balance.toFixed(2),
      totalViews,
      totalLikes,
      videosCount: userVideos.length,
      videos: userVideos.map(v => ({
        id: v.id,
        title: v.title,
        views: v.views,
        likes: v.likes
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== CONTRIBUTIONS & COLLABORATIONS ==============

app.post('/api/videos/:id/add-contributor', authenticate, (req, res) => {
  try {
    const { contributorId, role, sharePercent } = req.body;
    // role: 'actor', 'musician', 'technician', 'editor', etc.

    const video = videos.get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Vidéo non trouvée' });

    // Only creator can add contributors
    if (video.creatorId !== req.user.userId) {
      return res.status(403).json({ error: 'Autorisation refusée' });
    }

    video.contributors.push({
      id: contributorId,
      role,
      sharePercent
    });

    res.json({
      message: 'Contributeur ajouté avec succès',
      contributors: video.contributors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== WITHDRAW ==============

app.post('/api/withdrawals/request', authenticate, (req, res) => {
  try {
    const { amount, method, details } = req.body;
    // method: 'mobile_money', 'bank_transfer'
    // details: { phoneNumber/bankAccount }

    const user = Array.from(users.values()).find(u => u.id === req.user.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    if (user.balance < amount) {
      return res.status(400).json({ error: 'Solde insuffisant' });
    }

    const withdrawal = {
      id: `withdraw_${Date.now()}`,
      userId: user.id,
      amount,
      method,
      details,
      status: 'pending',
      requestedAt: new Date(),
      processedAt: null
    };

    // Deduct from balance
    user.balance -= amount;

    // Simulate processing
    setTimeout(() => {
      withdrawal.status = 'completed';
      withdrawal.processedAt = new Date();
    }, 5000);

    res.json({
      withdrawalId: withdrawal.id,
      status: 'pending',
      message: 'Demande de retrait soumise. Traitement en cours...'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== HEALTH CHECK ==============

app.get('/api/health', (req, res) => {
  res.json({
    status: 'JALI Platform Running ✨',
    timestamp: new Date(),
    users: users.size,
    videos: videos.size,
    payments: payments.length
  });
});

// ============== SERVER START ==============

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🎬 JALI Streaming Platform API`);
  console.log(`📍 Running on http://localhost:${PORT}`);
  console.log(`✨ Ready to empower African creators!\n`);
});

module.exports = app;
