const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'study';
const COLLECTION = 'responses';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('Connected to MongoDB');
}

app.get('/api/worker-id', (req, res) => {
  res.json({ workerId: 'W-' + uuidv4().split('-')[0].toUpperCase() });
});

app.post('/api/response', async (req, res) => {
  const {
    workerId, condition, trialId, questionId, subject,
    humanAnswer, groundTruth, isCorrect,
    confidenceRating, timeSpentMs,
    aiShown, aiAnswer, aiWasHelpful
  } = req.body;

  if (!workerId || !condition || !humanAnswer) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const entry = {
    timestamp: new Date().toISOString(),
    workerId, condition, trialId, questionId, subject,
    humanAnswer, groundTruth,
    isCorrect: isCorrect ? 1 : 0,
    confidenceRating: confidenceRating ?? null,
    timeSpentMs: timeSpentMs ?? null,
    aiShown: aiShown ?? null,
    aiAnswer: aiAnswer ?? null,
    aiWasHelpful: aiWasHelpful ?? null
  };

  await db.collection(COLLECTION).insertOne(entry);
  res.json({ ok: true });
});

app.post('/api/session', async (req, res) => {
  const { workerId, totalTimeMs } = req.body;
  await db.collection(COLLECTION).updateMany(
    { workerId, sessionTotalTimeMs: { $exists: false } },
    { $set: { sessionTotalTimeMs: totalTimeMs } }
  );
  res.json({ ok: true });
});

app.get('/api/admin/data', async (req, res) => {
  const data = await db.collection(COLLECTION).find({}, { projection: { _id: 0 } }).toArray();
  res.json(data);
});

app.get('/api/admin/csv', async (req, res) => {
  const data = await db.collection(COLLECTION).find({}, { projection: { _id: 0 } }).toArray();
  if (data.length === 0) return res.send('No data yet.');

  const headers = ['timestamp','workerId','condition','trialId','questionId','subject',
    'humanAnswer','groundTruth','isCorrect','confidenceRating','timeSpentMs',
    'aiShown','aiAnswer','aiWasHelpful','sessionTotalTimeMs'];

  const csv = [
    headers.join(','),
    ...data.map(r =>
      headers.map(h => {
        const v = r[h] ?? '';
        return String(v).includes(',') ? `"${v}"` : v;
      }).join(',')
    )
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="study_responses.csv"');
  res.send(csv);
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Study server running at http://localhost:${PORT}`);
    console.log(`  Baseline:  http://localhost:${PORT}/baseline.html`);
    console.log(`  AI-Assist: http://localhost:${PORT}/ai.html`);
    console.log(`  Admin:     http://localhost:${PORT}/admin`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
