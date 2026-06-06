/* ============================================================
   CryptoTrack — app.js
   CoinGecko API + Indicators + Prediction + Zoom + Portfolio
   ============================================================ */

const API_KEY  = 'CG-jq6F6GX1aHR1zZP2jiBisKMS';
const BASE_URL = 'https://api.coingecko.com/api/v3';
const HEADERS  = { 'x-cg-demo-api-key': API_KEY };

const POPULAR_IDS = [
  'bitcoin','ethereum','tether','binancecoin','solana',
  'ripple','usd-coin','dogecoin','cardano','avalanche-2'
];

/* ── DOM ─────────────────────────────────────────────────── */
const searchInput  = document.getElementById('searchInput');
const searchBtn    = document.getElementById('searchBtn');
const clearBtn     = document.getElementById('clearBtn');
const dropdown     = document.getElementById('dropdown');
const dropdownList = document.getElementById('dropdownList');
const loader       = document.getElementById('loader');
const coinCard     = document.getElementById('coinCard');
const errorMsg     = document.getElementById('errorMsg');
const chartLoader  = document.getElementById('chartLoader');

/* ── Nav Views ── */
const navMarket    = document.getElementById('navMarket');
const navPortfolio = document.getElementById('navPortfolio');
const viewMarket   = document.getElementById('viewMarket');
const viewPortfolio= document.getElementById('viewPortfolio');

/* ── State ───────────────────────────────────────────────── */
let popularCoins  = [];
let allCoinsList  = [];
let charts        = {};          // { price, volume, rsi, macd, prediction }
let currentCoinId = null;
let searchTimeout = null;
let focusedIndex  = -1;
let currentDays   = 1;

// Load portfolio from local storage, or start empty
let myPortfolio   = JSON.parse(localStorage.getItem('cryptoTrack_portfolio')) || [];

/* ════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════ */
async function init() {
  await loadPopularCoins();
  await loadAllCoinsList();
  bindEvents();
  bindPortfolioEvents();
}

/* ── API ─────────────────────────────────────────────────── */
async function apiFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

/* ── Popular coins ───────────────────────────────────────── */
async function loadPopularCoins() {
  try {
    popularCoins = await apiFetch(
      `/coins/markets?vs_currency=usd&ids=${POPULAR_IDS.join(',')}&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h`
    );
  } catch (e) { console.warn('Popular coins:', e.message); }
}

async function loadAllCoinsList() {
  try { allCoinsList = await apiFetch('/coins/list'); }
  catch (e) { console.warn('Coin list:', e.message); }
}

/* ════════════════════════════════════════════════════════════
   DROPDOWN
════════════════════════════════════════════════════════════ */
function renderDropdown(coins, isSearch = false) {
  dropdownList.innerHTML = '';
  focusedIndex = -1;
  dropdown.querySelector('.dropdown-section-label').textContent =
    isSearch ? 'Search Results' : 'Popular Coins';

  if (!coins || !coins.length) {
    dropdownList.innerHTML =
      '<div style="padding:14px 16px;color:var(--muted);font-size:0.82rem;">No coins found</div>';
    return;
  }

  coins.forEach(coin => {
    const btn = document.createElement('button');
    btn.className = 'dropdown-item';
    btn.dataset.id = coin.id;

    const change    = coin.price_change_percentage_24h;
    const changeStr = change != null ? `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%` : '—';
    const priceStr  = coin.current_price != null ? formatPrice(coin.current_price) : '—';

    btn.innerHTML = `
      ${coin.image
        ? `<img src="${coin.image}" alt="${coin.name}" loading="lazy"/>`
        : `<div class="di-icon-placeholder">${(coin.symbol||'?').toUpperCase().slice(0,2)}</div>`}
      <div class="di-info">
        <div class="di-name">${coin.name}</div>
        <div class="di-symbol">${(coin.symbol||coin.id).toUpperCase()}</div>
      </div>
      <div>
        <div class="di-price">${priceStr}</div>
        <div class="di-change ${change >= 0 ? 'up' : 'down'}">${changeStr}</div>
      </div>`;

    btn.addEventListener('click', () => selectCoin(coin.id, coin.name));
    dropdownList.appendChild(btn);
  });
}

/* ── Search ──────────────────────────────────────────────── */
function handleSearchInput() {
  const q = searchInput.value.trim().toLowerCase();
  clearBtn.classList.toggle('visible', q.length > 0);
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (!q) { renderDropdown(popularCoins, false); return; }
    const matches = allCoinsList
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q))
      .slice(0, 8)
      .map(m => popularCoins.find(p => p.id === m.id) ||
        { id:m.id, name:m.name, symbol:m.symbol, image:null,
          current_price:null, price_change_percentage_24h:null });
    renderDropdown(matches, true);
  }, 250);
}

function selectCoin(coinId, coinName) {
  currentCoinId = coinId;
  searchInput.value = coinName;
  clearBtn.classList.add('visible');
  closeDropdown();
  fetchCoinData(coinId);
}

/* ════════════════════════════════════════════════════════════
   FETCH & RENDER COIN CARD
════════════════════════════════════════════════════════════ */
async function fetchCoinData(coinId) {
  showError('');
  showLoader(true);
  coinCard.style.display = 'none';
  document.getElementById('resetZoomBtn').style.display = 'none'; // Hide zoom reset
  currentDays = 1;

  try {
    const data = await apiFetch(
      `/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`
    );
    renderCoinCard(data);
    coinCard.style.display = 'block';
    showLoader(false);
    await fetchAndRenderAllCharts(coinId, 1);
  } catch (e) {
    showLoader(false);
    showError('Could not load coin data. Check the name/symbol and try again.');
    console.error(e);
  }
}

function renderCoinCard(d) {
  const md = d.market_data;
  document.getElementById('coinLogo').src   = d.image?.large || '';
  document.getElementById('coinLogo').alt   = d.name;
  document.getElementById('coinName').textContent   = d.name;
  document.getElementById('coinSymbol').textContent = d.symbol?.toUpperCase();
  document.getElementById('coinRank').textContent   = d.market_cap_rank ? `#${d.market_cap_rank}` : '';

  const price  = md.current_price?.usd;
  const change = md.price_change_percentage_24h;
  document.getElementById('currentPrice').textContent = formatPrice(price);
  const changeEl = document.getElementById('priceChange');
  changeEl.className = `price-change ${change >= 0 ? 'up' : 'down'}`;
  changeEl.textContent = change != null
    ? `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}% (24h)` : '—';

  document.getElementById('marketCap').textContent  = formatLarge(md.market_cap?.usd);
  document.getElementById('volume24h').textContent  = formatLarge(md.total_volume?.usd);
  document.getElementById('high24h').textContent    = formatPrice(md.high_24h?.usd);
  document.getElementById('low24h').textContent     = formatPrice(md.low_24h?.usd);
  document.getElementById('circSupply').textContent = md.circulating_supply
    ? formatLarge(md.circulating_supply) + ' ' + d.symbol.toUpperCase() : '—';
  document.getElementById('athPrice').textContent   = formatPrice(md.ath?.usd);

  const desc = d.description?.en;
  const descSec = document.getElementById('descSection');
  if (desc) {
    document.getElementById('descText').textContent = stripHTML(desc).slice(0, 420) + '…';
    descSec.style.display = 'block';
  } else { descSec.style.display = 'none'; }

  /* Period buttons */
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.onclick = () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDays = parseInt(btn.dataset.days);
      document.getElementById('resetZoomBtn').style.display = 'none'; // Hide zoom reset on period change
      fetchAndRenderAllCharts(currentCoinId, currentDays);
    };
  });
  document.querySelector('[data-days="1"]').classList.add('active');
}

/* ════════════════════════════════════════════════════════════
   FETCH ALL CHART DATA
════════════════════════════════════════════════════════════ */
async function fetchAndRenderAllCharts(coinId, days) {
  chartLoader.classList.add('show');
  try {
    const interval = days <= 1 ? 'hourly' : 'daily';
    const data = await apiFetch(
      `/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`
    );

    const prices  = data.prices;
    const volumes = data.total_volumes;

    if (!prices || prices.length < 2) return;

    const labels   = prices.map(p => formatLabel(p[0], days));
    const closes   = prices.map(p => p[1]);
    const vols     = volumes.map(v => v[1]);

    /* Update volume label */
    const avgVol = vols.reduce((a,b) => a+b, 0) / vols.length;
    document.getElementById('volumeLabel').textContent = `Avg ${formatLarge(avgVol)}`;

    renderPriceMAChart(labels, closes);
    renderVolumeChart(labels, closes, vols);
    renderRSIChart(labels, closes);
    renderMACDChart(labels, closes);
    renderPredictionChart(labels, closes);

  } catch (e) {
    console.error('Chart fetch error:', e);
  } finally {
    chartLoader.classList.remove('show');
  }
}

/* ════════════════════════════════════════════════════════════
   ── TECHNICAL INDICATORS ──────────────────────────────────
════════════════════════════════════════════════════════════ */

/* Simple Moving Average */
function calcSMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

/* RSI (Wilder's Smoothing) — period 14 */
function calcRSI(closes, period = 14) {
  const rsi = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return rsi;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains  += diff;
    else           losses -= diff;
  }
  let avgGain = gains  / period;
  let avgLoss = losses / period;
  rsi[period] = 100 - (100 / (1 + avgGain / (avgLoss || 0.0001)));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain)  / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i]  = 100 - (100 / (1 + avgGain / (avgLoss || 0.0001)));
  }
  return rsi;
}

/* EMA */
function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = new Array(data.length).fill(null);
  let startIdx = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] != null) { startIdx = i; break; }
  }
  if (startIdx === -1 || startIdx + period > data.length) return ema;

  let sum = 0;
  for (let i = startIdx; i < startIdx + period; i++) sum += data[i];
  ema[startIdx + period - 1] = sum / period;

  for (let i = startIdx + period; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

/* MACD */
function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null);
  const signal    = calcEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) =>
    v != null && signal[i] != null ? v - signal[i] : null);
  return { macdLine, signal, histogram };
}

/* Simple Linear Regression */
function calcLinearRegression(data) {
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += (i * data[i]);
    sumXX += (i * i);
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

/* ════════════════════════════════════════════════════════════
   ── CHART RENDERERS ──────────────────────────────────────
════════════════════════════════════════════════════════════ */
const CHART_DEFAULTS = {
  gridColor:  'rgba(255,255,255,0.04)',
  tickColor:  '#6b7a99',
  tickFont:   { family: 'Space Mono', size: 10 },
  tooltipBg:  '#0c1120',
  tooltipBorder: 'rgba(255,255,255,0.1)',
};

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); charts[key] = null; }
}

function sharedScaleX(labels) {
  return {
    grid:   { color: CHART_DEFAULTS.gridColor },
    ticks:  { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.tickFont, maxTicksLimit: 6, maxRotation: 0 },
    border: { color: 'rgba(255,255,255,0.06)' }
  };
}
function sharedScaleY(position = 'right', tickCb) {
  return {
    position,
    grid:   { color: CHART_DEFAULTS.gridColor },
    ticks:  { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.tickFont, maxTicksLimit: 5, callback: tickCb },
    border: { color: 'rgba(255,255,255,0.06)' }
  };
}
function sharedTooltip(labelCb) {
  return {
    backgroundColor: CHART_DEFAULTS.tooltipBg,
    borderColor:     CHART_DEFAULTS.tooltipBorder,
    borderWidth: 1,
    titleColor: '#6b7a99',
    bodyColor:  '#e8eaf2',
    titleFont: { family: 'Space Mono', size: 11 },
    bodyFont:  { family: 'Space Mono', size: 12 },
    callbacks: { label: labelCb }
  };
}

/* ── 1. PRICE + MOVING AVERAGES (WITH ZOOM PLUG-IN) ──────── */
function renderPriceMAChart(labels, closes) {
  destroyChart('price');
  const ctx = document.getElementById('priceChart').getContext('2d');
  const ma7  = calcSMA(closes, 7);
  const ma25 = calcSMA(closes, 25);
  const ma99 = calcSMA(closes, 99);

  const isPos = closes[closes.length-1] >= closes[0];
  const lineColor = isPos ? '#00f5c4' : '#ff4d6d';
  const gradient = ctx.createLinearGradient(0, 0, 0, 240);
  gradient.addColorStop(0, isPos ? 'rgba(0,245,196,0.18)' : 'rgba(255,77,109,0.18)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  const show7  = document.getElementById('toggleMA7').checked;
  const show25 = document.getElementById('toggleMA25').checked;
  const show99 = document.getElementById('toggleMA99').checked;

  charts['price'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Price', data: closes, borderColor: lineColor, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: lineColor, fill: true, backgroundColor: gradient, tension: 0.35, order: 1 },
        { label: 'MA7', data: ma7, hidden: !show7, borderColor: '#f9c74f', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.35, order: 2 },
        { label: 'MA25', data: ma25, hidden: !show25, borderColor: '#f3722c', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.35, order: 3 },
        { label: 'MA99', data: ma99, hidden: !show99, borderColor: '#a855f7', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.35, order: 4 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { 
        legend: { display: false }, 
        tooltip: sharedTooltip(ctx => { const v = ctx.parsed.y; if (v == null) return null; return `  ${ctx.dataset.label}: ${formatPrice(v)}`; }),
        /* Zoom & Pan Configuration */
        zoom: {
          pan: {
            enabled: true,
            mode: 'x',
            onPanComplete: () => document.getElementById('resetZoomBtn').style.display = 'inline-block'
          },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x',
            onZoomComplete: () => document.getElementById('resetZoomBtn').style.display = 'inline-block'
          }
        }
      },
      scales: { x: sharedScaleX(labels), y: sharedScaleY('right', v => '$' + formatTickValue(v)) }
    }
  });

  document.getElementById('toggleMA7').onchange  = e => toggleDataset('price', 1, e.target.checked);
  document.getElementById('toggleMA25').onchange = e => toggleDataset('price', 2, e.target.checked);
  document.getElementById('toggleMA99').onchange = e => toggleDataset('price', 3, e.target.checked);

  /* Zoom Reset Wiring */
  document.getElementById('resetZoomBtn').onclick = () => {
    if (charts['price']) {
      charts['price'].resetZoom();
      document.getElementById('resetZoomBtn').style.display = 'none';
    }
  };
}

function toggleDataset(chartKey, datasetIdx, visible) {
  const chart = charts[chartKey];
  if (!chart) return;
  const meta = chart.getDatasetMeta(datasetIdx);
  meta.hidden = !visible;
  chart.update();
}

/* ── 2. VOLUME BAR CHART ─────────────────────────────────── */
function renderVolumeChart(labels, closes, volumes) {
  destroyChart('volume');
  const ctx = document.getElementById('volumeChart').getContext('2d');
  const barColors = closes.map((c, i) => { const prev = i > 0 ? closes[i - 1] : c; return c >= prev ? 'rgba(0,245,196,0.55)' : 'rgba(255,77,109,0.55)'; });

  charts['volume'] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Volume', data: volumes, backgroundColor: barColors, borderColor: 'transparent', borderRadius: 2, barPercentage: 0.9 }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: sharedTooltip(ctx => `  Vol: ${formatLarge(ctx.parsed.y)}`) },
      scales: { x: { ...sharedScaleX(labels), ticks: { display: false } }, y: sharedScaleY('right', v => formatTickValue(v)) }
    }
  });
}

/* ── 3. RSI CHART ────────────────────────────────────────── */
function renderRSIChart(labels, closes) {
  destroyChart('rsi');
  const ctx = document.getElementById('rsiChart').getContext('2d');
  const rsi = calcRSI(closes, 14);

  const lastRSI = [...rsi].reverse().find(v => v != null);
  const rsiEl   = document.getElementById('rsiReading');
  if (lastRSI != null) {
    let signal = 'Neutral', cls = 'neu';
    if (lastRSI > 70) { signal = 'Overbought — Potential sell zone'; cls = 'bear'; }
    else if (lastRSI < 30) { signal = 'Oversold — Potential buy zone'; cls = 'bull'; }
    rsiEl.innerHTML = `<div class="ind-chip ${cls}"><span class="lbl">RSI(14)</span><span class="val">${lastRSI.toFixed(2)}</span></div><div class="ind-chip ${cls}"><span class="lbl">Signal</span><span class="val">${signal}</span></div>`;
  }

  charts['rsi'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'RSI', data: rsi, borderColor: '#5b8def', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3, order: 1, spanGaps: true },
        { label: 'OB', data: rsi.map(v => v != null ? 70 : null), borderColor: 'rgba(255,77,109,0.3)', borderWidth: 1, borderDash: [4,3], pointRadius: 0, fill: '+1', backgroundColor: 'rgba(255,77,109,0.06)', tension: 0, order: 2, spanGaps: true },
        { label: '_top', data: rsi.map(v => v != null ? 100 : null), borderColor: 'transparent', pointRadius: 0, fill: false, tension: 0, order: 3, spanGaps: true },
        { label: 'OS', data: rsi.map(v => v != null ? 30 : null), borderColor: 'rgba(0,245,196,0.3)', borderWidth: 1, borderDash: [4,3], pointRadius: 0, fill: '-1', backgroundColor: 'rgba(0,245,196,0.06)', tension: 0, order: 4, spanGaps: true },
        { label: '_bot', data: rsi.map(v => v != null ? 0 : null), borderColor: 'transparent', pointRadius: 0, fill: false, tension: 0, order: 5, spanGaps: true },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { ...sharedTooltip(ctx => ctx.dataset.label === 'RSI' ? `  RSI: ${ctx.parsed.y?.toFixed(2) ?? '—'}` : null), filter: item => item.dataset.label === 'RSI' } },
      scales: { x: { ...sharedScaleX(labels), ticks: { display: false } }, y: { ...sharedScaleY('right', v => v.toFixed(0)), min: 0, max: 100 } }
    }
  });
}

/* ── 4. MACD CHART ───────────────────────────────────────── */
function renderMACDChart(labels, closes) {
  destroyChart('macd');
  const ctx = document.getElementById('macdChart').getContext('2d');
  const { macdLine, signal, histogram } = calcMACD(closes);

  const lastMACD = [...macdLine].reverse().find(v => v != null);
  const lastSig  = [...signal].reverse().find(v => v != null);
  const lastHist = [...histogram].reverse().find(v => v != null);
  const macdEl   = document.getElementById('macdReading');
  if (lastMACD != null) {
    const bullish  = lastMACD > lastSig;
    const histCls  = lastHist > 0 ? 'bull' : 'bear';
    const crossCls = bullish ? 'bull' : 'bear';
    macdEl.innerHTML = `<div class="ind-chip neu"><span class="lbl">MACD</span><span class="val">${lastMACD.toFixed(4)}</span></div><div class="ind-chip neu"><span class="lbl">Signal</span><span class="val">${lastSig?.toFixed(4) ?? '—'}</span></div><div class="ind-chip ${histCls}"><span class="lbl">Histogram</span><span class="val">${lastHist?.toFixed(4) ?? '—'}</span></div><div class="ind-chip ${crossCls}"><span class="lbl">Trend</span><span class="val">${bullish ? '▲ Bullish' : '▼ Bearish'}</span></div>`;
  }

  const histColors = histogram.map(v => v == null ? 'transparent' : v >= 0 ? 'rgba(0,245,196,0.7)' : 'rgba(255,77,109,0.7)');

  charts['macd'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Histogram', data: histogram, backgroundColor: histColors, borderColor: 'transparent', borderRadius: 2, barPercentage: 0.9, order: 3 },
        { type: 'line', label: 'MACD', data: macdLine, borderColor: '#5b8def', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.35, order: 1, spanGaps: true },
        { type: 'line', label: 'Signal', data: signal, borderColor: '#f9c74f', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.35, borderDash: [4, 3], order: 2, spanGaps: true },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: sharedTooltip(ctx => { const v = ctx.parsed.y; if (v == null) return null; return `  ${ctx.dataset.label}: ${v.toFixed(6)}`; }) },
      scales: { x: { ...sharedScaleX(labels), ticks: { display: false } }, y: sharedScaleY('right', v => v.toFixed(4)) }
    }
  });
}

/* ── 5. PREDICTION CHART ─────────────────────────────────── */
function renderPredictionChart(labels, closes) {
  destroyChart('prediction');
  const ctx = document.getElementById('predictionChart').getContext('2d');
  const { slope, intercept } = calcLinearRegression(closes);
  const regressionLine = closes.map((_, i) => intercept + slope * i);

  const futurePoints = 10; 
  const futureLabels = [...labels];
  const futureLine = new Array(closes.length).fill(null); 
  futureLine[closes.length - 1] = regressionLine[closes.length - 1]; 

  for (let i = 0; i < futurePoints; i++) {
    futureLabels.push(`T+${i + 1}`);
    futureLine.push(intercept + slope * (closes.length + i));
  }

  const paddedCloses = [...closes, ...new Array(futurePoints).fill(null)];
  const paddedRegression = [...regressionLine, ...new Array(futurePoints).fill(null)];

  charts['prediction'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: futureLabels,
      datasets: [
        { label: 'Actual Price', data: paddedCloses, borderColor: '#e8eaf2', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.1 },
        { label: 'Historical Trend', data: paddedRegression, borderColor: '#5b8def', borderWidth: 1.5, pointRadius: 0, fill: false, borderDash: [5, 5] },
        { label: 'Future Prediction', data: futureLine, borderColor: '#00f5c4', borderWidth: 2.5, pointRadius: 0, fill: false, borderDash: [2, 2] }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true, labels: { color: '#6b7a99', font: { family: 'Space Mono', size: 11 } } }, tooltip: sharedTooltip(ctx => { const v = ctx.parsed.y; if (v == null) return null; return `  ${ctx.dataset.label}: ${formatPrice(v)}`; }) },
      scales: { x: sharedScaleX(futureLabels), y: sharedScaleY('right', v => formatTickValue(v)) }
    }
  });
}

/* ════════════════════════════════════════════════════════════
   SEARCH BUTTON / ENTER
════════════════════════════════════════════════════════════ */
async function handleSearch() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) { showError('Please enter a coin name or symbol.'); return; }

  let match = popularCoins.find(
    c => c.id === query || c.symbol.toLowerCase() === query || c.name.toLowerCase() === query
  );
  if (!match) {
    const found = allCoinsList.find(
      c => c.id === query || c.symbol.toLowerCase() === query || c.name.toLowerCase() === query
    );
    if (found) match = found;
  }

  if (match) selectCoin(match.id, match.name);
  else showError(`No coin found for "${searchInput.value}". Try "Bitcoin", "BTC", "ETH", etc.`);
}

function openDropdown() { renderDropdown(searchInput.value.trim() ? [] : popularCoins, false); dropdown.classList.add('open'); }
function closeDropdown() { dropdown.classList.remove('open'); focusedIndex = -1; }

function handleKeydown(e) {
  const items = dropdown.querySelectorAll('.dropdown-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); focusedIndex = Math.min(focusedIndex + 1, items.length - 1); updateFocus(items); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); focusedIndex = Math.max(focusedIndex - 1, 0); updateFocus(items); }
  else if (e.key === 'Enter') { if (focusedIndex >= 0 && items[focusedIndex]) items[focusedIndex].click(); else { closeDropdown(); handleSearch(); } }
  else if (e.key === 'Escape') closeDropdown();
}
function updateFocus(items) {
  items.forEach((el, i) => el.classList.toggle('focused', i === focusedIndex));
  if (focusedIndex >= 0) items[focusedIndex].scrollIntoView({ block: 'nearest' });
}

function bindEvents() {
  searchInput.addEventListener('focus', () => { openDropdown(); if (searchInput.value.trim()) handleSearchInput(); });
  searchInput.addEventListener('input', handleSearchInput);
  searchInput.addEventListener('keydown', handleKeydown);

  clearBtn.addEventListener('click', () => { searchInput.value = ''; clearBtn.classList.remove('visible'); searchInput.focus(); renderDropdown(popularCoins, false); showError(''); });
  searchBtn.addEventListener('click', () => { closeDropdown(); handleSearch(); });

  document.addEventListener('click', e => { if (!e.target.closest('#searchContainer') && !e.target.closest('.search-btn')) closeDropdown(); });
}

/* ════════════════════════════════════════════════════════════
   PORTFOLIO MODULE
════════════════════════════════════════════════════════════ */
function bindPortfolioEvents() {
  navMarket.addEventListener('click', () => switchTab('market'));
  navPortfolio.addEventListener('click', () => switchTab('portfolio'));
  document.getElementById('portAddBtn').addEventListener('click', addToPortfolio);
  document.getElementById('portAssetsList').addEventListener('click', e => {
    const btn = e.target.closest('.btn-remove');
    if (btn) { removeFromPortfolio(btn.dataset.id); }
  });
}

function switchTab(tab) {
  showError('');
  if (tab === 'market') {
    navMarket.classList.add('active');
    navPortfolio.classList.remove('active');
    viewMarket.style.display = 'block';
    viewPortfolio.style.display = 'none';
  } else {
    navPortfolio.classList.add('active');
    navMarket.classList.remove('active');
    viewPortfolio.style.display = 'block';
    viewMarket.style.display = 'none';
    renderPortfolio(); 
  }
}

async function addToPortfolio() {
  const query = document.getElementById('portCoinInput').value.trim().toLowerCase();
  const amount = parseFloat(document.getElementById('portAmount').value);
  const buyPrice = parseFloat(document.getElementById('portPrice').value);

  if (!query || isNaN(amount) || amount <= 0 || isNaN(buyPrice) || buyPrice < 0) {
    showError('Please fill all portfolio fields with valid numbers.');
    return;
  }

  let match = popularCoins.find(c => c.id === query || c.symbol.toLowerCase() === query || c.name.toLowerCase() === query);
  if (!match) {
    match = allCoinsList.find(c => c.id === query || c.symbol.toLowerCase() === query || c.name.toLowerCase() === query);
  }

  if (!match) {
    showError(`Could not find coin "${query}". Try standard symbols like BTC or ETH.`);
    return;
  }

  const coinId = match.id;
  const existingIndex = myPortfolio.findIndex(p => p.id === coinId);

  if (existingIndex >= 0) {
    const existing = myPortfolio[existingIndex];
    const totalCost = (existing.amount * existing.buyPrice) + (amount * buyPrice);
    existing.amount += amount;
    existing.buyPrice = totalCost / existing.amount;
  } else {
    myPortfolio.push({ id: coinId, amount, buyPrice });
  }

  localStorage.setItem('cryptoTrack_portfolio', JSON.stringify(myPortfolio));
  document.getElementById('portCoinInput').value = '';
  document.getElementById('portAmount').value = '';
  document.getElementById('portPrice').value = '';
  showError('');
  await renderPortfolio();
}

function removeFromPortfolio(coinId) {
  myPortfolio = myPortfolio.filter(p => p.id !== coinId);
  localStorage.setItem('cryptoTrack_portfolio', JSON.stringify(myPortfolio));
  renderPortfolio();
}

async function renderPortfolio() {
  const listContainer = document.getElementById('portAssetsList');
  const valContainer  = document.getElementById('portTotalValue');
  const pnlContainer  = document.getElementById('portTotalPnL');

  if (myPortfolio.length === 0) {
    listContainer.innerHTML = '<div class="empty-portfolio">Your portfolio is currently empty. Add an asset above to start tracking.</div>';
    valContainer.textContent = '$0.00';
    pnlContainer.textContent = '$0.00';
    pnlContainer.className = 'port-card-value neu';
    return;
  }

  showLoader(true);
  try {
    const ids = myPortfolio.map(p => p.id).join(',');
    const liveData = await apiFetch(`/coins/markets?vs_currency=usd&ids=${ids}`);
    
    let totalValue = 0;
    let totalCost  = 0;
    let html = '';

    myPortfolio.forEach(item => {
      const live = liveData.find(d => d.id === item.id);
      const currentPrice = live ? live.current_price : 0;
      const img = live ? live.image : '';
      const name = live ? live.name : item.id;
      const symbol = live ? live.symbol.toUpperCase() : '';

      const itemValue = currentPrice * item.amount;
      const itemCost  = item.buyPrice * item.amount;
      const pnl = itemValue - itemCost;
      const pnlPercent = itemCost > 0 ? (pnl / itemCost) * 100 : 0;

      totalValue += itemValue;
      totalCost  += itemCost;

      const pnlClass = pnl >= 0 ? 'up' : 'down';
      const pnlSign  = pnl >= 0 ? '+' : '';

      html += `
      <div class="port-table-row">
        <div class="p-coin">
          ${img ? `<img src="${img}">` : ''}
          <div>
            <strong>${name}</strong><br>
            <span style="font-size:0.7rem; color:var(--muted)">${symbol}</span>
          </div>
        </div>
        <div>${item.amount.toLocaleString(undefined, {maximumFractionDigits: 6})}</div>
        <div>${formatPrice(item.buyPrice)}</div>
        <div>${formatPrice(currentPrice)}</div>
        <div style="font-weight:bold">${formatPrice(itemValue)}</div>
        <div class="pl-val ${pnlClass}">${pnlSign}${formatPrice(pnl)}<br><span style="font-size:0.75rem">(${pnlPercent.toFixed(2)}%)</span></div>
        <div><button class="btn-remove" data-id="${item.id}" title="Remove Asset">✕</button></div>
      </div>`;
    });

    listContainer.innerHTML = html;
    
    const totalPnL = totalValue - totalCost;
    valContainer.textContent = formatLarge(totalValue);
    
    pnlContainer.textContent = `${totalPnL >= 0 ? '+' : ''}${formatLarge(totalPnL)}`;
    pnlContainer.className = `port-card-value ${totalPnL >= 0 ? 'high' : 'low'}`;

  } catch (e) {
    console.error(e);
    showError('Could not fetch live prices for your portfolio.');
  } finally {
    showLoader(false);
  }
}

/* ════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════ */
function showLoader(on) { loader.classList.toggle('show', on); }
function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.toggle('show', !!msg); }

function formatLabel(ts, days) {
  const d = new Date(ts);
  return days <= 1
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatPrice(n) {
  if (n == null || isNaN(n)) return '—';
  if (n === 0) return '$0.00';
  const absN = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  
  if (absN >= 1)      return sign + '$' + absN.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (absN >= 0.01)   return sign + '$' + absN.toFixed(4);
  if (absN >= 0.0001) return sign + '$' + absN.toFixed(6);
  return sign + '$' + absN.toFixed(8);
}

function formatLarge(n) {
  if (n == null || isNaN(n)) return '—';
  const absN = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  
  if (absN >= 1e12) return sign + '$' + (absN / 1e12).toFixed(2) + 'T';
  if (absN >= 1e9)  return sign + '$' + (absN / 1e9).toFixed(2) + 'B';
  if (absN >= 1e6)  return sign + '$' + (absN / 1e6).toFixed(2) + 'M';
  if (absN >= 1e3)  return sign + '$' + (absN / 1e3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'K';
  return sign + '$' + absN.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTickValue(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  if (v >= 1)   return v.toFixed(2);
  return v.toFixed(4);
}

function stripHTML(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

/* ── Boot ────────────────────────────────────────────────── */
init();