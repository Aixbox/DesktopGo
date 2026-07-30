use std::path::Path;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use once_cell::sync::Lazy;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE, WM_QUIT,
};

use super::api::EverythingApi;
use super::query::{self, ActiveRequest, FirstPageCache, SearchResultCaches};
use super::reply_window;
use super::snapshot::SearchResultSnapshot;
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

struct IpcWorker {
    api: EverythingApi,
    reply_hwnd: HWND,
    command_rx: Receiver<WorkerCommand>,
    app_handle: tauri::AppHandle,
    active: Option<ActiveRequest>,
    first_page_cache: Option<FirstPageCache>,
    result_snapshot: Option<SearchResultSnapshot>,
}

impl IpcWorker {
    fn new(
        api: EverythingApi,
        reply_hwnd: HWND,
        command_rx: Receiver<WorkerCommand>,
        app_handle: tauri::AppHandle,
    ) -> Self {
        Self {
            api,
            reply_hwnd,
            command_rx,
            app_handle,
            active: None,
            first_page_cache: None,
            result_snapshot: None,
        }
    }

    fn run(mut self) {
        loop {
            if !self.pump_messages() || !self.dispatch_commands() {
                return;
            }
            self.finish_pending_request();
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn pump_messages(&mut self) -> bool {
        let mut message = MSG::default();
        while unsafe { PeekMessageW(&mut message, None, 0, 0, PM_REMOVE) }.into() {
            if message.message == WM_QUIT {
                self.teardown();
                return false;
            }
            unsafe {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
        true
    }

    fn dispatch_commands(&mut self) -> bool {
        while let Ok(command) = self.command_rx.try_recv() {
            match command {
                WorkerCommand::Probe { response } => {
                    query::cancel_active_request(&self.app_handle, &mut self.active);
                    self.result_snapshot = None;
                    self.start_probe(response);
                }
                WorkerCommand::Search {
                    query: search_query,
                    response,
                } => {
                    if self.reuse_result_snapshot(&search_query, &response) {
                        continue;
                    }
                    query::cancel_active_request(&self.app_handle, &mut self.active);
                    self.start_search(search_query, response);
                }
                WorkerCommand::Shutdown { response } => {
                    query::cancel_active_request(&self.app_handle, &mut self.active);
                    append_debug_log(&self.app_handle, "ipc worker shutdown requested");
                    self.teardown();
                    let _ = response.send(());
                    return false;
                }
            }
        }
        true
    }

    fn start_probe(&mut self, response: Sender<Result<(), String>>) {
        match query::start_probe(
            &self.api,
            self.reply_hwnd,
            &self.app_handle,
            response.clone(),
        ) {
            Ok(request) => self.active = Some(request),
            Err(error) => {
                append_debug_log(
                    &self.app_handle,
                    format!("ipc worker failed to start probe: {}", error),
                );
                let _ = response.send(Err(error));
            }
        }
    }

    fn start_search(
        &mut self,
        search_query: SearchQuery,
        response: Sender<Result<SearchResponse, String>>,
    ) {
        if self.reuse_cached_first_page(&search_query, &response) {
            return;
        }

        self.result_snapshot = None;

        match query::start_search(
            &self.api,
            self.reply_hwnd,
            search_query,
            &self.app_handle,
            response.clone(),
        ) {
            Ok(request) => self.active = Some(request),
            Err(error) => {
                append_debug_log(
                    &self.app_handle,
                    format!("ipc worker failed to start search: {}", error),
                );
                let _ = response.send(Err(error));
            }
        }
    }

    fn reuse_result_snapshot(
        &mut self,
        search_query: &SearchQuery,
        response: &Sender<Result<SearchResponse, String>>,
    ) -> bool {
        let Some(range) = self
            .result_snapshot
            .as_ref()
            .and_then(|snapshot| snapshot.resolve_range(search_query))
        else {
            return false;
        };

        append_debug_log(
            &self.app_handle,
            format!(
                "ipc search: reused SDK result snapshot offset={} limit={}",
                search_query.offset, search_query.limit
            ),
        );
        let result = query::extract_snapshot_range(&self.api, &self.app_handle, range);
        let _ = response.send(result);
        true
    }

    fn reuse_cached_first_page(
        &mut self,
        search_query: &SearchQuery,
        response: &Sender<Result<SearchResponse, String>>,
    ) -> bool {
        if search_query.offset != 0 {
            return false;
        }
        if let Some(cache) = self.first_page_cache.as_ref() {
            if cache.query == *search_query {
                append_debug_log(&self.app_handle, "ipc search: reused cached first page");
                let _ = response.send(Ok(cache.response.clone()));
                return true;
            }
        }
        self.first_page_cache = None;
        false
    }

    fn finish_pending_request(&mut self) {
        if reply_window::is_completed() {
            let mut caches = SearchResultCaches {
                first_page: &mut self.first_page_cache,
                snapshot: &mut self.result_snapshot,
            };
            query::finish_active_request(
                &self.api,
                &self.app_handle,
                &mut self.active,
                &mut caches,
                false,
            );
            return;
        }

        let probe_timed_out = self.active.as_ref().is_some_and(|request| {
            request.is_probe() && request.started_at().elapsed() >= request.timeout()
        });
        if probe_timed_out {
            let mut caches = SearchResultCaches {
                first_page: &mut self.first_page_cache,
                snapshot: &mut self.result_snapshot,
            };
            query::finish_active_request(
                &self.api,
                &self.app_handle,
                &mut self.active,
                &mut caches,
                probe_timed_out,
            );
        }
    }

    fn teardown(&mut self) {
        query::teardown_worker(
            &self.api,
            self.reply_hwnd,
            &self.app_handle,
            &mut self.active,
        );
    }
}

fn worker_loop(
    api: EverythingApi,
    reply_hwnd: HWND,
    command_rx: Receiver<WorkerCommand>,
    app_handle: tauri::AppHandle,
) {
    IpcWorker::new(api, reply_hwnd, command_rx, app_handle).run();
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
