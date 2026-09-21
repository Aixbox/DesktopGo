//! 轮询等待的小工具。

use std::time::{Duration, Instant};

/// 轮询直到 `settled` 为真或超时，返回是否等到。
pub(crate) fn wait_until(
    mut settled: impl FnMut() -> bool,
    timeout: Duration,
    poll_interval: Duration,
) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        if settled() {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(poll_interval);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wait_until_returns_as_soon_as_the_condition_holds_and_gives_up_on_timeout() {
        let mut polls = 0;
        assert!(wait_until(
            || {
                polls += 1;
                polls >= 3
            },
            Duration::from_secs(5),
            Duration::from_millis(1),
        ));
        assert_eq!(polls, 3);

        assert!(!wait_until(
            || false,
            Duration::from_millis(20),
            Duration::from_millis(1),
        ));
    }
}
