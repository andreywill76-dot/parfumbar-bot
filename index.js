const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const IG_TOKEN = process.env.IG_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'parfumbar123';
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || 'Ты помощник магазина парфюмерии.';

const BOT_ENABLED = process.env.BOT_ENABLED === 'true';

const ALLOWED_SENDER_IDS = (process.env.ALLOWED_SENDER_IDS || '')
  .split(',')
  .map(x => x.trim())
  .filter(Boolean);

const conversations = {};

app.get('/', (req, res) => {
  res.status(200).send('Selectiv Parfumbar bot is running');
});

app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.send(req.query['hub.challenge']);
  } else {
    console.log('Webhook verification failed');
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  console.log('Incoming webhook:', JSON.stringify(req.body, null, 2));

  const entry = req.body.entry?.[0];
  if (!entry) {
    console.log('No entry, skipping');
    return;
  }

  let messaging = entry.messaging?.[0];

  if (!messaging) {
    const change = entry.changes?.[0];
    messaging = change?.value;
  }

  console.log('Messaging object:', JSON.stringify(messaging, null, 2));

  if (messaging?.message?.is_echo) {
    console.log('Echo message, skipping');
    return;
  }

  const text = messaging?.message?.text || messaging?.messages?.[0]?.text;
  const senderId =
    messaging?.sender?.id ||
    messaging?.from?.id ||
    messaging?.contacts?.[0]?.wa_id;

  if (!text || !senderId) {
    console.log('No text or senderId, skipping');
    return;
  }

  console.log('Message from:', senderId, ':', text);

  if (!BOT_ENABLED) {
    console.log('BOT_ENABLED=false. Bot will not reply.');
    console.log('Sender ID for testing:', senderId);
    return;
  }

  if (ALLOWED_SENDER_IDS.length > 0 && !ALLOWED_SENDER_IDS.includes(senderId)) {
    console.log('Sender not allowed, skipping:', senderId);
    return;
  }

  if (!conversations[senderId]) {
    conversations[senderId] = [];
  }

  conversations[senderId].push({
    role: 'user',
    content: text
  });

  if (conversations[senderId].length > 20) {
    conversations[senderId] = conversations[senderId].slice(-20);
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: conversations[senderId]
    });

    const reply =
      response.content?.[0]?.text ||
      'Извините, сейчас не смогла ответить. Напишите, пожалуйста, ещё раз.';

    conversations[senderId].push({
      role: 'assistant',
      content: reply
    });

    await axios.post(
      'https://graph.instagram.com/v21.0/me/messages',
      {
        recipient: {
          id: senderId
        },
        message: {
          text: reply
        }
      },
      {
        params: {
          access_token: IG_TOKEN
        }
      }
    );

    console.log('Reply sent to:', senderId);
  } catch (e) {
    console.error('Error:', e.response?.data || e.message);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
