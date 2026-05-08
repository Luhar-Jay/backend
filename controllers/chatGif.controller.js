// GET /api/v1/chat/gifs?q=&limit=
export const searchGifs = async (req, res) => {
  try {
    const { q = "", limit = "20" } = req.query;
    const apiKey = process.env.TENOR_API_KEY;

    if (!apiKey) {
      return res.status(503).json({ success: false, message: "GIF service not configured" });
    }

    const params = new URLSearchParams({
      q: q.trim() || "trending",
      key: apiKey,
      limit: String(Math.min(parseInt(limit) || 20, 50)),
      media_filter: "gif",
      contentfilter: "medium",
    });

    const tenorRes = await fetch(`https://tenor.googleapis.com/v2/search?${params}`);
    if (!tenorRes.ok) {
      return res.status(502).json({ success: false, message: "GIF service unavailable" });
    }

    const data = await tenorRes.json();

    const gifs = (data.results ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      preview: item.media_formats?.tinygif?.url ?? "",
      url: item.media_formats?.gif?.url ?? item.media_formats?.tinygif?.url ?? "",
      dims: item.media_formats?.gif?.dims ?? [200, 200],
    }));

    return res.status(200).json({ success: true, data: gifs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/v1/chat/gifs/trending
export const trendingGifs = async (req, res) => {
  req.query.q = "";
  return searchGifs(req, res);
};
