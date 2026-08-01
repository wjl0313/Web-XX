export interface CloudFunctionCallOptions {
  name: string
  data?: Record<string, unknown>
}

export interface CloudBaseCallable {
  callFunction(options: CloudFunctionCallOptions): Promise<{ result?: unknown }>
}

export interface CloudFunctionClient {
  invoke<T>(name: string, data?: Record<string, unknown>): Promise<T>
}

export class CloudFunctionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly functionName: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'CloudFunctionError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class CloudBaseFunctionClient implements CloudFunctionClient {
  constructor(private readonly callable: CloudBaseCallable) {}

  async invoke<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
    let response: { result?: unknown }
    try {
      response = await this.callable.callFunction({ name, data })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '云函数调用失败'
      throw new CloudFunctionError(message, 'transport-error', name, true)
    }

    const result = response.result
    if (!isRecord(result)) {
      throw new CloudFunctionError('云函数返回了无效数据', 'invalid-response', name)
    }
    if (result.ok === false) {
      const error = isRecord(result.error) ? result.error : {}
      throw new CloudFunctionError(
        typeof error.message === 'string' ? error.message : '云函数拒绝了请求',
        typeof error.code === 'string' ? error.code : 'request-rejected',
        name,
        Boolean(error.retryable),
      )
    }
    if (result.ok === true && 'data' in result) return result.data as T
    return result as T
  }
}
