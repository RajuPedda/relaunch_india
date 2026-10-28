# Deploying the proof of concept

The app runs as **one web service**: Fastify serves the API and the built
single-page app from the same process, so there is one URL and no CORS to
arrange. [`render.yaml`](../render.yaml) is a Render blueprint for exactly that.

## Render, free plan

1. Push this repository to GitHub.
2. On Render: **New > Blueprint**, select the repository, apply.
3. First build takes a few minutes. The service comes up at
   `https://relaunch-india.onrender.com` (Render appends a suffix if the name is taken).

Render reads everything from the blueprint:

| Setting | Value | Why |
| --- | --- | --- |
| Build | `npm ci --include=dev && npm run build` | Render sets `NODE_ENV=production`, which makes npm skip dev dependencies. Vite and TypeScript live there, so without `--include=dev` there is nothing to build the app with. |
| Start | `npm start` | Runs `tsx src/server.ts`. `tsx` is a runtime dependency for this reason. |
| Health check | `/api/health` | Returns the adapter backend and the time. |
| Node | 22.20.0 | Pinned in `.node-version` and in the blueprint. |

### What the free plan means for this app

- **It sleeps after 15 minutes without traffic, and takes about a minute to
  wake.** A visitor arriving cold sees a loading page for that minute. Open the
  URL yourself a few minutes before any demo.
- **There is no persistent disk.** `.data/` and `.artifacts/` live on the
  instance's ephemeral filesystem, so a restart, a redeploy or a wake-up gives a
  freshly seeded demo. That is the intended behaviour here: every visitor starts
  from the same seeded state, and nobody can leave the demo half-finished for
  the next person. If you want state to survive, that is the point at which you
  wire the DynamoDB adapter described in [aws-architecture.md](aws-architecture.md).
- **750 instance hours per month per workspace**, and sleeping hours do not
  count. Keeping one service awake around the clock costs about 730 of them, so
  it fits, but only for a single service and with no headroom.
- 512 MB RAM, 0.1 CPU, 5 GB of bandwidth, 500 build minutes per month.
- Render's own documentation advises against the free instance type for
  production. For a hackathon demo it is fine.

### Keeping it awake for a judging window

The free plan has no "always on" switch. If a cold start would hurt, point an
external scheduler (GitHub Actions on a cron, or any uptime pinger) at
`/api/health` every 10 minutes for the day of the demo, then turn it off. Watch
the 750-hour budget: continuous pinging consumes nearly all of it.

## Running the production build locally

```bash
npm run build && npm start
```

That is the same pair of commands Render runs. The app and the API are both on
`http://localhost:4000`.

## Other free hosts, and why this shape was chosen

| Host | Verdict for this app |
| --- | --- |
| **Vercel Hobby / Netlify** | The static app deploys perfectly, but the API does not: function filesystems are read-only apart from `/tmp` and are torn down between invocations, so the JSON store, the in-process event bus and the message outbox all lose their state. They would need a managed database first. Vercel Hobby is also restricted to non-commercial use. |
| **Cloudflare Workers** | Free and fast, but a Worker is not a long-lived Node process and the CPU budget per request is small; a Fastify app does not port across unchanged. Cloudflare **Pages** would host a static build well. |
| **Fly.io / Koyeb** | No longer a dependable free option in 2026: Fly gives new accounts a short trial, and Koyeb's free tier closed. |
| **Northflank Sandbox** | Two services that genuinely never sleep, which solves the cold start. It asks for a card to verify the account. Worth a look if the 15-minute sleep becomes the problem. |

Because no free tier offers a persistent disk, state is ephemeral wherever this
goes. Render was chosen because it runs the real HTTP API unchanged — the same
code path the AWS adapters would replace — rather than a reshaped copy of it.

## Submission artifacts

| Item | Where |
| --- | --- |
| Architecture diagram | [architecture.svg](architecture.svg), [architecture.png](architecture.png) |
| Text description | [submission.md](submission.md) |
| Demo video script | [video-script.md](video-script.md) |
| Deployed URL | the Render service created from `render.yaml` |
