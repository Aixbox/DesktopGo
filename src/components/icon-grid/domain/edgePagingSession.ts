import { EDGE_PAGING, IDLE_EDGE_STATE, sameEdgeTarget } from './edgePagingPolicy'
import type { EdgePagingState, EdgeTarget } from './edgePagingPolicy'

interface EdgePagingRuntime {
  later: (callback: () => void, delay: number) => number
  cancel: (timer: number) => void
  resolve: (state: EdgePagingState) => EdgeTarget | null
  publish: (state: EdgePagingState) => void
  prepare: () => void
  flip: (target: EdgeTarget) => void
  recheck: () => void
}

/** One drag's alarms. Page completion, rather than pointer movement, rearms it. */
export function createEdgePagingSession(runtime: EdgePagingRuntime) {
  let state = IDLE_EDGE_STATE
  let generation = 0
  let tip: number | null = null
  let main: number | null = null
  let transitionPage: number | null = null
  const emit = (next: EdgePagingState) => {
    state = next
    runtime.publish(next)
  }
  const cancelAlarms = () => {
    generation += 1
    if (tip !== null) runtime.cancel(tip)
    if (main !== null) runtime.cancel(main)
    tip = main = null
  }
  const clear = () => {
    cancelAlarms()
    emit(IDLE_EDGE_STATE)
  }
  const update = () => {
    if (transitionPage !== null || state.phase === 'paging') return true
    const target = runtime.resolve(state)
    if (!target) {
      clear()
      return false
    }
    if (sameEdgeTarget(state.target, target)) return true
    const retarget = state.phase === 'peeking' && state.target?.session === target.session
    cancelAlarms()
    const token = generation
    runtime.prepare()
    emit({ phase: retarget ? 'peeking' : 'pending', target })
    if (!retarget)
      tip = runtime.later(() => {
        if (token !== generation) return
        tip = null
        if (!sameEdgeTarget(target, runtime.resolve(state))) {
          clear()
          return
        }
        emit({ phase: 'peeking', target })
      }, EDGE_PAGING.tipDelay)
    main = runtime.later(
      () => {
        if (token !== generation) return
        main = null
        if (!sameEdgeTarget(target, runtime.resolve(state))) {
          clear()
          return
        }
        emit({ phase: 'paging', target })
        runtime.flip(target)
      },
      retarget ? EDGE_PAGING.retargetDwell : EDGE_PAGING.dwell
    )
    return true
  }
  return {
    update,
    clear,
    state: () => state,
    startTransition(page: number) {
      cancelAlarms()
      transitionPage = page
      emit({ phase: 'paging', target: state.target })
      runtime.prepare()
    },
    finishTransition(page: number) {
      if (transitionPage !== page) return
      transitionPage = null
      clear()
      runtime.recheck()
    },
    dispose() {
      cancelAlarms()
      transitionPage = null
      state = IDLE_EDGE_STATE
    },
  }
}
