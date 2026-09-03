# Fraud Risk Dashboard

Next.js dashboard with a FastAPI serverless API for the simulated fraud stream.

## Deploy to Vercel

1. Push this repository to GitHub and import it into Vercel.
2. Keep the project root as the repository root.
3. Use the default Next.js build settings. Vercel will detect `app/` and `api/index.py` automatically.
4. Deploy. No environment variables are required.

The dashboard polls `/api/live-stream-tick` so it works with Vercel's short-lived Python functions. After deployment, verify the API at:

```text
https://YOUR-DOMAIN.vercel.app/api/metrics
```

For local development:

```bash
npm install
npm run dev
```

The Python dependencies used by the Vercel function are listed in `requirements.txt`.

## Known limitations

- The live stream is simulated and stateless.
- Vercel serverless functions do not provide a persistent WebSocket connection; use an always-on host if a real WebSocket stream is needed.

## Notes

** add exceptions for ml warning and others too
** bechmark i want to know the seconds
** add readme
** what is c file why is it empty😭
** web app create
** complete the third layer
** do video 
** add acc recall presicion and all 
** add visual
** add sample output folder and screen shot of web page
