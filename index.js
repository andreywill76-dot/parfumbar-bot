const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const IG_TOKEN = process.env.IG_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'parfumbar123';

const conversations = {};

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || 'Ты помощник магазина парфюмерии.';

// Верификация webhook
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

// Получение сообщений
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const entry = req.body.entry?.[0];
  const messaging = entry?.messaging?.[0];
  if (!messaging?.message?.text) return;

  const senderId = messaging.sender.id;
  const text = messaging.message.text;

  if (!conversations[senderId]) conversations[senderId] = [];
  conversations[senderId].push({ role: 'user', content: text });

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

    const reply = response.content[0].text;
    conversations[senderId].push({ role: 'assistant', content: reply });

    await axios.post(`https://graph.facebook.com/v18.0/me/messages`, {
      recipient: { id: senderId },
      message: { text: reply }
    }, {
      params: { access_token: IG_TOKEN }
    });
  } catch (e) {
    console.error(e);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));