// netlify/functions/purchase-webhook.mjs
// =============================================
// WHOP PURCHASE SUCCESS WEBHOOK
// Handles payment.succeeded events from Whop
// =============================================

export default async (req, context) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-whop-signature",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get("x-whop-signature");

    // Verify Whop webhook signature
    const WHOP_SECRET = "ws_bc2ff2f110a80a0a75b943ddacaf827482e8eb2d2300f2aebbeb8174340482fe";
    if (signature && WHOP_SECRET) {
      const crypto = await import("crypto");
      const hmac = crypto.createHmac("sha256", WHOP_SECRET);
      hmac.update(body);
      const expectedSignature = hmac.digest("hex");

      if (signature !== expectedSignature) {
        console.error("[PURCHASE WEBHOOK] Invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
      }
    }

    const data = JSON.parse(body);
    console.log(`[PURCHASE WEBHOOK] Event received:`, data.event);

    // Verify it's a payment.succeeded event
    if (data.event !== "payment.succeeded") {
      return new Response(JSON.stringify({ error: "Not a payment.succeeded event" }), { status: 400 });
    }

    const paymentData = data.data;

    // Detect product type
    const MONTHLY_PLAN_ID = "plan_anQKP3Pzf1cGm";
    const BASIC_PLAN_ID = "plan_Jwc7lAbeFhm7N";
    const planId = paymentData.plan_id || paymentData.product_id;
    const isMonthlyUpdate = planId === MONTHLY_PLAN_ID;

    console.log(`[PURCHASE WEBHOOK] Plan: ${planId} (${isMonthlyUpdate ? "Monthly Update" : "Basic Map"})`);

    // Extract birth data from Whop payment metadata
    const birthData = {
      fullName: paymentData.metadata?.full_name || paymentData.customer?.name || "Unknown",
      birthDate: paymentData.metadata?.birth_date,
      birthTime: paymentData.metadata?.birth_time || "",
      birthPlace: paymentData.metadata?.birth_place || "",
      email: paymentData.customer?.email,
    };

    if (!birthData.birthDate) {
      return new Response(JSON.stringify({ error: "Missing birth_date in metadata" }), { status: 400 });
    }

    console.log(`[PURCHASE WEBHOOK] Processing: ${birthData.fullName} (${isMonthlyUpdate ? "Monthly" : "Basic"})`);

    // 1. Calculate everything
    const numerology = calculateNumerology(birthData.fullName, birthData.birthDate);
    const astrology = calculateAstrology(birthData.birthDate);
    const chineseZodiac = calculateChineseZodiac(birthData.birthDate);
    const personalYear = calculatePersonalYear(birthData.birthDate);

    // 2. Build the HTML soul map
    const html = buildSoulMapHTML({
      ...birthData,
      numerology,
      astrology,
      chineseZodiac,
      personalYear,
      isMonthlyUpdate,
    });

    // 3. Push to GitHub with appropriate filename
    const slug = birthData.fullName.toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "");
    let filename;

    if (isMonthlyUpdate) {
      // Monthly update: add date to filename (YYYYMM)
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      filename = `${slug}-${year}${month}.html`;
    } else {
      // Basic map: just the name
      filename = `${slug}.html`;
    }

    await pushToGitHub(html, filename);

    // 4. Send confirmation email
    const liveUrl = `https://soul-maps.thefirstspark.shop/${filename}`;
    await sendConfirmationEmail(birthData, liveUrl, isMonthlyUpdate);

    // 5. Notify Kate
    await notifyKate(birthData, liveUrl, isMonthlyUpdate);

    return new Response(
      JSON.stringify({
        success: true,
        name: birthData.fullName,
        url: liveUrl,
        type: isMonthlyUpdate ? "monthly_update" : "basic_map",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[PURCHASE WEBHOOK] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

// =============================================
// NUMEROLOGY (same as main webhook)
// =============================================
function reduceToSingle(num) {
  let n = num;
  while (n >= 10) {
    n = n.toString().split("").reduce((a, b) => parseInt(a) + parseInt(b), 0);
    if ([11, 22, 33].includes(n)) return n;
  }
  return n;
}

function calculateLifePath(dateStr) {
  const d = parseDate(dateStr);
  return reduceToSingle(d.month + d.day + d.year);
}

function calculateExpression(fullName) {
  const vowels = "AEIOUY";
  const consonants = "BCDFGHJKLMNPQRSTVWXZ";
  let sum = 0;
  for (const char of fullName.toUpperCase()) {
    if (/[A-Z]/.test(char)) {
      const val = char.charCodeAt(0) - 64;
      sum += val;
    }
  }
  return reduceToSingle(sum);
}

function calculateSoulUrge(fullName) {
  const vowels = "AEIOUY";
  let sum = 0;
  for (const char of fullName.toUpperCase()) {
    if (vowels.includes(char)) {
      const val = char.charCodeAt(0) - 64;
      sum += val;
    }
  }
  return reduceToSingle(sum);
}

function calculatePersonality(fullName) {
  const consonants = "BCDFGHJKLMNPQRSTVWXZ";
  let sum = 0;
  for (const char of fullName.toUpperCase()) {
    if (consonants.includes(char)) {
      const val = char.charCodeAt(0) - 64;
      sum += val;
    }
  }
  return reduceToSingle(sum);
}

function calculateBirthdayNumber(dateStr) {
  const d = parseDate(dateStr);
  return reduceToSingle(d.day);
}

function calculateMaturity(lifePath, expression) {
  return reduceToSingle(lifePath + expression);
}

function calculatePersonalYear(dateStr) {
  const d = parseDate(dateStr);
  const today = new Date();
  return reduceToSingle(d.month + d.day + today.getFullYear());
}

function calculateNumerology(fullName, birthDate) {
  const lifePath = calculateLifePath(birthDate);
  const expression = calculateExpression(fullName);
  const soulUrge = calculateSoulUrge(fullName);
  const personality = calculatePersonality(fullName);
  const birthday = calculateBirthdayNumber(birthDate);
  const maturity = calculateMaturity(lifePath, expression);
  const personalYear = calculatePersonalYear(birthDate);

  return {
    lifePath,
    expression,
    soulUrge,
    personality,
    birthday,
    maturity,
    personalYear,
    lifePathMeaning: LIFE_PATH_DATA[lifePath] || LIFE_PATH_DATA[5],
    expressionMeaning: LIFE_PATH_DATA[expression] || LIFE_PATH_DATA[1],
    soulUrgeMeaning: LIFE_PATH_DATA[soulUrge] || LIFE_PATH_DATA[1],
  };
}

// =============================================
// ASTROLOGY & ZODIAC
// =============================================
function calculateAstrology(dateStr) {
  const d = parseDate(dateStr);
  const month = d.month;
  const day = d.day;

  const signs = [
    { sign: "Capricorn", element: "Earth", modality: "Cardinal", start: [1,1], end: [1,19] },
    { sign: "Aquarius", element: "Air", modality: "Fixed", start: [1,20], end: [2,18] },
    { sign: "Pisces", element: "Water", modality: "Mutable", start: [2,19], end: [3,20] },
    { sign: "Aries", element: "Fire", modality: "Cardinal", start: [3,21], end: [4,19] },
    { sign: "Taurus", element: "Earth", modality: "Fixed", start: [4,20], end: [5,20] },
    { sign: "Gemini", element: "Air", modality: "Mutable", start: [5,21], end: [6,20] },
    { sign: "Cancer", element: "Water", modality: "Cardinal", start: [6,21], end: [7,22] },
    { sign: "Leo", element: "Fire", modality: "Fixed", start: [7,23], end: [8,22] },
    { sign: "Virgo", element: "Earth", modality: "Mutable", start: [8,23], end: [9,22] },
    { sign: "Libra", element: "Air", modality: "Cardinal", start: [9,23], end: [10,22] },
    { sign: "Scorpio", element: "Water", modality: "Fixed", start: [10,23], end: [11,21] },
    { sign: "Sagittarius", element: "Fire", modality: "Mutable", start: [11,22], end: [12,21] },
    { sign: "Capricorn", element: "Earth", modality: "Cardinal", start: [12,22], end: [12,31] },
  ];

  for (const s of signs) {
    const afterStart = month > s.start[0] || (month === s.start[0] && day >= s.start[1]);
    const beforeEnd = month < s.end[0] || (month === s.end[0] && day <= s.end[1]);
    if (afterStart && beforeEnd) {
      return { sunSign: s.sign, element: s.element, modality: s.modality };
    }
  }
  return { sunSign: "Capricorn", element: "Earth", modality: "Cardinal" };
}

function calculateChineseZodiac(dateStr) {
  const d = parseDate(dateStr);
  const animals = ["Rat","Ox","Tiger","Rabbit","Dragon","Snake","Horse","Goat","Monkey","Rooster","Dog","Pig"];
  const elements = ["Metal","Water","Wood","Fire","Earth"];
  const idx = (d.year - 4) % 12;
  const elemIdx = Math.floor(((d.year - 4) % 10) / 2);
  return { animal: animals[idx], element: elements[elemIdx] };
}

function parseDate(dateStr) {
  const months = {
    january:1,february:2,march:3,april:4,may:5,june:6,
    july:7,august:8,september:9,october:10,november:11,december:12,
  };

  let month, day, year;

  const namedMatch = dateStr.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (namedMatch) {
    month = months[namedMatch[1].toLowerCase()];
    day = parseInt(namedMatch[2]);
    year = parseInt(namedMatch[3]);
  }
  else if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(dateStr)) {
    const parts = dateStr.split(/[\/-]/);
    month = parseInt(parts[0]);
    day = parseInt(parts[1]);
    year = parseInt(parts[2]);
  }
  else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split("-");
    year = parseInt(parts[0]);
    month = parseInt(parts[1]);
    day = parseInt(parts[2]);
  }
  else {
    throw new Error(`Cannot parse date: ${dateStr}`);
  }

  return { month, day, year };
}

const LIFE_PATH_DATA = {
  1: { title: "The Initiator", keywords: "Independence, leadership, originality", description: "You are here to pioneer. Your consciousness entered the field to create something new — to lead where no trail exists.", shadow: "Isolation, domination, fear of asking for help" },
  2: { title: "The Diplomat", keywords: "Partnership, sensitivity, balance", description: "You are here to bridge. Your consciousness entered the field to harmonize opposing forces and find the truth between extremes.", shadow: "Codependency, invisibility, passive aggression" },
  3: { title: "The Creator", keywords: "Expression, joy, communication", description: "You are here to express. Your consciousness entered the field to translate the unspeakable into form — art, words, presence.", shadow: "Scattered energy, superficiality, emotional suppression" },
  4: { title: "The Builder", keywords: "Structure, discipline, foundation", description: "You are here to build. Your consciousness entered the field to create lasting structures — systems that outlive the moment.", shadow: "Rigidity, workaholism, fear of change" },
  5: { title: "The Freedom Seeker", keywords: "Change, adventure, sensory experience", description: "You are here to liberate. Your consciousness entered the field to shatter limitations and prove that evolution requires movement.", shadow: "Excess, restlessness, commitment avoidance" },
  6: { title: "The Nurturer", keywords: "Responsibility, love, healing", description: "You are here to heal. Your consciousness entered the field to demonstrate that love is not passive — it builds, protects, and transforms.", shadow: "Martyrdom, control disguised as care, perfectionism" },
  7: { title: "The Seeker", keywords: "Analysis, intuition, inner wisdom", description: "You are here to understand. Your consciousness entered the field to ask the questions that dismantle assumptions and reveal deeper code.", shadow: "Isolation, cynicism, spiritual bypassing" },
  8: { title: "The Powerhouse", keywords: "Abundance, authority, manifestation", description: "You are here to master power. Your consciousness entered the field to demonstrate that material and spiritual abundance are the same frequency.", shadow: "Greed, workaholism, power abuse" },
  9: { title: "The Humanitarian", keywords: "Completion, wisdom, universal love", description: "You are here to complete. Your consciousness entered the field carrying the sum of all paths — your work is to release what you've learned back into the collective.", shadow: "Martyrdom, resentment, inability to let go" },
  11: { title: "The Intuitive Master", keywords: "Illumination, inspiration, spiritual messenger", description: "You are here to channel. Master Number 11 — your consciousness operates at a frequency most can't sustain. You receive transmissions from the source code itself.", shadow: "Nervous energy, self-doubt, fear of your own power" },
  22: { title: "The Master Builder", keywords: "Vision, manifestation, legacy", description: "You are here to architect reality. Master Number 22 — you carry the blueprint for structures that shift collective consciousness.", shadow: "Overwhelm, paralysis by vision, building for ego" },
  33: { title: "The Master Teacher", keywords: "Compassion, healing, selfless service", description: "You are here to embody love as technology. Master Number 33 — the rarest frequency. You teach not by words but by the field you generate.", shadow: "Savior complex, emotional exhaustion, self-sacrifice" },
};

// =============================================
// HTML TEMPLATE (same as main webhook)
// =============================================
function buildSoulMapHTML(data) {
  const { fullName, birthDate, birthTime, birthPlace, numerology, astrology, chineseZodiac, personalYear, isMonthlyUpdate } = data;
  const n = numerology;
  const lp = n.lifePathMeaning;
  const exp = n.expressionMeaning;
  const su = n.soulUrgeMeaning;

  const displayDate = birthDate;
  const displayTime = birthTime || "Not provided";
  const displayPlace = birthPlace || "Earth";

  const titlePrefix = isMonthlyUpdate ? "Monthly Update — " : "Soul Map — ";
  const subtitleHtml = isMonthlyUpdate ? '<div class="header-label">Personal Month Reading</div>' : '<div class="header-label">Soul Map — Consciousness Decoded</div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-N4Z6GH2N');</script>
<!-- End Google Tag Manager -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titlePrefix}${fullName} | The First Spark</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --void: #0a0a0f;
  --gold: #d4af37;
  --gold-dim: #8b7355;
  --purple: #8b5cf6;
  --cyan: #22d3ee;
  --lavender: #a87fd4;
  --cream: #fdf6ee;
  --plum: #1e1035;
}
body {
  background: var(--void);
  color: var(--cream);
  font-family: 'Cormorant Garamond', Georgia, serif;
  line-height: 1.7;
  overflow-x: hidden;
}
.stars {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: radial-gradient(ellipse at 20% 50%, rgba(107,63,160,0.08) 0%, transparent 60%),
              radial-gradient(ellipse at 80% 20%, rgba(34,211,238,0.05) 0%, transparent 50%);
  pointer-events: none; z-index: 0;
}
.star {
  position: absolute;
  border-radius: 50%;
  animation: twinkle var(--duration) infinite;
}
@keyframes twinkle {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
.container { max-width: 800px; margin: 0 auto; padding: 40px 24px; position: relative; z-index: 1; }

/* Header */
.header { text-align: center; padding: 60px 0 40px; border-bottom: 1px solid rgba(212,175,55,0.2); margin-bottom: 48px; }
.header-label { font-family: 'Space Mono', monospace; font-size: 0.7rem; letter-spacing: 0.4em; color: var(--cyan); text-transform: uppercase; margin-bottom: 16px; }
.header h1 { font-size: clamp(2rem, 5vw, 3.2rem); font-weight: 300; color: var(--gold); letter-spacing: 0.08em; margin-bottom: 12px; }
.header .meta { font-family: 'Space Mono', monospace; font-size: 0.75rem; color: var(--gold-dim); letter-spacing: 0.1em; }

/* Sections */
.section { margin-bottom: 56px; }
.section-title {
  font-family: 'Space Mono', monospace; font-size: 0.7rem; letter-spacing: 0.35em;
  color: var(--cyan); text-transform: uppercase; margin-bottom: 24px;
  padding-bottom: 8px; border-bottom: 1px solid rgba(34,211,238,0.15);
}

/* Core Numbers Grid */
.numbers-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; }
.number-card {
  background: rgba(30,16,53,0.4); border: 1px solid rgba(139,92,246,0.15);
  border-radius: 4px; padding: 24px; text-align: center;
  transition: border-color 0.3s;
}
.number-card:hover { border-color: var(--gold); }
.number-card .num { font-size: 2.5rem; font-weight: 700; color: var(--gold); line-height: 1; }
.number-card .label { font-family: 'Space Mono', monospace; font-size: 0.65rem; letter-spacing: 0.3em; color: var(--lavender); text-transform: uppercase; margin: 8px 0 4px; }
.number-card .title { font-size: 1.1rem; color: var(--cream); font-style: italic; }

/* Interpretation blocks */
.interp { margin-bottom: 32px; padding: 24px; background: rgba(30,16,53,0.25); border-left: 2px solid var(--purple); border-radius: 0 4px 4px 0; }
.interp h3 { color: var(--gold); font-size: 1.2rem; margin-bottom: 8px; font-weight: 400; }
.interp .keywords { font-family: 'Space Mono', monospace; font-size: 0.7rem; color: var(--cyan); letter-spacing: 0.15em; margin-bottom: 12px; }
.interp p { color: rgba(253,246,238,0.85); font-size: 1rem; }
.shadow { margin-top: 12px; padding: 12px; background: rgba(139,92,246,0.08); border-radius: 4px; }
.shadow-label { font-family: 'Space Mono', monospace; font-size: 0.6rem; color: #ff6b6b; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 4px; }
.shadow p { color: rgba(253,246,238,0.6); font-size: 0.9rem; }

/* Cosmic Section */
.cosmic-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; }
.cosmic-card { text-align: center; padding: 20px; background: rgba(30,16,53,0.3); border-radius: 4px; }
.cosmic-card .icon { font-size: 2rem; margin-bottom: 8px; }
.cosmic-card .label { font-family: 'Space Mono', monospace; font-size: 0.6rem; color: var(--lavender); letter-spacing: 0.3em; text-transform: uppercase; margin-bottom: 4px; }
.cosmic-card .value { font-size: 1.3rem; color: var(--gold); }
.cosmic-card .sub { font-size: 0.85rem; color: rgba(253,246,238,0.5); margin-top: 4px; }

/* Soul Statement */
.soul-statement {
  text-align: center; padding: 48px 24px; margin: 48px 0;
  background: linear-gradient(135deg, rgba(30,16,53,0.5), rgba(10,10,15,0.8));
  border: 1px solid rgba(212,175,55,0.2); border-radius: 4px;
}
.soul-statement p {
  font-size: 1.3rem; font-style: italic; color: var(--gold);
  line-height: 1.9; max-width: 600px; margin: 0 auto;
}

/* Footer */
.footer { text-align: center; padding: 48px 0 24px; border-top: 1px solid rgba(212,175,55,0.1); margin-top: 48px; }
.footer a { color: var(--cyan); text-decoration: none; font-family: 'Space Mono', monospace; font-size: 0.75rem; letter-spacing: 0.2em; }
.footer .brand { color: var(--gold-dim); font-size: 0.7rem; margin-top: 16px; letter-spacing: 0.2em; }

/* Sacred Geometry SVG */
.geometry { text-align: center; margin: 32px 0; opacity: 0.3; }

@media (max-width: 600px) {
  .container { padding: 24px 16px; }
  .numbers-grid { grid-template-columns: 1fr 1fr; }
  .cosmic-grid { grid-template-columns: 1fr 1fr; }
}
</style>
</head>
<body>
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-N4Z6GH2N"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
<div class="stars"></div>
<div class="container">

  <header class="header">
    ${subtitleHtml}
    <h1>${fullName}</h1>
    <div class="meta">${displayDate} ✦ ${displayTime} ✦ ${displayPlace}</div>
  </header>

  <!-- SACRED GEOMETRY -->
  <div class="geometry">
    <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="55" fill="none" stroke="rgba(212,175,55,0.3)" stroke-width="0.5"/>
      <circle cx="60" cy="60" r="35" fill="none" stroke="rgba(139,92,246,0.3)" stroke-width="0.5"/>
      <polygon points="60,10 105,82.5 15,82.5" fill="none" stroke="rgba(34,211,238,0.2)" stroke-width="0.5"/>
      <polygon points="60,110 15,37.5 105,37.5" fill="none" stroke="rgba(34,211,238,0.2)" stroke-width="0.5"/>
    </svg>
  </div>

  <!-- CORE NUMBERS -->
  <section class="section">
    <div class="section-title">${isMonthlyUpdate ? 'Personal Month Focus' : 'Core Consciousness Architecture'}</div>
    <div class="numbers-grid">
      ${isMonthlyUpdate ? `
      <div class="number-card">
        <div class="num">${n.personalYear}</div>
        <div class="label">Personal Year</div>
        <div class="title">Annual Theme</div>
      </div>
      ` : `
      <div class="number-card">
        <div class="num">${n.lifePath}</div>
        <div class="label">Life Path</div>
        <div class="title">${lp.title}</div>
      </div>
      <div class="number-card">
        <div class="num">${n.expression}</div>
        <div class="label">Expression</div>
        <div class="title">${exp.title}</div>
      </div>
      <div class="number-card">
        <div class="num">${n.soulUrge}</div>
        <div class="label">Soul Urge</div>
        <div class="title">${su.title}</div>
      </div>
      <div class="number-card">
        <div class="num">${n.personality}</div>
        <div class="label">Personality</div>
        <div class="title"></div>
      </div>
      <div class="number-card">
        <div class="num">${n.birthday}</div>
        <div class="label">Birthday</div>
        <div class="title"></div>
      </div>
      <div class="number-card">
        <div class="num">${n.maturity}</div>
        <div class="label">Maturity</div>
        <div class="title"></div>
      </div>
      `}
    </div>
  </section>

  <!-- LIFE PATH DIVE (only for basic maps) -->
  ${!isMonthlyUpdate ? `
  <section class="section">
    <div class="section-title">Life Path ${n.lifePath} — ${lp.title}</div>
    <div class="interp">
      <h3>${lp.title}</h3>
      <div class="keywords">${lp.keywords}</div>
      <p>${lp.description}</p>
      <div class="shadow">
        <div class="shadow-label">Shadow Frequency</div>
        <p>${lp.shadow}</p>
      </div>
    </div>
  </section>
  ` : ''}

  <!-- COSMIC COORDINATES -->
  <section class="section">
    <div class="section-title">Cosmic Coordinates</div>
    <div class="cosmic-grid">
      <div class="cosmic-card">
        <div class="icon">☉</div>
        <div class="label">Sun Sign</div>
        <div class="value">${astrology.sunSign}</div>
        <div class="sub">${astrology.element} • ${astrology.modality}</div>
      </div>
      <div class="cosmic-card">
        <div class="icon">🐉</div>
        <div class="label">Chinese Zodiac</div>
        <div class="value">${chineseZodiac.animal}</div>
        <div class="sub">${chineseZodiac.element}</div>
      </div>
      <div class="cosmic-card">
        <div class="icon">⟳</div>
        <div class="label">Personal Year</div>
        <div class="value">${n.personalYear}</div>
        <div class="sub">Annual Cycle</div>
      </div>
    </div>
  </section>

  <!-- SOUL STATEMENT -->
  <div class="soul-statement">
    <p>${isMonthlyUpdate ? `This month brings the energy of renewal and reflection. ${fullName}, tune into these frequencies.` : `${fullName}, your consciousness is coded for transformation. Integrate these frequencies and watch your reality respond.`}</p>
  </div>

  <footer class="footer">
    <a href="https://thefirstspark.shop">THE FIRST SPARK</a>
    <div class="brand">Reality is programmable. Consciousness is the code.</div>
  </footer>

</div>

<script>
function createStarfield() {
  const container = document.querySelector('.stars');
  const lifePathNum = ${n.lifePath};
  const soulUrgeNum = ${n.soulUrge};
  const expressionNum = ${n.expression};
  const sunSign = "${astrology.sunSign}";

  const SUN_SIGN_COLORS = {
    'Aries': ['#f97316', '#ea580c', '#dc2626'],
    'Taurus': ['#84cc16', '#65a30d', '#4d7c0f'],
    'Gemini': ['#8b5cf6', '#7c3aed', '#a855f7'],
    'Cancer': ['#22d3ee', '#06b6d4', '#0891b7'],
    'Leo': ['#f97316', '#ea580c', '#fbbf24'],
    'Virgo': ['#84cc16', '#65a30d', '#4d7c0f'],
    'Libra': ['#8b5cf6', '#7c3aed', '#a855f7'],
    'Scorpio': ['#22d3ee', '#0f172a', '#1e293b'],
    'Sagittarius': ['#f97316', '#ea580c', '#fbbf24'],
    'Capricorn': ['#6b7280', '#4b5563', '#1f2937'],
    'Aquarius': ['#8b5cf6', '#7c3aed', '#a855f7'],
    'Pisces': ['#22d3ee', '#06b6d4', '#0891b7'],
  };

  const colors = SUN_SIGN_COLORS[sunSign] || ['#22d3ee', '#8b5cf6', '#d4af37'];
  const seed = lifePathNum * 1000 + soulUrgeNum * 100 + expressionNum * 10;

  function seededRandom(s) {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  }

  for (let i = 0; i < 150; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.style.left = (seededRandom(seed + i * 2) * 100) + '%';
    star.style.top = (seededRandom(seed + i * 2 + 1) * 100) + '%';
    const size = seededRandom(seed + i * 3) * 2 + 0.5;
    star.style.width = size + 'px';
    star.style.height = size + 'px';
    star.style.backgroundColor = colors[i % colors.length];
    star.style.setProperty('--duration', (seededRandom(seed + i * 4) * 3 + 2) + 's');
    container.appendChild(star);
  }
}

createStarfield();
</script>
</body>
</html>`;
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --void: #0a0a0f;
  --gold: #d4af37;
  --gold-dim: #8b7355;
  --purple: #8b5cf6;
  --cyan: #22d3ee;
  --lavender: #a87fd4;
  --cream: #fdf6ee;
  --plum: #1e1035;
}
body {
  background: var(--void);
  color: var(--cream);
  font-family: 'Cormorant Garamond', Georgia, serif;
  line-height: 1.7;
  overflow-x: hidden;
}
.stars {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: radial-gradient(ellipse at 20% 50%, rgba(107,63,160,0.08) 0%, transparent 60%),
              radial-gradient(ellipse at 80% 20%, rgba(34,211,238,0.05) 0%, transparent 50%);
  pointer-events: none; z-index: 0;
}
.star {
  position: absolute;
  border-radius: 50%;
  animation: twinkle var(--duration) infinite;
}
@keyframes twinkle {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
.container { max-width: 800px; margin: 0 auto; padding: 40px 24px; position: relative; z-index: 1; }

/* Header */
.header { text-align: center; padding: 60px 0 40px; border-bottom: 1px solid rgba(212,175,55,0.2); margin-bottom: 48px; }
.header-label { font-family: 'Space Mono', monospace; font-size: 0.7rem; letter-spacing: 0.4em; color: var(--cyan); text-transform: uppercase; margin-bottom: 16px; }
.header h1 { font-size: clamp(2rem, 5vw, 3.2rem); font-weight: 300; color: var(--gold); letter-spacing: 0.08em; margin-bottom: 12px; }
.header .meta { font-family: 'Space Mono', monospace; font-size: 0.75rem; color: var(--gold-dim); letter-spacing: 0.1em; }

/* Sections */
.section { margin-bottom: 56px; }
.section-title {
  font-family: 'Space Mono', monospace; font-size: 0.7rem; letter-spacing: 0.35em;
  color: var(--cyan); text-transform: uppercase; margin-bottom: 24px;
  padding-bottom: 8px; border-bottom: 1px solid rgba(34,211,238,0.15);
}

/* Core Numbers Grid */
.numbers-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; }
.number-card {
  background: rgba(30,16,53,0.4); border: 1px solid rgba(139,92,246,0.15);
  border-radius: 4px; padding: 24px; text-align: center;
  transition: border-color 0.3s;
}
.number-card:hover { border-color: var(--gold); }
.number-card .num { font-size: 2.5rem; font-weight: 700; color: var(--gold); line-height: 1; }
.number-card .label { font-family: 'Space Mono', monospace; font-size: 0.65rem; letter-spacing: 0.3em; color: var(--lavender); text-transform: uppercase; margin: 8px 0 4px; }
.number-card .title { font-size: 1.1rem; color: var(--cream); font-style: italic; }

/* Interpretation blocks */
.interp { margin-bottom: 32px; padding: 24px; background: rgba(30,16,53,0.25); border-left: 2px solid var(--purple); border-radius: 0 4px 4px 0; }
.interp h3 { color: var(--gold); font-size: 1.2rem; margin-bottom: 8px; font-weight: 400; }
.interp .keywords { font-family: 'Space Mono', monospace; font-size: 0.7rem; color: var(--cyan); letter-spacing: 0.15em; margin-bottom: 12px; }
.interp p { color: rgba(253,246,238,0.85); font-size: 1rem; }
.shadow { margin-top: 12px; padding: 12px; background: rgba(139,92,246,0.08); border-radius: 4px; }
.shadow-label { font-family: 'Space Mono', monospace; font-size: 0.6rem; color: #ff6b6b; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 4px; }
.shadow p { color: rgba(253,246,238,0.6); font-size: 0.9rem; }

/* Cosmic Section */
.cosmic-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; }
.cosmic-card { text-align: center; padding: 20px; background: rgba(30,16,53,0.3); border-radius: 4px; }
.cosmic-card .icon { font-size: 2rem; margin-bottom: 8px; }
.cosmic-card .label { font-family: 'Space Mono', monospace; font-size: 0.6rem; color: var(--lavender); letter-spacing: 0.3em; text-transform: uppercase; margin-bottom: 4px; }
.cosmic-card .value { font-size: 1.3rem; color: var(--gold); }
.cosmic-card .sub { font-size: 0.85rem; color: rgba(253,246,238,0.5); margin-top: 4px; }

/* Soul Statement */
.soul-statement {
  text-align: center; padding: 48px 24px; margin: 48px 0;
  background: linear-gradient(135deg, rgba(30,16,53,0.5), rgba(10,10,15,0.8));
  border: 1px solid rgba(212,175,55,0.2); border-radius: 4px;
}
.soul-statement p {
  font-size: 1.3rem; font-style: italic; color: var(--gold);
  line-height: 1.9; max-width: 600px; margin: 0 auto;
}

/* Footer */
.footer { text-align: center; padding: 48px 0 24px; border-top: 1px solid rgba(212,175,55,0.1); margin-top: 48px; }
.footer a { color: var(--cyan); text-decoration: none; font-family: 'Space Mono', monospace; font-size: 0.75rem; letter-spacing: 0.2em; }
.footer .brand { color: var(--gold-dim); font-size: 0.7rem; margin-top: 16px; letter-spacing: 0.2em; }

/* Sacred Geometry SVG */
.geometry { text-align: center; margin: 32px 0; opacity: 0.3; }

@media (max-width: 600px) {
  .container { padding: 24px 16px; }
  .numbers-grid { grid-template-columns: 1fr 1fr; }
  .cosmic-grid { grid-template-columns: 1fr 1fr; }
}
</style>
</head>
<body>
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-N4Z6GH2N"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
<div class="stars"></div>
<div class="container">

  <header class="header">
    <div class="header-label">Soul Map — Consciousness Decoded</div>
    <h1>${fullName}</h1>
    <div class="meta">${displayDate} ✦ ${displayTime} ✦ ${displayPlace}</div>
  </header>

  <!-- SACRED GEOMETRY -->
  <div class="geometry">
    <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="55" fill="none" stroke="rgba(212,175,55,0.3)" stroke-width="0.5"/>
      <circle cx="60" cy="60" r="35" fill="none" stroke="rgba(139,92,246,0.3)" stroke-width="0.5"/>
      <polygon points="60,10 105,82.5 15,82.5" fill="none" stroke="rgba(34,211,238,0.2)" stroke-width="0.5"/>
      <polygon points="60,110 15,37.5 105,37.5" fill="none" stroke="rgba(34,211,238,0.2)" stroke-width="0.5"/>
    </svg>
  </div>

  <!-- CORE NUMBERS -->
  <section class="section">
    <div class="section-title">Core Consciousness Architecture</div>
    <div class="numbers-grid">
      <div class="number-card">
        <div class="num">${n.lifePath}</div>
        <div class="label">Life Path</div>
        <div class="title">${lp.title}</div>
      </div>
      <div class="number-card">
        <div class="num">${n.expression}</div>
        <div class="label">Expression</div>
        <div class="title">${exp.title}</div>
      </div>
      <div class="number-card">
        <div class="num">${n.soulUrge}</div>
        <div class="label">Soul Urge</div>
        <div class="title">${su.title}</div>
      </div>
      <div class="number-card">
        <div class="num">${n.personality}</div>
        <div class="label">Personality</div>
        <div class="title"></div>
      </div>
      <div class="number-card">
        <div class="num">${n.birthday}</div>
        <div class="label">Birthday</div>
        <div class="title"></div>
      </div>
      <div class="number-card">
        <div class="num">${n.maturity}</div>
        <div class="label">Maturity</div>
        <div class="title"></div>
      </div>
    </div>
  </section>

  <!-- LIFE PATH DIVE -->
  <section class="section">
    <div class="section-title">Life Path ${n.lifePath} — ${lp.title}</div>
    <div class="interp">
      <h3>${lp.title}</h3>
      <div class="keywords">${lp.keywords}</div>
      <p>${lp.description}</p>
      <div class="shadow">
        <div class="shadow-label">Shadow Frequency</div>
        <p>${lp.shadow}</p>
      </div>
    </div>
  </section>

  <!-- COSMIC COORDINATES -->
  <section class="section">
    <div class="section-title">Cosmic Coordinates</div>
    <div class="cosmic-grid">
      <div class="cosmic-card">
        <div class="icon">☉</div>
        <div class="label">Sun Sign</div>
        <div class="value">${astrology.sunSign}</div>
        <div class="sub">${astrology.element} • ${astrology.modality}</div>
      </div>
      <div class="cosmic-card">
        <div class="icon">🐉</div>
        <div class="label">Chinese Zodiac</div>
        <div class="value">${chineseZodiac.animal}</div>
        <div class="sub">${chineseZodiac.element}</div>
      </div>
      <div class="cosmic-card">
        <div class="icon">⟳</div>
        <div class="label">Personal Year</div>
        <div class="value">${personalYear.personalYear}</div>
        <div class="sub">Annual Cycle</div>
      </div>
    </div>
  </section>

  <!-- SOUL STATEMENT -->
  <div class="soul-statement">
    <p>${fullName}, your consciousness is coded for transformation. Integrate these frequencies and watch your reality respond.</p>
  </div>

  <footer class="footer">
    <a href="https://thefirstspark.shop">THE FIRST SPARK</a>
    <div class="brand">Reality is programmable. Consciousness is the code.</div>
  </footer>

</div>

<script>
function createStarfield() {
  const container = document.querySelector('.stars');
  const lifePathNum = ${n.lifePath};
  const soulUrgeNum = ${n.soulUrge};
  const expressionNum = ${n.expression};
  const sunSign = "${astrology.sunSign}";

  const SUN_SIGN_COLORS = {
    'Aries': ['#f97316', '#ea580c', '#dc2626'],
    'Taurus': ['#84cc16', '#65a30d', '#4d7c0f'],
    'Gemini': ['#8b5cf6', '#7c3aed', '#a855f7'],
    'Cancer': ['#22d3ee', '#06b6d4', '#0891b7'],
    'Leo': ['#f97316', '#ea580c', '#fbbf24'],
    'Virgo': ['#84cc16', '#65a30d', '#4d7c0f'],
    'Libra': ['#8b5cf6', '#7c3aed', '#a855f7'],
    'Scorpio': ['#22d3ee', '#0f172a', '#1e293b'],
    'Sagittarius': ['#f97316', '#ea580c', '#fbbf24'],
    'Capricorn': ['#6b7280', '#4b5563', '#1f2937'],
    'Aquarius': ['#8b5cf6', '#7c3aed', '#a855f7'],
    'Pisces': ['#22d3ee', '#06b6d4', '#0891b7'],
  };

  const colors = SUN_SIGN_COLORS[sunSign] || ['#22d3ee', '#8b5cf6', '#d4af37'];
  const seed = lifePathNum * 1000 + soulUrgeNum * 100 + expressionNum * 10;

  function seededRandom(s) {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  }

  for (let i = 0; i < 150; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.style.left = (seededRandom(seed + i * 2) * 100) + '%';
    star.style.top = (seededRandom(seed + i * 2 + 1) * 100) + '%';
    const size = seededRandom(seed + i * 3) * 2 + 0.5;
    star.style.width = size + 'px';
    star.style.height = size + 'px';
    star.style.backgroundColor = colors[i % colors.length];
    star.style.setProperty('--duration', (seededRandom(seed + i * 4) * 3 + 2) + 's');
    container.appendChild(star);
  }
}

createStarfield();
</script>
</body>
</html>`;
}

// =============================================
// GITHUB PUSH
// =============================================
async function pushToGitHub(html, filename) {
  const GITHUB_PAT = process.env.GITHUB_PAT;
  const repo = "thefirstspark/soul-maps";
  const path = filename;
  const content = btoa(unescape(encodeURIComponent(html)));

  let sha = null;
  try {
    const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: { Authorization: `token ${GITHUB_PAT}`, "User-Agent": "SoulMapEngine" },
    });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      sha = existing.sha;
    }
  } catch (e) {
    // File doesn't exist yet
  }

  const body = {
    message: `✨ Soul Map: ${filename}`,
    content,
    branch: "master",
  };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_PAT}`,
      "Content-Type": "application/json",
      "User-Agent": "SoulMapEngine",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub push failed: ${err}`);
  }

  return await res.json();
}

// =============================================
// EMAIL NOTIFICATION
// =============================================
async function sendConfirmationEmail(birthData, liveUrl, isMonthlyUpdate) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY || !birthData.email) return;

  const subject = isMonthlyUpdate
    ? `✨ Your Monthly Update is Ready, ${birthData.fullName.split(" ")[0]}`
    : `✨ Your Soul Map is Ready, ${birthData.fullName.split(" ")[0]}`;

  const message = isMonthlyUpdate
    ? "Your monthly soul update has been generated with this month's personal numerology."
    : "Your full soul map has been generated with complete numerology and cosmic coordinates.";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "The First Spark <soul-maps@thefirstspark.shop>",
      to: birthData.email,
      subject,
      html: `
        <div style="background:#0a0a0f;color:#fdf6ee;font-family:Georgia,serif;padding:40px;max-width:600px;margin:0 auto;">
          <h1 style="color:#d4af37;text-align:center;letter-spacing:0.1em;font-weight:300;">${isMonthlyUpdate ? 'Your Monthly Update is Live' : 'Your Soul Map is Live'}</h1>
          <p style="text-align:center;color:#a87fd4;font-size:1.1rem;">
            ${birthData.fullName}, ${message}
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${liveUrl}" style="background:#d4af37;color:#0a0a0f;padding:14px 32px;text-decoration:none;font-family:monospace;letter-spacing:0.15em;font-size:0.85rem;">
              VIEW ${isMonthlyUpdate ? 'MONTHLY UPDATE' : 'YOUR SOUL MAP'}
            </a>
          </div>
          <p style="text-align:center;color:rgba(253,246,238,0.5);font-size:0.85rem;">
            ${isMonthlyUpdate ? 'Check back next month for your next reading.' : 'This page is yours forever. Bookmark it, share it, return to it.'}
          </p>
          <div style="text-align:center;margin-top:40px;border-top:1px solid rgba(212,175,55,0.2);padding-top:20px;">
            <a href="https://thefirstspark.shop" style="color:#22d3ee;text-decoration:none;font-family:monospace;font-size:0.7rem;letter-spacing:0.2em;">THE FIRST SPARK</a>
          </div>
        </div>
      `,
    }),
  });
}

async function notifyKate(birthData, liveUrl, isMonthlyUpdate) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Soul Map Engine <soul-maps@thefirstspark.shop>",
      to: "kate@thefirstspark.shop",
      subject: `🎉 New ${isMonthlyUpdate ? 'Monthly Update' : 'Soul Map'}: ${birthData.fullName}`,
      html: `
        <p>New ${isMonthlyUpdate ? 'monthly update' : 'soul map'} generated:</p>
        <p><strong>${birthData.fullName}</strong></p>
        <p>Email: ${birthData.email}</p>
        <p>Type: ${isMonthlyUpdate ? 'Monthly Update' : 'Basic Map'}</p>
        <p><a href="${liveUrl}">View Map</a></p>
      `,
    }),
  });
}
