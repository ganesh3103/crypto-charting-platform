import { SUPPORTED_SYMBOLS } from '../../types/market';
import { useMarketStore } from '../../stores/marketStore';

export function SymbolSelector() {
  const symbol = useMarketStore((s) => s.symbol);
  const setSymbol = useMarketStore((s) => s.setSymbol);

  return (
    <div className="symbol-selector">
      {SUPPORTED_SYMBOLS.map((s) => (
        <button
          key={s.id}
          className={`symbol-pill ${s.id === symbol.id ? 'active' : ''}`}
          onClick={() => setSymbol(s)}
          title={s.name}
        >
          {s.display}
        </button>
      ))}
    </div>
  );
}
