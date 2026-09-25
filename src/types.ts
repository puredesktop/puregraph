import type {
  GraphCurveStyle,
  GraphLayoutName,
  GraphNodeShape,
} from './constants'

export interface ShellPreferences {
  workingDirectory?: string
  theme?: string
}

export interface PureGraphSettings {
  backgroundColor?: string
  curveStyle?: GraphCurveStyle
  directed?: boolean
  edgeColor?: string
  edgeWidth?: number
  labelSize?: number
  layout?: GraphLayoutName
  nodeColor?: string
  nodeShape?: GraphNodeShape
  packagePath?: string
  nodeSize?: number
  showLabels?: boolean
}

export interface PureGraphBootState {
  prefs: ShellPreferences
  appSettings: PureGraphSettings
}

export interface PlatformAppSettingsUpdateRequest {
  appSlug: string
  patch: Partial<PureGraphSettings>
}
