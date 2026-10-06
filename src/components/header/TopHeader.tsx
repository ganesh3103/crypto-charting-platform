import { SymbolSelector } from './SymbolSelector';
import { TimeframeSelector } from './TimeframeSelector';
import { useMarketStore } from '../../stores/marketStore';
import { usePineStore } from '../../stores/pineStore';
import { ConnectionStatusBadge } from '../common/ConnectionStatusBadge';

function formatPrice(n: number): string {
  const decimals = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

interface TopHeaderProps {
  pineEditorOpen: boolean;
  onTogglePineEditor: () => void;
}

export function TopHeader({ pineEditorOpen, onTogglePineEditor }: TopHeaderProps) {
  const symbol = useMarketStore((s) => s.symbol);
  const ticker = useMarketStore((s) => s.ticker);
  const candles = useMarketStore((s) => s.candles);
  const indicatorVisible = usePineStore((s) => s.indicatorVisible);
  const toggleIndicatorVisible = usePineStore((s) => s.toggleIndicatorVisible);

  const lastClose = candles.length > 0 ? candles[candles.length - 1].close : ticker?.lastPrice;
  const isUp = (ticker?.changePercent ?? 0) >= 0;

  return (
    <header className="top-header">
      <div className="brand">
        <span className="brand-mark">◆</span>
        <span className="brand-name">CryptoTerminal</span>
      </div>

      <SymbolSelector />

      <div className="price-block">
        <span className={`price ${isUp ? 'text-up' : 'text-down'}`}>
          {lastClose !== undefined ? formatPrice(lastClose) : '—'}
        </span>
        {ticker && (
          <span className={`change ${isUp ? 'text-up' : 'text-down'}`}>
            {isUp ? '+' : ''}
            {ticker.changePercent.toFixed(2)}%
          </span>
        )}
      </div>

      {ticker && (
        <div className="stats-block">
          <div className="stat">
            <span className="stat-label">24h High</span>
            <span className="stat-value">{formatPrice(ticker.high)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">24h Low</span>
            <span className="stat-value">{formatPrice(ticker.low)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">24h Vol ({symbol.base})</span>
            <span className="stat-value">{ticker.volume.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
      )}

      <div className="header-spacer" />

      <TimeframeSelector />
      <button
        className={`indicator-toggle ${indicatorVisible ? 'active' : ''}`}
        title={indicatorVisible ? 'Hide indicator' : 'Show indicator'}
        onClick={toggleIndicatorVisible}
      >
        Indicator
      </button>
      <button
        className={`pine-editor-toggle ${pineEditorOpen ? 'active' : ''}`}
        onClick={onTogglePineEditor}
      >
        Pine Editor
      </button>
      <ConnectionStatusBadge />
    </header>
  );
}
