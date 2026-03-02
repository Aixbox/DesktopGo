pub fn map_ipc_error(code: u32) -> &'static str {
    match code {
        0 => "No error",
        1 => "Memory allocation failed",
        2 => "IPC unavailable: Everything is not running",
        3 => "Failed to register search query window class",
        4 => "Failed to create search query window",
        5 => "Invalid query parameters",
        _ => "Unknown Everything IPC error",
    }
}
