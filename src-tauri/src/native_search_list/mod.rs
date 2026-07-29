mod model;
#[cfg(windows)]
mod windows;

use std::sync::{Arc, Mutex};

use crate::everything::SearchHit;
pub use model::{NativeSearchBounds, NativeSearchPalette};
use model::{NativeSearchModel, NativeSearchRow};

#[derive(Default)]
struct NativeSearchRegistry {
    generation: u64,
    ready_generation: Option<u64>,
    host: isize,
}

pub struct NativeSearchListState {
    registry: Mutex<NativeSearchRegistry>,
    model: Arc<Mutex<NativeSearchModel>>,
}

impl Default for NativeSearchListState {
    fn default() -> Self {
        Self {
            registry: Mutex::new(NativeSearchRegistry::default()),
            model: Arc::new(Mutex::new(NativeSearchModel::default())),
        }
    }
}

impl NativeSearchListState {
    pub fn begin_generation(&self, generation: u64) -> Result<(), String> {
        let mut registry = self
            .registry
            .lock()
            .map_err(|_| "Failed to lock native search registry".to_string())?;
        if generation < registry.generation {
            return Ok(());
        }
        registry.generation = generation;
        registry.ready_generation = None;
        drop(registry);

        let mut model = self
            .model
            .lock()
            .map_err(|_| "Failed to lock native search model".to_string())?;
        model.rows.clear();
        model.selected = -1;
        Ok(())
    }

    pub fn commit_results(&self, generation: u64, items: Vec<SearchHit>) -> Result<bool, String> {
        let mut registry = self
            .registry
            .lock()
            .map_err(|_| "Failed to lock native search registry".to_string())?;
        if registry.generation != generation {
            return Ok(false);
        }
        let mut model = self
            .model
            .lock()
            .map_err(|_| "Failed to lock native search model".to_string())?;
        model.rows = items.into_iter().map(NativeSearchRow::from).collect();
        model.selected = -1;
        registry.ready_generation = Some(generation);
        Ok(true)
    }

    fn is_ready(&self, generation: u64) -> Result<bool, String> {
        self.registry
            .lock()
            .map(|registry| registry.ready_generation == Some(generation))
            .map_err(|_| "Failed to lock native search registry".to_string())
    }

    fn host(&self) -> Result<isize, String> {
        self.registry
            .lock()
            .map(|registry| registry.host)
            .map_err(|_| "Failed to lock native search registry".to_string())
    }

    fn set_host(&self, host: isize) -> Result<(), String> {
        self.registry
            .lock()
            .map(|mut registry| registry.host = host)
            .map_err(|_| "Failed to lock native search registry".to_string())
    }
}

#[cfg(windows)]
pub async fn show(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeSearchListState>,
    generation: u64,
    bounds: NativeSearchBounds,
    palette: NativeSearchPalette,
) -> Result<(), String> {
    if !state.is_ready(generation)? {
        return Err("Native search results are not ready".to_string());
    }
    windows::show(window, state.inner(), bounds, palette).await
}

#[cfg(windows)]
pub async fn hide(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeSearchListState>,
) -> Result<(), String> {
    windows::hide(window, state.inner()).await
}

#[cfg(windows)]
pub async fn select(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeSearchListState>,
    index: i32,
) -> Result<(), String> {
    windows::select(window, state.inner(), index).await
}

#[cfg(not(windows))]
pub async fn show(
    _window: tauri::WebviewWindow,
    _state: tauri::State<'_, NativeSearchListState>,
    _generation: u64,
    _bounds: NativeSearchBounds,
    _palette: NativeSearchPalette,
) -> Result<(), String> {
    Err("Native search lists are only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub async fn hide(
    _window: tauri::WebviewWindow,
    _state: tauri::State<'_, NativeSearchListState>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
pub async fn select(
    _window: tauri::WebviewWindow,
    _state: tauri::State<'_, NativeSearchListState>,
    _index: i32,
) -> Result<(), String> {
    Ok(())
}
