import { PHASE_1_TIMEFRAMES, type Timeframe } from '../../types/market';
import { useMarketStore } from '../../stores/marketStore';

const LABELS: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1H',
  '2h': '2H',
  '4h': '4H',
  '6h': '6H',
  '12h': '12H',
  '1d': '1D',
  '1w': '1W',
  '1M': '1M',
};

export function TimeframeSelector() {
  const timeframe = useMarketStore((s) => s.timeframe);
  const setTimeframe = useMarketStore((s) => s.setTimeframe);

  return (
    <div className="timeframe-selector">
      {PHASE_1_TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          className={`tf-pill ${tf === timeframe ? 'active' : ''}`}
          onClick={() => setTimeframe(tf)}
        >
          {LABELS[tf]}
        </button>
      ))}
    </div>
  );
}
