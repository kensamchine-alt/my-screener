import { useState, useCallback, useEffect, useRef } from "react";

const SCREEN_METHODS = [
  {
    id: "large_stable", label: "Large-Cap Stable", tag: "METHOD 1",
    desc: "Market cap ≥ $10B — Only ~12 coins qualify. Tradable, reliable, long-term watch.",
    marketCap: "≥ $10B", move: "Any", timeframe: "Daily", color: "#00FFB2", accent: "#001A10",
  },
  {
    id: "mid_stable", label: "Mid-Cap Stable", tag: "METHOD 2",
    desc: "Market cap $1B–$10B with ±5%–10% monthly move — stable trending coins.",
    marketCap: "$1B – $10B", move: "±5%–10% / month", timeframe: "Daily", color: "#3B82F6", accent: "#010D1E",
  },
  {
    id: "consolidating", label: "Consolidating", tag: "METHOD 3",
    desc: "Market cap $1B–$10B with ±0%–5% weekly move — coins building energy before a move.",
    marketCap: "$1B – $10B", move: "±0%–5% / week", timeframe: "Daily", color: "#F59E0B", accent: "#130D00",
  },
  {
    id: "impulsive", label: "Impulsive Moves", tag: "METHOD 4",
    desc: "Small-cap $100M–$1B with ±10%–30% move in a day or week — high momentum plays.",
    marketCap: "$100M – $1B", move: "±10%–30% / day or week", timeframe: "Daily + 4H", color: "#FF4D6D", accent: "#160005",
  },
];

function screenCoins(methodId, coins) {
  return coins.filter((c) => {
    const capB = (c.market_cap || 0) / 1e9;
    const change1d = c.price_change_percentage_24h_in_currency ?? 0;
    const change1w = c.price_change_percentage_7d_in_currency ?? 0;
    const change1m = c.price_change_percentage_30d_in_currency ?? 0;
    if (methodId === "large_stable") return capB >= 10;
    if (methodId === "mid_stable") return capB >= 1 && capB < 10 && Math.abs(change1m) >= 5 && Math.abs(change1m) <= 10;
    if (methodId === "consolidating") return capB >= 1 && capB < 10 && Math.abs(change1w) <= 5;
    if (methodId === "impulsive") return capB >= 0.1 && capB < 1 && (Math.abs(change1d) >= 10 || Math.abs(change1w) >= 10);
    return false;
  });
}

function formatCap(v) {
  if (!v) return "N/A";
  const b = v / 1e9;
  if (b >= 10) return `$${b.toFixed(0)}B`;
  if (b >= 1) return `$${b.toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}

function formatPrice(v) {
  if (!v) return "N/A";
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(6)}`;
}

function ChangeTag({ val }) {
  if (val == null) return <span style={{ color: "#3A5070", fontSize: 12 }}>—</span>;
  const pos = val >= 0;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700,
      background: pos ? "rgba(0,255,100,0.10)" : "rgba(255,60,80,0.10)",
      color: pos ? "#00FF88" : "#FF4D6D",
    }}>
      {pos ? "+" : ""}{val.toFixed(2)}%
    </span>
  );
}

function CandlestickChart({ coinId, apiKey, color }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const [range, setRange] = useState("30");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const ranges = [["1", "24H"], ["7", "7D"], ["30", "1M"], ["90", "3M"]];

  // Map days to CoinGecko OHLC supported days
  const ohlcDays = { "1": "1", "7": "7", "30": "30", "90": "90" };

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically import lightweight-charts
    import("lightweight-charts").then(({ createChart, CandlestickSeries }) => {
      // Destroy old chart if exists
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 220,
        layout: {
          background: { color: "transparent" },
          textColor: "#4A6080",
        },
        grid: {
          vertLines: { color: "#0F1820" },
          horzLines: { color: "#0F1820" },
        },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: "#1E2D3D" },
        timeScale: { borderColor: "#1E2D3D", timeVisible: true },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#00FF88",
        downColor: "#FF4D6D",
        borderUpColor: "#00FF88",
        borderDownColor: "#FF4D6D",
        wickUpColor: "#00FF88",
        wickDownColor: "#FF4D6D",
      });

      chartRef.current = chart;
      seriesRef.current = candleSeries;

      setLoading(true);
      setError("");

      fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${ohlcDays[range]}`,
        { headers: { "x-cg-demo-api-key": apiKey } }
      )
        .then(r => r.json())
        .then(data => {
          if (!Array.isArray(data) || data.length === 0) throw new Error("No data");
          const candles = data.map(([ts, o, h, l, c]) => ({
            time: Math.floor(ts / 1000),
            open: o, high: h, low: l, close: c,
          }));
          // Remove duplicate timestamps
          const seen = new Set();
          const unique = candles.filter(c => {
            if (seen.has(c.time)) return false;
            seen.add(c.time);
            return true;
          });
          unique.sort((a, b) => a.time - b.time);
          candleSeries.setData(unique);
          chart.timeScale().fitContent();
          setLoading(false);
        })
        .catch(e => {
          setError("Chart data unavailable");
          setLoading(false);
        });

      // Handle resize
      const ro = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    });

    return () => {
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [coinId, apiKey, range]);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {ranges.map(([v, label]) => (
          <button key={v} onClick={() => setRange(v)} style={{
            padding: "4px 12px", borderRadius: 4, fontSize: 11,
            background: range === v ? color : "#13191F",
            color: range === v ? "#080C10" : "#4A6080",
            border: `1px solid ${range === v ? color : "#1E2D3D"}`,
            fontFamily: "inherit", cursor: "pointer", fontWeight: 700, letterSpacing: 1,
          }}>{label}</button>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        {loading && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", color: "#4A6080", fontSize: 12, zIndex: 2,
            background: "#0A1018",
          }}>Loading candles...</div>
        )}
        {error && (
          <div style={{
            height: 220, display: "flex", alignItems: "center",
            justifyContent: "center", color: "#FF4D6D", fontSize: 12,
          }}>{error}</div>
        )}
        <div ref={containerRef} style={{ width: "100%", opacity: loading ? 0 : 1, transition: "opacity 0.3s" }} />
      </div>
    </div>
  );
}

function CoinCard({ coin, color, apiKey }) {
  const [expanded, setExpanded] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [notesLoaded, setNotesLoaded] = useState(false);

  async function loadAiNote() {
    if (notesLoaded) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `You are a professional crypto trading analyst. Give a detailed trading note for ${coin.name} (${coin.symbol.toUpperCase()}):
- Price: ${formatPrice(coin.current_price)}
- Market Cap: ${formatCap(coin.market_cap)}
- 24H: ${(coin.price_change_percentage_24h_in_currency ?? 0).toFixed(2)}%
- 7D: ${(coin.price_change_percentage_7d_in_currency ?? 0).toFixed(2)}%
- 30D: ${(coin.price_change_percentage_30d_in_currency ?? 0).toFixed(2)}%
- 24H Volume: ${formatCap(coin.total_volume)}
- ATH: ${formatPrice(coin.ath)} (${(coin.ath_change_percentage ?? 0).toFixed(1)}% from ATH)

Write 4 sections:
1. 📊 MARKET STRUCTURE — what the price action is telling us
2. 🎯 KEY LEVELS — important price levels to watch
3. ⚡ MOMENTUM — bullish, bearish or neutral and why
4. 🧭 TRADING BIAS — what a trader should watch for

Be specific, use the actual numbers, keep it concise.`
          }]
        })
      });
      const data = await res.json();
      setAiNote(data.content?.map(b => b.text || "").join("") || "Could not generate note.");
    } catch {
      setAiNote("Could not generate AI note.");
    }
    setAiLoading(false);
    setNotesLoaded(true);
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !notesLoaded) loadAiNote();
  }

  return (
    <div style={{
      border: `1px solid ${expanded ? color + "55" : "#1E2D3D"}`,
      borderRadius: 10, overflow: "hidden", marginBottom: 8,
      background: expanded ? "#0A1018" : "#0D1117",
      boxShadow: expanded ? `0 0 20px ${color}11` : "none",
      transition: "all 0.2s",
    }}>
      {/* Coin Row */}
      <div onClick={toggle} style={{
        display: "grid", gridTemplateColumns: "36px 70px 1fr 100px 90px 90px 90px",
        padding: "12px 16px", alignItems: "center", cursor: "pointer", gap: 4,
      }}>
        <span style={{ color: expanded ? color : "#3A5070", fontSize: 16 }}>
          {expanded ? "▾" : "▸"}
        </span>
        <span style={{ fontWeight: 800, fontSize: 13, color: color }}>{coin.symbol?.toUpperCase()}</span>
        <span style={{ fontSize: 12, color: "#7A90A8" }}>{coin.name}</span>
        <span style={{ fontSize: 12, textAlign: "right", color: "#C0CCD8" }}>{formatPrice(coin.current_price)}</span>
        <span style={{ fontSize: 12, textAlign: "right", color: "#C0CCD8" }}>{formatCap(coin.market_cap)}</span>
        <span style={{ textAlign: "right" }}><ChangeTag val={coin.price_change_percentage_24h_in_currency} /></span>
        <span style={{ textAlign: "right" }}><ChangeTag val={coin.price_change_percentage_7d_in_currency} /></span>
      </div>

      {/* Expanded Panel */}
      {expanded && (
        <div style={{ padding: "0 16px 20px", borderTop: "1px solid #1E2D3D" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24, marginTop: 16 }}>

            {/* LEFT — Candlestick Chart */}
            <div>
              <div style={{ fontSize: 10, color: color, letterSpacing: 3, fontWeight: 700, marginBottom: 8 }}>
                ◈ CANDLESTICK CHART
              </div>
              <CandlestickChart coinId={coin.id} apiKey={apiKey} color={color} />
            </div>

            {/* RIGHT — AI Note + Stats */}
            <div>
              <div style={{ fontSize: 10, color: "#3B82F6", letterSpacing: 3, fontWeight: 700, marginBottom: 8 }}>
                ◈ AI TRADING NOTE
              </div>
              {aiLoading ? (
                <div style={{ color: "#4A6080", fontSize: 12 }}>Generating analysis...</div>
              ) : (
                <div style={{
                  fontSize: 12, color: "#8AA0B8", lineHeight: 1.8,
                  whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto",
                  marginBottom: 14,
                }}>
                  {aiNote}
                </div>
              )}

              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["30D %", <ChangeTag val={coin.price_change_percentage_30d_in_currency} />],
                  ["ATH %", <ChangeTag val={coin.ath_change_percentage} />],
                  ["24H VOL", <span style={{ fontSize: 12, color: "#C0CCD8", fontWeight: 700 }}>{formatCap(coin.total_volume)}</span>],
                  ["ATH", <span style={{ fontSize: 12, color: "#C0CCD8", fontWeight: 700 }}>{formatPrice(coin.ath)}</span>],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: "#080C10", borderRadius: 6, padding: "8px 12px", border: "1px solid #1E2D3D" }}>
                    <div style={{ fontSize: 10, color: "#3A5070", letterSpacing: 2, marginBottom: 4 }}>{label}</div>
                    {val}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CryptoScreener() {
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [coins, setCoins] = useState([]);
  const [loadingCoins, setLoadingCoins] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [active, setActive] = useState(null);
  const [results, setResults] = useState([]);
  const [aiInsight, setAiInsight] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const fetchCoins = useCallback(async (key) => {
    setLoadingCoins(true);
    setFetchError("");
    try {
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=24h,7d,30d`;
      const res = await fetch(url, { headers: { "x-cg-demo-api-key": key } });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      setCoins(await res.json());
      setApiKey(key);
    } catch (e) {
      setFetchError(e.message || "Failed to fetch. Check your API key.");
    }
    setLoadingCoins(false);
  }, []);

  async function runScreen(method) {
    setActive(method.id);
    setAiInsight("");
    const matched = screenCoins(method.id, coins);
    setResults(matched);
    setAiLoading(true);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Crypto screen "${method.label}": ${method.desc}. Found ${matched.length} coins: ${matched.slice(0, 10).map(c => `${c.symbol.toUpperCase()} (24h:${(c.price_change_percentage_24h_in_currency ?? 0).toFixed(1)}%, 7d:${(c.price_change_percentage_7d_in_currency ?? 0).toFixed(1)}%)`).join(", ")}. Give 3 sharp bullet-point insights about what this screen result means for the market right now.`
          }]
        })
      });
      const data = await res.json();
      setAiInsight(data.content?.map(b => b.text || "").join("") || "");
    } catch { setAiInsight("Could not load insight."); }
    setAiLoading(false);
  }

  const activeMethod = SCREEN_METHODS.find(m => m.id === active);

  if (!apiKey) {
    return (
      <div style={{
        minHeight: "100vh", background: "#080C10", fontFamily: "'Courier New', monospace",
        color: "#E0E6F0", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <div style={{ maxWidth: 480, width: "100%" }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: "#3B82F6", marginBottom: 8 }}>◈ SETUP</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 8px", background: "linear-gradient(90deg,#00FFB2,#3B82F6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Connect Live Crypto Data
          </h1>
          <p style={{ color: "#4A6080", fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>
            Get a free demo key at{" "}
            <a href="https://www.coingecko.com/en/api" target="_blank" rel="noreferrer" style={{ color: "#00FFB2" }}>
              coingecko.com/en/api
            </a> — no credit card needed.
          </p>
          <div style={{ background: "#0D1117", border: "1px solid #1E2D3D", borderRadius: 10, padding: 20 }}>
            <label style={{ fontSize: 11, color: "#3B82F6", letterSpacing: 3, display: "block", marginBottom: 8 }}>YOUR API KEY</label>
            <input type="text" placeholder="CG-xxxxxxxxxxxxxxxxxxxx" value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && keyInput.trim() && fetchCoins(keyInput.trim())}
              style={{ width: "100%", boxSizing: "border-box", background: "#080C10", border: "1px solid #1E3050", borderRadius: 6, padding: "10px 14px", color: "#00FFB2", fontFamily: "inherit", fontSize: 13, outline: "none", marginBottom: 12 }} />
            {fetchError && <div style={{ color: "#FF4D6D", fontSize: 12, marginBottom: 10 }}>⚠ {fetchError}</div>}
            <button onClick={() => keyInput.trim() && fetchCoins(keyInput.trim())} disabled={loadingCoins || !keyInput.trim()}
              style={{ width: "100%", padding: "11px 0", borderRadius: 6, background: loadingCoins ? "#1E2D3D" : "linear-gradient(90deg,#00FFB2,#3B82F6)", border: "none", color: "#080C10", fontFamily: "inherit", fontWeight: 900, fontSize: 13, letterSpacing: 2, cursor: "pointer" }}>
              {loadingCoins ? "CONNECTING..." : "CONNECT & LOAD DATA"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080C10", fontFamily: "'Courier New', monospace", color: "#E0E6F0", padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 4, color: "#4A5568", marginBottom: 6 }}>◈ LIVE DATA · {coins.length} COINS LOADED</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, background: "linear-gradient(90deg,#00FFB2,#3B82F6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Crypto Screener
          </h1>
        </div>
        <button onClick={() => { setApiKey(""); setCoins([]); setActive(null); setResults([]); setAiInsight(""); }}
          style={{ background: "none", border: "1px solid #1E2D3D", borderRadius: 6, color: "#4A6080", fontSize: 11, padding: "6px 12px", fontFamily: "inherit", cursor: "pointer", letterSpacing: 1 }}>
          CHANGE KEY
        </button>
      </div>

      {/* Method Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }}>
        {SCREEN_METHODS.map((m) => {
          const count = screenCoins(m.id, coins).length;
          return (
            <button key={m.id} onClick={() => runScreen(m)} style={{
              background: active === m.id ? m.accent : "#0D1117",
              border: `1.5px solid ${active === m.id ? m.color : "#1E2D3D"}`,
              borderRadius: 10, padding: "16px 18px", textAlign: "left", cursor: "pointer",
              boxShadow: active === m.id ? `0 0 20px ${m.color}22` : "none", transition: "all 0.2s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: m.color, letterSpacing: 3, fontWeight: 700 }}>{m.tag}</span>
                <span style={{ fontSize: 11, fontWeight: 800, background: `${m.color}22`, color: m.color, padding: "1px 8px", borderRadius: 10 }}>{count} coins</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: active === m.id ? m.color : "#C9D4E0", marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: "#4A6080", lineHeight: 1.5 }}>{m.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Results */}
      {active && (
        <>
          <div style={{ background: "#0D1117", border: `1px solid ${activeMethod?.color}33`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #1E2D3D", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: activeMethod?.color, fontWeight: 700, letterSpacing: 2 }}>
                {activeMethod?.label.toUpperCase()} — {results.length} COINS · CLICK ROW TO EXPAND
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "36px 70px 1fr 100px 90px 90px 90px", padding: "8px 16px", fontSize: 10, color: "#3A5070", letterSpacing: 2, borderBottom: "1px solid #131920" }}>
              <span /><span>SYMBOL</span><span>NAME</span>
              <span style={{ textAlign: "right" }}>PRICE</span>
              <span style={{ textAlign: "right" }}>MKT CAP</span>
              <span style={{ textAlign: "right" }}>24H %</span>
              <span style={{ textAlign: "right" }}>7D %</span>
            </div>
            <div style={{ padding: 8 }}>
              {results.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#4A6080", fontSize: 13 }}>No coins matched this criteria.</div>
              ) : results.map(coin => (
                <CoinCard key={coin.id} coin={coin} color={activeMethod?.color} apiKey={apiKey} />
              ))}
            </div>
          </div>

          <div style={{ background: "#0D1117", border: "1px solid #1E2D3D", borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, color: "#3B82F6", letterSpacing: 3, fontWeight: 700, marginBottom: 10 }}>◈ SCREEN SUMMARY</div>
            {aiLoading ? (
              <div style={{ color: "#4A6080", fontSize: 13 }}>Analyzing screen results...</div>
            ) : (
              <div style={{ fontSize: 13, color: "#8AA0B8", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{aiInsight}</div>
            )}
          </div>
        </>
      )}
      <div style={{ marginTop: 24, fontSize: 10, color: "#2A3A4A", textAlign: "center", letterSpacing: 2 }}>
        POWERED BY COINGECKO · REAL-TIME DATA
      </div>
    </div>
  );
}
