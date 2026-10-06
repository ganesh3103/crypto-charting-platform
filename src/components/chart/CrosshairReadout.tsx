import { useSettingsStore } from '../../stores/settingsStore';
import { useCrosshairStore } from '../../stores/crosshairStore';
import { formatDateTime } from '../../utils/time/timezone';

function fmt(n: number): string {
  const decimals = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function CrosshairReadout() {
  const info = useCrosshairStore((s) => s.info);
  const timezone = useSettingsStore((s) => s.timezone);
  if (!info) return null;

  const isUp = info.close >= info.open;

  return (
    <div className="crosshair-readout">
      <span className="readout-time">{formatDateTime(info.time, timezone)}</span>
      <span className="readout-field">
        O <b className={isUp ? 'text-up' : 'text-down'}>{fmt(info.open)}</b>
      </span>
      <span className="readout-field">
        H <b className={isUp ? 'text-up' : 'text-down'}>{fmt(info.high)}</b>
      </span>
      <span className="readout-field">
        L <b className={isUp ? 'text-up' : 'text-down'}>{fmt(info.low)}</b>
      </span>
      <span className="readout-field">
        C <b className={isUp ? 'text-up' : 'text-down'}>{fmt(info.close)}</b>
      </span>
      <span className="readout-field">
        Vol <b>{info.volume.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
      </span>
    </div>
  );
}
