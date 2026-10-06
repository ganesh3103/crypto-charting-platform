import type { Candle, ConnectionStatus, Ticker24h, Timeframe } from '../../types/market';
import type { MarketDataProvider } from './MarketDataProvider';

const REST_BASE = 'https://api.binance.com/api/v3';
const WS_BASE = 'wss://stream.binance.com:9443/ws';

/** Binance uses these exact interval strings, which map 1:1 onto our Timeframe type. */
const TIMEFRAME_TO_BINANCE: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '6h': '6h',
  '12h': '12h',
  '1d': '1d',
  '1w': '1w',
  '1M': '1M',
};

type BinanceKline = [
  number, // open time (ms)
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close time (ms)
  string, // quote asset volume
  number, // number of trades
  string, // taker buy base volume
  string, // taker buy quote volume
  string // ignore
];

function klineToCandle(k: BinanceKline): Candle {
  return {
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  };
}

interface KlineStreamPayload {
  e: string; // event type
  k: {
    t: number; // kline start time (ms)
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    x: boolean; // is this kline closed?
  };
}

interface Ticker24hPayload {
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
}

/** One realtime subscription: a symbol/timeframe pair with its own socket. */
class KlineSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private closedByUser = false;
  private lastMessageAt = Date.now();
  private readonly streamName: string;
  private readonly onKline: (payload: KlineStreamPayload) => void;
  private readonly onStatus: (status: ConnectionStatus) => void;

  constructor(
    streamName: string,
    onKline: (payload: KlineStreamPayload) => void,
    onStatus: (status: ConnectionStatus) => void
  ) {
    this.streamName = streamName;
    this.onKline = onKline;
    this.onStatus = onStatus;
    this.connect();
  }

  private connect() {
    if (this.closedByUser) return;
    this.onStatus(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');

    const socket = new WebSocket(`${WS_BASE}/${this.streamName}`);
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.lastMessageAt = Date.now();
      this.onStatus('connected');
      this.startHeartbeat();
    };

    socket.onmessage = (event) => {
      this.lastMessageAt = Date.now();
      try {
        const payload = JSON.parse(event.data) as KlineStreamPayload;
        if (payload.e === 'kline') this.onKline(payload);
      } catch {
        // ignore malformed frames
      }
    };

    socket.onerror = () => {
      // onclose will follow and trigger reconnect logic
    };

    socket.onclose = () => {
      this.stopHeartbeat();
      if (!this.closedByUser) {
        this.onStatus('disconnected');
        this.scheduleReconnect();
      }
    };
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // Binance sends pings automatically at the protocol level; this is a
    // client-side watchdog in case the connection silently dies.
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastMessageAt > 45_000) {
        this.ws?.close();
      }
    }, 15_000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private scheduleReconnect() {
    if (this.closedByUser) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }
}

export class BinanceProvider implements MarketDataProvider {
  private statusListeners = new Set<(status: ConnectionStatus) => void>();

  async getHistoricalCandles(
    symbol: string,
    timeframe: Timeframe,
    startTime: number,
    endTime: number,
    limit = 1000
  ): Promise<Candle[]> {
    const interval = TIMEFRAME_TO_BINANCE[timeframe];
    const url = new URL(`${REST_BASE}/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('startTime', String(Math.floor(startTime * 1000)));
    url.searchParams.set('endTime', String(Math.floor(endTime * 1000)));
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Failed to load historical candles: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as BinanceKline[];
    return data.map(klineToCandle);
  }

  async getRecentCandles(symbol: string, timeframe: Timeframe, limit = 500): Promise<Candle[]> {
    const interval = TIMEFRAME_TO_BINANCE[timeframe];
    const url = new URL(`${REST_BASE}/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Failed to load candles: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as BinanceKline[];
    return data.map(klineToCandle);
  }

  async getTicker24h(symbol: string): Promise<Ticker24h> {
    const url = new URL(`${REST_BASE}/ticker/24hr`);
    url.searchParams.set('symbol', symbol);
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Failed to load ticker: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as Ticker24hPayload;
    return {
      lastPrice: parseFloat(data.lastPrice),
      changePercent: parseFloat(data.priceChangePercent),
      high: parseFloat(data.highPrice),
      low: parseFloat(data.lowPrice),
      volume: parseFloat(data.volume),
    };
  }

  subscribeToRealtime(
    symbol: string,
    timeframe: Timeframe,
    callback: (candle: Candle, isFinal: boolean) => void
  ): () => void {
    const interval = TIMEFRAME_TO_BINANCE[timeframe];
    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;

    const socket = new KlineSocket(
      streamName,
      (payload) => {
        const k = payload.k;
        const candle: Candle = {
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };
        callback(candle, k.x);
      },
      (status) => this.statusListeners.forEach((l) => l(status))
    );

    return () => socket.close();
  }

  onConnectionStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }
}

export const binanceProvider = new BinanceProvider();
