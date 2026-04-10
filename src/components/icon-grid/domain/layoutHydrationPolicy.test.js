import {
  resolveLayoutHydrationSource,
  shouldResetPersistedLayoutCache,
} from './layoutHydrationPolicy.ts'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(
  resolveLayoutHydrationSource({
    hydrated: false,
    hydratedResetToken: 0,
    currentResetToken: 0,
  }) === 'persisted',
  '首次进入启动台时，应从持久化布局读取初始排布'
)

assert(
  resolveLayoutHydrationSource({
    hydrated: true,
    hydratedResetToken: 2,
    currentResetToken: 2,
  }) === 'memory',
  '未收到外部重置信号时，应继续复用内存中的当前布局'
)

assert(
  resolveLayoutHydrationSource({
    hydrated: true,
    hydratedResetToken: 2,
    currentResetToken: 3,
  }) === 'persisted',
  '收到外部重置信号后，不应继续复用旧的内存布局'
)

assert(
  shouldResetPersistedLayoutCache({
    cachedResetToken: null,
    currentResetToken: 0,
  }) === true,
  '首次读取布局前，应初始化持久化布局缓存版本'
)

assert(
  shouldResetPersistedLayoutCache({
    cachedResetToken: 3,
    currentResetToken: 3,
  }) === false,
  '同一次布局版本内，不应重复清空持久化布局缓存'
)

assert(
  shouldResetPersistedLayoutCache({
    cachedResetToken: 3,
    currentResetToken: 4,
  }) === true,
  '布局被重置后，应丢弃旧的持久化布局缓存'
)

console.log('layoutHydrationPolicy 测试通过')
