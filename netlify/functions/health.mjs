// netlify/functions/health.mjs
export default async (req) => {
  return new Response(
    JSON.stringify({
      status: "online",
      engine: "Soul Map Engine v1.0",
      brand: "The First Spark",
      endpoints: {
        webhook: "/.netlify/functions/soul-map-webhook",
        health: "/.netlify/functions/health",
      },
      timestamp: new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/health",
};
