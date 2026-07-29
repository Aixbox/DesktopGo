pub(super) fn resolve_list_layout(
    width: i32,
    system_scrollbar_width: i32,
    minimum_width: i32,
) -> (i32, i32) {
    let scrollbar_width = system_scrollbar_width.max(minimum_width).min(width.max(1));
    ((width - scrollbar_width).max(1), scrollbar_width)
}

#[cfg(test)]
mod tests {
    use super::resolve_list_layout;

    #[test]
    fn uses_system_scrollbar_width_when_it_is_wider() {
        assert_eq!(resolve_list_layout(600, 17, 12), (583, 17));
    }

    #[test]
    fn respects_the_custom_scrollbar_minimum_width() {
        assert_eq!(resolve_list_layout(600, 17, 20), (580, 20));
    }

    #[test]
    fn stays_valid_for_a_narrow_host() {
        assert_eq!(resolve_list_layout(8, 17, 20), (1, 8));
    }
}
