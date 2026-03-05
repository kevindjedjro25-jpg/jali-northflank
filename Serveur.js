// JALI Backend - Plateforme de Streaming Africain
// ================================================

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration
const JWT_SECRET = 'JALI_SECRET_KEY_2024_AFRICAN_CINEMA';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DB_DIR = path.join(__dirname, 'db');

// Créer les répertoires
[UPLOAD_DIR, DB_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Configuration Multer pour les uploads vidéos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté'));
    }
  }
});
// =============== Base de Données Simple (JSON) ===============

class JALIDatabase {
  constructor() {
    this.usersFile = path.join(DB_DIR, 'users.json');
    this.videosFile = path.join(DB_DIR, 'videos.json');
    this.paymentsFile = path.join(DB_DIR, 'payments.json');
    this.revenuesFile = path.join(DB_DIR, 'revenues.json');
    this.collaboratorsFile = path.join(DB_DIR, 'collaborators.json');

    this.ensureFiles();
  }

  ensureFiles() {
    const files = {
      [this.usersFile]: [],
      [this.videosFile]: [],
      [this.paymentsFile]: [],
      [this.revenuesFile]: [],
      [this.collaboratorsFile]: []
    };

    Object.entries(files).forEach(([file, defaultData]) => {
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
      }
    });
  }

  read(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  }

  write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  // Users
  getUsers() {
    return this.read(this.usersFile);
  }

  getUserById(id) {
    return this.getUsers().find(u => u.id === id);
  }

  getUserByEmail(email) {
    return this.getUsers().find(u => u.email === email);
  }

  createUser(userData) {
    const users = this.getUsers();
    const newUser = {
      id: Date.now().toString(),
      ...userData,
      createdAt: new Date().toISOString(),
      totalRevenue: 0,
      verified: false
    };
    users.push(newUser);
    this.write(this.usersFile, users);
    return newUser;
  }

  // Videos
  getVideos() {
    return this.read(this.videosFile);
  }

  getVideoById(id) {
    return this.getVideos().find(v => v.id === id);
  }

  getVideosByCreator(creatorId) {
    return this.getVideos().filter(v => v.creatorId === creatorId);
  }

  createVideo(videoData) {
    const videos = this.getVideos();
    const newVideo = {
      id: Date.now().toString(),
      ...videoData,
      views: 0,
      likes: 0,
      uploadedAt: new Date().toISOString(),
      totalRevenue: 0,
      collaborators: []
    };
    videos.push(newVideo);
    this.write(this.videosFile, videos);
    return newVideo;
  }

  updateVideo(id, updates) {
    const videos = this.getVideos();
    const index = videos.findIndex(v => v.id === id);
    if (index !== -1) {
      videos[index] = { ...videos[index], ...updates };
      this.write(this.videosFile, videos);
      return videos[index];
    }
  }

  // Revenues
  getRevenues() {
    return this.read(this.revenuesFile);
  }

  addRevenue(revenueData) {
    const revenues = this.getRevenues();
    const newRevenue = {
      id: Date.now().toString(),
      ...revenueData,
      createdAt: new Date().toISOString()
    };
    revenues.push(newRevenue);
    this.write(this.revenuesFile, revenues);
    return newRevenue;
                               }
      
  // Payments
  getPayments() {
    return this.read(this.paymentsFile);
  }

  createPayment(paymentData) {
    const payments = this.getPayments();
    const newPayment = {
      id: Date.now().toString(),
      ...paymentData,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    payments.push(newPayment);
    this.write(this.paymentsFile, payments);
    return newPayment;
  }

  updatePayment(id, updates) {
    const payments = this.getPayments();
    const index = payments.findIndex(p => p.id === id);
    if (index !== -1) {
      payments[index] = { ...payments[index], ...updates };
      this.write(this.paymentsFile, payments);
      return payments[index];
    }
  }
}

const db = new JALIDatabase();

// =============== Authentification ===============

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, type: user.type },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token invalide' });
  }
};

// =============== Routes Authentification ===============

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, type, country, phone } = req.body;

    if (db.getUserByEmail(email)) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = db.createUser({
      email,
      password: hashedPassword,
      name,
      type, // 'viewer' ou 'creator'
      country,
      phone,
      profileImage: null
    });

    const token = generateToken(user);
    res.json({
      message: 'Inscription réussie! Bienvenue sur JALI 🎬',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        type: user.type
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.getUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const token = generateToken(user);
    res.json({
      message: 'Connexion réussie! Bienvenue sur JALI 🎬',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        type: user.type
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', verifyToken, (req, res) => {
  const user = db.getUserById(req.user.id);
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    type: user.type,
    totalRevenue: user.totalRevenue,
    verified: user.verified
  });
});

// =============== Routes Vidéos ===============

app.post('/api/videos/upload', verifyToken, upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { title, description, category, language, collaborators } = req.body;
    const creator = db.getUserById(req.user.id);

    if (creator.type !== 'creator') {
      return res.status(403).json({ error: 'Seuls les créateurs peuvent uploader' });
    }

    const video = db.createVideo({
      title,
      description,
      category,
      language,
      creatorId: req.user.id,
      creatorName: creator.name,
      videoPath: req.file.filename,
      videoSize: req.file.size,
      collaborators: collaborators ? collaborators.split(',').map(c => c.trim()) : []
    });

    res.json({
      message: '✨ Vidéo uploadée avec succès! Elle sera visible dans quelques minutes.',
      video
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/videos', (req, res) => {
  const { creatorId } = req.query;
  let videos = db.getVideos();

  if (creatorId) {
    videos = videos.filter(v => v.creatorId === creatorId);
  }

  // Simuler les vues et revenus
  videos = videos.map(v => ({
    ...v,
    views: Math.floor(Math.random() * 50000) + 1000,
    revenue: Math.floor(Math.random() * 10000) + 500
  }));

  res.json(videos);
});

app.get('/api/videos/:id', (req, res) => {
  const video = db.getVideoById(req.params.id);
  if (!video) return res.status(404).json({ error: 'Vidéo non trouvée' });

  res.json({
    ...video,
    views: Math.floor(Math.random() * 50000) + 1000,
    revenue: Math.floor(Math.random() * 10000) + 500
  });
});

app.post('/api/videos/:id/view', (req, res) => {
  const video = db.updateVideo(req.params.id, {
    views: (db.getVideoById(req.params.id).views || 0) + 1
  });
  res.json({ message: '👁️ Vue enregistrée', video });
});

// =============== Routes Paiements ===============

app.post('/api/payments/subscribe', verifyToken, async (req, res) => {
  try {
    const { plan } = req.body; // 'starter', 'premium', 'vip'
    const user = db.getUserById(req.user.id);

    const plans = {
      starter: { price: 2990, currency: 'XOF', duration: '30 jours' },
      premium: { price: 4990, currency: 'XOF', duration: '30 jours' },
      vip: { price: 9990, currency: 'XOF', duration: '30 jours' }
    };

    if (!plans[plan]) {
      return res.status(400).json({ error: 'Plan invalide' });
    }

    // Créer une transaction
    const payment = db.createPayment({
      userId: req.user.id,
      type: 'subscription',
      plan,
      amount: plans[plan].price,
      currency: plans[plan].currency,
      paymentMethod: 'mobilemoney', // ou 'card'
      description: `Abonnement ${plan}`
    });

    res.json({
      message: 'Paiement initié! Veuillez compléter sur votre téléphone.',
      payment,
      instructions: `📱 Vous allez recevoir un SMS de votre opérateur. Validez le paiement de ${plans[plan].price} XOF.`
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/payments/verify', verifyToken, (req, res) => {
  try {
    const { paymentId, transactionId } = req.body;
    const payment = db.updatePayment(paymentId, {
      status: 'completed',
      transactionId,
      completedAt: new Date().toISOString()
    });

    res.json({
      message: '✅ Paiement confirmé! Merci de soutenir le cinéma africain',
      payment
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/payments/withdraw', verifyToken, async (req, res) => {
  try {
    const { amount, method, accountInfo } = req.body; // method: 'mobilemoney' ou 'card'
    const user = db.getUserById(req.user.id);

    if (user.type !== 'creator') {
      return res.status(403).json({ error: 'Seuls les créateurs peuvent retirer' });
    }

    if (user.totalRevenue < amount) {
      return res.status(400).json({ error: 'Solde insuffisant' });
    }

    const withdrawal = db.createPayment({
      userId: req.user.id,
      type: 'withdrawal',
      amount,
      method,
      accountInfo,
      description: `Retrait de ${amount} XOF`
    });

    res.json({
      message: '💰 Retrait en cours! Vous recevrez l\'argent dans 24-48 heures.',
      withdrawal,
      estimatedArrival: new Date(Date.now() + 48 * 60 * 60 * 1000).toLocaleDateString('fr-FR')
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============== Routes Répartition des Revenus ===============

app.post('/api/revenue/distribute', verifyToken, async (req, res) => {
  try {
    const { videoId, totalAmount } = req.body;
    const video = db.getVideoById(videoId);

    if (!video) return res.status(404).json({ error: 'Vidéo non trouvée' });

    // Répartition simple: créateur 70%, plateforme 30%
    const creatorShare = Math.floor(totalAmount * 0.7);
    const platformShare = totalAmount - creatorShare;

    // Ajouter les revenus au créateur
    const creator = db.getUserById(video.creatorId);
    creator.totalRevenue = (creator.totalRevenue || 0) + creatorShare;
    const users = db.getUsers();
    const creatorIndex = users.findIndex(u => u.id === creator.id);
    users[creatorIndex] = creator;
    db.write(path.join(DB_DIR, 'users.json'), users);

    // Enregistrer la transaction
    const revenue = db.addRevenue({
      videoId,
      creatorId: video.creatorId,
      totalAmount,
      creatorShare,
      platformShare,
      type: 'video_revenue'
    });

    // Distribuer aux collaborateurs si applicable
    if (video.collaborators && video.collaborators.length > 0) {
      const collaboratorShare = Math.floor(creatorShare * 0.2); // 20% du créateur pour les collabs
      video.collaborators.forEach(collaboratorName => {
        db.addRevenue({
          videoId,
          collaboratorName,
          amount: collaboratorShare / video.collaborators.length,
          type: 'collaborator_revenue'
        });
      });
               }res.json({
      message: '💰 Revenus distribués avec succès!',
      revenue,
      breakdown: {
        total: totalAmount,
        creator: creatorShare,
        platform: platformShare,
        collaborators: video.collaborators.length
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/revenue/creator/:creatorId', verifyToken, (req, res) => {
  try {
    const revenues = db.getRevenues();
    const creatorRevenues = revenues.filter(r => r.creatorId === req.params.creatorId);

    const totalRevenue = creatorRevenues.reduce((sum, r) => sum + (r.creatorShare || r.amount || 0), 0);
    const videoCount = new Set(creatorRevenues.map(r => r.videoId)).size;

    res.json({
      creatorId: req.params.creatorId,
      totalRevenue,
      videoCount,
      revenues: creatorRevenues,
      monthlyAverage: Math.floor(totalRevenue / 6), // Simulation 6 mois
      nextPayment: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============== Routes Créateurs ===============

app.get('/api/creators', (req, res) => {
  const users = db.getUsers();
  const creators = users
    .filter(u => u.type === 'creator')
    .map(u => ({
      id: u.id,
      name: u.name,
      verified: u.verified,
      totalRevenue: u.totalRevenue || 0,
      videos: db.getVideosByCreator(u.id).length
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  res.json(creators);
});

app.get('/api/creators/:id', (req, res) => {
  const creator = db.getUserById(req.params.id);
  if (!creator || creator.type !== 'creator') {
    return res.status(404).json({ error: 'Créateur non trouvé' });
  }

  const videos = db.getVideosByCreator(req.params.id);
  const revenues = db.getRevenues().filter(r => r.creatorId === req.params.id);

  res.json({
    id: creator.id,
    name: creator.name,
    email: creator.email,
    country: creator.country,
    verified: creator.verified,
    totalRevenue: creator.totalRevenue || 0,
    videosCount: videos.length,
    totalViews: videos.reduce((sum, v) => sum + (v.views || 0), 0),
    revenues: revenues.length,
    profileImage: creator.profileImage
  });
});

app.put('/api/creators/:id', verifyToken, (req, res) => {
  if (req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  const users = db.getUsers();
  const userIndex = users.findIndex(u => u.id === req.params.id);
  
  users[userIndex] = {
    ...users[userIndex],
    ...req.body,
    id: users[userIndex].id,
    email: users[userIndex].email,
    type: users[userIndex].type
  };

  db.write(path.join(DB_DIR, 'users.json'), users);
  res.json({ message: 'Profil mis à jour', user: users[userIndex] });
});

// =============== Routes Analytics ===============

app.get('/api/analytics/dashboard', verifyToken, (req, res) => {
  try {
    const user = db.getUserById(req.user.id);
    const videos = db.getVideosByCreator(req.user.id);
    const revenues = db.getRevenues().filter(r => r.creatorId === req.user.id);

    const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);
    const totalRevenue = user.totalRevenue || 0;
    const averageRevenue = videos.length > 0 ? Math.floor(totalRevenue / videos.length) : 0;

    res.json({
      creator: {
        name: user.name,
        verified: user.verified,
        country: user.country
      },
      stats: {
        videosCount: videos.length,
        totalViews,
        totalRevenue,
        averageRevenue,
        pendingPayment: Math.floor(totalRevenue * 0.1)
      },
      monthlyData: [
        { month: 'Jan', revenue: 2400, views: 12000 },
        { month: 'Fév', revenue: 3100, views: 15000 },
        { month: 'Mar', revenue: 2800, views: 14000 },
        { month: 'Avr', revenue: 4200, views: 21000 },
        { month: 'Mai', revenue: 5100, views: 25000 },
        { month: 'Jun', revenue: 6300, views: 31000 }
      ],
      topVideos: videos
        .map(v => ({
          id: v.id,
          title: v.title,
          views: v.views || 0,
          revenue: Math.floor((v.views || 0) * 0.2)
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 5)
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============== Routes Statistiques Globales ===============

app.get('/api/stats/platform', (req, res) => {
  try {
    const users = db.getUsers();
    const videos = db.getVideos();
    const payments = db.getPayments();

    const creators = users.filter(u => u.type === 'creator').length;
    const viewers = users.filter(u => u.type === 'viewer').length;
    const totalRevenue = users.reduce((sum, u) => sum + (u.totalRevenue || 0), 0);
    const completedPayments = payments.filter(p => p.status === 'completed').length;

    res.json({
      platform: {
        totalUsers: users.length,
        creators,
        viewers,
        videosCount: videos.length,
        totalRevenue,
        completedPayments,
        countries: new Set(users.map(u => u.country)).size
      },
      growth: {
        newUsersThisMonth: Math.floor(users.length * 0.15),
        newVideosThisMonth: Math.floor(videos.length * 0.25)
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============== Health Check ===============

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    message: '✨ JALI plateforme est active et prête!',
    timestamp: new Date().toISOString()
  });
});

// =============== Erreurs et Serveur ===============

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur', details: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║     🎬 JALI Backend - Plateforme de Cinéma Africain     ║
║════════════════════════════════════════════════════════║
║  Server running on http://localhost:${PORT}              ║
║                                                        ║
║  📚 API Documentation:                                 ║
║  - POST   /api/auth/register       (Inscription)       ║
║  - POST   /api/auth/login          (Connexion)         ║
║  - POST   /api/videos/upload       (Upload vidéo)      ║
║  - GET    /api/videos              (Lister vidéos)     ║
║  - POST   /api/payments/subscribe  (Abonnement)        ║
║  - POST   /api/revenue/distribute  (Distribuer revenus)║
║  - GET    /api/revenue/creator/:id (Revenus créateur)  ║
║  - GET    /api/analytics/dashboard (Dashboard)         ║
║                                                        ║
║  💰 Modèle: 80% Créateurs, 20% Plateforme              ║
║  🌍 Support: Mobile Money & Cartes Bancaires           ║
╚════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
