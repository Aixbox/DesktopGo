/** Wait until WebView layout has observed a completed native resize (also safe while hidden). */
export const waitForWindowGeometrySync = () =>
  new Promise<void>(resolve => {
    let firstFrame = 0
    let secondFrame = 0
    const finish = () => {
      window.clearTimeout(timeout)
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
      resolve()
    }
    const timeout = window.setTimeout(finish, 100)
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(finish)
    })
  })
