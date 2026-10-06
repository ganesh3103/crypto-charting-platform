import { useMarketStore } from '../../stores/marketStore';
import { useReplayStore } from '../../stores/replayStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatDateTime } from '../../utils/time/timezone';
import type { ReplaySpeed } from '../../types/replay';

const SPEEDS: ReplaySpeed[] = [1, 2, 5, 10];

/**
 * Replay's play/pause/step/speed controls. Seeking itself happens by
 * dragging the on-chart ReplayCursor line, not here — this bar just shows
 * where that cursor currently sits and drives playback from it.
 */
export function ReplayControls() {
  const candles = useMarketStore((s) => s.candles);
  const timezone = useSettingsStore((s) => s.timezone);
  const enabled = useReplayStore((s) => s.enabled);
  const selecting = useReplayStore((s) => s.selecting);
  const playing = useReplayStore((s) => s.playing);
  const currentTimestamp = useReplayStore((s) => s.currentTimestamp);
  const speed = useReplayStore((s) => s.speed);
  const enableReplay = useReplayStore((s) => s.enable);
  const disableReplay = useReplayStore((s) => s.disable);
  const play = useReplayStore((s) => s.play);
  const pause = useReplayStore((s) => s.pause);
  const stepForward = useReplayStore((s) => s.stepForward);
  const stepBackward = useReplayStore((s) => s.stepBackward);
  const setSpeed = useReplayStore((s) => s.setSpeed);

  if (!enabled) {
    return (
      <div className="replay-bar replay-bar-collapsed">
        <button
          className="replay-toggle"
          disabled={candles.length === 0}
          onClick={() => enableReplay(candles)}
        >
          ▶ Replay
        </button>
      </div>
    );
  }

  if (selecting) {
    return (
      <div className="replay-bar replay-bar-collapsed">
        <span className="replay-hint-text">Click a point on the chart to start replay</span>
        <button className="replay-toggle" onClick={disableReplay} title="Cancel replay">
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="replay-bar replay-bar-collapsed">
      <button className="replay-toggle" onClick={disableReplay} title="Exit replay">
        ✕
      </button>
      <button className="replay-icon-btn" onClick={stepBackward} title="Step back">
        ⏮
      </button>
      <button className="replay-icon-btn" onClick={playing ? pause : play} title={playing ? 'Pause' : 'Play'}>
        {playing ? '⏸' : '▶'}
      </button>
      <button className="replay-icon-btn" onClick={stepForward} title="Step forward">
        ⏭
      </button>
      <span className="replay-timestamp">{formatDateTime(currentTimestamp, timezone)}</span>
      <div className="replay-speeds">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`replay-speed-pill ${s === speed ? 'active' : ''}`}
            onClick={() => setSpeed(s)}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
