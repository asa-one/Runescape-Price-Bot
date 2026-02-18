# RS3 Price Bot for Root

This bot displays **current RS3 prices**, **24h change**, and **last 5 trades** using geprice.com API.

It runs on **Render free tier** with Node.js.

---

## Setup on Render

1. Fork or push this repo to GitHub.
2. Go to [Render](https://render.com) → Dashboard → New → **Web Service**.
3. Connect your GitHub repo.
4. Set **Environment Variables**:
   - `BOT_PRIVATE_KEY` = your Root bot private key
5. Set **Start Command**:
```
npm start
```
6. Choose **Node 18+** runtime.
7. Deploy.

---

## Usage

Send a message in Root:

```
/price grace of the elves
```

Bot will reply with current price, 24h change, and last 5 trades including full date and time.

---

## Notes

- No database is needed; caching is in-memory for 1 minute.
- Fully free-host friendly on Render.
- Keep `BOT_PRIVATE_KEY` secret.
