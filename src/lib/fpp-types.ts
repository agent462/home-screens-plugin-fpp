/** The parts of FPP's API this plugin reads. Every field is optional because
 *  FPP versions differ in what they send, and a remote in "remote" mode sends
 *  a different subset than the player. */

export interface FppSensor {
  label?: string;
  value?: number;
  valueType?: string;
  formatted?: string;
}

export interface FppSchedulerInfo {
  enabled?: number;
  /** "idle", "playing" (started by the schedule) or "manual". */
  status?: string;
  nextPlaylist?: {
    playlistName?: string;
    /** Epoch seconds; 0 when nothing is scheduled. */
    scheduledStartTime?: number;
  };
  currentPlaylist?: {
    playlistName?: string;
    scheduledEndTime?: number;
    actualEndTime?: number;
  };
}

/** `GET /api/fppd/status`, answered by fppd itself (no PHP). */
export interface FppStatus {
  status_name?: string;
  mode_name?: string;
  current_playlist?: {
    playlist?: string;
    index?: string | number;
    count?: string | number;
  };
  current_sequence?: string;
  current_song?: string;
  sequence_filename?: string;
  seconds_played?: string | number;
  seconds_remaining?: string | number;
  scheduler?: FppSchedulerInfo;
  sensors?: FppSensor[];
  /** Strings on 10.x; newer builds may send objects with a `message`. */
  warnings?: unknown[];
  uptimeTotalSeconds?: number;
  version?: string;
  volume?: number;
  host_name?: string;
  uuid?: string;
}

/** One row of `GET /api/fppd/multiSyncSystems`. */
export interface FppSystem {
  address?: string;
  hostname?: string;
  HostDescription?: string;
  uuid?: string;
  type?: string;
  typeId?: number;
  fppModeString?: string;
  version?: string;
  channelRanges?: string;
  /** 1 for the box that answered (the player we asked). */
  local?: number;
  lastSeen?: number;
  capeInfo?: { name?: string };
}

export interface FppPlaylistEntry {
  type?: string;
  enabled?: number;
  sequenceName?: string;
  mediaName?: string;
  duration?: number;
}

/** `GET /api/playlist/<name>`. */
export interface FppPlaylist {
  name?: string;
  leadIn?: FppPlaylistEntry[];
  mainPlaylist?: FppPlaylistEntry[];
  leadOut?: FppPlaylistEntry[];
}

/** One rule from `GET /api/fppd/schedule` (`schedule.entries`). */
export interface FppScheduleEntry {
  enabled?: number;
  type?: string;
  playlist?: string;
  day?: number;
  dayStr?: string;
  startTime?: string;
  endTime?: string;
  startDate?: string;
  endDate?: string;
}

/** One computed window from `GET /api/fppd/schedule` (`schedule.items`). */
export interface FppScheduleItem {
  command?: string;
  args?: string[];
  /** Epoch seconds. */
  startTime?: number;
  endTime?: number;
}

export interface FppSchedule {
  entries?: FppScheduleEntry[];
  items?: FppScheduleItem[];
}
