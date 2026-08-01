// This one source directory is deployed under all ten P0 function names.
// The trusted function name comes from CloudBase runtime context, never from the request body.
import cloudbase from '@cloudbase/node-sdk'

import {
  GameCloudFunctionService,
  type GameCloudIdentity,
} from '../../../src/services/cloudbase/server/game-cloud-function.service'
import { CloudBaseGameServerStore } from './cloudbase-game.store'

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const auth = app.auth()
const service = new GameCloudFunctionService(new CloudBaseGameServerStore(app.database()))

function resolveIdentity(): GameCloudIdentity | null {
  const info = auth.getUserInfo()
  const userId = String(info.uid || info.customUserId || info.openId || '').trim()
  if (!userId) return null
  return {
    userId,
    anonymous: false,
    displayName: null,
  }
}

export async function main(event: unknown, context: unknown) {
  const runtime = cloudbase.parseContext(context as any)
  const functionName = String(runtime.function_name || '')
  return service.invoke(functionName, event, resolveIdentity())
}
