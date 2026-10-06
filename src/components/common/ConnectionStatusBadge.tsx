import { useMarketStore } from '../../stores/marketStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { SUPPORTED_TIMEZONES } from '../../utils/time/timezone';

const LABELS: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected',
};

export function ConnectionStatusBadge() {
  const status = useMarketStore((s) => s.connectionStatus);
  const timezone = useSettingsStore((s) => s.timezone);
  const tzLabel = SUPPORTED_TIMEZONES.find((t) => t.id === timezone)?.label ?? timezone;

  return (
    <div className="connection-badge" title={tzLabel}>
      <span className={`status-dot status-${status}`} />
      <span className="status-label">{LABELS[status] ?? status}</span>
    </div>
  );
}
