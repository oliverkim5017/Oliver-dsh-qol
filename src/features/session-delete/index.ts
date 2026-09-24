import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-workspace'
import type { HostFeature } from '../types.js'
import { resolveSessionDeleteConfig } from './config.js'
import { findSessionDirs } from './jsonl-layout.js'
import { registerSessionDeleteRoute } from './route.js'
import { removeSessionDirs } from './removal.js'
import { SessionDeleteService, type SessionDeleteDeps } from './service.js'

/** Session deletion: permanent removal of stored sessions and their derived state. */
export const sessionDeleteFeature: HostFeature = {
  name: 'sessionDelete',
  register(ctx: Context, root): void {
    const config = resolveSessionDeleteConfig(root.sessionDelete)
    ctx.inject(['sessionPersistence'], (featureCtx) => {
      const deps: SessionDeleteDeps = {
        sessionPersistence: featureCtx.sessionPersistence,
        // Optional services are read per call: their fibers activate
        // asynchronously, so a read at feature activation can miss them.
        workspaceRegistry: () => featureCtx.get('workspaceRegistry'),
        storageDomain: () => featureCtx.get('storageDomain'),
        activityOf: async (sessionId) => {
          const activity = await featureCtx.waterfall(
            'workspace/session-activity',
            { sessionId },
            () => Promise.resolve([]),
          )
          return activity.length
        },
        logger: {
          warn: message => { featureCtx.logger.warn(message) },
        },
        sleep: milliseconds => new Promise(resolve => { setTimeout(resolve, milliseconds) }),
        now: () => Date.now(),
        findSessionDirs,
        removeSessionDirs,
      }
      const service = new SessionDeleteService(deps, config)
      featureCtx.provide('sessionDelete', service)
      // The Web route waits for the connection service instead of sampling it:
      // a headless composition never provides one and simply stays without a route.
      featureCtx.inject(['connection'], (routeCtx) => {
        registerSessionDeleteRoute(routeCtx, service)
      })
    })
  },
}
