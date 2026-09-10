import iconBroadcastTv from '../../assets/icons/broadcast-tv.svg' with { type: 'text' }
import iconCheck from '../../assets/icons/check.svg' with { type: 'text' }
import iconChevronLeft from '../../assets/icons/chevron-left.svg' with { type: 'text' }
import iconChevronRight from '../../assets/icons/chevron-right.svg' with { type: 'text' }
import iconExpandVertical from '../../assets/icons/expand-vertical.svg' with { type: 'text' }
import iconFolderPlus from '../../assets/icons/folder-plus.svg' with { type: 'text' }
import iconInbox from '../../assets/icons/inbox.svg' with { type: 'text' }
import iconLive from '../../assets/icons/live.svg' with { type: 'text' }
import iconMaximize from '../../assets/icons/maximize.svg' with { type: 'text' }
import iconMinimize from '../../assets/icons/minimize.svg' with { type: 'text' }
import iconPause from '../../assets/icons/pause.svg' with { type: 'text' }
import iconPlay from '../../assets/icons/play.svg' with { type: 'text' }
import iconPlus from '../../assets/icons/plus.svg' with { type: 'text' }
import iconRadio from '../../assets/icons/radio.svg' with { type: 'text' }
import iconRefresh from '../../assets/icons/refresh.svg' with { type: 'text' }
import iconSearch from '../../assets/icons/search.svg' with { type: 'text' }
import iconSettings from '../../assets/icons/settings.svg' with { type: 'text' }
import iconShrinkVertical from '../../assets/icons/shrink-vertical.svg' with { type: 'text' }
import iconSparkle from '../../assets/icons/sparkle.svg' with { type: 'text' }
import iconStar from '../../assets/icons/star.svg' with { type: 'text' }
import iconTrash from '../../assets/icons/trash.svg' with { type: 'text' }
import iconVolume from '../../assets/icons/volume.svg' with { type: 'text' }
import iconVolumeX from '../../assets/icons/volume-x.svg' with { type: 'text' }
export const ICONS = {
  broadcastTv: iconBroadcastTv,
  check: iconCheck,
  chevronLeft: iconChevronLeft,
  chevronRight: iconChevronRight,
  expandVertical: iconExpandVertical,
  folderPlus: iconFolderPlus,
  inbox: iconInbox,
  live: iconLive,
  maximize: iconMaximize,
  minimize: iconMinimize,
  pause: iconPause,
  play: iconPlay,
  plus: iconPlus,
  radio: iconRadio,
  refresh: iconRefresh,
  search: iconSearch,
  settings: iconSettings,
  shrinkVertical: iconShrinkVertical,
  sparkle: iconSparkle,
  star: iconStar,
  trash: iconTrash,
  volume: iconVolume,
  volumeX: iconVolumeX,
} as const

export type IconName = keyof typeof ICONS
