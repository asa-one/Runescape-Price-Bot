import { SimplePool, getPublicKey, getEventHash, signEvent } from 'nostr-tools';
import axios from 'axios';
import http from 'http'; // ✅ built-in, no extra dependency

/* ================= CONFIG ================= */

const relays = ['wss://relay.damus.io'];
const sk = process.env.BOT_PRIVATE_KEY;
const pk = getPublicKey(sk);
const pool = new SimplePool();
const cooldown = new Map();
const cache = new Map();

const COOLDOWN_MS = 5000;
const CACHE_TTL = 60_000; // 1 minute

/* ================= UTIL ================= */

function formatNumber(num) {
  return Number(num).toLocaleString('en-US');
}

function getTrendEmoji(change) {
  if (change > 0) return "🟢";
  if (change < 0) return "🔴";
  return "⚪";
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

/* ================= API ================= */

async function searchItem(query) {
  const { data } = await axios.get(
    `https://api.geprice.com/search?query=${encodeURIComponent(query)}`
  );
  if (!data.items?.length) return null;
  return data.items[0];
}

async function fetchHistory(id) {
  const { data } = await axios.get(`https://api.geprice.com/rs3/history/${id}`);
  return data[id];
}

/* ================= LOGIC ================= */

async function getPriceData(query) {
  if (cache.has(query)) {
    const entry = cache.get(query);
    if (Date.now() - entry.timestamp < CACHE_TTL) {
      return entry.data;
    }
  }

  const item = await searchItem(query);
  if (!item) return null;

  const history = await fetchHistory(item.id);
  if (!history?.length) return null;

  const latest = history.at(-1);
  const oneDayAgo = history.find(h => latest.timestamp - h.timestamp >= 86400000) || history.at(-2);
  const change24h = latest.price - oneDayAgo.price;
  const latestFive = history.slice(-5).reverse();

  const result = {
    name: item.name,
    current: latest.price,
    change24h,
    latestFive
  };

  cache.set(query, { data: result, timestamp: Date.now() });
  return result;
}

/* ================= BOT ================= */

const filters = [{ kinds: [1] }];

relays.forEach((relayUrl) => {
  const sub = pool.sub([relayUrl], filters);

  sub.on('event', async (event) => {
    try {
      const content = event.content.trim();
      if (!content.startsWith("/price ")) return;

      const user = event.pubkey;

      if (cooldown.has(user)) {
        const last = cooldown.get(user);
        const elapsed = Date.now() - last;
        if (elapsed < COOLDOWN_MS) {
          console.log(`Cooldown: Ignoring ${user} for ${COOLDOWN_MS - elapsed}ms`);
          return;
        }
      }
      cooldown.set(user, Date.now());

      const query = content.replace("/price ", "").trim();
      if (!query || query.length > 60) return;

      const data = await getPriceData(query);
      if (!data) return await reply(event, "Item not found.");

      const tradesText = data.latestFive
        .map((t, i) => `${i + 1}) ${formatNumber(t.price)} gp | ${formatDateTime(t.timestamp)}`)
        .join("\n");

      const replyText =
`📦 ${data.name}
💰 Current: ${formatNumber(data.current)} gp
📈 24h: ${data.change24h >= 0 ? "+" : ""}${formatNumber(data.change24h)} gp ${getTrendEmoji(data.change24h)}

Latest Trades:
${tradesText}`;

      await reply(event, replyText);

    } catch (err) {
      console.error(err);
      await reply(event, "Error fetching price data.");
    }
  });

  sub.on('error', (err) => {
    console.error(`Error on relay ${relayUrl}:`, err);
  });
});

/* ================= REPLY FUNCTION ================= */

async function reply(event, content) {
  const replyEvent = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', event.id],
      ['p', event.pubkey]
    ],
    content,
    pubkey: pk
  };

  replyEvent.id = getEventHash(replyEvent);
  replyEvent.sig = await signEvent(replyEvent, sk);

  try {
    pool.publish(relays, replyEvent);
  } catch (err) {
    console.error("Failed to publish reply:", err);
  }
}

/* ================= DUMMY HTTP SERVER ================= */

// This exists solely so Render sees a port
const server = http.createServer((req, res) => {
  res.end("OK");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Dummy server running on port ${PORT} (Render happy)`);
});
