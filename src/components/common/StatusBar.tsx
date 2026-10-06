import { useMarketStore } from '../../stores/marketStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { CrosshairReadout } from '../chart/CrosshairReadout';
import { SUPPORTED_TIMEZONES } from '../../utils/time/timezone';

export function StatusBar() {
  const symbol = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);
  const status = useMarketStore((s) => s.connectionStatus);
  const error = useMarketStore((s) => s.error);
  const isLoadingHistory = useMarketStore((s) => s.isLoadingHistory);
  const timezone = useSettingsStore((s) => s.timezone);
  const tzLabel = SUPPORTED_TIMEZONES.find((t) => t.id === timezone)?.label ?? timezone;

  return (
    <footer className="status-bar">
      <span>{symbol.display}</span>
      <span className="divider">·</span>
      <span>{timeframe.toUpperCase()}</span>
      <span className="divider">·</span>
      <span>{tzLabel}</span>
      <span className="divider">·</span>
      <span className={`status-dot status-${status}`} />
      <span>{status}</span>
      {isLoadingHistory && (
        <>
          <span className="divider">·</span>
          <span>Loading history…</span>
        </>
      )}
      {error && (
        <>
          <span className="divider">·</span>
          <span className="status-error">{error}</span>
        </>
      )}
      <CrosshairReadout />
    </footer>
  );
}
