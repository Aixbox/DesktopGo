use std::path::Path;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use once_cell::sync::Lazy;
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE, WM_QUIT,
};

use super::api::EverythingApi;
use super::query::{self, ActiveRequest, FirstPageCache};
use super::reply_window;
use super::{SearchQuery, SearchResponse};
use crate::everything::debug_log::append as append_debug_log;

enum WorkerCommand {
    Probe {
        response: Sender<Result<(), String>>,
    },
    Search {
        query: SearchQuery,
        response: Sender<Result<SearchResponse, String>>,
    },
    Shutdown {
        response: Sender<()>,
    },
}

static WORKER_SENDER: Lazy<Mutex<Option<Sender<WorkerCommand>>>> = Lazy::new(|| Mutex::new(None));
static WORKER_INIT_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

fn worker_loop(
    api: EverythingApi,
    reply_hwnd: windows::Win32::Foundation::HWND,
    command_rx: Receiver<WorkerCommand>,
    app_handle: tauri::AppHandle,
) {
    let mut active: Option<ActiveRequest> = None;
    let mut first_page_cache: Option<FirstPageCache> = None;

    loop {
        let mut message = MSG::default();
        while unsafe { PeekMessageW(&mut message, None, 0, 0, PM_REMOVE) }.into() {
            if message.message == WM_QUIT {
                query::teardown_worker(&api, reply_hwnd, &app_handle, &mut active);
                return;
            }
            unsafe {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }

        while let Ok(command) = command_rx.try_recv() {
            query::cancel_active_request(&app_handle, &mut active);
            match command {
                WorkerCommand::Probe { response } => {
                    match query::start_probe(&api, reply_hwnd, &app_handle, response.clone()) {
                        Ok(request) => active = Some(request),
                        Err(error) => {
                            append_debug_log(
                                &app_handle,
                                format!("ipc worker failed to start probe: {}", error),
                            );
                            let _ = response.send(Err(error));
                        }
                    }
                }
                WorkerCommand::Search { query, response } => {
                    if query.offset == 0 {
                        if let Some(cache) = first_page_cache.as_ref() {
                            if cache.query == query {
                                append_debug_log(
                                    &app_handle,
                                    "ipc search: reused cached first page",
                                );
                                let _ = response.send(Ok(cache.response.clone()));
                                continue;
                            }
                        }
                        first_page_cache = None;
                    }

                    match query::start_search(
                        &api,
                        reply_hwnd,
                        query,
                        &app_handle,
                        response.clone(),
                    ) {
                        Ok(request) => active = Some(request),
                        Err(error) => {
                            append_debug_log(
                                &app_handle,
                                format!("ipc worker failed to start search: {}", error),
                            );
                            let _ = response.send(Err(error));
                        }
                    }
                }
                WorkerCommand::Shutdown { response } => {
                    append_debug_log(&app_handle, "ipc worker shutdown requested");
                    query::teardown_worker(&api, reply_hwnd, &app_handle, &mut active);
                    let _ = response.send(());
                    return;
                }
            }
        }

        if reply_window::is_completed() {
            query::finish_active_request(
                &api,
                &app_handle,
                &mut active,
                &mut first_page_cache,
                false,
            );
        } else if active
            .as_ref()
            .map(|request| {
                request.is_probe() && request.started_at().elapsed() >= request.timeout()
            })
            .unwrap_or(false)
        {
            query::finish_active_request(
                &api,
                &app_handle,
                &mut active,
                &mut first_page_cache,
                true,
            );
        }

        thread::sleep(Duration::from_millis(10));
    }
}

fn ensure_worker(
    dll_path: &Path,
    app_handle: &tauri::AppHandle,
) -> Result<Sender<WorkerCommand>, String> {
    if let Some(sender) = WORKER_SENDER
        .lock()
        .map_err(|_| "Failed to lock Everything IPC worker sender".to_string())?
        .clone()
    {
        return Ok(sender);
    }

    let _guard = WORKER_INIT_LOCK
        .lock()
        .map_err(|_| "Failed to lock Everything IPC worker init".to_string())?;
    if let Some(sender) = WORKER_SENDER
        .lock()
        .map_err(|_| "Failed to lock Everything IPC worker sender".to_string())?
        .clone()
    {
        return Ok(sender);
    }

    let dll_path = dll_path.to_path_buf();
    let app_handle_clone = app_handle.clone();
    let (command_tx, command_rx) = mpsc::channel();
    let (init_tx, init_rx) = mpsc::channel();
    thread::spawn(move || {
        let api = match EverythingApi::load(&dll_path) {
            Ok(api) => api,
            Err(error) => {
                let _ = init_tx.send(Err(error));
                return;
            }
        };
        let reply_hwnd = match reply_window::create() {
            Ok(hwnd) => hwnd,
            Err(error) => {
                let _ = init_tx.send(Err(error));
                return;
            }
        };
        unsafe {
            (api.set_reply_window)(reply_hwnd);
        }

        append_debug_log(
            &app_handle_clone,
            format!("ipc worker ready hwnd={:?}", reply_hwnd),
        );
        let _ = init_tx.send(Ok(()));
        worker_loop(api, reply_hwnd, command_rx, app_handle_clone);
    });

    match init_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(())) => {
            let mut guard = WORKER_SENDER
                .lock()
                .map_err(|_| "Failed to lock Everything IPC worker sender".to_string())?;
            *guard = Some(command_tx.clone());
            Ok(command_tx)
        }
        Ok(Err(error)) => Err(error),
        Err(RecvTimeoutError::Timeout) => {
            Err("Everything IPC worker startup timed out".to_string())
        }
        Err(RecvTimeoutError::Disconnected) => {
            Err("Everything IPC worker stopped during startup".to_string())
        }
    }
}

pub(super) fn probe_connection(
    dll_path: &Path,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let sender = ensure_worker(dll_path, app_handle)?;
    let (response_tx, response_rx) = mpsc::channel();
    sender
        .send(WorkerCommand::Probe {
            response: response_tx,
        })
        .map_err(|_| "Everything IPC worker is unavailable".to_string())?;

    match response_rx.recv_timeout(Duration::from_secs(4)) {
        Ok(result) => result,
        Err(RecvTimeoutError::Timeout) => {
            Err("Everything query timed out while waiting for reply".to_string())
        }
        Err(RecvTimeoutError::Disconnected) => Err("Everything IPC worker stopped".to_string()),
    }
}

pub(super) fn search(
    dll_path: &Path,
    query: &SearchQuery,
    app_handle: &tauri::AppHandle,
) -> Result<SearchResponse, String> {
    let sender = ensure_worker(dll_path, app_handle)?;
    let (response_tx, response_rx) = mpsc::channel();
    sender
        .send(WorkerCommand::Search {
            query: query.clone(),
            response: response_tx,
        })
        .map_err(|_| "Everything IPC worker is unavailable".to_string())?;

    match response_rx.recv_timeout(Duration::from_secs(32)) {
        Ok(result) => result,
        Err(RecvTimeoutError::Timeout) => {
            Err("Everything query timed out while waiting for reply".to_string())
        }
        Err(RecvTimeoutError::Disconnected) => Err("Everything IPC worker stopped".to_string()),
    }
}

pub(super) fn shutdown_worker(app_handle: &tauri::AppHandle) {
    let sender = match WORKER_SENDER.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => None,
    };
    let Some(sender) = sender else {
        return;
    };

    append_debug_log(app_handle, "ipc worker shutdown dispatch");
    let (response_tx, response_rx) = mpsc::channel();
    if sender
        .send(WorkerCommand::Shutdown {
            response: response_tx,
        })
        .is_err()
    {
        append_debug_log(app_handle, "ipc worker already stopped before shutdown");
        return;
    }

    match response_rx.recv_timeout(Duration::from_secs(2)) {
        Ok(()) => append_debug_log(app_handle, "ipc worker shutdown complete"),
        Err(RecvTimeoutError::Timeout) => {
            append_debug_log(app_handle, "ipc worker shutdown timed out")
        }
        Err(RecvTimeoutError::Disconnected) => {
            append_debug_log(app_handle, "ipc worker stopped during shutdown")
        }
    }
}
