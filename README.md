# ⚡ Soul Map Engine — The First Spark

Automated Soul Map generation server on Netlify.

## What It Does

1. **Catches payment webhooks** from Stripe or Whop
2. **Calculates** numerology (Life Path, Expression, Soul Urge, Personality, Birthday, Maturity, Personal Year)
3. **Calculates** Sun Sign + Chinese Zodiac
4. **Generates** a fully branded HTML Soul Map page
5. **Pushes** to GitHub → live at `soul-maps.thefirstspark.shop/[name]/`
6. **Emails** the customer their live Soul Map URL
7. **Notifies** Kate at kate@thefirstspark.shop

## Setup (10 minutes)

### 1. Deploy to Netlify

Go to [app.netlify.com](https://app.netlify.com) and either:
- **Option A:** Drag & drop this folder onto the Netlify dashboard
- **Option B:** Connect to a GitHub repo

### 2. Set Environment Variables

In Netlify Dashboard → Site Settings → Environment Variables, add:

| Variable | Value | Where to get it |
|----------|-------|-----------------|
| `GITHUB_PAT` | Your GitHub token | Already have: ghp_a0mB... |
| `RESEND_API_KEY` | Resend.com API key | Sign up free at resend.com |

### 3. Point Your Webhook

**For Stripe:**
- Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://YOUR-NETLIFY-SITE.netlify.app/soul-map-webhook`
- Event: `checkout.session.completed`
- Add birth data to Stripe checkout metadata fields: `full_name`, `birth_date`, `birth_time`, `birth_place`

**For Whop:**
- App Settings → Webhooks
- URL: `https://YOUR-NETLIFY-SITE.netlify.app/soul-map-webhook`
- Event: `membership.went_valid` or `payment.succeeded`

### 4. Test It

```bash
curl -X POST https://YOUR-NETLIFY-SITE.netlify.app/soul-map-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "source": "direct",
    "full_name": "Test Person",
    "birth_date": "January 15, 1990",
    "email": "kate@thefirstspark.shop"
  }'
```

## Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/soul-map-webhook` | POST | Main automation endpoint |
| `/health` | GET | Status check |

## Architecture

```
Customer pays (Stripe/Whop)
        ↓
Webhook hits Netlify Function
        ↓
Numerology + Astrology calculated
        ↓
HTML Soul Map generated from template
        ↓
Pushed to GitHub (soul-maps repo)
        ↓
GitHub Pages serves at soul-maps.thefirstspark.shop/[name]/
        ↓
Customer + Kate emailed
```

## Cost

- **Netlify:** Free (125K function invocations/month)
- **Resend:** Free (100 emails/day)
- **GitHub:** Free
- **Total:** $0/month
