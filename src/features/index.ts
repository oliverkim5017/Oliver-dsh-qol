import { sessionDeleteFeature } from './session-delete/index.js'
import type { HostFeature } from './types.js'

/** Every host feature this plugin mounts, in registration order. */
export const HOST_FEATURES: readonly HostFeature[] = [sessionDeleteFeature]
