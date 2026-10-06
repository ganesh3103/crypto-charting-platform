export type ReplaySpeed = 1 | 2 | 5 | 10;

export interface ReplayState {
  enabled: boolean;
  /** True from the moment replay is entered until the user places the starting anchor. */
  selecting: boolean;
  playing: boolean;
  startTimestamp: number;
  currentTimestamp: number;
  endTimestamp: number;
  speed: ReplaySpeed;
}
